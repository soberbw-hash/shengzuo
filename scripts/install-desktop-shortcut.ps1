[CmdletBinding()]
param(
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$launcherScript = Join-Path $projectRoot 'scripts\start-clonevoice.ps1'
$packagedCandidates = @(
  (Join-Path $projectRoot 'apps\desktop\release\win-unpacked\ShengZuo.exe'),
  (Join-Path (Split-Path $projectRoot -Parent) 'WINDOWS-APP\ShengZuo.exe'),
  (Join-Path $projectRoot 'apps\desktop\release\win-unpacked\CloneVoice.exe'),
  (Join-Path (Split-Path $projectRoot -Parent) 'WINDOWS-APP\CloneVoice.exe')
)
$packagedExe = $packagedCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop '声作 快速启动.lnk'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powerShell
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherScript`""
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = '启动声作；若桌面程序被拦截，则自动打开本地预览'

if ($packagedExe) {
  $shortcut.IconLocation = "$packagedExe,0"
}
else {
  $icon = Join-Path $projectRoot 'apps\desktop\build\icon.ico'
  if (Test-Path -LiteralPath $icon -PathType Leaf) {
    $shortcut.IconLocation = "$icon,0"
  }
}

$shortcut.Save()

if (-not $Quiet) {
  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show(
    "桌面快捷方式已创建。`n`n以后双击声作 快速启动即可。",
    '声作',
    [System.Windows.MessageBoxButton]::OK,
    [System.Windows.MessageBoxImage]::Information
  )
}

Write-Output $shortcutPath
