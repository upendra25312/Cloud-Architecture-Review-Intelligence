Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$TerraformDir = Join-Path $RepoRoot "infrastructure/terraform"

function Write-Info([string]$Message) { Write-Host "[postdeploy] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[postdeploy] $Message" }

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

function Invoke-SmokeCheck([string]$Name, [string]$Url, [int[]]$AllowedStatusCodes) {
  try {
    $response = Invoke-WebRequest -Uri $Url -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
    $statusCode = [int]$response.StatusCode
  }
  catch {
    Fail "$Name check failed: $($_.Exception.Message)"
  }

  if ($AllowedStatusCodes -notcontains $statusCode) {
    Fail "$Name check failed with status $statusCode. Allowed values: $($AllowedStatusCodes -join ', ')."
  }
  Write-Info "$Name check passed with status $statusCode."
}

$frontendUrl = Get-TerraformOutput -Name "static_web_app_url"
$apiUrl = Get-TerraformOutput -Name "function_app_url"
$rendererUrl = Get-TerraformOutput -Name "office_renderer_endpoint"

Write-Info "Final deployment endpoints:"
Write-Host "  Frontend: $frontendUrl"
Write-Host "  ARB:      $frontendUrl/arb"
Write-Host "  API:      $apiUrl"
Write-Host "  Renderer: $rendererUrl"

Write-Info "Running smoke tests..."
Invoke-SmokeCheck -Name "Frontend home" -Url $frontendUrl -AllowedStatusCodes @(200)
Invoke-SmokeCheck -Name "Frontend /arb" -Url "$frontendUrl/arb" -AllowedStatusCodes @(200)
Invoke-SmokeCheck -Name "API health" -Url "$apiUrl/api/health" -AllowedStatusCodes @(200, 401, 503)
Invoke-SmokeCheck -Name "Renderer health" -Url "$rendererUrl/health" -AllowedStatusCodes @(200)

Write-Info "Smoke tests completed."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Open $frontendUrl/arb"
Write-Host "  2. Sign in with your configured Entra account."
Write-Host "  3. Start a new review and upload architecture artifacts."
