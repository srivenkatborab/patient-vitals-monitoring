"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { foldBedsideWindow } = require("./aggregation");

const READINGS = [
  { ts: "t0", value: 60.0 },
  { ts: "t1", value: 70.0 },
  { ts: "t2", value: 80.0 },
];

test("foldBedsideWindow computes basic stats", () => {
  const s = foldBedsideWindow("heart_rate", "patient-1", "bpm", READINGS, "start", "end");
  assert.equal(s.count, 3);
  assert.equal(s.min, 60.0);
  assert.equal(s.max, 80.0);
  assert.equal(s.avg, 70.0);
  assert.equal(s.latest, 80.0);
});

test("foldBedsideWindow carries metadata", () => {
  const s = foldBedsideWindow("spo2", "patient-9", "%", READINGS, "s", "e");
  assert.equal(s.sensor_type, "spo2");
  assert.equal(s.site_id, "patient-9");
  assert.equal(s.unit, "%");
  assert.equal(s.window_start, "s");
  assert.equal(s.window_end, "e");
});

test("latest is the last reading", () => {
  const readings = [{ ts: "t0", value: 5.0 }, { ts: "t1", value: 7.5 }];
  assert.equal(foldBedsideWindow("systolic_bp", "p", "mmHg", readings, "s", "e").latest, 7.5);
});
