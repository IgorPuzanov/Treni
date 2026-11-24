$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$candidates = @((Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source))
$runtime = Join-Path $env:ProgramFiles 'WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt\dependencies\node\bin\node.exe'
try {
    $candidates += Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction Stop |
        ForEach-Object { Join-Path $_.InstallLocation 'dependencies\node\bin\node.exe' }
} catch {
    # Package discovery is unavailable in some Windows sessions.
}
$candidates += $runtime
$node = $null
foreach ($candidate in $candidates | Where-Object { $_ } | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate) {
        try {
            $version = & $candidate -p "process.versions.node.split('.')[0]" 2>$null
            if ([int]$version -ge 24) { $node = $candidate; break }
        } catch {}
    }
}
if (!$node) {
    Write-Host 'Node.js 24+ is required. Install it or run from the Codex terminal.'
    exit 1
}
Set-Location -LiteralPath $root
if (!$env:TRENI_PORT) { $env:TRENI_PORT = '4173' }
$url = 'http://127.0.0.1:' + $env:TRENI_PORT
function Test-Treni {
    try {
        $response = Invoke-RestMethod -Uri ($url + '/api/state') -TimeoutSec 1
        return $null -ne $response.state.program
    } catch { return $false }
}
if (Test-Treni) {
    Start-Process $url
    exit 0
}
Write-Host "Treni opens at $url. Keep this window open. Ctrl+C stops the server."
$browser = Start-Job -ArgumentList $url -ScriptBlock {
    param($address)
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-RestMethod -Uri ($address + '/api/state') -TimeoutSec 1
            if ($response.state.program) { Start-Process $address; break }
        } catch {}
        Start-Sleep -Milliseconds 350
    }
}
try {
    & $node (Join-Path $root 'server.mjs')
    exit $LASTEXITCODE
} finally {
    Stop-Job $browser -ErrorAction SilentlyContinue
    Remove-Job $browser -Force -ErrorAction SilentlyContinue
}
