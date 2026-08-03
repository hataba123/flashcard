[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspacePath = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $workspacePath '.env'

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw "Khong tim thay file .env tai $envPath."
}

function Read-DotEnv {
    param([Parameter(Mandatory)][string]$Path)

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmedLine = $line.Trim()
        if ($trimmedLine.Length -eq 0 -or $trimmedLine.StartsWith('#')) {
            continue
        }

        if ($trimmedLine -notmatch '^(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)$') {
            continue
        }

        $value = $Matches['value'].Trim()
        if (
            $value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'")))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        $values[$Matches['name']] = $value
    }

    return $values
}

function Get-RequiredValue {
    param(
        [Parameter(Mandatory)][hashtable]$Values,
        [Parameter(Mandatory)][string]$Name
    )

    if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace([string]$Values[$Name])) {
        throw "Bien $Name chua duoc cau hinh trong .env."
    }

    return [string]$Values[$Name]
}

function ConvertTo-SqlIdentifier {
    param([Parameter(Mandatory)][string]$Value)

    return '[' + $Value.Replace(']', ']]') + ']'
}

function ConvertTo-SqlLiteral {
    param([Parameter(Mandatory)][string]$Value)

    return "N'" + $Value.Replace("'", "''") + "'"
}

$configuration = Read-DotEnv -Path $envPath
$databaseName = Get-RequiredValue -Values $configuration -Name 'DB_NAME'
$databaseUser = Get-RequiredValue -Values $configuration -Name 'DB_USER'
$databasePassword = Get-RequiredValue -Values $configuration -Name 'DB_PASSWORD'

Push-Location $workspacePath
try {
    $containerId = [string]((& docker compose ps -q sqlserver 2>$null | Select-Object -First 1))
    $containerId = $containerId.Trim()
} finally {
    Pop-Location
}

if ([string]::IsNullOrWhiteSpace($containerId)) {
    throw 'Khong tim thay container SQL Server. Hay chay docker compose up -d sqlserver truoc.'
}

$sqlcmdCommand = '/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -I'
$healthCommand = "$sqlcmdCommand -Q 'SELECT 1'"
$deadline = (Get-Date).AddSeconds(60)
$isReady = $false

while ((Get-Date) -lt $deadline) {
    $null = & docker exec $containerId /bin/bash -c $healthCommand 2>$null
    if ($LASTEXITCODE -eq 0) {
        $isReady = $true
        break
    }

    Start-Sleep -Seconds 2
}

if (-not $isReady) {
    throw 'SQL Server chua san sang hoac mat khau sa cua container khong khop cau hinh Docker.'
}

$databaseIdentifier = ConvertTo-SqlIdentifier -Value $databaseName
$databaseLiteral = ConvertTo-SqlLiteral -Value $databaseName

$sql = @"
IF DB_ID($databaseLiteral) IS NULL
BEGIN
    CREATE DATABASE $databaseIdentifier;
END;
GO
"@

if ($databaseUser -ine 'sa') {
    $userIdentifier = ConvertTo-SqlIdentifier -Value $databaseUser
    $userLiteral = ConvertTo-SqlLiteral -Value $databaseUser
    $passwordLiteral = ConvertTo-SqlLiteral -Value $databasePassword

    $sql += [Environment]::NewLine
    $sql += @"
IF SUSER_ID($userLiteral) IS NULL
BEGIN
    CREATE LOGIN $userIdentifier WITH PASSWORD = $passwordLiteral, CHECK_POLICY = OFF;
END
ELSE IF EXISTS (
    SELECT 1
    FROM sys.server_principals
    WHERE name = $userLiteral AND type_desc <> N'SQL_LOGIN'
)
BEGIN
    THROW 50000, 'DB_USER phai la SQL login.', 1;
END
ELSE
BEGIN
    ALTER LOGIN $userIdentifier WITH PASSWORD = $passwordLiteral, CHECK_POLICY = OFF;
    ALTER LOGIN $userIdentifier ENABLE;
END;
ALTER LOGIN $userIdentifier WITH DEFAULT_DATABASE = $databaseIdentifier;
GO
USE $databaseIdentifier;
IF USER_ID($userLiteral) IS NULL
BEGIN
    CREATE USER $userIdentifier FOR LOGIN $userIdentifier;
END
IF ISNULL(IS_ROLEMEMBER(N'db_owner', $userLiteral), 0) = 0
BEGIN
    ALTER ROLE [db_owner] ADD MEMBER $userIdentifier;
END;
GO
"@
}

$sqlOutput = $sql | & docker exec -i $containerId /bin/bash -c $sqlcmdCommand 2>&1
if ($LASTEXITCODE -ne 0) {
    $details = ($sqlOutput | Out-String).Trim()
    throw "Khong the tao database/login SQL Server.$([Environment]::NewLine)$details"
}

Write-Host "SQL Server da san sang cho database '$databaseName' va user '$databaseUser'."
