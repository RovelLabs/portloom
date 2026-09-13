# Portloom Windows Installer Script
# Installs Portloom into %LOCALAPPDATA%\Portloom, adds to user PATH, and creates Desktop/Start Menu shortcuts.

param (
    [switch]$Uninstall
)

$appName = "Portloom"
$installDir = "$env:LOCALAPPDATA\Programs\$appName"
$desktopPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\$appName"
$shortcutFile = "$desktopPath\$appName.lnk"

if ($Uninstall) {
    Write-Host "[Portloom] Uninstalling..." -ForegroundColor Yellow
    
    # Remove shortcuts
    if (Test-Path $shortcutFile) { Remove-Item $shortcutFile -Force }
    if (Test-Path $startMenuPath) { Remove-Item $startMenuPath -Recurse -Force }

    # Remove from User PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -like "*$installDir*") {
        $newPath = ($userPath -split ';' | Where-Object { $_ -ne $installDir -and $_ -ne "" }) -join ';'
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "[Portloom] Removed from user PATH." -ForegroundColor Green
    }

    # Remove installation directory
    if (Test-Path $installDir) {
        Remove-Item $installDir -Recurse -Force
        Write-Host "[Portloom] Removed installation files." -ForegroundColor Green
    }

    Write-Host "[Portloom] Uninstallation complete." -ForegroundColor Green
    exit 0
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Installing Portloom Local Developer Gateway..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Create target installation directory
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# 2. Copy application files from current directory
$sourceDir = $PSScriptRoot
if (-not (Test-Path "$sourceDir\dist")) {
    $sourceDir = (Get-Item $PSScriptRoot).Parent.FullName
}

Write-Host "[1/4] Copying files to $installDir..."
Copy-Item -Recurse -Path "$sourceDir\dist", "$sourceDir\bin", "$sourceDir\assets", "$sourceDir\scripts", "$sourceDir\package.json", "$sourceDir\portloom.cmd", "$sourceDir\Portloom.vbs", "$sourceDir\README.md", "$sourceDir\LICENSE" -Destination $installDir -Force

# 3. Add to User PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$installDir*") {
    Write-Host "[2/4] Adding to User PATH environment variable..."
    $newPath = "$userPath;$installDir"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
} else {
    Write-Host "[2/4] Already present in User PATH."
}

# 4. Create Desktop & Start Menu Shortcuts using WScript.Shell
Write-Host "[3/4] Creating Desktop and Start Menu shortcuts..."
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutFile)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$installDir\Portloom.vbs`""
$shortcut.WorkingDirectory = $installDir
$shortcut.Description = "Portloom - Local Developer Gateway for Windows"
$shortcut.Save()

if (-not (Test-Path $startMenuPath)) {
    New-Item -ItemType Directory -Path $startMenuPath -Force | Out-Null
}
$startMenuShortcut = $wsh.CreateShortcut("$startMenuPath\$appName.lnk")
$startMenuShortcut.TargetPath = "wscript.exe"
$startMenuShortcut.Arguments = "`"$installDir\Portloom.vbs`""
$startMenuShortcut.WorkingDirectory = $installDir
$startMenuShortcut.Save()

# 5. Summary
Write-Host "[4/4] Installation successful!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Portloom v1.0.0 is installed." -ForegroundColor Green
Write-Host "You can now run 'portloom' in any terminal or launch it from your Desktop."
Write-Host "Dashboard: http://127.0.0.1:24224"
Write-Host "To uninstall later, run: .\install.ps1 -Uninstall"
Write-Host "==================================================" -ForegroundColor Green
