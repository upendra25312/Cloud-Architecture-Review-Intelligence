Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "[preprovision] $Message" -ForegroundColor Cyan }
function Write-WarnMsg([string]$Message) { Write-Host "[preprovision] $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { throw "[preprovision] $Message" }

function Test-Command([Parameter(Mandatory = $true)][string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-AzdEnvironmentMap {
  $values = azd env get-values 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $values) {
    Fail "No active azd environment. Run 'azd env new <name>' or 'azd env select <name>'."
  }

  $map = @{}
  foreach ($line in $values) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$') {
      $name = $matches[1]
      $value = $matches[2].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $map[$name] = $value
    }
  }
  return $map
}

function Set-AzdEnvValue([string]$Name, [string]$Value) {
  azd env set $Name $Value | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail "Failed setting azd environment value '$Name'."
  }
}

Write-Info "Validating required deployment tools..."
$requiredTools = @("az", "azd", "terraform", "node", "npm", "docker")
foreach ($tool in $requiredTools) {
  if (-not (Test-Command -Name $tool)) {
    Fail "Required tool '$tool' is not installed or not on PATH."
  }
}

Write-Info "Validating Azure CLI authentication..."
az account show --output none 2>$null
if ($LASTEXITCODE -ne 0) {
  Fail "Azure CLI is not authenticated. Run 'az login' first."
}

$envMap = Get-AzdEnvironmentMap

$requiredAzdVars = @("AZURE_SUBSCRIPTION_ID", "AZURE_LOCATION", "CARI_ALERT_EMAIL")
foreach ($varName in $requiredAzdVars) {
  if (-not $envMap.ContainsKey($varName) -or [string]::IsNullOrWhiteSpace($envMap[$varName])) {
    Fail "Missing required azd environment value '$varName'."
  }
}

$defaultValues = @{
  "CARI_PREFIX"                    = "arb-review"
  "CARI_PREFIX_SHORT"              = "arbrev"
  "CARI_BUDGET_AMOUNT"             = "60"
  "CARI_USE_DURABLE_ORCHESTRATION" = "OFF"
}

foreach ($key in $defaultValues.Keys) {
  if (-not $envMap.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envMap[$key])) {
    $value = $defaultValues[$key]
    Write-WarnMsg "Setting default azd environment value $key=$value"
    Set-AzdEnvValue -Name $key -Value $value
    $envMap[$key] = $value
  }
}

if ($envMap.ContainsKey("AZURE_ENV_NAME") -and [string]::IsNullOrWhiteSpace($envMap["AZURE_ENV_NAME"])) {
  $envMap.Remove("AZURE_ENV_NAME")
}

if (-not $envMap.ContainsKey("AZURE_ENV_NAME")) {
  Fail "AZURE_ENV_NAME is not set. Run 'azd env new <name>' and retry."
}

Write-Info "Validating subscription selection..."
$currentSubscriptionId = az account show --query id --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentSubscriptionId)) {
  Fail "Unable to read current Azure subscription."
}
if ($currentSubscriptionId -ne $envMap["AZURE_SUBSCRIPTION_ID"]) {
  Write-Info "Switching Azure CLI context to AZURE_SUBSCRIPTION_ID..."
  az account set --subscription $envMap["AZURE_SUBSCRIPTION_ID"]
  if ($LASTEXITCODE -ne 0) {
    Fail "Unable to set Azure subscription '$($envMap["AZURE_SUBSCRIPTION_ID"])'."
  }
}

Write-Info "Mapping azd variables to Terraform TF_VAR_* values..."
$tfVarMap = @{
  "TF_VAR_subscription_id"          = $envMap["AZURE_SUBSCRIPTION_ID"]
  "TF_VAR_location"                 = $envMap["AZURE_LOCATION"]
  "TF_VAR_env"                      = $envMap["AZURE_ENV_NAME"]
  "TF_VAR_prefix"                   = $envMap["CARI_PREFIX"]
  "TF_VAR_prefix_short"             = $envMap["CARI_PREFIX_SHORT"]
  "TF_VAR_alert_email"              = $envMap["CARI_ALERT_EMAIL"]
  "TF_VAR_budget_amount"            = $envMap["CARI_BUDGET_AMOUNT"]
  "TF_VAR_use_durable_orchestration" = $envMap["CARI_USE_DURABLE_ORCHESTRATION"]
}

foreach ($pair in $tfVarMap.GetEnumerator()) {
  if ([string]::IsNullOrWhiteSpace($pair.Value)) {
    Fail "Cannot set '$($pair.Key)' because source value is empty."
  }
  Set-AzdEnvValue -Name $pair.Key -Value $pair.Value
}

Write-Info "preprovision validation completed successfully."
