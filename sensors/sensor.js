"use strict";

const { SIGNAL_PROFILES, advanceSample } = require("./lib");

async function run() {
  const vitalType = process.env.SENSOR_TYPE;
  if (!vitalType) throw new Error("SENSOR_TYPE env var is required");
  const patientId = process.env.SITE_ID || "patient-1";
  const sampleInterval = parseFloat(process.env.SAMPLE_INTERVAL || "2");
  const dispatchInterval = parseFloat(process.env.DISPATCH_INTERVAL || "10");
  const gatewayUrl = process.env.FOG_URL || "http://fog:8000/ingest";

  const signalProfile = SIGNAL_PROFILES[vitalType];
  if (!signalProfile) throw new Error(`unknown SENSOR_TYPE: ${vitalType}`);

  let reading = signalProfile.start;
  let sampleBuffer = [];
  let lastDispatch = Date.now();

  console.log(`${vitalType}@${patientId} sampling every ${sampleInterval}s, dispatching every ${dispatchInterval}s`);

  setInterval(async () => {
    reading = advanceSample(reading, signalProfile);
    sampleBuffer.push({ ts: new Date().toISOString(), value: reading });

    if ((Date.now() - lastDispatch) / 1000 >= dispatchInterval && sampleBuffer.length > 0) {
      const payload = { sensor_type: vitalType, site_id: patientId, unit: signalProfile.unit, readings: sampleBuffer };
      const inFlight = sampleBuffer;
      sampleBuffer = [];
      try {
        await fetch(gatewayUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        console.log(`${vitalType} dispatched ${inFlight.length} readings`);
        lastDispatch = Date.now();
      } catch (err) {
        console.log(`${vitalType} dispatch failed, will retry: ${err.message}`);
        sampleBuffer = inFlight.concat(sampleBuffer);
      }
    }
  }, sampleInterval * 1000);
}

if (require.main === module) {
  run();
}

module.exports = { run };
