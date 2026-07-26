"use strict";

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");

async function recentVitalWindows(chart, chartTable, vitalType, limit) {
  const resp = await chart.send(new QueryCommand({
    TableName: chartTable,
    KeyConditionExpression: "sensor_type = :st",
    ExpressionAttributeValues: { ":st": vitalType },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (resp.Items || []).reverse();
}

async function buildWardRoster(chart, chartTable, vitalTypes, patientIds) {
  const roster = new Map(patientIds.map((id) => [id, { patient_id: id, vitals: {} }]));

  for (const vitalType of vitalTypes) {
    const windows = await recentVitalWindows(chart, chartTable, vitalType, 40);
    const latestPerPatient = new Map();
    for (const windowRow of windows) latestPerPatient.set(windowRow.site_id, windowRow);

    for (const [patientId, windowRow] of latestPerPatient) {
      if (!roster.has(patientId)) roster.set(patientId, { patient_id: patientId, vitals: {} });
      roster.get(patientId).vitals[vitalType] = {
        latest: windowRow.latest,
        min: windowRow.min,
        max: windowRow.max,
        avg: windowRow.avg,
        count: windowRow.count,
        unit: windowRow.unit,
        window_end: windowRow.window_end,
        alerts: windowRow.alerts || [],
      };
    }
  }

  return Array.from(roster.values()).sort((a, b) => a.patient_id.localeCompare(b.patient_id));
}

module.exports = { recentVitalWindows, buildWardRoster };
