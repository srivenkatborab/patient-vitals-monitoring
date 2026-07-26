"use strict";

const {
  SQSClient,
  GetQueueUrlCommand,
  SendMessageCommand,
  SendMessageBatchCommand,
} = require("@aws-sdk/client-sqs");

const RELAY_BATCH_LIMIT = 10;

class SqsRelay {
  constructor(endpoint, region, relayName) {
    const config = { region };
    if (endpoint) {
      config.endpoint = endpoint;
      config.credentials = { accessKeyId: "test", secretAccessKey: "test" };
    }
    this.sqs = new SQSClient(config);
    this.relayName = relayName;
    this.relayUrl = null;
  }

  async connect() {
    this.relayUrl = await this._pollForRelay(this.relayName);
    return this;
  }

  async _pollForRelay(relayName, attempts = 30, delayMs = 2000) {
    for (let i = 0; i < attempts; i++) {
      try {
        const located = await this.sqs.send(new GetQueueUrlCommand({ QueueName: relayName }));
        return located.QueueUrl;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error(`queue ${relayName} never became available`);
  }

  async relayOne(payload) {
    await this.sqs.send(new SendMessageCommand({
      QueueUrl: this.relayUrl,
      MessageBody: JSON.stringify(payload),
    }));
  }

  async relayBatch(payloads) {
    for (let offset = 0; offset < payloads.length; offset += RELAY_BATCH_LIMIT) {
      const chunk = payloads.slice(offset, offset + RELAY_BATCH_LIMIT);
      await this.sqs.send(new SendMessageBatchCommand({
        QueueUrl: this.relayUrl,
        Entries: chunk.map((payload, i) => ({
          Id: String(offset + i),
          MessageBody: JSON.stringify(payload),
        })),
      }));
    }
  }
}

module.exports = { SqsRelay };
