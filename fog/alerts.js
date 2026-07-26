"use strict";

// Adult resting-vitals cutoffs, window-averaged (not single-sample) to avoid firing on one noisy reading.
const BEDSIDE_THRESHOLDS = {
  heart_rate:       [["avg", "<", 50, "bradycardia_risk"], ["avg", ">", 120, "tachycardia_risk"]],
  spo2:             [["avg", "<", 92, "hypoxia_risk"]],
  body_temperature: [["avg", ">", 38.5, "fever"], ["min", "<", 35.5, "hypothermia_risk"]],
  respiration_rate: [["avg", ">", 24, "respiratory_distress"], ["avg", "<", 10, "bradypnea_risk"]],
  systolic_bp:      [["avg", ">", 140, "hypertension_risk"], ["avg", "<", 90, "hypotension_risk"]],
};

function screenVital(vitalSign, windowFold) {
  const breachRules = BEDSIDE_THRESHOLDS[vitalSign] || [];
  const raisedAlerts = [];
  for (const [metric, comparator, bound, alertKey] of breachRules) {
    const observed = windowFold[metric];
    const breached = comparator === "<" ? observed < bound : observed > bound;
    if (breached) raisedAlerts.push(alertKey);
  }
  return raisedAlerts;
}

module.exports = { BEDSIDE_THRESHOLDS, screenVital };
