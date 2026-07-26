"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toChartRow } = require("./transform");

test("toChartRow builds a composite sort_key from window_end and site_id", () => {
  const body = JSON.stringify({
    sensor_type: "heart_rate",
    site_id: "patient-2",
    unit: "bpm",
    window_start: "s",
    window_end: "e",
    count: 3,
    min: 60,
    max: 80,
    avg: 70,
    latest: 75,
    alerts: ["tachycardia_risk"],
  });
  const record = toChartRow(body);
  assert.equal(record.sort_key, "e#patient-2");
  assert.equal(record.sensor_type, "heart_rate");
  assert.equal(record.avg, 70);
  assert.deepEqual(record.alerts, ["tachycardia_risk"]);
});

test("toChartRow accepts already-parsed objects", () => {
  const record = toChartRow({ sensor_type: "spo2", window_end: "e2", site_id: "patient-1" });
  assert.equal(record.sort_key, "e2#patient-1");
  assert.deepEqual(record.alerts, []);
});

test("toChartRow defaults site_id when absent", () => {
  const record = toChartRow({ sensor_type: "spo2", window_end: "e3" });
  assert.equal(record.site_id, "patient-1");
  assert.equal(record.sort_key, "e3#patient-1");
});
