"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

const { recentVitalWindows, buildWardRoster } = require("./dynamoHelper");
const { aggQueueReachable, processorActive, aggQueueDepth, countStoredReadings } = require("./healthChecks");

const TABLE_NAME = process.env.TABLE_NAME || "fpv-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "fpv-vitals-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "fpv-processor";
const GATEWAY_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const GATEWAY_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";
const VITALS = ["heart_rate", "spo2", "body_temperature", "respiration_rate", "systolic_bp"];
const PATIENT_IDS = ["patient-1", "patient-2"];
const FRESH_WINDOW_SECONDS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function bedsideClients() {
  const config = { region: process.env.AWS_REGION || "us-east-1" };
  return {
    doc: DynamoDBDocumentClient.from(new DynamoDBClient(config)),
    sqs: new SQSClient(config),
    lambda: new LambdaClient(config),
  };
}

let warmClients = null;
function resolveClients(injected) {
  // A truthy third arg is real clients only when it carries a chart client, not the Lambda runtime callback.
  if (injected && injected.doc) return injected;
  if (!warmClients) warmClients = bedsideClients();
  return warmClients;
}

async function gatewayReachable(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function listWard(c) {
  return ok({ patients: await buildWardRoster(c.doc, TABLE_NAME, VITALS, PATIENT_IDS) });
}

async function streamReadings(c, query) {
  const vitalType = query.sensor_type;
  const patientId = query.site_id;
  const limit = parseInt(query.limit || "60", 10);
  let items = await recentVitalWindows(c.doc, TABLE_NAME, vitalType, patientId ? limit * PATIENT_IDS.length : limit);
  if (patientId) items = items.filter((item) => item.site_id === patientId).slice(-limit);
  return ok({ sensor_type: vitalType, items });
}

async function wardHealth(c) {
  const [gateway, queue, lambda] = await Promise.all([
    gatewayReachable(GATEWAY_HEALTH_URL),
    aggQueueReachable(c.sqs, QUEUE_NAME),
    processorActive(c.lambda, FUNCTION_NAME),
  ]);
  let freshestAge = null;
  for (const vitalType of VITALS) {
    const windows = await recentVitalWindows(c.doc, TABLE_NAME, vitalType, 1);
    if (!windows.length) continue;
    const age = (Date.now() - new Date(windows[windows.length - 1].window_end).getTime()) / 1000;
    if (freshestAge === null || age < freshestAge) freshestAge = age;
  }
  const pipeline = freshestAge !== null && freshestAge <= FRESH_WINDOW_SECONDS;
  return ok({ gateway, queue, lambda, pipeline, freshest_age_seconds: freshestAge });
}

async function wardBackendStats(c) {
  return ok({ queue: await aggQueueDepth(c.sqs, QUEUE_NAME), items_in_table: await countStoredReadings(c.doc, TABLE_NAME) });
}

async function relayThresholds() {
  try {
    const res = await fetch(GATEWAY_THRESHOLDS_URL, { signal: AbortSignal.timeout(5000) });
    return { status: 200, body: await res.text() };
  } catch {
    return { status: 502, body: { error: "thresholds unavailable" } };
  }
}

function ok(body) {
  return { status: 200, body };
}

const ROUTES = [
  { path: "/api/patients", run: (c) => listWard(c) },
  { path: "/api/readings", run: (c, q) => streamReadings(c, q) },
  { path: "/api/health", run: (c) => wardHealth(c) },
  { path: "/api/backend-stats", run: (c) => wardBackendStats(c) },
  { path: "/api/thresholds", run: () => relayThresholds() },
];

function reply(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...CORS },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function handler(event, _context, injectedClients) {
  const method = event.httpMethod || "GET";
  const path = event.path || "/";
  const query = event.queryStringParameters || {};
  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (method !== "GET") return reply(404, { error: "not found" });

  const route = ROUTES.find((r) => r.path === path);
  if (!route) return reply(404, { error: "not found" });

  try {
    const result = await route.run(resolveClients(injectedClients), query);
    return reply(result.status, result.body);
  } catch (err) {
    return reply(500, { error: err.message || "internal error" });
  }
}

module.exports = { handler, resolveClients };
