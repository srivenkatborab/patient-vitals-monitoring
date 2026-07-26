"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { aggQueueReachable, processorActive, aggQueueDepth, countStoredReadings } = require("./healthChecks");

function fakeClient(responder) {
  return { send: async (command) => responder(command) };
}

test("aggQueueReachable is true when both calls succeed", async () => {
  const sqs = fakeClient(() => ({ QueueUrl: "http://q" }));
  assert.equal(await aggQueueReachable(sqs, "q"), true);
});

test("aggQueueReachable is false when the queue lookup throws", async () => {
  const sqs = fakeClient(() => { throw new Error("not found"); });
  assert.equal(await aggQueueReachable(sqs, "missing"), false);
});

test("processorActive reflects the reported state", async () => {
  const lambda = fakeClient(() => ({ Configuration: { State: "Active" } }));
  assert.equal(await processorActive(lambda, "fn"), true);
});

test("processorActive is false when the function is not deployed", async () => {
  const lambda = fakeClient(() => { throw new Error("not found"); });
  assert.equal(await processorActive(lambda, "fn"), false);
});

test("aggQueueDepth parses waiting and in-flight counts", async () => {
  let call = 0;
  const sqs = fakeClient(() => {
    call += 1;
    if (call === 1) return { QueueUrl: "http://q" };
    return { Attributes: { ApproximateNumberOfMessages: "3", ApproximateNumberOfMessagesNotVisible: "1" } };
  });
  assert.deepEqual(await aggQueueDepth(sqs, "q"), { waiting: 3, in_flight: 1 });
});

test("countStoredReadings returns the reported count", async () => {
  const doc = fakeClient(() => ({ Count: 42 }));
  assert.equal(await countStoredReadings(doc, "table"), 42);
});

test("countStoredReadings sums every page until pagination is exhausted", async () => {
  const pages = [
    { Count: 500, LastEvaluatedKey: { sensor_type: "heart_rate" } },
    { Count: 500, LastEvaluatedKey: { sensor_type: "spo2" } },
    { Count: 137 },
  ];
  let call = 0;
  const doc = fakeClient((command) => {
    assert.equal(command.input.ExclusiveStartKey, pages[call - 1]?.LastEvaluatedKey);
    return pages[call++];
  });
  assert.equal(await countStoredReadings(doc, "table"), 1137);
  assert.equal(call, 3);
});
