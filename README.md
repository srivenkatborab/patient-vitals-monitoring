# Patient Vitals Remote Monitoring

A four-tier **fog computing** system that continuously monitors five vital signs across multiple hospital
beds, raises clinical alarms **at the edge** (near the bedside, without a cloud round trip), and streams
compact window summaries to AWS for durable storage and a live dashboard.

**Student:** Sri Venkat Bora (X25164414)
**Module:** H9FECC — Fog and Edge Computing
**Stack:** Node.js 20 end to end · Express · AWS SDK v3 · Docker Compose · LocalStack · Terraform
**Tests:** 41 automated tests (Node's built-in `node:test` runner — no test framework dependency)

> 📖 **[readme.txt](readme.txt)** is the prerequisites / install / configuration / build / run / deploy /
> test reference.

---

## The problem

Patient deterioration shows up in the vitals **hours** before the crisis — but standard ward practice
takes observations every four hours, so whatever happens between two rounds is invisible. Monitoring
continuously fixes that, and immediately creates three new problems:

| Problem | Why it bites |
|---|---|
| **Volume** | Two beds × five vitals = **194 readings/minute**. A 300-bed hospital is ~42 M readings/day, 99% of them saying "the patient is fine". |
| **Latency & availability** | An oxygen-desaturation alarm that must round-trip to a datacentre is wrong by design — the patient is *in the room*. Lose the WAN for two minutes and you have permanently lost two minutes of vitals. |
| **False alarms** | A single 88% oximeter sample from a patient who rolled over is not a clinical event. An alarm that cries wolf gets ignored, and **alarm fatigue is itself a patient-safety hazard**. |

## The solution

A **fog tier** in the ward, between the instruments and the cloud, that does three things:

1. **Reduces** — collects readings into fixed 10-second windows and folds each to a five-number summary
   (`count`, `min`, `max`, `avg`, `latest`). The ward's 194 readings/min leave the building as **6 cloud
   API calls/min — a 32:1 reduction**.
2. **Decides locally** — the threshold rules live *in the fog node*, so a breach is labelled milliseconds
   after the window closes, with no cloud involvement. Pull the WAN cable and the ward still knows the
   patient is hypoxic.
3. **Buffers** — sensors retain failed batches in memory and retry on the next tick, so a transient
   network failure drops nothing.

**The distinctive design decision:** each alarm rule reads the field its failure mode actually lives in.
Eight of the nine rules read the window **average**, so a vital must be *sustainedly* out of band to fire —
an SpO2 window of `92.4, 91.6, 92.6` dips below the 92 floor but averages 92.2, and correctly stays
silent. But the hypothermia rule reads the window **minimum**, because averaging is the right filter for a
*drift* and the wrong filter for a *floor*: a temperature window of `35.8, 35.5, 35.2` averages to exactly
35.5 and would slip past an average-based test, even though the patient was measurably hypothermic within
the last ten seconds.

## Architecture

```
┌─ EDGE — 10 containers ────────────────────────────────────────────┐
│  heart_rate · spo2 · body_temperature · respiration_rate ·        │
│  systolic_bp     ×     patient-1, patient-2                      │
│  bounded random walk, sample 2–5s → buffer → POST batch 8–20s     │
│  194 readings/min  →  ~49 HTTP requests/min            [4:1]      │
└──────────────────────────────┬────────────────────────────────────┘
                               │  POST /ingest → 202 Accepted
                               ▼
┌─ FOG — Express :8000, on EC2 in the ward ─────────────────────────┐
│  /ingest  buffer per (vital, patient) channel                     │
│  /health  liveness — polled by the dashboard                      │
│  /thresholds  publishes the LIVE alarm rules                      │
│                                                                    │
│  every 10s:  snapshot-then-clear  (race-free)                     │
│              fold   → count/min/max/avg/latest                    │
│              screen → alerts: ["hypoxia_risk"]   ← DECISION, LOCAL │
│              publish → SQS, batched ≤10 per call                  │
└──────────────────────────────┬────────────────────────────────────┘
                               │  6 SendMessageBatch/min  [32:1 total]
                               ▼
┌─ CLOUD ───────────────────────────────────────────────────────────┐
│  SQS  fpv-vitals-agg        elastic buffer, decouples fog ↔ cloud │
│    └─ Lambda fpv-processor  transform → PutItem (idempotent)      │
│         └─ DynamoDB fpv-readings                                  │
│              PK sensor_type · SK window_end#patient_id            │
└──────────────────────────────┬────────────────────────────────────┘
                               ▼
┌─ SERVING ─────────────────────────────────────────────────────────┐
│  Lambda fpv-dashboard-api + API Gateway — 5 JSON endpoints        │
│  S3 static dashboard — polls every 2.5s, ECG trace + vital tiles  │
└───────────────────────────────────────────────────────────────────┘
```

Note the dashboard's **two independent paths**: it queries DynamoDB for data *and* reaches back to the fog
node's `/health` and `/thresholds` over the Elastic IP. That is what lets `/api/health` return four
separate booleans (`gateway`, `queue`, `lambda`, `pipeline`) and so **localise** a failure instead of just
reporting one.

## The five vitals and nine alarm rules

| Vital | Unit | Sensor band | Rule | Alarm |
|---|---|---|---|---|
| `heart_rate` | bpm | 40–160 | `avg < 50` / `avg > 120` | `bradycardia_risk` / `tachycardia_risk` |
| `spo2` | % | 85–100 | `avg < 92` | `hypoxia_risk` |
| `body_temperature` | °C | 34–41 | `avg > 38.5` / **`min < 35.5`** | `fever` / `hypothermia_risk` |
| `respiration_rate` | brpm | 6–32 | `avg > 24` / `avg < 10` | `respiratory_distress` / `bradypnea_risk` |
| `systolic_bp` | mmHg | 80–180 | `avg > 140` / `avg < 90` | `hypertension_risk` / `hypotension_risk` |

`spo2` is the only single-sided rule — there is no such thing as too much blood oxygen.

## Quick start

```bash
docker compose -f infra/docker-compose.yml up --build
```

Open **http://localhost:8082**. Within ~30 seconds you should see two patient cards, ECG traces drawing,
and a green health footer. LocalStack is on `:4568`; the fog node, ten sensors and the processor talk over
the compose network only.

Verify the pipeline end to end, and tear down:

```bash
python infra/verify_pipeline.py     # asserts all five vitals reached DynamoDB
docker compose -f infra/docker-compose.yml down -v
```

## Tests — 41 total

```bash
cd sensors            && npm install && npm test    #  4
cd ../fog             && npm install && npm test    # 16
cd ../backend/processor && npm install && npm test  #  5
cd ../backend/dashboard && npm install && npm test  # 16
```

AWS clients are faked by **injection**, not module mocking, so the tests exercise the real handler code
paths with no network and no LocalStack.

## Repository layout

```
sensors/            edge tier — bounded random walk, batching, retry-on-failure  (zero dependencies)
fog/                fog tier — Express gateway, window fold, threshold screening, SQS relay
backend/processor/  SQS-triggered ingestion Lambda → DynamoDB
backend/dashboard/  serving tier — Lambda handler (AWS) + Express server (local) + static frontend
infra/              docker-compose (local + AWS), LocalStack init, pipeline verifier, load generator
terraform/          IaC — provisions all 24 AWS resources in one apply
```

## Local vs AWS — one variable

The same source runs in both places, switched by **`AWS_ENDPOINT_URL`**:

- **set** → clients point at LocalStack with static `test` credentials (local Docker Compose).
- **unset** → no endpoint override and no static keys, so the SDK default credential chain resolves the
  **EC2 instance profile**. No secret is ever baked into an image or committed.

## Deploy to AWS

```bash
aws configure && aws sts get-caller-identity     # confirm the target account
cd terraform
terraform workspace new fpv                      # isolate this stack's state
./build.sh deployments/fpv.tfvars                # build both Lambda zips
terraform plan  -var-file=deployments/fpv.tfvars # expect "24 to add, 0 to destroy"
terraform apply -var-file=deployments/fpv.tfvars
```

Read the plan's `Plan: N to add, 0 to change, 0 to destroy` line before approving — **a nonzero destroy
count is a stop-and-ask signal.**

## Known limitations

- The fog node's window buffers are **in memory**, so a container restart loses up to 10 seconds of
  buffered data per channel. The production fix is a small write-ahead log on the fog host, replayed on
  startup.
- The patient roster and vital list are compile-time constants in the serving tier, so admitting a patient
  needs a redeploy. Deriving the roster from the table's partitions would be the production answer.
