"use strict";

const express = require("express");
const { foldBedsideWindow } = require("./aggregation");
const { screenVital, BEDSIDE_THRESHOLDS } = require("./alerts");
const { SqsRelay } = require("./queueGateway");

const WINDOW_SPAN_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const RELAY_QUEUE_NAME = process.env.SQS_QUEUE_NAME || "fpv-vitals-agg";
const RELAY_ENDPOINT = process.env.AWS_ENDPOINT_URL;
const RELAY_REGION = process.env.AWS_REGION || "eu-west-1";
const CHANNEL_KEY_SEP = " ";

function createFogNode() {
  const app = express();
  app.use(express.json());

  app.locals.openWindows = new Map();
  app.locals.unitByChannel = new Map();

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.get("/thresholds", (req, res) => {
    const thresholdView = {};
    for (const [vitalSign, breachRules] of Object.entries(BEDSIDE_THRESHOLDS)) {
      thresholdView[vitalSign] = breachRules.map(([field, op, limit, key]) => ({ field, op, limit, key }));
    }
    res.json(thresholdView);
  });

  app.post("/ingest", (req, res) => {
    const { sensor_type: vitalSign, site_id: bedId = "patient-1", unit: unitLabel, readings: samples } = req.body;
    const channelKey = vitalSign + CHANNEL_KEY_SEP + bedId;
    if (!app.locals.openWindows.has(channelKey)) app.locals.openWindows.set(channelKey, []);
    app.locals.openWindows.get(channelKey).push(...samples);
    if (unitLabel) app.locals.unitByChannel.set(vitalSign, unitLabel);
    res.status(202).json({ accepted: samples.length });
  });

  return app;
}

function foldPendingWindows(windowSnapshot, unitByChannel, windowOpen, windowClose) {
  const windowBatch = [];
  for (const [channelKey, samples] of windowSnapshot.entries()) {
    if (samples.length === 0) continue;
    const [vitalSign, bedId] = channelKey.split(CHANNEL_KEY_SEP);
    const windowFold = foldBedsideWindow(vitalSign, bedId, unitByChannel.get(vitalSign) || "", samples, windowOpen, windowClose);
    windowFold.alerts = screenVital(vitalSign, windowFold);
    windowBatch.push(windowFold);
  }
  return windowBatch;
}

async function relayWindow(app, relay) {
  const windowClose = new Date().toISOString();
  const windowOpen = new Date(Date.now() - WINDOW_SPAN_SECONDS * 1000).toISOString();

  const windowSnapshot = new Map(app.locals.openWindows);
  app.locals.openWindows.clear();
  const unitByChannel = new Map(app.locals.unitByChannel);

  const windowBatch = foldPendingWindows(windowSnapshot, unitByChannel, windowOpen, windowClose);
  if (windowBatch.length > 0) await relay.relayBatch(windowBatch);
}

async function bootFogNode() {
  const app = createFogNode();
  const relay = await new SqsRelay(RELAY_ENDPOINT, RELAY_REGION, RELAY_QUEUE_NAME).connect();

  setInterval(() => {
    relayWindow(app, relay).catch((err) => console.log(`window flush failed: ${err.message}`));
  }, WINDOW_SPAN_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  bootFogNode();
}

module.exports = { createFogNode, foldPendingWindows };
