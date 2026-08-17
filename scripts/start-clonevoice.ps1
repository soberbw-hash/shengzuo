[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$PreviewOnly,
  [switch]$SourceOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$packagedCandidates = @(
  (Join-Path $projectRoot 'apps\desktop\release\win-unpacked\ShengZuo.exe'),
  (Join-Path (Split-Path $projectRoot -Parent) 'WINDOWS-APP\ShengZuo.exe'),
  (Join-Path $projectRoot 'apps\desktop\release\win-unpacked\CloneVoice.exe'),
  (Join-Path (Split-Path $projectRoot -Parent) 'WINDOWS-APP\CloneVoice.exe')
)
$packagedExe = $packagedCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1

if (-not $packagedExe) {
  $packagedExe = $packagedCandidates[0]
}

$previewUrl = 'http://127.0.0.1:5173/'
$windowTitle = '声作 快速启动'
$sourceDesktopRoot = Join-Path $projectRoot 'apps\desktop'
$sourceElectron = Join-Path $sourceDesktopRoot 'node_modules\electron\dist\electron.exe'
$sourceMain = Join-Path $sourceDesktopRoot 'dist-electron\main\index.cjs'
$sourceRenderer = Join-Path $sourceDesktopRoot 'dist\index.html'

function Show-FriendlyMessage {
  param(
    [Parameter(Mandatory)]
    [string]$Message,
    [ValidateSet('Info', 'Error')]
    [string]$Kind = 'Info'
  )

  try {
    Add-Type -AssemblyName PresentationFramework
    $icon = if ($Kind -eq 'Error') {
      [System.Windows.MessageBoxImage]::Error
    }
    else {
      [System.Windows.MessageBoxImage]::Information
    }

    [void][System.Windows.MessageBox]::Show(
      $Message,
      $windowTitle,
      [System.Windows.MessageBoxButton]::OK,
      $icon
    )
  }
  catch {
    Write-Host $Message
  }
}

function Test-PreviewReady {
  try {
    $response = Invoke-WebRequest `
      -Uri $previewUrl `
      -UseBasicParsing `
      -TimeoutSec 2 `
      -ErrorAction Stop

    return [int]$response.StatusCode -eq 200 -and $response.Content -match '<div\s+id=["'']root["'']'
  }
  catch {
    return $false
  }
}

function Get-PnpmRuntime {
  $pnpmCommand = Get-Command 'pnpm.cmd' -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $pnpmCommand) {
    $pnpmCommand = Get-Command 'pnpm' -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
  }

  if ($pnpmCommand) {
    return [pscustomobject]@{
      PnpmPath  = $pnpmCommand.Source
      ExtraPath = @()
      Source    = '系统环境'
    }
  }

  $portableRoot = Join-Path $env:LOCALAPPDATA 'Temp\codex-ai-voice-studio-node'
  $portablePnpm = Join-Path $portableRoot 'pnpm\pnpm.cmd'
  $portableNodeDirectory = Get-ChildItem `
    -LiteralPath $portableRoot `
    -Directory `
    -Filter 'node-v*-win-x64' `
    -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ((Test-Path -LiteralPath $portablePnpm -PathType Leaf) -and $portableNodeDirectory) {
    return [pscustomobject]@{
      PnpmPath  = $portablePnpm
      ExtraPath = @($portableNodeDirectory.FullName, (Split-Path $portablePnpm -Parent))
      Source    = '项目临时环境'
    }
  }

  return $null
}

function Open-Preview {
  Start-Process -FilePath $previewUrl
}

function Start-PackagedApp {
  try {
    $process = Start-Process -FilePath $packagedExe -WorkingDirectory (Split-Path $packagedExe -Parent) -PassThru

    for ($attempt = 0; $attempt -lt 24; $attempt += 1) {
      Start-Sleep -Milliseconds 250
      $process.Refresh()

      if ($process.HasExited) {
        return $false
      }

      if ($process.MainWindowHandle -ne 0) {
        return $true
      }
    }

    $process.Refresh()
    return -not $process.HasExited
  }
  catch {
    return $false
  }
}

