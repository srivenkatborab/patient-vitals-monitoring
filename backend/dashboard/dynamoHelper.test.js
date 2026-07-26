"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { recentVitalWindows, buildWardRoster } = require("./dynamoHelper");

class FakeDoc {
  constructor(itemsByTable) {
    this.itemsByTable = itemsByTable;
  }

  async send(command) {
    const sensorType = command.input.ExpressionAttributeValues[":st"];
    const all = (this.itemsByTable[sensorType] || []).slice();
    all.reverse();
    return { Items: all.slice(0, command.input.Limit) };
  }
}

test("recentVitalWindows returns items in ascending chronological order", async () => {
  const doc = new FakeDoc({
    heart_rate: [
      { sensor_type: "heart_rate", site_id: "patient-1", window_end: "t0", latest: 70 },
      { sensor_type: "heart_rate", site_id: "patient-1", window_end: "t1", latest: 75 },
    ],
  });
  const items = await recentVitalWindows(doc, "table", "heart_rate", 10);
  assert.deepEqual(items.map((i) => i.window_end), ["t0", "t1"]);
});

test("buildWardRoster groups the latest reading per vital per patient", async () => {
  const doc = new FakeDoc({
    heart_rate: [
      { sensor_type: "heart_rate", site_id: "patient-1", window_end: "t0", latest: 70, alerts: [] },
      { sensor_type: "heart_rate", site_id: "patient-1", window_end: "t1", latest: 130, alerts: ["tachycardia_risk"] },
      { sensor_type: "heart_rate", site_id: "patient-2", window_end: "t0", latest: 65, alerts: [] },
    ],
    spo2: [],
  });
  const patients = await buildWardRoster(doc, "table", ["heart_rate", "spo2"], ["patient-1", "patient-2"]);
  assert.equal(patients.length, 2);
  const p1 = patients.find((p) => p.patient_id === "patient-1");
  assert.equal(p1.vitals.heart_rate.latest, 130);
  assert.deepEqual(p1.vitals.heart_rate.alerts, ["tachycardia_risk"]);
  assert.equal(p1.vitals.spo2, undefined);
});

test("buildWardRoster seeds every known patient even without data", async () => {
  const doc = new FakeDoc({});
  const patients = await buildWardRoster(doc, "table", ["heart_rate"], ["patient-1", "patient-2"]);
  assert.deepEqual(patients.map((p) => p.patient_id), ["patient-1", "patient-2"]);
});
