# Wifinity setup: checks everything the app needs, installs what's missing, then gets it ready.
# Run it through setup.bat (double-click). Safe to run again any time.

$ErrorActionPreference = 'Continue'  # native tools write warnings to stderr; failures are checked explicitly
Set-Location $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Host.UI.RawUI.WindowTitle = 'Wifinity setup'

function Step($t) { Write-Host ''; Write-Host "> $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  !   $t" -ForegroundColor Yellow }
function Fail($t) {
  Write-Host "  X   $t" -ForegroundColor Red
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Get-NodeVersion {
  try {
    $out = & node -v 2>$null
    if ($out -match 'v(\d+)\.(\d+)\.(\d+)') { return [version]"$($matches[1]).$($matches[2]).$($matches[3])" }
  } catch {}
  return $null
}

Write-Host ''
Write-Host '  WIFINITY  setup' -ForegroundColor Yellow
Write-Host '  Your Wi-Fi network as a star system' -ForegroundColor DarkGray

# ---------- 0. Trust this folder's files ----------
# Files from a downloaded zip are flagged by Windows and trigger a warning on every launch.
Get-ChildItem -Path $PSScriptRoot -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  Unblock-File -ErrorAction SilentlyContinue

# ---------- 1. Node.js ----------
Step 'Checking Node.js'
$minNode = [version]'20.19.0'
$node = Get-NodeVersion
if (-not $node -or $node -lt $minNode) {
  if ($node) { Warn "Node.js $node is too old (Wifinity needs $minNode or newer). Updating it..." }
  else { Warn 'Node.js is not installed. Installing it now (this can take a few minutes)...' }

  # First try winget (built into Windows 10/11)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Host
    } catch { Warn 'winget could not install Node.js, trying the direct download instead.' }
    Refresh-Path
    $node = Get-NodeVersion
  }

  # Fallback: download the official installer from nodejs.org
  if (-not $node -or $node -lt $minNode) {
    try {
      Warn 'Downloading the Node.js installer from nodejs.org...'
      $lts = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' -ErrorAction Stop) | Where-Object { $_.lts } | Select-Object -First 1
      $arch = 'x64'
      if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
      $url = "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-$arch.msi"
      $msi = Join-Path $env:TEMP 'orbit-node-lts.msi'
      Invoke-WebRequest $url -OutFile $msi -UseBasicParsing -ErrorAction Stop
      Warn 'Windows will ask for permission to install Node.js. Click Yes.'
      Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /passive /norestart" -Wait -Verb RunAs -ErrorAction Stop
      Refresh-Path
      # The installer's default location, in case PATH hasn't caught up yet
      if (Test-Path "$env:ProgramFiles\nodejs\node.exe") { $env:Path = "$env:ProgramFiles\nodejs;$env:Path" }
      $node = Get-NodeVersion
    } catch {
      Warn "Download failed: $($_.Exception.Message)"
    }
  }

  if (-not $node -or $node -lt $minNode) {
    Fail 'Could not install Node.js automatically. Install the LTS version from https://nodejs.org, then run setup.bat again.'
  }
}
Ok "Node.js $node"

# ---------- 2. App packages ----------
Step 'Installing app packages (1-3 minutes the first time)'
$attempt = 0
do {
  $attempt++
  & npm install --no-fund --no-audit
  $code = $LASTEXITCODE
  if ($code -ne 0 -and $attempt -lt 2) { Warn 'Install hit a problem. Trying once more...' }
} while ($code -ne 0 -and $attempt -lt 2)
if ($code -ne 0) { Fail 'Package install failed. Copy the red error text above and send it to Claude.' }
Ok 'Packages installed'

# ---------- 3. Claude key (key.txt) ----------
Step 'Checking the Claude key'
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Test-Path 'key.txt')) {
  $old = ''
  # Carry over a key saved by an older version in .env
  foreach ($l in (Get-Content '.env')) { if ($l -match '^\s*ANTHROPIC_API_KEY\s*=\s*(\S+)') { $old = $matches[1] } }
  Copy-Item 'key.txt.example' 'key.txt'
  if ($old) { Add-Content 'key.txt' $old -Encoding ASCII }
}
$hasKey = (Get-Content 'key.txt' | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') } | Select-Object -First 1)
if ($hasKey) { Ok 'Claude key found in key.txt' }
else { Warn 'No Claude key yet. Paste it into key.txt (opening it for you at the end). Wifinity works without it, with simulated answers.' }

# ---------- 3b. Build the app ----------
Step 'Building Wifinity'
& npm run build *> "$env:TEMP\orbit-build.log"
if ($LASTEXITCODE -ne 0) { Get-Content "$env:TEMP\orbit-build.log" -Tail 30 | Out-Host; Fail 'Build failed. Copy the error above and send it to Claude.' }
Ok 'Wifinity is built'

# ---------- 4. Wi-Fi access ----------
Step 'Checking Wi-Fi access'
$iface = (& netsh wlan show interfaces 2>$null | Out-String)
$nets = (& netsh wlan show networks 2>$null | Out-String)
if ($iface -match 'no wireless interface' -or -not $iface.Trim()) {
  Warn 'No Wi-Fi adapter found. Wifinity still maps devices on a wired network, but nearby networks will be empty.'
} elseif (($iface + $nets) -match 'location') {
  Warn 'Windows hides Wi-Fi details until Location is on. Opening the Location settings now:'
  Warn 'turn on "Location services" AND "Let desktop apps access your location".'
  Start-Process 'ms-settings:privacy-location'
} else {
  Ok 'Wi-Fi details are readable'
}

# ---------- 5. App shortcuts ----------
Step 'Adding Wifinity to your desktop and Start menu'
function New-OrbitShortcut($folder, $name = 'Wifinity', $script = 'launch.vbs') {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut((Join-Path $folder "$name.lnk"))
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + (Join-Path $PSScriptRoot $script) + '"'
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.IconLocation = (Join-Path $PSScriptRoot 'assets\orbit.ico') + ',0'
  $lnk.Description = 'Wifinity: your Wi-Fi network as a star system'
  $lnk.Save()
}
try {
  $desk = [Environment]::GetFolderPath('Desktop')
  Remove-Item (Join-Path $desk 'Orbit.lnk') -ErrorAction SilentlyContinue  # old name
  New-OrbitShortcut $desk
  Ok 'Desktop icon added'
} catch { Warn 'Could not add the desktop icon. Double-click launch.vbs instead.' }
try {
  $start = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft\Windows\Start Menu\Programs'
  Remove-Item (Join-Path $start 'Orbit.lnk'), (Join-Path $start 'Orbit Demo.lnk') -ErrorAction SilentlyContinue
  New-OrbitShortcut $start
  New-OrbitShortcut $start 'Wifinity Demo' 'launch-demo.vbs'
  Ok 'Added to the Start menu (search "Wifinity", or "Wifinity Demo" for presenting)'
} catch { Warn 'Could not add Wifinity to the Start menu.' }

# ---------- Done ----------
Write-Host ''
Write-Host '  Setup complete. Starting Wifinity...' -ForegroundColor Green
if (-not $hasKey) { Start-Process notepad.exe -ArgumentList (Join-Path $PSScriptRoot 'key.txt') }
Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $PSScriptRoot 'launch.vbs') + '"') -WorkingDirectory $PSScriptRoot
Start-Sleep -Seconds 2
