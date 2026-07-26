import os
import sys
import time

import boto3
from boto3.dynamodb.conditions import Key

ENDPOINT = os.getenv("AWS_ENDPOINT_URL", "http://localhost:4568")
REGION = os.getenv("AWS_REGION", "eu-west-1")
TABLE_NAME = os.getenv("TABLE_NAME", "fpv-readings")

VITAL_TYPES = ["heart_rate", "spo2", "body_temperature", "respiration_rate", "systolic_bp"]


def main():
    deadline = time.monotonic() + float(os.getenv("VERIFY_TIMEOUT", "90"))
    table = boto3.resource("dynamodb", endpoint_url=ENDPOINT, region_name=REGION).Table(TABLE_NAME)

    seen = set()
    while time.monotonic() < deadline and len(seen) < len(VITAL_TYPES):
        for vital in VITAL_TYPES:
            if vital in seen:
                continue
            resp = table.query(
                KeyConditionExpression=Key("sensor_type").eq(vital),
                Limit=1,
            )
            if resp.get("Items"):
                seen.add(vital)
                print(f"  ok: {vital}")
        if len(seen) < len(VITAL_TYPES):
            time.sleep(3)

    missing = [v for v in VITAL_TYPES if v not in seen]
    if missing:
        print(f"FAILED: no records for {missing}")
        sys.exit(1)
    print(f"PASSED: all {len(VITAL_TYPES)} vital types have records in {TABLE_NAME}")


if __name__ == "__main__":
    main()
