prefix       = "fpv"
project_root = ".."

table_name = "fpv-readings"
queue_name = "fpv-vitals-agg"

processor_lambda_name   = "fpv-processor"
processor_build_command = "cd backend/processor && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip handler.js transform.js package.json node_modules"
processor_zip_path      = "backend/processor/lambda.zip"
processor_handler       = "handler.handler"
processor_runtime       = "nodejs20.x"

dashboard_lambda_name   = "fpv-dashboard-api"
dashboard_build_command = "cd backend/dashboard && npm ci --omit=dev --silent && rm -f lambda.zip && zip -qr lambda.zip lambdaHandler.js dynamoHelper.js healthChecks.js package.json node_modules"
dashboard_zip_path      = "backend/dashboard/lambda.zip"
dashboard_handler       = "lambdaHandler.handler"
dashboard_runtime       = "nodejs20.x"

frontend_local_dir    = "backend/dashboard/static"
api_base_placeholder  = "__API_BASE__"
api_base_search_files = ["index.html"]
