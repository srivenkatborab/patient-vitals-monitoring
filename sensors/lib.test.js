"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SIGNAL_PROFILES, clampToBand, advanceSample } = require("./lib");

test("clampToBand keeps value in range", () => {
  assert.equal(clampToBand(500, 0, 100), 100);
  assert.equal(clampToBand(-5, 0, 100), 0);
  assert.equal(clampToBand(50, 0, 100), 50);
});

test("advanceSample stays within profile bounds", () => {
  const profile = SIGNAL_PROFILES.heart_rate;
  let reading = profile.start;
  for (let i = 0; i < 500; i++) {
    reading = advanceSample(reading, profile);
    assert.ok(reading >= profile.lo && reading <= profile.hi);
  }
});

test("all five vitals have profiles", () => {
  assert.deepEqual(
    new Set(Object.keys(SIGNAL_PROFILES)),
    new Set(["heart_rate", "spo2", "body_temperature", "respiration_rate", "systolic_bp"])
  );
});

test("advanceSample moves by at most step", () => {
  const profile = { lo: 0, hi: 100, start: 50, step: 2.0 };
  const nextReading = advanceSample(50, profile);
  assert.ok(Math.abs(nextReading - 50) <= profile.step);
});
