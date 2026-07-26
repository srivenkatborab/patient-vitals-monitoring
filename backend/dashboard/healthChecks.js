"use strict";

const { GetQueueUrlCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { GetFunctionCommand } = require("@aws-sdk/client-lambda");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

async function aggQueueReachable(sqs, queueName) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    await sqs.send(new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ["QueueArn"] }));
    return true;
  } catch {
    return false;
  }
}

async function processorActive(lambda, functionName) {
  try {
    const resp = await lambda.send(new GetFunctionCommand({ FunctionName: functionName }));
    return resp.Configuration.State === "Active";
  } catch {
    return false;
  }
}

async function aggQueueDepth(sqs, queueName) {
  try {
    const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
    const attrs = await sqs.send(new GetQueueAttributesCommand({
      QueueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    }));
    return {
      waiting: parseInt(attrs.Attributes.ApproximateNumberOfMessages, 10),
      in_flight: parseInt(attrs.Attributes.ApproximateNumberOfMessagesNotVisible, 10),
    };
  } catch {
    return null;
  }
}

async function countStoredReadings(chart, chartTable) {
  let tally = 0;
  let pageCursor;
  do {
    const resp = await chart.send(new ScanCommand({
      TableName: chartTable,
      Select: "COUNT",
      ExclusiveStartKey: pageCursor,
    }));
    tally += resp.Count;
    pageCursor = resp.LastEvaluatedKey;
  } while (pageCursor);
  return tally;
}

module.exports = { aggQueueReachable, processorActive, aggQueueDepth, countStoredReadings };
