"use strict";

function foldBedsideWindow(vitalSign, bedId, unitLabel, samples, windowOpen, windowClose) {
  const sampleValues = samples.map((sample) => sample.value);
  const tally = sampleValues.reduce((tallySoFar, sampleValue) => tallySoFar + sampleValue, 0);
  return {
    sensor_type: vitalSign,
    site_id: bedId,
    unit: unitLabel,
    window_start: windowOpen,
    window_end: windowClose,
    count: sampleValues.length,
    min: Math.min(...sampleValues),
    max: Math.max(...sampleValues),
    avg: Math.round((tally / sampleValues.length) * 1000) / 1000,
    latest: samples[samples.length - 1].value,
  };
}

module.exports = { foldBedsideWindow };
