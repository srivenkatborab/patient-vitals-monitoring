"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { screenVital } = require("./alerts");

test("low heart rate triggers bradycardia", () => {
  assert.deepEqual(screenVital("heart_rate", { avg: 42 }), ["bradycardia_risk"]);
});

test("high heart rate triggers tachycardia", () => {
  assert.deepEqual(screenVital("heart_rate", { avg: 135 }), ["tachycardia_risk"]);
});

test("normal heart rate is silent", () => {
  assert.deepEqual(screenVital("heart_rate", { avg: 75 }), []);
});

test("low spo2 triggers hypoxia", () => {
  assert.deepEqual(screenVital("spo2", { avg: 88 }), ["hypoxia_risk"]);
});

test("body temperature can raise two alerts", () => {
  const fired = screenVital("body_temperature", { avg: 39.0, min: 35.0 });
  assert.ok(fired.includes("fever"));
  assert.ok(fired.includes("hypothermia_risk"));
});

test("blood pressure hypertension", () => {
  assert.deepEqual(screenVital("systolic_bp", { avg: 150 }), ["hypertension_risk"]);
});

test("unknown vital has no rules", () => {
  assert.deepEqual(screenVital("glucose", { avg: 999, min: 999 }), []);
});
