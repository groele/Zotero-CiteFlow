param(
    [string]$OutputDirectory = 'dist'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$runtimeFiles = @(
    'bootstrap.js',
    'manifest.json',
    'prefs.js',
    'chrome/content/scripts/index.js',
    'chrome/content/icons/favicon.png',
    'chrome/content/icons/favicon@0.5x.png',
    'chrome/content/icons/word.png',
    'locale/en-US/zoterocitation-addon.ftl',
    'locale/zh-CN/zoterocitation-addon.ftl'
)

Push-Location -LiteralPath $projectRoot
try {
    & node --check bootstrap.js
    if ($LASTEXITCODE -ne 0) { throw 'bootstrap.js syntax check failed' }
    & node --check chrome/content/scripts/index.js
    if ($LASTEXITCODE -ne 0) { throw 'index.js syntax check failed' }
    & node --test tests/*.test.*
    if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

    $outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
        $OutputDirectory
    } else {
        Join-Path $projectRoot $OutputDirectory
    }
    $outputPath = [System.IO.Path]::GetFullPath($outputPath)
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    $archivePath = Join-Path $outputPath "zotero-citation-$($manifest.version).xpi"
    if (Test-Path -LiteralPath $archivePath) {
        throw "Archive already exists: $archivePath"
    }
    try {
        $archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($relativePath in $runtimeFiles) {
                $sourcePath = Join-Path $projectRoot $relativePath
                if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
                    throw "Missing runtime file: $relativePath"
                }
                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $archive, $sourcePath, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null
            }
        } finally {
            $archive.Dispose()
        }
    } catch {
        if (Test-Path -LiteralPath $archivePath) {
            Remove-Item -LiteralPath $archivePath -Force
        }
        throw
    }
    $zip = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $entryNames = @($zip.Entries | ForEach-Object FullName)
        if (@(Compare-Object $runtimeFiles $entryNames).Count -ne 0) {
            throw 'Archive entries do not match the runtime file list'
        }
        foreach ($entry in $zip.Entries) {
            $sourceHash = (Get-FileHash -LiteralPath (Join-Path $projectRoot $entry.FullName) -Algorithm SHA256).Hash
            $stream = $entry.Open()
            try {
                $entryHash = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash
            } finally {
                $stream.Dispose()
            }
            if ($sourceHash -ne $entryHash) {
                throw "Archive content differs from source: $($entry.FullName)"
            }
        }
    } finally {
        $zip.Dispose()
    }
    Get-FileHash -LiteralPath $archivePath -Algorithm SHA256 | Select-Object Path, Hash
} finally {
    Pop-Location
}
