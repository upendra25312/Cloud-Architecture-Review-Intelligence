Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$TerraformDir = Join-Path $RepoRoot "infrastructure/terraform"

function Write-Info([string]$Message) { Write-Host "[postprovision] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[postprovision] $Message" }

function Set-AzdEnvValue([string]$Name, [string]$Value) {
  azd env set $Name $Value | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail "Failed setting azd environment value '$Name'."
  }
}

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

Write-Info "Reading Terraform outputs..."
$resourceGroup = Get-TerraformOutput -Name "resource_group_name"
$functionAppName = Get-TerraformOutput -Name "function_app_name"
$functionAppUrl = Get-TerraformOutput -Name "function_app_url"
$staticWebAppUrl = Get-TerraformOutput -Name "static_web_app_url"
$storageAccountName = Get-TerraformOutput -Name "storage_account_name"
$searchEndpoint = Get-TerraformOutput -Name "search_endpoint"
$docIntelEndpoint = Get-TerraformOutput -Name "doc_intel_endpoint"
$visionEndpoint = Get-TerraformOutput -Name "vision_endpoint"
$rendererEndpoint = Get-TerraformOutput -Name "office_renderer_endpoint"
$swaDeployToken = Get-TerraformOutput -Name "static_web_app_deploy_token"

Write-Info "Persisting outputs into azd environment..."
$envOutputMap = @{
  "CARI_RESOURCE_GROUP"              = $resourceGroup
  "CARI_FUNCTION_APP_NAME"           = $functionAppName
  "CARI_FUNCTION_APP_URL"            = $functionAppUrl
  "CARI_STATIC_WEB_APP_URL"          = $staticWebAppUrl
  "CARI_STORAGE_ACCOUNT_NAME"        = $storageAccountName
  "CARI_SEARCH_ENDPOINT"             = $searchEndpoint
  "CARI_DOCINT_ENDPOINT"             = $docIntelEndpoint
  "CARI_VISION_ENDPOINT"             = $visionEndpoint
  "CARI_OFFICE_RENDERER_ENDPOINT"    = $rendererEndpoint
  "CARI_STATIC_WEB_APP_DEPLOY_TOKEN" = $swaDeployToken
}

foreach ($pair in $envOutputMap.GetEnumerator()) {
  Set-AzdEnvValue -Name $pair.Key -Value $pair.Value
}

Write-Info "Synchronizing runtime app settings that depend on provisioned outputs..."
az functionapp config appsettings set `
  --resource-group $resourceGroup `
  --name $functionAppName `
  --settings `
  "AZURE_SEARCH_ENDPOINT=$searchEndpoint" `
  "AZURE_DOCINT_ENDPOINT=$docIntelEndpoint" `
  "AZURE_VISION_ENDPOINT=$visionEndpoint" `
  "OFFICE_RENDERER_ENDPOINT=$rendererEndpoint" `
  "AZURE_SEARCH_USE_MI=true" `
  "AZURE_DOCINT_USE_MI=true" | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "Failed updating Function App settings."
}

Write-Info "Validating managed identity app settings..."
$searchUseMi = az functionapp config appsettings list `
  --resource-group $resourceGroup `
  --name $functionAppName `
  --query "[?name=='AZURE_SEARCH_USE_MI'].value | [0]" `
  --output tsv
if ($LASTEXITCODE -ne 0 -or $searchUseMi -ne "true") {
  Fail "AZURE_SEARCH_USE_MI app setting is not configured as 'true'."
}

$docIntUseMi = az functionapp config appsettings list `
  --resource-group $resourceGroup `
  --name $functionAppName `
  --query "[?name=='AZURE_DOCINT_USE_MI'].value | [0]" `
  --output tsv
if ($LASTEXITCODE -ne 0 -or $docIntUseMi -ne "true") {
  Fail "AZURE_DOCINT_USE_MI app setting is not configured as 'true'."
}

Write-Info "postprovision completed successfully."
