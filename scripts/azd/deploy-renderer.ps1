Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$RendererDir = Join-Path $RepoRoot "services/office-renderer"
$TerraformDir = Join-Path $RepoRoot "infrastructure/terraform"

function Write-Info([string]$Message) { Write-Host "[deploy-renderer] $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { throw "[deploy-renderer] $Message" }

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

function New-HexSecret([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

$resourceGroup = Get-TerraformOutput -Name "resource_group_name"
$functionAppName = Get-TerraformOutput -Name "function_app_name"
$acrName = Get-TerraformOutput -Name "office_renderer_container_registry_name"
$acrLoginServer = Get-TerraformOutput -Name "office_renderer_container_registry_login_server"
$containerAppName = Get-TerraformOutput -Name "office_renderer_container_app_name"

$imageName = "cari-office-renderer"
$imageTag = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$imageRef = "$acrLoginServer/${imageName}:$imageTag"
$rendererToken = New-HexSecret -Bytes 32

Write-Info "Running renderer unit tests..."
Push-Location $RendererDir
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { Fail "npm ci failed for renderer." }

  npm test
  if ($LASTEXITCODE -ne 0) { Fail "Renderer tests failed." }
}
finally {
  Pop-Location
}

Write-Info "Authenticating Docker with ACR..."
$acrUsername = az acr credential show --name $acrName --resource-group $resourceGroup --query username --output tsv
$acrPassword = az acr credential show --name $acrName --resource-group $resourceGroup --query "passwords[0].value" --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($acrUsername) -or [string]::IsNullOrWhiteSpace($acrPassword)) {
  Fail "Unable to read ACR credentials."
}

$acrPassword | docker login $acrLoginServer --username $acrUsername --password-stdin | Out-Null
if ($LASTEXITCODE -ne 0) {
  Fail "Docker login to ACR failed."
}

Write-Info "Building and pushing renderer image '$imageRef'..."
docker build -t $imageRef -t "$acrLoginServer/${imageName}:latest" $RendererDir
if ($LASTEXITCODE -ne 0) { Fail "Docker build failed." }

docker push $imageRef
if ($LASTEXITCODE -ne 0) { Fail "Docker push failed for tag '$imageTag'." }

docker push "$acrLoginServer/${imageName}:latest"
if ($LASTEXITCODE -ne 0) { Fail "Docker push failed for tag 'latest'." }

Write-Info "Updating Container App image and runtime settings..."
az containerapp secret set `
  --name $containerAppName `
  --resource-group $resourceGroup `
  --secrets "renderer-shared-secret=$rendererToken" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Failed to set Container App secret." }

az containerapp registry set `
  --name $containerAppName `
  --resource-group $resourceGroup `
  --server $acrLoginServer `
  --username $acrUsername `
  --password $acrPassword | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Failed to set Container App registry configuration." }

az containerapp update `
  --name $containerAppName `
  --resource-group $resourceGroup `
  --image $imageRef `
  --set-env-vars `
  "NODE_ENV=production" `
  "PORT=8080" `
  "RENDERER_MAX_FILE_BYTES=52428800" `
  "RENDERER_MAX_PAGES=20" `
  "RENDERER_COMMAND_TIMEOUT_MS=120000" `
  "RENDERER_SHARED_SECRET=secretref:renderer-shared-secret" `
  --min-replicas 0 `
  --max-replicas 1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Failed to update Container App image." }

$rendererFqdn = az containerapp show `
  --name $containerAppName `
  --resource-group $resourceGroup `
  --query properties.configuration.ingress.fqdn `
  --output tsv

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($rendererFqdn)) {
  Fail "Unable to resolve renderer endpoint."
}

$rendererEndpoint = "https://$rendererFqdn"

Write-Info "Updating Function App renderer settings..."
az functionapp config appsettings set `
  --resource-group $resourceGroup `
  --name $functionAppName `
  --settings `
  "OFFICE_RENDERER_ENDPOINT=$rendererEndpoint" `
  "OFFICE_RENDERER_SHARED_SECRET=$rendererToken" `
  "OFFICE_RENDERER_MAX_FILE_BYTES=52428800" `
  "OFFICE_RENDERER_MAX_PAGES=20" `
  "OFFICE_RENDERER_TIMEOUT_MS=120000" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Failed to update Function App renderer settings." }

azd env set CARI_OFFICE_RENDERER_ENDPOINT $rendererEndpoint | Out-Null

Write-Info "Running renderer health check..."
try {
  $response = Invoke-WebRequest -Uri "$rendererEndpoint/health" -Method GET -TimeoutSec 30 -SkipHttpErrorCheck
  if ([int]$response.StatusCode -ne 200) {
    Fail "Renderer health endpoint returned status $($response.StatusCode)."
  }
}
catch {
  Fail "Renderer health check failed: $($_.Exception.Message)"
}

Write-Info "Renderer deployment completed successfully."
