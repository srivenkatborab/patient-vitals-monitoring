import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4568")
REGION = os.getenv("AWS_REGION", "eu-west-1")
QUEUE_NAME = os.getenv("SQS_QUEUE_NAME", "fpv-vitals-agg")

# Synthetic type names distinct from the 5 real vitals, so burst traffic never
# lands in the DynamoDB partitions the live dashboard reads from.
LOAD_TYPES = ["loadtest_a", "loadtest_b", "loadtest_c", "loadtest_d", "loadtest_e"]

BASE = datetime.now(timezone.utc)


def sample_message(i):
    vital = LOAD_TYPES[i % len(LOAD_TYPES)]
    end = BASE + timedelta(milliseconds=i)
    return {
        "sensor_type": vital,
        "site_id": f"load-{i % 50}",
        "unit": "x",
        "window_start": (end - timedelta(seconds=10)).isoformat(),
        "window_end": end.isoformat(),
        "count": 5,
        "min": 1.0, "max": 9.0, "avg": 5.0, "latest": 5.0,
        "alerts": [],
    }


def main():
    parser = argparse.ArgumentParser(description="Burst-load the backend queue to demonstrate scaling.")
    parser.add_argument("--messages", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=32)
    args = parser.parse_args()

    sqs = boto3.client("sqs", endpoint_url=ENDPOINT, region_name=REGION)
    queue_url = sqs.get_queue_url(QueueName=QUEUE_NAME)["QueueUrl"]

    def send(i):
        sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(sample_message(i)))

    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        list(pool.map(send, range(args.messages)))
    elapsed = time.monotonic() - start

    print(f"sent {args.messages} messages in {elapsed:.2f}s ({args.messages / elapsed:.0f} msg/s)")
    attrs = sqs.get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    )["Attributes"]
    print("queue depth after burst:", attrs)


if __name__ == "__main__":
    main()
