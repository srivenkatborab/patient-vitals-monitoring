"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { toChartRow } = require("./transform");

const TABLE_NAME = process.env.TABLE_NAME || "fpv-readings";

let cachedLedger;

function chartLedger() {
  if (!cachedLedger) {
    const ledgerConfig = { region: process.env.AWS_REGION || "eu-west-1" };
    if (process.env.AWS_ENDPOINT_URL) {
      ledgerConfig.endpoint = process.env.AWS_ENDPOINT_URL;
      ledgerConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      };
    }
    cachedLedger = DynamoDBDocumentClient.from(new DynamoDBClient(ledgerConfig));
  }
  return cachedLedger;
}

async function fileReadings(windowBatch, ledger, chartTable) {
  for (const windowRecord of windowBatch) {
    await ledger.send(new PutCommand({ TableName: chartTable, Item: toChartRow(windowRecord.body) }));
  }
  return windowBatch.length;
}

exports.handler = async (event) => {
  const filed = await fileReadings(event.Records, chartLedger(), TABLE_NAME);
  return { processed: filed };
};

exports.fileReadings = fileReadings;
