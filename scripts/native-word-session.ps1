param([Parameter(Mandatory)][string]$Root, [switch]$Visible,
    [ValidatePattern('^[A-Za-z][A-Za-z0-9-]{0,31}$')][string]$Prefix = 'Citation',
    [switch]$UseRunningWord)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath (Join-Path $Root 'session.json'))) { throw 'A prepared isolated test session is required' }
$word = if ($UseRunningWord) { [Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application') } else { New-Object -ComObject Word.Application }
if ($Visible) { $word.Visible = $true }
if (-not $UseRunningWord) { $word.DisplayAlerts = 0 }
$documents = @{}
@{ ready = $true; version = $word.Version; build = $word.Build; root = $Root } | ConvertTo-Json -Compress
try {
    while ($line = [Console]::ReadLine()) {
        try {
            $request = $line | ConvertFrom-Json
            $name = $request.name
            if ($name -and $name -notmatch '^[AB]$') { throw 'Unsupported test document' }
            if ($request.action -eq 'quit') { break }
            if ($request.action -eq 'create') {
                if ($documents.ContainsKey($name)) { throw 'Document already created' }
                $document = $word.Documents.Add()
                $document.Content.Text = "Native citation regression document $name`r`r"
                [string]$path = Join-Path $Root "$Prefix-$name.docx"
                if (Test-Path -LiteralPath $path) { throw 'Test document already exists' }
                $format = 16
                $document.SaveAs([ref]$path, [ref]$format)
                $documents[$name] = $document
            } else { $document = $documents[$name] }
            if (-not $document) { throw 'Test document is not open' }
            $document.Activate()
            switch ($request.action) {
                'create' { $document.Range($document.Content.End - 1, $document.Content.End - 1).Select() }
                'activate' { $document.Range($document.Content.End - 1, $document.Content.End - 1).Select() }
                'append' {
                    $word.Selection.EndKey(6) | Out-Null
                    $word.Selection.TypeText(" $($request.text) ")
                }
                'selectField' {
                    $document.Fields.Item([int]$request.index).Result.Select()
                }
                'deleteField' {
                    $document.Fields.Item([int]$request.index).Result.Delete() | Out-Null
                }
                'undo' { $document.Undo() | Out-Null }
                'save' { $document.Save() }
                'show' { $word.Visible = $true }
                'arrange' {
                    $word.WindowState = 0
                    $word.Left = [int]$request.left; $word.Top = 0
                    $word.Width = [int]$request.width; $word.Height = [int]$request.height
                }
                'inspect' {}
                default { throw 'Unsupported Word test action' }
            }
            $fields = for ($i = 1; $i -le $document.Fields.Count; $i++) {
                $field = $document.Fields.Item($i)
                @{ index = $i; code = $field.Code.Text; text = $field.Result.Text }
            }
            @{ ok = $true; name = $name; path = $document.FullName; text = $document.Content.Text; fields = @($fields) } | ConvertTo-Json -Depth 6 -Compress
        } catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }
    }
} finally {
    foreach ($doc in $documents.Values) { $doc.Save(); $doc.Close(0) }
    if (-not $UseRunningWord) { $word.Quit(0) }
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) | Out-Null
}