function Start-SourceDesktopApp {
  if (
    -not (Test-Path -LiteralPath $sourceElectron -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceMain -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceRenderer -PathType Leaf)
  ) {
    return $false
  }

  $previousUseDist = $env:AVS_USE_DIST
  try {
    $env:AVS_USE_DIST = '1'
    $process = Start-Process `
      -FilePath $sourceElectron `
      -ArgumentList @("`"$sourceDesktopRoot`"") `
      -WorkingDirectory $sourceDesktopRoot `
      -PassThru

    for ($attempt = 0; $attempt -lt 24; $attempt += 1) {
      Start-Sleep -Milliseconds 250
      $process.Refresh()

      if ($process.HasExited) {
        return $false
      }

      if ($process.MainWindowHandle -ne 0) {
        return $true
      }
    }

    $process.Refresh()
    return -not $process.HasExited
  }
  catch {
    return $false
  }
  finally {
    $env:AVS_USE_DIST = $previousUseDist
  }
}

function Start-LocalPreview {
  param(
    [Parameter(Mandatory)]
    [pscustomobject]$Runtime
  )

  if ($Runtime.ExtraPath.Count -gt 0) {
    $env:Path = ($Runtime.ExtraPath -join ';') + ';' + $env:Path
  }

  try {
    $server = Start-Process `
      -FilePath $Runtime.PnpmPath `
      -ArgumentList @('--dir', 'apps/desktop', 'dev:renderer', '--host', '127.0.0.1', '--strictPort') `
      -WorkingDirectory $projectRoot `
      -WindowStyle Hidden `
      -PassThru
  }
  catch {
    return $false
  }

  for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
    Start-Sleep -Milliseconds 250

    if (Test-PreviewReady) {
      Open-Preview
      return $true
    }

    $server.Refresh()
    if ($server.HasExited) {
      return $false
    }
  }

  return $false
}

$packagedReady = Test-Path -LiteralPath $packagedExe -PathType Leaf
$sourceDesktopReady =
  (Test-Path -LiteralPath $sourceElectron -PathType Leaf) -and
  (Test-Path -LiteralPath $sourceMain -PathType Leaf) -and
  (Test-Path -LiteralPath $sourceRenderer -PathType Leaf)
$previewReady = Test-PreviewReady
$runtime = Get-PnpmRuntime

if ($CheckOnly) {
  $recommendedMode = if (-not $PreviewOnly -and -not $SourceOnly -and $packagedReady) {
    '优先打开打包版；若启动受限，则使用源码内的真实桌面程序'
  }
  elseif (-not $PreviewOnly -and $sourceDesktopReady) {
    '打开源码内的真实桌面程序'
  }
  elseif ($previewReady) {
    '打开正在运行的本地预览'
  }
  elseif ($runtime) {
    '启动本地预览'
  }
  else {
    '缺少可用的桌面程序和本地运行环境'
  }

  Write-Output "桌面程序：$(if ($packagedReady) { '已找到' } else { '未找到' })"
  Write-Output "源码桌面程序：$(if ($sourceDesktopReady) { '已找到' } else { '未找到' })"
  Write-Output "本地预览：$(if ($previewReady) { '已运行' } else { '未运行' })"
  Write-Output "预览环境：$(if ($runtime) { $runtime.Source } else { '未找到' })"
  Write-Output "启动方式：$recommendedMode"

  if ($packagedReady -or $sourceDesktopReady -or $previewReady -or $runtime) {
    exit 0
  }

  exit 1
}

if (-not $PreviewOnly -and -not $SourceOnly -and $packagedReady -and (Start-PackagedApp)) {
  exit 0
}

if (-not $PreviewOnly -and (Start-SourceDesktopApp)) {
  exit 0
}

if ($PreviewOnly -and $previewReady) {
  Open-Preview
  exit 0
}

if (-not $runtime) {
  Show-FriendlyMessage `
    -Kind Error `
    -Message "这台电脑暂时无法启动声作。`n`n回家后请先安装 Node.js 22 以上版本和 pnpm，或直接运行已打包的 ShengZuo.exe。"
  exit 1
}

if ($PreviewOnly -and (Start-LocalPreview -Runtime $runtime)) {
  exit 0
}

Show-FriendlyMessage `
  -Kind Error `
  -Message "声作桌面程序没有成功启动。`n`n请先运行 pnpm install 和 pnpm build；如只需查看界面，可在 PowerShell 中运行 scripts\start-clonevoice.ps1 -PreviewOnly。"
exit 1
