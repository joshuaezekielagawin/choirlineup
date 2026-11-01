$ErrorActionPreference = 'Stop'
$Options = $args
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Frontend = Join-Path $Root 'frontend'
$RunDir = Join-Path $Root 'data/run'
$LogDir = Join-Path $Root 'data/logs'
$Mode = 'dev'
$OpenBrowser = $true
$HostAddress = if ($env:DJANGO_BIND_HOST) { $env:DJANGO_BIND_HOST } else { '127.0.0.1' }
$ApiPort = if ($env:DJANGO_PORT) { $env:DJANGO_PORT } else { '8000' }
$FrontendPort = if ($env:VITE_PORT) { $env:VITE_PORT } else { '5173' }

function Stop-WithMessage([string]$Message) { throw "ChoirLineup: $Message" }
$StartedBackend = $false
$StartedFrontend = $false

# Read only launcher settings from the simple KEY=value file; never execute it.
$DotEnv = Join-Path $Root '.env'
if (Test-Path $DotEnv) {
    foreach ($Line in Get-Content $DotEnv) {
        if ($Line -match '^\s*#' -or $Line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { continue }
        $Key = $Matches[1]; $Value = $Matches[2].Trim().Trim('"').Trim("'")
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Key))) {
            switch ($Key) {
                'DJANGO_BIND_HOST' { $HostAddress = $Value }
                'DJANGO_PORT' { $ApiPort = $Value }
                'VITE_PORT' { $FrontendPort = $Value }
                'VITE_API_BASE_URL' { $env:VITE_API_BASE_URL = $Value }
            }
        }
    }
}
for ($i = 0; $i -lt $Options.Count; $i++) {
    switch ($Options[$i]) {
        '--built' { $Mode = 'built' }
        '--no-browser' { $OpenBrowser = $false }
        '--host' { $i++; if ($i -ge $Options.Count) { Stop-WithMessage 'Expected an address after --host.' }; $HostAddress = $Options[$i] }
        '--help' { Write-Output 'Usage: scripts\start-windows.bat [--built] [--host ADDRESS] [--no-browser]'; exit 0 }
        default { Stop-WithMessage "Unknown option: $($Options[$i])" }
    }
}
try {
if ($HostAddress -notmatch '^[A-Za-z0-9:.-]+$') { Stop-WithMessage 'Host must be an IP address or hostname (letters, numbers, dots, colons, and hyphens only).' }
foreach ($Port in @($ApiPort, $FrontendPort)) { if ($Port -notmatch '^\d{1,5}$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535) { Stop-WithMessage 'DJANGO_PORT and VITE_PORT must be between 1 and 65535.' } }
if ([int]$ApiPort -eq [int]$FrontendPort) { Stop-WithMessage 'DJANGO_PORT and VITE_PORT must be different.' }
foreach ($Port in @([int]$ApiPort, [int]$FrontendPort)) {
    $Addresses = $null
    try { $Addresses = [System.Net.Dns]::GetHostAddresses($HostAddress) }
    catch { Stop-WithMessage "Could not resolve bind host '$HostAddress'. Use an IP address or hostname available on this computer." }
    foreach ($Address in $Addresses) {
        $Listener = $null
        try { $Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port); $Listener.Start() }
        catch { Stop-WithMessage "Port $Port is already in use for bind host $HostAddress. Stop the existing service or choose another port." }
        finally { if ($Listener) { $Listener.Stop() } }
    }
}

    $PyLauncher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($PyLauncher) { $PyCommand = $PyLauncher.Source; $PyArgs = @('-3') }
    else { $PyLauncher = Get-Command python.exe -ErrorAction SilentlyContinue; if (-not $PyLauncher) { Stop-WithMessage 'Install Python 3.11 or newer.' }; $PyCommand = $PyLauncher.Source; $PyArgs = @() }
    $PyVersion = (& $PyCommand @PyArgs --version 2>&1 | Out-String)
    if ($PyVersion -notmatch 'Python 3\.(1[1-9]|[2-9]\d)') { Stop-WithMessage "Python 3.11 or newer is required. Found: $PyVersion" }
    $NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $NpmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $NodeCommand -or -not $NpmCommand) { Stop-WithMessage 'Install Node.js 20 or newer (including npm).' }
    $NodeMajor = [int]((& $NodeCommand.Source -p 'process.versions.node.split(".")[0]').Trim())
    if ($NodeMajor -lt 20) { Stop-WithMessage 'Node.js 20 or newer is required.' }

    New-Item -ItemType Directory -Force -Path $RunDir, $LogDir, (Join-Path $Root 'data/backups') | Out-Null
    $Python = Join-Path $Root 'backend/.venv/Scripts/python.exe'
    if (-not (Test-Path $Python)) { & $PyCommand @PyArgs -m venv (Join-Path $Root 'backend/.venv'); if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Could not create backend\.venv. Check Python venv support and folder permissions.' } }
    $Requirements = Join-Path $Root 'backend/requirements.txt'
    $ReqHash = (Get-FileHash $Requirements -Algorithm SHA256).Hash
    $ReqStamp = Join-Path $Root 'backend/.venv/.choirlineup-requirements'
    if (-not (Test-Path $ReqStamp) -or (Get-Content $ReqStamp -Raw).Trim() -ne $ReqHash) {
        & $Python -m pip install -r $Requirements
        if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Python dependencies could not be installed. Check the network and backend\requirements.txt.' }
        Set-Content -Path $ReqStamp -Value $ReqHash -NoNewline
    }
    $PackageFiles = @((Join-Path $Frontend 'package.json'), (Join-Path $Frontend 'package-lock.json')) | Where-Object { Test-Path $_ }
    $NpmHash = (($PackageFiles | ForEach-Object { (Get-FileHash $_ -Algorithm SHA256).Hash }) -join '')
    $NpmStamp = Join-Path $Frontend 'node_modules/.choirlineup-dependencies'
    if (-not (Test-Path $NpmStamp) -or (Get-Content $NpmStamp -Raw).Trim() -ne $NpmHash) {
        Push-Location $Frontend
        try { & $NpmCommand.Source install; if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Frontend dependencies could not be installed. Check the network and frontend/package-lock.json.' } }
        finally { Pop-Location }
        Set-Content -Path $NpmStamp -Value $NpmHash -NoNewline
    }
    if ($Mode -eq 'built') { Push-Location $Frontend; try { & $NpmCommand.Source run build; if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'The frontend production build failed; review the output above.' } } finally { Pop-Location } }

    $FrontMarker = if ($Mode -eq 'built') { 'npm run preview' } else { 'npm run dev' }
    foreach ($Entry in @(@{ Name='backend'; Marker='manage.py runserver' }, @{ Name='frontend'; Marker=$FrontMarker })) {
        $PidFile = Join-Path $RunDir "$($Entry.Name).pid"
        if (Test-Path $PidFile) {
            $OldPid = 0
            $PidText = (Get-Content $PidFile -Raw).Trim()
            if (-not [int]::TryParse($PidText, [ref]$OldPid) -or $OldPid -lt 1) { Remove-Item $PidFile -Force; continue }
            $Proc = Get-CimInstance Win32_Process -Filter "ProcessId = $OldPid" -ErrorAction SilentlyContinue
            if ($Proc -and $Proc.CommandLine -like "*$Root*" -and $Proc.CommandLine -like "*$($Entry.Marker)*") { Stop-WithMessage "$($Entry.Name) is already running with PID $OldPid. Use scripts\stop-windows.bat first." }
            Remove-Item $PidFile -Force
        }
    }

    & $Python (Join-Path $Root 'backend/manage.py') migrate --noinput
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'Database migrations failed. Your database was not reset; review the error and run the migrate command manually.' }
    $BackendLog = Join-Path $LogDir 'backend.log'
    $ManageFile = '"' + (Join-Path $Root 'backend/manage.py') + '"'
    $Backend = Start-Process -FilePath $Python -ArgumentList @($ManageFile, 'runserver', "$HostAddress`:$ApiPort", '--noreload') -WorkingDirectory $Root -RedirectStandardOutput $BackendLog -RedirectStandardError (Join-Path $LogDir 'backend-error.log') -PassThru
    $StartedBackend = $true
    Set-Content -Path (Join-Path $RunDir 'backend.pid') -Value $Backend.Id -NoNewline
    $FrontendLog = Join-Path $LogDir 'frontend.log'
    $NpmTask = if ($Mode -eq 'built') { 'preview' } else { 'dev' }
    $FrontendCommand = "cd /d `"$Frontend`" && npm run $NpmTask -- --host $HostAddress --port $FrontendPort"
    $FrontendProc = Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', $FrontendCommand) -WorkingDirectory $Frontend -RedirectStandardOutput $FrontendLog -RedirectStandardError (Join-Path $LogDir 'frontend-error.log') -PassThru
    $StartedFrontend = $true
    Set-Content -Path (Join-Path $RunDir 'frontend.pid') -Value $FrontendProc.Id -NoNewline
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Id $Backend.Id -ErrorAction SilentlyContinue) -or -not (Get-Process -Id $FrontendProc.Id -ErrorAction SilentlyContinue)) {
        & (Join-Path $PSScriptRoot 'stop-windows.ps1')
        Stop-WithMessage 'A server stopped during startup. Review data\logs\backend.log and data\logs\frontend.log.'
    }
    Write-Output "ChoirLineup is running ($Mode mode)."
    $UrlHost = if ($HostAddress.Contains(':')) { "[$HostAddress]" } else { $HostAddress }
    Write-Output "Frontend: http://$UrlHost`:$FrontendPort"
    Write-Output "API:      http://$UrlHost`:$ApiPort/api/"
    Write-Output "Logs:     $LogDir"
    Write-Output 'Stop with: scripts\stop-windows.bat'
    if ($Mode -eq 'built') { Write-Warning 'Vite preview serves the built frontend; Django still uses the development server and is not suitable for production Internet hosting.' }
    if ($OpenBrowser) { try { Start-Process "http://$UrlHost`:$FrontendPort" } catch { Write-Warning "Could not open a browser automatically. Open http://$UrlHost`:$FrontendPort manually." } }
} catch {
    if ($StartedBackend -or $StartedFrontend) { try { & (Join-Path $PSScriptRoot 'stop-windows.ps1') | Out-Null } catch { } }
    [Console]::Error.WriteLine("ChoirLineup: $($_.Exception.Message)")
    exit 1
}
