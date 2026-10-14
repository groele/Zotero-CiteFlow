param([Parameter(Mandatory)][string]$SessionRoot)
$ErrorActionPreference = 'Stop'
$SessionRoot = (Resolve-Path -LiteralPath $SessionRoot).Path
$session = Get-Content -LiteralPath (Join-Path $SessionRoot 'session.json') -Raw | ConvertFrom-Json
if ((Get-Process WINWORD -ErrorAction SilentlyContinue)) { throw 'Close the previous owned Word test instance before running this isolated acceptance' }
$uri = "http://127.0.0.1:$($session.port)/citeflow-settings-test"
$checks = [Collections.Generic.List[object]]::new()
$documents = @{}
$word = $null
function Invoke-Native($request) {
    $reply = Invoke-RestMethod -Uri $uri -Method Post -ContentType application/json -UserAgent CiteFlow-Word-Test/1.0 -Body ($request | ConvertTo-Json -Depth 6 -Compress) -TimeoutSec 20
    if (-not $reply.ok) { throw $reply.error }
    if ($request.action -like 'word*') {
        $taskID = $reply.value.id
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 100
            $reply = Invoke-RestMethod -Uri $uri -Method Post -ContentType application/json -UserAgent CiteFlow-Word-Test/1.0 -Body (@{action='wordResult';id=$taskID}|ConvertTo-Json -Compress) -TimeoutSec 20
            if (-not $reply.value.pending) {
                if (-not $reply.value.ok) { throw $reply.value.error }
                return $reply.value.value
            }
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'Native Word task timed out'
    }
    return $reply.value
}
function Assert-QA($condition, $label, $evidence) {
    $checks.Add(@{check=$label;ok=[bool]$condition;evidence=$evidence})
    if (-not $condition) { throw $label }
}
function Read-Fields($doc) {
    $fields = for ($i=1; $i -le $doc.Fields.Count; $i++) {
        $field = $doc.Fields.Item($i)
        $code = $field.Code.Text
        if ($code -notmatch 'ADDIN ZOTERO_ITEM CSL_CITATION\s+(\{.*\})') { throw 'Unexpected non-Zotero field' }
        $data = $Matches[1] | ConvertFrom-Json
        @{code=$code;text=$field.Result.Text;ids=@($data.citationItems|ForEach-Object {[int]$_.id})}
    }
    return ,@($fields)
}
function Move-Outside($doc) {
    $doc.Activate()
    $doc.Range($doc.Content.End - 1, $doc.Content.End - 1).Select()
    $word.Selection.TypeText(' outside citation ')
}
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false; $word.DisplayAlerts = 0
    $setup = Invoke-Native @{action='wordSetup'}
    # wordSetup creates three fresh items even when this test host was probed earlier.
    $ids = @($setup.probe.itemIDs | Select-Object -Last 3)
    $null = Invoke-Native @{action='open'}
    $null = Invoke-Native @{action='change';id='dragCite';value=$true}
    foreach ($name in @('A','B')) {
        $doc = $word.Documents.Add()
        $doc.Content.Text = "Isolated CiteFlow acceptance $name`r`r"
        $path = Join-Path $SessionRoot "Word-QA-$name.docx"
        if (Test-Path -LiteralPath $path) { throw 'Acceptance document already exists' }
        $doc.SaveAs2($path,16); $documents[$name] = $doc
        $null = Invoke-Native @{action='wordPrepare';document=$path;styleID=$setup.probe.styleID}
    }
    $a=$documents.A; $b=$documents.B
    Move-Outside $a
    $null = Invoke-Native @{action='wordDrag';document=$a.FullName;itemIDs=@($ids[0])}
    $fields = Read-Fields $a
    Assert-QA ($fields.Count -eq 1 -and $fields[0].ids[0] -eq $ids[0]) 'Drag inserts a real editable citation into document A' $fields
    Move-Outside $a
    $null = Invoke-Native @{action='wordDrag';document=$a.FullName;itemIDs=@($ids[1],$ids[2])}
    $fields = Read-Fields $a
    Assert-QA ($fields.Count -eq 2 -and ($fields[1].ids -join ',') -eq ($ids[1..2] -join ',')) 'Multiple dragged items form a second native citation field' $fields
    Move-Outside $b
    $null = Invoke-Native @{action='wordDrag';document=$b.FullName;itemIDs=@($ids[2])}
    $fields = Read-Fields $b
    Assert-QA ($fields.Count -eq 1 -and $fields[0].ids[0] -eq $ids[2] -and $a.Fields.Count -eq 2) 'Switching to document B preserves document A' $fields
    Move-Outside $a
    $null = Invoke-Native @{action='wordDrag';document=$a.FullName;itemIDs=@($ids[1])}
    Assert-QA ($a.Fields.Count -eq 3 -and $b.Fields.Count -eq 1) 'Switching back to A inserts only into the active document' (Read-Fields $a)
    $b.Activate(); $b.Fields.Item(1).Result.Select()
    $null = Invoke-Native @{action='wordDrag';document=$b.FullName;itemIDs=@($ids[0])}
    $fields=Read-Fields $b
    Assert-QA ($fields.Count -eq 1 -and $fields[0].ids.Count -eq 2 -and $fields[0].ids -contains $ids[0] -and $fields[0].ids -contains $ids[2]) 'Dropping at an existing citation adds items without duplicating fields' $fields
    $null = Invoke-Native @{action='wordRefresh';document=$b.FullName}
    Assert-QA ($b.Fields.Count -eq 1 -and $a.Fields.Count -eq 3) 'Native Word refresh preserves both documents and fields' (Read-Fields $b)
    Assert-QA ($a.Content.Text -notmatch 'CiteFlow Word acceptance specimen' -and $b.Content.Text -notmatch 'CiteFlow Word acceptance specimen') 'Dragged items do not leak plain bibliography text' @{a=$a.Content.Text;b=$b.Content.Text}
    $tagged=Invoke-Native @{action='change';id='citationTagText';value='Word引用验证'}
    Assert-QA ((@($tagged.testTags|Select-Object -Last 3|Where-Object {$_ -notcontains 'Word引用验证'})).Count -eq 0) 'Custom tag text applies to actual Word-cited items' $tagged.testTags
    $off=Invoke-Native @{action='change';id='citationTags';value=$false}
    Assert-QA ((@($off.testTags|Where-Object {$_ -contains 'Word引用验证'})).Count -eq 0) 'Tag switch removes plugin-owned tags from actual cited items' $off.testTags
    $null=Invoke-Native @{action='change';id='citationTags';value=$true}
    $null=Invoke-Native @{action='change';id='dragCite';value=$false}
    $offDrag=Invoke-Native @{action='dragProbe'}
    Assert-QA ($offDrag.probe.calls -eq 0) 'Drag switch stops citation dispatch immediately' $offDrag.probe
    $null=Invoke-Native @{action='change';id='dragCite';value=$true}
    $cancel=Invoke-Native @{action='dragProbe';cancelAfterStart=$true}
    Assert-QA ($cancel.probe.calls -eq 0) 'Disabling during a drag cancels citation dispatch' $cancel.probe
    $null=Invoke-Native @{action='reset'}
    $passed=$true
    Write-Output "Real Word acceptance passed: $($checks.Count) checks. $SessionRoot/word-results.json"
} finally {
    if ($word) {
        foreach ($doc in $documents.Values) { $doc.Save(); $doc.Close(0) }
        $word.Quit(0)
        [Runtime.InteropServices.Marshal]::FinalReleaseComObject($word)|Out-Null
    }
    @{ok=[bool]$passed;wordVersion='16.0';checks=@($checks.ToArray());scope='Native Zotero drag handlers plus real Word COM fields; no OS pointer automation'}|ConvertTo-Json -Depth 15|Set-Content -LiteralPath (Join-Path $SessionRoot 'word-results.json') -Encoding utf8NoBOM
}
