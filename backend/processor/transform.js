"use strict";

function toChartRow(windowMessage) {
  const windowSummary = typeof windowMessage === "string" ? JSON.parse(windowMessage) : windowMessage;
  const patientId = windowSummary.site_id || "patient-1";
  return {
    sensor_type: windowSummary.sensor_type,
    sort_key: `${windowSummary.window_end}#${patientId}`,
    window_end: windowSummary.window_end,
    window_start: windowSummary.window_start,
    site_id: patientId,
    unit: windowSummary.unit || "",
    count: windowSummary.count,
    min: windowSummary.min,
    max: windowSummary.max,
    avg: windowSummary.avg,
    latest: windowSummary.latest,
    alerts: windowSummary.alerts || [],
  };
}

module.exports = { toChartRow };
