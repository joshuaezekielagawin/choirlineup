$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunDir = Join-Path $Root 'data/run'
$Stopped = 0

foreach ($Name in @('backend', 'frontend')) {
    $PidFile = Join-Path $RunDir "$Name.pid"
    if (-not (Test-Path $PidFile)) { continue }
    $PidText = (Get-Content $PidFile -Raw).Trim()
    $ProcessId = 0
    if (-not [int]::TryParse($PidText, [ref]$ProcessId) -or $ProcessId -lt 1) {
        Write-Warning "The $Name PID file is malformed; removing only that stale launcher file."
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        continue
    }
    $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
    if (-not $Process) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Write-Output "$Name is not running (removed a stale PID file)."
        continue
    }
    $Command = [string]$Process.CommandLine
    $IsExpected = $Command -like "*$Root*"
    if ($Name -eq 'backend') { $IsExpected = $IsExpected -and $Command -like '*manage.py*runserver*' }
    else { $IsExpected = $IsExpected -and ($Command -like '*npm run dev*' -or $Command -like '*npm run preview*') }
    if (-not $IsExpected) {
        Write-Warning "Refusing to stop PID $ProcessId: it no longer matches this ChoirLineup $Name process."
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        continue
    }
    & taskkill.exe /PID $ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Windows could not stop the tracked $Name process tree (PID $ProcessId)."; continue }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped ChoirLineup $Name process tree (PID $ProcessId)."
    $Stopped++
}
if ($Stopped -eq 0) { Write-Output 'No ChoirLineup launcher processes were running.' }
