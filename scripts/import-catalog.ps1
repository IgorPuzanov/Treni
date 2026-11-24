$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent

function Read-ExerciseSheet($file, $source) {
    $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $root "data/$file"))
    try {
        $stream = [IO.StreamReader]::new($zip.GetEntry('xl/worksheets/sheet1.xml').Open())
        try { [xml]$sheet = $stream.ReadToEnd() } finally { $stream.Dispose() }
        $rows = $sheet.SelectNodes("//*[local-name()='row']")
        $headers = @{}
        foreach ($cell in $rows[0].ChildNodes) { $headers[($cell.r -replace '\d+$','')] = $cell.InnerText }
        foreach ($row in $rows | Select-Object -Skip 1) {
            $values = @{}
            $original = [ordered]@{}
            foreach ($cell in $row.ChildNodes) {
                $column = $cell.r -replace '\d+$',''
                $values[$column] = $cell.InnerText
                $original[$headers[$column]] = $cell.InnerText
            }
            if ($source -eq 'current') {
                $link, $category, $secondary, $filter, $equipment = $values.C, $values.D, $values.E, $values.F, ''
            } else {
                $link, $category, $secondary, $filter, $equipment = $values.H, $values.C, $values.D, '', $values.E
            }
            $categories = @($category -split '\s*[,;/]\s*' | ForEach-Object {
                $value = $_.Trim()
                if ($value) { $value.Substring(0,1).ToUpperInvariant() + $value.Substring(1) }
            })
            [ordered]@{
                id = if ($source -eq 'current') { "current-$($row.r)" } else { $values.A }
                source_id = $values.A
                source_file = $file
                source_row = [int]$row.r
                original_name = $values.B
                name = $values.B
                link = $link
                category = if ($categories.Count) { $categories[0] } else { 'Без категории' }
                categories = $categories
                subcategory = $secondary
                filter = $filter
                equipment = $equipment
                original = $original
            }
        }
    } finally { $zip.Dispose() }
}

$current = @(Read-ExerciseSheet 'Treni_Uprazhneniya_iz_aktualnoy_bazy.xlsx' 'current')
$legacy = @(Read-ExerciseSheet 'Treni_Exercise_Library_Codex_Final_legacy_495.xlsx' 'legacy')
if ($current.Count -ne 1065 -or $legacy.Count -ne 495) { throw 'Unexpected exercise counts' }
if (@(($current + $legacy).id | Sort-Object -Unique).Count -ne 1560) { throw 'Duplicate internal exercise IDs' }
$catalog = [ordered]@{ current = $current; legacy = $legacy }
$catalog | ConvertTo-Json -Depth 8 -Compress | Set-Content -Encoding utf8NoBOM (Join-Path $root 'public/catalog.json')
Write-Output "Current: $($current.Count); archive: $($legacy.Count)"
