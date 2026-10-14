param(
    [Parameter(Mandatory)][string]$XpiPath,
    [string]$ZoteroExecutable = 'C:/Program Files/Zotero/zotero.exe',
    [int]$Port = 23131,
    [ValidateSet('zh-CN', 'en-US')][string]$Locale = 'zh-CN'
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Test port $Port is already in use" }
$testRoot = Join-Path $projectRoot ('dist/settings-native-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$profile = Join-Path $testRoot 'profile'
$dataDir = Join-Path $testRoot 'data'
$extensions = Join-Path $profile 'extensions'
New-Item -ItemType Directory -Path $dataDir, $extensions -Force | Out-Null
$archive = (Resolve-Path -LiteralPath $XpiPath).Path
# Instrument only this disposable profile's copy. Never alter the deliverable XPI.
$testCode = [IO.File]::ReadAllText((Join-Path $projectRoot 'tests/fixtures/settings-native-bootstrap.js')).Replace('async function startup()', 'async function startupSettingsTest()').Replace('function shutdown()', 'function shutdownSettingsTest()')
$testCode += "`nconst originalSettingsTestStartup = startup;`nstartup = async function(...args) { await originalSettingsTestStartup.apply(this, args); startupSettingsTest().catch(error => Zotero.logError(error)); };`nconst originalSettingsTestShutdown = shutdown;`nshutdown = async function(...args) { if (args[1] === APP_SHUTDOWN) shutdownSettingsTest(); await originalSettingsTestShutdown.apply(this, args); };`n"
$sourceZip = [IO.Compression.ZipFile]::OpenRead($archive)
$testZip = [IO.Compression.ZipFile]::Open((Join-Path $extensions 'citeflow@groele.xpi'), [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($entry in $sourceZip.Entries) {
        $destination = $testZip.CreateEntry($entry.FullName)
        $outputStream = $destination.Open()
        $inputStream = $entry.Open()
        try {
            if ($entry.FullName -eq 'bootstrap.js') {
                $reader = [IO.StreamReader]::new($inputStream)
                $originalCode = $reader.ReadToEnd()
                $bytes = [Text.Encoding]::UTF8.GetBytes($originalCode + "`n" + $testCode)
                $outputStream.Write($bytes, 0, $bytes.Length)
            } else { $inputStream.CopyTo($outputStream) }
        } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    }
} finally { $sourceZip.Dispose(); $testZip.Dispose() }
$preferences = @{
    'extensions.zotero.dataDir' = $dataDir
    'extensions.zotero.useDataDir' = $true
    'extensions.zotero.firstRun2' = $false
    'extensions.zotero.httpServer.enabled' = $true
    'extensions.zotero.httpServer.port' = $Port
    'extensions.zotero.citationSettingsTest.dataDir' = $dataDir
    'extensions.zoteroWinWordIntegration.skipInstallation' = $true
    'extensions.zoteroOpenOfficeIntegration.skipInstallation' = $true
    'extensions.autoDisableScopes' = 0
    'extensions.enabledScopes' = 15
    'app.update.auto' = $false
    'intl.locale.requested' = $Locale
    'extensions.zotero.zoterocitation.dragCite.enable' = $false
}
function Write-TestPreferences {
    $lines = foreach ($key in $preferences.Keys) {
        'user_pref(' + (ConvertTo-Json $key -Compress) + ', ' + (ConvertTo-Json $preferences[$key] -Compress) + ');'
    }
    [IO.File]::WriteAllLines((Join-Path $profile 'user.js'), $lines)
}
Write-TestPreferences
$uri = "http://127.0.0.1:$Port/citeflow-settings-test"
$checks = [Collections.Generic.List[object]]::new()
$passed = $false
$testProcess = $null
function Invoke-SettingsTest($request) {
    $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -UserAgent 'CiteFlow-Settings-Test/1.0' -Body ($request | ConvertTo-Json -Compress) -TimeoutSec 20
    if (-not $response.ok) { throw $response.error }
    return $response.value
}
function Assert-Settings($condition, $message, $snapshot) {
    $checks.Add(@{ check = $message; result = $(if ($condition) { 'passed' } else { 'failed' }); snapshot = $snapshot })
    if (-not $condition) { throw $message }
}
function Start-TestHost {
    $logStamp = Get-Date -Format 'HHmmss'
    $script:testProcess = Start-Process -FilePath $ZoteroExecutable -ArgumentList @('-no-remote', '-ZoteroDebugText', '-profile', ('"' + $profile + '"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testRoot "stdout-$logStamp.log") -RedirectStandardError (Join-Path $testRoot "stderr-$logStamp.log")
    $deadline = [DateTime]::UtcNow.AddSeconds(55)
    do {
        try { return Invoke-SettingsTest @{ action = 'status' } } catch { Start-Sleep -Milliseconds 300 }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Isolated Zotero settings-test endpoint unavailable: $($Error[0])"
}
function Stop-TestHost {
    $owned = @(Get-CimInstance Win32_Process -Filter "Name = 'zotero.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains(('"' + $profile + '"')) })
    if ($owned.Count) { try { $null = Invoke-SettingsTest @{ action = 'quit' } } catch {} }
    foreach ($owner in $owned) {
        $process = Get-Process -Id $owner.ProcessId -ErrorAction SilentlyContinue
        if ($process -and -not $process.WaitForExit(10000)) { Stop-Process -Id $owner.ProcessId }
    }
    # Zotero can replace its launcher process. Match only this exact test profile.
    Get-CimInstance Win32_Process -Filter "Name = 'zotero.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains(('"' + $profile + '"')) } | ForEach-Object { Stop-Process -Id $_.ProcessId }
}
try {
    $initial = Start-TestHost
    Assert-Settings ($initial.tracking -and $initial.paneRegistered) 'Tracking starts and settings register' $initial
    $opened = Invoke-SettingsTest @{ action = 'open' }
    Assert-Settings ($opened.controls.Count -eq 10 -and @($opened.controls | Where-Object { $_.width -le 0 -or $_.height -le 0 }).Count -eq 0) 'All ten native controls render with positive dimensions' $opened
    $localized = if ($Locale -eq 'zh-CN') { $opened.text -match '功能设置' -and $opened.text -match '恢复默认设置' } else { $opened.text -match 'Features' -and $opened.text -match 'Restore defaults' }
    Assert-Settings $localized "$Locale Fluent labels resolve in the native pane" $opened
    Assert-Settings ($opened.observerCount -eq 10 -and $opened.panelCount -eq 1) 'Ten preference observers and one panel mount are registered' $opened
    Assert-Settings (($opened.controls | Where-Object id -eq 'zoterocitation-setting-citationTagText').value -eq '/Citations') 'Tag text box defaults to /Citations' $opened
    $tagFixtures = Invoke-SettingsTest @{ action = 'tagFixtures' }
    Assert-Settings ($tagFixtures.testTags[0] -contains '/Citations') 'Default tag saves into a real Zotero item' $tagFixtures
    $custom = Invoke-SettingsTest @{ action = 'change'; id = 'citationTagText'; value = '已引用' }
    Assert-Settings ($custom.testTags[0] -contains '已引用' -and $custom.testTags[0] -notcontains '/Citations' -and $custom.testTags[1].Count -eq 2) 'Custom tag renames managed tags and preserves manual tags' $custom
    $tagsOff = Invoke-SettingsTest @{ action = 'change'; id = 'citationTags'; value = $false }
    Assert-Settings ($tagsOff.testTags[0].Count -eq 0 -and $tagsOff.testTags[1].Count -eq 2) 'Disabling automatic tags removes only managed tags' $tagsOff
    $tagsOn = Invoke-SettingsTest @{ action = 'change'; id = 'citationTags'; value = $true }
    Assert-Settings ($tagsOn.testTags[0] -contains '已引用') 'Re-enabling tags restores the custom tag' $tagsOn
    $blank = Invoke-SettingsTest @{ action = 'change'; id = 'citationTagText'; value = '   ' }
    Assert-Settings ($blank.prefValues.'citationTags.text' -eq '已引用' -and $blank.status -eq 'zoterocitation-settings-invalid-tag') 'Empty tag text is rejected without losing the saved name' $blank
    $null = Invoke-SettingsTest @{ action = 'close' }
    $null = Invoke-SettingsTest @{ action = 'open' }
    $drag = Invoke-SettingsTest @{ action = 'change'; id = 'dragCite'; value = $true }
    Assert-Settings ($drag.patchCount -eq ($initial.patchCount + 1)) 'Drag citation can be enabled after starting disabled' $drag
    $dragProbe = Invoke-SettingsTest @{ action = 'dragProbe' }
    Assert-Settings ($dragProbe.probe.prepared -and $dragProbe.probe.calls -eq 1) 'The native drag handler dispatches citation when enabled' $dragProbe
    $cancelDrag = Invoke-SettingsTest @{ action = 'dragProbe'; cancelAfterStart = $true }
    Assert-Settings ($cancelDrag.probe.prepared -and $cancelDrag.probe.calls -eq 0) 'Disabling drag citation during a drag cancels insertion' $cancelDrag
    $null = Invoke-SettingsTest @{ action = 'change'; id = 'dragCite'; value = $true }
    $quickOff = Invoke-SettingsTest @{ action = 'change'; id = 'quickCite'; value = $false }
    $quickOffProbe = Invoke-SettingsTest @{ action = 'keyboardProbe' }
    Assert-Settings ($quickOffProbe.probe.calls -eq 0) 'Quick citation does not dispatch when disabled' $quickOffProbe
    $null = Invoke-SettingsTest @{ action = 'change'; id = 'quickCite'; value = $true }
    $quickOnProbe = Invoke-SettingsTest @{ action = 'keyboardProbe' }
    Assert-Settings ($quickOnProbe.probe.calls -eq 1 -and $quickOnProbe.probe.prevented) 'The native keyboard handler dispatches quick citation when enabled' $quickOnProbe
    $editingProbe = Invoke-SettingsTest @{ action = 'keyboardProbe'; editing = $true }
    Assert-Settings ($editingProbe.probe.calls -eq 0) 'Quick citation does not intercept text editing' $editingProbe
    $debugOff = Invoke-SettingsTest @{ action = 'debugProbe' }
    Assert-Settings ($debugOff.probe.lines -eq 0) 'Debug output is suppressed when disabled' $debugOff
    $debug = Invoke-SettingsTest @{ action = 'change'; id = 'debug'; value = $true }
    Assert-Settings ($debug.debug -eq $true) 'Debug changes reach the live citation module' $debug
    $debugOn = Invoke-SettingsTest @{ action = 'debugProbe' }
    Assert-Settings ($debugOn.probe.lines -eq 1) 'Debug output is emitted when enabled' $debugOn
    $number = Invoke-SettingsTest @{ action = 'change'; id = 'citationTagDebounceMs'; value = '625' }
    Assert-Settings ($number.tagDelay -eq 625 -and $number.prefValues.citationTagDebounceMs -eq 625) 'Valid integer saves and updates runtime' $number
    $view = Invoke-SettingsTest @{ action = 'change'; id = 'itemsViewRefreshDebounceMs'; value = 345 }
    Assert-Settings ($view.runtimeConfig.viewDelay -eq 345) 'Item refresh setting reaches the live scheduler' $view
    $health = Invoke-SettingsTest @{ action = 'change'; id = 'healthWindowMs'; value = 10000 }
    Assert-Settings ($health.runtimeConfig.healthWindow -eq 10000) 'Health window setting reaches live diagnostics' $health
    $slow = Invoke-SettingsTest @{ action = 'change'; id = 'perfSlowThresholdMs'; value = 15 }
    Assert-Settings ($slow.runtimeConfig.slowThreshold -eq 15) 'Slow-operation threshold reaches live performance recording' $slow
    $performance = Invoke-SettingsTest @{ action = 'performanceProbe' }
    Assert-Settings ($performance.probe.recentErrors -eq 1 -and $performance.probe.slowCount -eq 1) 'New numeric settings change health filtering and slow classification' $performance
    $rapid = Invoke-SettingsTest @{ action = 'batch'; changes = @(@{id='citationTagText';value='快速修改 A'},@{id='citationTagText';value='快速修改 B'},@{id='citationTagText';value='快速修改 C'}) }
    Assert-Settings ($rapid.testTags[0] -contains '快速修改 C' -and $rapid.testTags[0].Count -eq 1 -and $rapid.testTags[1] -contains '/Citations') 'Rapid name changes converge to one final managed tag and preserve manual tags' $rapid
    foreach ($value in @('', '-1', '2001', '2.5')) {
        $invalid = Invoke-SettingsTest @{ action = 'change'; id = 'citationTagDebounceMs'; value = $value }
        Assert-Settings ($invalid.prefValues.citationTagDebounceMs -eq 625 -and $invalid.status -eq 'zoterocitation-settings-invalid') "Invalid value '$value' is rejected" $invalid
    }
    $null = Invoke-SettingsTest @{ action = 'close' }
    $reopened = Invoke-SettingsTest @{ action = 'open' }
    Assert-Settings (($reopened.controls | Where-Object id -eq 'zoterocitation-setting-citationTagDebounceMs').value -eq '625') 'Reopening settings restores the saved value' $reopened
    Assert-Settings ($reopened.panelCount -eq 1 -and $reopened.observerCount -eq 10) 'Reopening does not duplicate observers or panel mounts' $reopened
    $disabled = Invoke-SettingsTest @{ action = 'disable' }
    Assert-Settings (-not $disabled.paneRegistered -and $disabled.probe.remainingObservers -eq 0 -and $disabled.probe.remainingPanels -eq 0 -and $disabled.probe.remainingPatches -eq 0) 'Disabling the add-on removes its pane, observers, panels, and wrappers' $disabled
    $enabled = Invoke-SettingsTest @{ action = 'enable' }
    Assert-Settings ($enabled.tracking -and $enabled.paneRegistered -and $enabled.observerCount -eq 10) 'Re-enabling the add-on restores one settings pane and its observers' $enabled
    $null = Invoke-SettingsTest @{ action = 'open' }
    $off = Invoke-SettingsTest @{ action = 'change'; id = 'enable'; value = $false }
    Assert-Settings ($off.status -eq 'zoterocitation-settings-restart') 'Tracking toggle displays restart requirement' $off
    Stop-TestHost
    $preferences.Remove('extensions.zotero.zoterocitation.dragCite.enable')
    Write-TestPreferences
    $restarted = Start-TestHost
    Assert-Settings (-not $restarted.tracking -and $restarted.paneRegistered -and $restarted.prefValues.citationTagDebounceMs -eq 625) 'Restart persists values and retains settings while tracking is disabled' $restarted
    $null = Invoke-SettingsTest @{ action = 'open' }
    $defaults = Invoke-SettingsTest @{ action = 'reset' }
    Assert-Settings ($defaults.prefValues.enable -and -not $defaults.prefValues.debug -and $defaults.prefValues.citationTagDebounceMs -eq 150) 'Restore defaults works while tracking is disabled' $defaults
    Stop-TestHost
    $restored = Start-TestHost
    Assert-Settings ($restored.tracking -and $restored.paneRegistered) 'Tracking resumes after restoring defaults and restarting' $restored
    $passed = $true
    Write-Output "Native settings acceptance passed: $($checks.Count) checks. Results: $testRoot/results.json"
} finally {
    Stop-TestHost
    @{ ok = $passed; locale = $Locale; root = $testRoot; xpiSHA256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; checks = @($checks.ToArray()) } |
        ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $testRoot 'results.json') -Encoding utf8NoBOM
}
