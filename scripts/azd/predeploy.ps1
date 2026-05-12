param(
  [switch]$SkipRenderer,
  [switch]$SkipApi,
  [switch]$SkipFrontend
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "[predeploy] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[predeploy] $Message" }

$deployRendererScript = Join-Path $PSScriptRoot "deploy-renderer.ps1"
$deployApiScript = Join-Path $PSScriptRoot "deploy-api.ps1"
$deployFrontendScript = Join-Path $PSScriptRoot "deploy-frontend.ps1"

foreach ($scriptPath in @($deployRendererScript, $deployApiScript, $deployFrontendScript)) {
  if (-not (Test-Path $scriptPath)) {
    Fail "Missing deployment script: $scriptPath"
  }
}

Write-Info "Starting azd predeploy orchestration..."

if (-not $SkipRenderer) {
  Write-Info "Deploying Office renderer..."
  & $deployRendererScript
}

if (-not $SkipApi) {
  Write-Info "Deploying API..."
  & $deployApiScript
}

if (-not $SkipFrontend) {
  Write-Info "Deploying frontend..."
  & $deployFrontendScript
}

Write-Info "predeploy orchestration completed successfully."
