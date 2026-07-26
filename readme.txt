Patient Vitals Monitoring

PREREQUISITES
--------------
  - Docker and Docker Compose (to run the local stack)
  - Node.js 20+ (to run each module's own test suite locally; matches the
    node:20-slim base image used by every Dockerfile in this project)
  - AWS CLI (to deploy)
  - Terraform >= 1.5 (to deploy; matches the version constraint in
    terraform/main.tf)

INSTALLATION STEPS
--------------------
1. Clone this repository and change into the project folder:
     git clone <repository-url>
     cd projects/03-patient-vitals

2. Install each module's local dependencies (needed to run its unit tests):
     cd sensors && npm install               (no dependencies to install)
     cd ../fog && npm install
     cd ../backend/processor && npm install
     cd ../backend/dashboard && npm install

CONFIGURATION
--------------
sensors/sensor.js (one container per vital per patient):
  SENSOR_TYPE            vital this container simulates: heart_rate, spo2,
                         body_temperature, respiration_rate, or systolic_bp;
                         no default, required
  SITE_ID                patient identifier attached to each reading;
                         default patient-1
  SAMPLE_INTERVAL        seconds between generated readings; default 2
  DISPATCH_INTERVAL      seconds between batched dispatches to the fog
                         gateway; default 10
  FOG_URL                fog gateway ingest endpoint; default
                         http://fog:8000/ingest

fog/app.js, fog/queueGateway.js:
  WINDOW_SECONDS         seconds per aggregation window; default 10
  SQS_QUEUE_NAME         SQS queue the fog node publishes window summaries
                         to; default fpv-vitals-agg
  AWS_ENDPOINT_URL       AWS endpoint override; unset by default
  AWS_REGION             AWS region; default eu-west-1

backend/processor/handler.js, backend/processor/deploy_lambda.sh:
  TABLE_NAME             DynamoDB table records are written to; default
                         fpv-readings
  AWS_REGION             AWS region; default eu-west-1
  AWS_ENDPOINT_URL       AWS endpoint override; unset by default
  AWS_ACCESS_KEY_ID      static access key, used only when AWS_ENDPOINT_URL
                         is set; default test
  AWS_SECRET_ACCESS_KEY  static secret key, used only when AWS_ENDPOINT_URL
                         is set; default test
  SQS_QUEUE_NAME         queue deploy_lambda.sh wires the Lambda's event
                         source mapping to; default fpv-vitals-agg
  LAMBDA_FUNCTION_NAME   Lambda function name deploy_lambda.sh creates or
                         updates; default fpv-processor

backend/dashboard/server.js:
  TABLE_NAME             DynamoDB table read for patient vitals; default
                         fpv-readings
  SQS_QUEUE_NAME         SQS queue reported on by the health and stats
                         endpoints; default fpv-vitals-agg
  LAMBDA_FUNCTION_NAME   Lambda function reported on by the health
                         endpoint; default fpv-processor
  FOG_HEALTH_URL         fog node health endpoint polled by /api/health;
                         default http://fog:8000/health
  FOG_THRESHOLDS_URL     fog node thresholds endpoint proxied by
                         /api/thresholds; default http://fog:8000/thresholds
  AWS_REGION             AWS region; default eu-west-1
  AWS_ENDPOINT_URL       AWS endpoint override; unset by default
  AWS_ACCESS_KEY_ID      static access key, used only when AWS_ENDPOINT_URL
                         is set; default test
  AWS_SECRET_ACCESS_KEY  static secret key, used only when AWS_ENDPOINT_URL
                         is set; default test

BUILD INSTRUCTIONS
--------------------
  sensors:            no dependencies; nothing to build
  fog:                cd fog && npm install
  backend/processor:  cd backend/processor && npm install
  backend/dashboard:  cd backend/dashboard && npm install

These match what each module's own Dockerfile runs during its image build
(npm install --omit=dev). backend/processor's Docker build additionally
zips the installed files into a deployable archive:
  zip -qr function.zip handler.js transform.js node_modules

RUN INSTRUCTIONS
------------------
Bring up the local stack:
  docker compose -f infra/docker-compose.yml up --build

Ports exposed to the host:
  Dashboard:   http://localhost:8082   (container port 8000)
  LocalStack:  http://localhost:4568   (container port 4566)

The fog gateway, the ten sensor containers, and the one-shot processor
container are not published to the host; they communicate over the
compose network only.

Stop the stack:
  docker compose -f infra/docker-compose.yml down -v

AWS DEPLOYMENT STEPS
----------------------
Deployment uses the Terraform module in the repository's top-level
terraform/ directory.

1. Configure AWS CLI credentials for the target AWS account:
     aws configure
   or export AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and (for temporary
   credentials) AWS_SESSION_TOKEN directly.

2. Confirm the credentials resolve to the intended account:
     aws sts get-caller-identity

3. From the terraform/ directory, create and switch to a dedicated
   workspace before running any apply:
     cd terraform
     terraform workspace new fpv
     terraform workspace list

4. Create terraform/deployments/fpv.tfvars in "key = value" format,
   defining every variable terraform/variables.tf requires:
     prefix                   = "fpv"
     project_root             = "../projects/03-patient-vitals"
     table_name               = "fpv-readings"
     queue_name               = "fpv-vitals-agg"
     processor_lambda_name    = "fpv-processor"
     processor_build_command  = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
     processor_zip_path       = "backend/processor/lambda.zip"
     processor_handler        = "handler.handler"
     processor_runtime        = "nodejs20.x"
     dashboard_lambda_name    = "fpv-dashboard-api"
     dashboard_build_command  = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js dynamoHelper.js healthChecks.js package.json node_modules"
     dashboard_zip_path       = "backend/dashboard/lambda.zip"
     dashboard_handler        = "lambdaHandler.handler"
     dashboard_runtime        = "nodejs20.x"
     frontend_local_dir       = "backend/dashboard/static"
     api_base_placeholder     = "<placeholder token to substitute with the deployed API Gateway URL>"
     api_base_search_files    = ["<frontend file(s) containing that placeholder>"]

5. Build the Lambda deployment artifacts, then plan and apply:
     ./build.sh deployments/fpv.tfvars
     terraform plan -var-file=deployments/fpv.tfvars
     terraform apply -var-file=deployments/fpv.tfvars

6. After the apply finishes, switch back to the default workspace:
     terraform workspace select default

TESTING INSTRUCTIONS
-----------------------
Each module has its own package.json and test script, using Node's
built-in node:test runner:

  cd sensors && npm test                4 tests
  cd fog && npm test                    16 tests
  cd backend/processor && npm test      5 tests
  cd backend/dashboard && npm test      16 tests

Total: 41 tests.
