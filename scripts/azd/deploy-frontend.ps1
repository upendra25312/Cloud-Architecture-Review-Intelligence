Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$FrontendDir = Join-Path $RepoRoot "frontend"
$TerraformDir = Join-Path $RepoRoot "infrastructure/terraform"

function Write-Info([string]$Message) { Write-Host "[deploy-frontend] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[deploy-frontend] $Message" }

function Get-TerraformOutput([string]$Name) {
  Push-Location $TerraformDir
  try {
    $value = terraform output -raw $Name 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($value)) {
      Fail "Terraform output '$Name' is missing."
    }
    return $value.Trim()
  }
  finally {
    Pop-Location
  }
}

$apiUrl = Get-TerraformOutput -Name "function_app_url"
$swaUrl = Get-TerraformOutput -Name "static_web_app_url"
$swaToken = Get-TerraformOutput -Name "static_web_app_deploy_token"

Write-Info "Building frontend with NEXT_PUBLIC_API_URL=$apiUrl"
Push-Location $FrontendDir
try {
  $env:NEXT_PUBLIC_API_URL = $apiUrl
  $env:SWA_CLI_DEPLOYMENT_TOKEN = $swaToken

  npm ci
  if ($LASTEXITCODE -ne 0) { Fail "npm ci failed for frontend." }

  npm run build
  if ($LASTEXITCODE -ne 0) { Fail "Frontend build failed." }

  $outDir = Join-Path $FrontendDir "out"
  if (-not (Test-Path $outDir)) {
    Fail "Frontend build output directory '$outDir' was not created."
  }

  Write-Info "Deploying static export to Azure Static Web Apps..."
  npx -y @azure/static-web-apps-cli@2.0.9 deploy ./out --env production
  if ($LASTEXITCODE -ne 0) { Fail "Static Web Apps deploy failed." }
}
finally {
  Pop-Location
}

Write-Info "Running frontend smoke tests..."
foreach ($path in @("/", "/arb")) {
  $uri = "$swaUrl$path"
  try {
    $response = Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
    $statusCode = [int]$response.StatusCode
    if ($statusCode -ne 200) {
      Fail "Frontend route '$path' returned status $statusCode."
    }
  }
  catch {
    Fail "Smoke test failed for '$uri': $($_.Exception.Message)"
  }
}

Write-Info "Frontend deployment and smoke tests completed successfully."
