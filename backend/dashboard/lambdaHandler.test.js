"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { handler, resolveClients } = require("./lambdaHandler");

function fakeDoc(items) {
  return { send: async () => ({ Items: items }) };
}

test("OPTIONS preflight returns 200 with CORS and no body", async () => {
  const res = await handler({ httpMethod: "OPTIONS", path: "/api/patients" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "*");
  assert.strictEqual(res.body, "");
});

test("unknown path returns 404 json", async () => {
  const res = await handler({ httpMethod: "GET", path: "/api/nope" }, {}, { doc: fakeDoc([]), sqs: {}, lambda: {} });
  assert.strictEqual(res.statusCode, 404);
  assert.match(res.body, /not found/);
});

test("non-GET method returns 404", async () => {
  const res = await handler({ httpMethod: "POST", path: "/api/patients" });
  assert.strictEqual(res.statusCode, 404);
});

test("GET /api/patients builds one card per patient from injected clients", async () => {
  const row = (site) => ({ site_id: site, latest: 72, min: 60, max: 90, avg: 74, count: 5, unit: "bpm", window_end: new Date().toISOString(), alerts: [] });
  const clients = { doc: fakeDoc([row("patient-1"), row("patient-2")]), sqs: {}, lambda: {} };
  const res = await handler({ httpMethod: "GET", path: "/api/patients" }, {}, clients);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.deepStrictEqual(body.patients.map((p) => p.patient_id), ["patient-1", "patient-2"]);
});

test("resolveClients ignores a runtime callback (function) and never treats it as clients", () => {
  const callback = () => {};
  const resolved = resolveClients(callback);
  assert.notStrictEqual(resolved, callback);
  assert.ok(resolved.doc && resolved.sqs && resolved.lambda);
});

test("resolveClients passes through a genuine injected clients object", () => {
  const injected = { doc: fakeDoc([]), sqs: {}, lambda: {} };
  assert.strictEqual(resolveClients(injected), injected);
});
