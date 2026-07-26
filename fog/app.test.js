"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFogNode, foldPendingWindows } = require("./app");

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const { port } = server.address();
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test("POST /ingest buffers readings", async () => {
  const app = createFogNode();
  await withServer(app, async (base) => {
    const payload = {
      sensor_type: "heart_rate",
      site_id: "patient-1",
      unit: "bpm",
      readings: [{ ts: "t0", value: 72.0 }, { ts: "t1", value: 74.0 }],
    };
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.deepEqual(body, { accepted: 2 });
    assert.equal(app.locals.openWindows.get("heart_rate patient-1").length, 2);
  });
});

test("GET /health returns ok", async () => {
  const app = createFogNode();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/health`);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /thresholds exposes the real rules", async () => {
  const app = createFogNode();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.ok(body.heart_rate.some((r) => r.key === "bradycardia_risk" && r.limit === 50));
  });
});

test("foldPendingWindows aggregates and evaluates alerts", () => {
  const snapshot = new Map([
    ["heart_rate patient-1", [{ ts: "t0", value: 130.0 }, { ts: "t1", value: 140.0 }]],
  ]);
  const messages = foldPendingWindows(snapshot, new Map([["heart_rate", "bpm"]]), "s", "e");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 135.0);
  assert.deepEqual(messages[0].alerts, ["tachycardia_risk"]);
});
