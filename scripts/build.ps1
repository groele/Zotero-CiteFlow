param(
    [string]$OutputDirectory = 'dist'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'manifest.json') -Raw | ConvertFrom-Json
$runtimeFiles = @(
    'bootstrap.js',
    'LICENSE',
    'THIRD_PARTY.md',
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
    & node scripts/build-source.mjs
    if ($LASTEXITCODE -ne 0) { throw 'source build failed; run npm ci to restore pinned build dependencies' }
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
    $archivePath = Join-Path $outputPath "zotero-citeflow-$($manifest.version).xpi"
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
                $entry = $archive.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
                $entry.LastWriteTime = [DateTimeOffset]::new(2020, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
                $inputStream = [System.IO.File]::OpenRead($sourcePath)
                $outputStream = $entry.Open()
                try { $inputStream.CopyTo($outputStream) } finally {
                    $outputStream.Dispose()
                    $inputStream.Dispose()
                }
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
    $archiveHash = Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
    $version = $manifest.version
    $candidateFeed = @{
        addons = @{
            $manifest.applications.zotero.id = @{
                updates = @(@{
                    version = $version
                    update_link = "https://github.com/groele/Zotero-CiteFlow/releases/download/v$($version.Split('.')[0])/zotero-citeflow-$version.xpi"
                    update_hash = "sha256:$($archiveHash.Hash.ToLowerInvariant())"
                    applications = @{ zotero = @{
                        strict_min_version = $manifest.applications.zotero.strict_min_version
                        strict_max_version = $manifest.applications.zotero.strict_max_version
                    } }
                })
            }
        }
    }
    $candidateFeed | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $outputPath 'update.json') -Encoding utf8NoBOM
    $archiveHash | Select-Object Path, Hash
} finally {
    Pop-Location
}
