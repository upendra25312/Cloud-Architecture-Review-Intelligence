param(
  [int]$MinimumFunctionCount = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ApiDir = Join-Path $RepoRoot "api"
$ArtifactDir = Join-Path $RepoRoot ".azure/deploy-artifacts"
$PackagePath = Join-Path $ArtifactDir "api.zip"
$TerraformDir = Join-Path $RepoRoot "infrastructure/terraform"

function Write-Info([string]$Message) { Write-Host "[deploy-api] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[deploy-api] $Message" }

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

$resourceGroup = Get-TerraformOutput -Name "resource_group_name"
$functionAppName = Get-TerraformOutput -Name "function_app_name"
$functionAppUrl = Get-TerraformOutput -Name "function_app_url"

Write-Info "Installing API dependencies and running tests..."
Push-Location $ApiDir
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { Fail "npm ci failed for API." }

  npm test
  if ($LASTEXITCODE -ne 0) { Fail "API tests failed." }
}
finally {
  Pop-Location
}

Write-Info "Packaging API for zip deployment..."
New-Item -ItemType Directory -Path $ArtifactDir -Force | Out-Null
if (Test-Path $PackagePath) {
  Remove-Item -Path $PackagePath -Force
}

Compress-Archive -Path (Join-Path $ApiDir "*") -DestinationPath $PackagePath -Force

Write-Info "Deploying package to Azure Function App '$functionAppName'..."
az functionapp deployment source config-zip `
  --resource-group $resourceGroup `
  --name $functionAppName `
  --src $PackagePath `
  --build-remote true | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "Function App zip deployment failed."
}

Start-Sleep -Seconds 20

Write-Info "Running API health check..."
$healthStatus = $null
try {
  $response = Invoke-WebRequest -Uri "$functionAppUrl/api/health" -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
  $healthStatus = [int]$response.StatusCode
}
catch {
  Fail "Health check request failed: $($_.Exception.Message)"
}

if ($healthStatus -notin @(200, 401, 503)) {
  Fail "Unexpected API health status code: $healthStatus"
}
Write-Info "API health check returned status $healthStatus."

Write-Info "Validating deployed function count..."
$functionCount = az functionapp function list `
  --name $functionAppName `
  --resource-group $resourceGroup `
  --query "length(@)" `
  --output tsv

if ($LASTEXITCODE -ne 0) {
  Fail "Unable to enumerate functions from Function App."
}

if ([int]$functionCount -lt $MinimumFunctionCount) {
  Fail "Expected at least $MinimumFunctionCount functions, but found $functionCount."
}

Write-Info "Deployment verification passed with $functionCount functions."
