param(
    [string]$XpiPath = 'dist/native-candidate-40.1.0-citeflow-v3/zotero-citeflow-40.1.0.xpi',
    [int]$Port = 23129
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$testRoot = Join-Path $projectRoot ('dist/native-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$profile = Join-Path $testRoot 'profile'
$data = Join-Path $testRoot 'data'
$extensions = Join-Path $profile 'extensions'
New-Item -ItemType Directory -Path $extensions, $data -Force | Out-Null
$archive = if ([IO.Path]::IsPathRooted($XpiPath)) { $XpiPath } else { Join-Path $projectRoot $XpiPath }
Copy-Item -LiteralPath $archive -Destination (Join-Path $extensions 'citeflow@groele.xpi')
$preferences = @{
    'extensions.zotero.dataDir' = $data
    'extensions.zotero.useDataDir' = $true
    'extensions.zotero.firstRun2' = $false
    'extensions.zotero.httpServer.enabled' = $true
    'extensions.zotero.httpServer.port' = $Port
    'extensions.zotero.httpServer.localAPI.enabled' = $true
    'extensions.zoteroWinWordIntegration.skipInstallation' = $true
    'extensions.zoteroOpenOfficeIntegration.skipInstallation' = $true
    'extensions.autoDisableScopes' = 0
    'extensions.enabledScopes' = 15
    'app.update.auto' = $false
}
$lines = foreach ($key in $preferences.Keys) {
    'user_pref(' + (ConvertTo-Json $key -Compress) + ', ' + (ConvertTo-Json $preferences[$key] -Compress) + ');'
}
[IO.File]::WriteAllLines((Join-Path $profile 'user.js'), $lines)
# The primary test application stays visible for desktop acceptance.
$process = Start-Process -FilePath 'C:/Program Files/Zotero/zotero.exe' -ArgumentList @('-no-remote', '-profile', ('"' + $profile + '"')) -WindowStyle Normal -PassThru
$session = @{ root = $testRoot; profile = $profile; dataDir = $data; port = $Port; processID = $process.Id; xpiSHA256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash }
$session | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'session.json') -Encoding utf8NoBOM
$session | ConvertTo-Json
