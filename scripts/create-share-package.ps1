[CmdletBinding()]
param(
  [string]$ReleaseDate = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$PackageName = ''
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Hash {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deliverablesRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'deliverables'))
$desktopRoot = Join-Path $repositoryRoot 'apps\desktop'
$desktopPackagePath = Join-Path $desktopRoot 'package.json'
$desktopPackage = Get-Content -LiteralPath $desktopPackagePath -Raw -Encoding utf8 | ConvertFrom-Json
$version = [string]$desktopPackage.version
$packageName = if ($PackageName.Trim()) {
  $PackageName.Trim()
} else {
  "声作-完整便携版-$ReleaseDate"
}
if (
  $packageName -in @('.', '..') -or
  [IO.Path]::GetFileName($packageName) -ne $packageName -or
  $packageName.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0
) {
  throw '包名称只能是一个有效的文件夹名称。'
}
$targetRoot = [IO.Path]::GetFullPath((Join-Path $deliverablesRoot $packageName))
$stagingRoot = [IO.Path]::GetFullPath((Join-Path $deliverablesRoot ".staging-$packageName"))
$zipPath = "$targetRoot.zip"
$zipHashPath = "$zipPath.sha256.txt"

if (-not $targetRoot.StartsWith($deliverablesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw '分享包目标目录不在 deliverables 中。'
}

foreach ($requiredPath in @(
  (Join-Path $desktopRoot 'dist\index.html'),
  (Join-Path $desktopRoot 'dist-electron\main\index.cjs'),
  (Join-Path $desktopRoot 'node_modules\electron\dist\electron.exe'),
  (Join-Path $repositoryRoot 'LICENSE'),
  (Join-Path $repositoryRoot 'PRIVACY.md'),
  (Join-Path $repositoryRoot '预置声音\放入声音档案说明.txt')
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "缺少已构建运行文件：$requiredPath"
  }
}

New-Item -ItemType Directory -Path $deliverablesRoot -Force | Out-Null
if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

$appRoot = Join-Path $stagingRoot 'app\source'
$portableDesktopRoot = Join-Path $appRoot 'apps\desktop'
$portableNodeModules = Join-Path $portableDesktopRoot 'node_modules'
New-Item -ItemType Directory -Path $portableNodeModules -Force | Out-Null

foreach ($directoryName in @('build', 'dist', 'dist-electron')) {
  Copy-Item -LiteralPath (Join-Path $desktopRoot $directoryName) -Destination $portableDesktopRoot -Recurse -Force
}

$electronLink = Get-Item -LiteralPath (Join-Path $desktopRoot 'node_modules\electron')
$electronSource = if ($electronLink.Target) {
  $linkTarget = if ($electronLink.Target -is [array]) {
    [string]$electronLink.Target[0]
  } else {
    [string]$electronLink.Target
  }
  [IO.Path]::GetFullPath($linkTarget)
} else {
  $electronLink.FullName
}
Copy-Item -LiteralPath $electronSource -Destination $portableNodeModules -Recurse -Force

# pnpm's generated command shims contain absolute paths from the build machine and
# are not needed by the portable Electron runtime.
$electronCommandShims = Join-Path $portableNodeModules 'electron\node_modules\.bin'
if (Test-Path -LiteralPath $electronCommandShims) {
  Remove-Item -LiteralPath $electronCommandShims -Recurse -Force
}

$portablePackage = [ordered]@{
  name = 'shengzuo-portable-cmd-runtime'
  version = $version
  private = $true
  description = 'ShengZuo self-contained CMD runtime'
  main = 'dist-electron/main/index.cjs'
} | ConvertTo-Json
[IO.File]::WriteAllText(
  (Join-Path $portableDesktopRoot 'package.json'),
  $portablePackage + "`n",
  [Text.UTF8Encoding]::new($false)
)

$portableEnginesRoot = Join-Path $appRoot 'engines'
New-Item -ItemType Directory -Path $portableEnginesRoot -Force | Out-Null
foreach ($engineName in @('common', 'voxcpm2', 'fun-cosyvoice3', 'indextts2-5')) {
  Copy-Item -LiteralPath (Join-Path $repositoryRoot "engines\$engineName") -Destination $portableEnginesRoot -Recurse -Force
}

Copy-Item -LiteralPath (Join-Path $repositoryRoot 'licenses') -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'prompts') -Destination $appRoot -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'LICENSE') -Destination (Join-Path $appRoot 'LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'LICENSE') -Destination (Join-Path $stagingRoot 'LICENSE.txt') -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'PRIVACY.md') -Destination (Join-Path $stagingRoot '隐私说明.md') -Force

$presetVoicesRoot = Join-Path $stagingRoot '预置声音'
New-Item -ItemType Directory -Path $presetVoicesRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repositoryRoot '预置声音\放入声音档案说明.txt') -Destination $presetVoicesRoot -Force
$presetVoicesMarker = Join-Path $presetVoicesRoot '.shengzuo-preset-voices'
[IO.File]::WriteAllText(
  $presetVoicesMarker,
  "ShengZuo preset voices folder.`n",
  [Text.Encoding]::ASCII
)
(Get-Item -LiteralPath $presetVoicesMarker).Attributes = [IO.FileAttributes]::Hidden

# Keep the exact upstream notices for every third-party package whose code is
# shipped in the Electron runtime or bundled renderer. This is deliberately
# generated from the locked installation instead of paraphrasing license text.
$runtimeLicenseRoot = Join-Path $appRoot 'licenses\runtime'
New-Item -ItemType Directory -Path $runtimeLicenseRoot -Force | Out-Null
$runtimeLicensePackages = @(
  @('electron', '35.7.5'),
  @('framer-motion', '11.18.2'),
  @('motion-dom', '11.18.1'),
  @('motion-utils', '11.18.1'),
  @('react', '18.3.1'),
  @('react-dom', '18.3.1'),
  @('scheduler', '0.23.2'),
  @('loose-envify', '1.4.0'),
  @('js-tokens', '4.0.0'),
  @('tslib', '2.8.1'),
  @('lucide-react', '0.511.0'),
  @('react-router-dom', '7.7.1'),
  @('react-router', '7.7.1'),
  @('cookie', '1.1.1'),
  @('set-cookie-parser', '2.7.2'),
  @('zustand', '5.0.6'),
  @('vite', '6.3.5'),
  @('tailwindcss', '3.4.17')
)
$pnpmStoreRoot = Join-Path $repositoryRoot 'node_modules\.pnpm'
foreach ($packageSpec in $runtimeLicensePackages) {
  $dependencyName = [string]$packageSpec[0]
  $expectedVersion = [string]$packageSpec[1]
  $dependencyRoot = Join-Path $desktopRoot "node_modules\$dependencyName"

  if (-not (Test-Path -LiteralPath (Join-Path $dependencyRoot 'package.json') -PathType Leaf)) {
    $pnpmDirectoryPrefix = "$($dependencyName.Replace('/', '+'))@$expectedVersion"
    $pnpmEntry = Get-ChildItem -LiteralPath $pnpmStoreRoot -Directory -Force |
      Where-Object { $_.Name.StartsWith($pnpmDirectoryPrefix, [StringComparison]::OrdinalIgnoreCase) } |
      Sort-Object Name |
      Select-Object -First 1
    if ($null -eq $pnpmEntry) {
      throw "缺少第三方许可来源：$dependencyName@$expectedVersion"
    }
    $dependencyRoot = Join-Path $pnpmEntry.FullName "node_modules\$dependencyName"
  }

  $dependencyPackagePath = Join-Path $dependencyRoot 'package.json'
  $dependencyPackage = Get-Content -LiteralPath $dependencyPackagePath -Raw -Encoding utf8 | ConvertFrom-Json
  if ([string]$dependencyPackage.version -ne $expectedVersion) {
    throw "第三方许可版本不一致：$dependencyName 需要 $expectedVersion，实际为 $($dependencyPackage.version)"
  }

  $dependencyLicense = Get-ChildItem -LiteralPath $dependencyRoot -File -Force |
    Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE)(\.|$)' } |
    Sort-Object Name |
    Select-Object -First 1
  if ($null -eq $dependencyLicense) {
    throw "第三方包没有随附许可文本：$dependencyName@$expectedVersion"
  }

  $safeDependencyName = $dependencyName.Replace('/', '__')
  $licenseExtension = if ($dependencyLicense.Extension) { $dependencyLicense.Extension } else { '.txt' }
  Copy-Item -LiteralPath $dependencyLicense.FullName -Destination (
    Join-Path $runtimeLicenseRoot "$safeDependencyName-$expectedVersion$licenseExtension"
  ) -Force
}

$developmentDirectories = @(
  Get-ChildItem -LiteralPath $portableEnginesRoot -Directory -Recurse -Force |
    Where-Object { $_.Name -in @('__pycache__', 'test', 'tests') } |
    Sort-Object { $_.FullName.Length } -Descending
)
foreach ($developmentDirectory in $developmentDirectories) {
  if (Test-Path -LiteralPath $developmentDirectory.FullName) {
    Remove-Item -LiteralPath $developmentDirectory.FullName -Recurse -Force
  }
}
Get-ChildItem -LiteralPath $appRoot -File -Recurse -Force |
  Where-Object { $_.Extension -in @('.map', '.pyc', '.pyo') } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

$forbiddenWeightExtensions = @('.ckpt', '.gguf', '.onnx', '.pt', '.pth', '.safetensors')
$forbiddenWeightFiles = @(
  Get-ChildItem -LiteralPath $stagingRoot -File -Recurse -Force |
    Where-Object { $_.Extension.ToLowerInvariant() -in $forbiddenWeightExtensions }
)
if ($forbiddenWeightFiles.Count -gt 0) {
  throw "分享包意外包含模型权重：$($forbiddenWeightFiles[0].FullName)"
}

$forbiddenDevelopmentPaths = @(
  Get-ChildItem -LiteralPath $portableEnginesRoot -Directory -Recurse -Force |
    Where-Object { $_.Name -in @('__pycache__', 'test', 'tests') }
)
if ($forbiddenDevelopmentPaths.Count -gt 0 -or (Test-Path -LiteralPath $electronCommandShims)) {
  throw '分享包仍包含测试目录、Python 缓存或构建机命令脚本。'
}

$safeTextExtensions = @('.cmd', '.cjs', '.css', '.html', '.ini', '.js', '.json', '.md', '.mjs', '.ps1', '.py', '.toml', '.tsv', '.txt', '.xml', '.yaml', '.yml')
$privateContentPatterns = @(
  '(?i)\bsk-[a-z0-9_-]{20,}\b',
  '(?i)\b[a-z]:(?:\\{1,2}|/)(?:users|desktop|桌面)(?:\\{1,2}|/)'
)
$scannableFiles = Get-ChildItem -LiteralPath $stagingRoot -File -Recurse -Force |
  Where-Object { $_.Extension.ToLowerInvariant() -in $safeTextExtensions -and $_.Length -le 5MB }
foreach ($privateContentPattern in $privateContentPatterns) {
  $privateContentMatch = $scannableFiles |
    Select-String -Pattern $privateContentPattern -List -ErrorAction Stop |
    Select-Object -First 1
  if ($null -ne $privateContentMatch) {
    throw "分享包包含疑似密钥或构建机私人路径：$($privateContentMatch.Path)"
  }
}

$normalLauncher = @'
@echo off
setlocal
set "APPROOT=%~dp0app\source\apps\desktop"
set "ELECTRON=%APPROOT%\node_modules\electron\dist\electron.exe"
set "MAIN=%APPROOT%\dist-electron\main\index.cjs"
set "RENDERER=%APPROOT%\dist\index.html"
set "MODELLIB="
set "PRESETVOICES="
for /d %%D in ("%~dp0*") do if exist "%%~fD\model-library.json" set "MODELLIB=%%~fD"
for /d %%D in ("%~dp0*") do if exist "%%~fD\.shengzuo-preset-voices" set "PRESETVOICES=%%~fD"

if not exist "%ELECTRON%" goto missing
if not exist "%MAIN%" goto missing
if not exist "%RENDERER%" goto missing

set "AVS_USE_DIST=1"
if defined MODELLIB set "SHENGZUO_MODEL_LIBRARY=%MODELLIB%"
if defined PRESETVOICES set "SHENGZUO_PRESET_VOICES=%PRESETVOICES%"
start "" /d "%APPROOT%" "%ELECTRON%" "%APPROOT%"
exit /b 0

:missing
echo ShengZuo files are incomplete. Please extract the whole ZIP first.
pause
exit /b 2
'@

[IO.File]::WriteAllText((Join-Path $stagingRoot '启动.cmd'), $normalLauncher, [Text.Encoding]::ASCII)

$usageGuide = @"
声作 $version · 完整便携版
============================

让自己的声音，成为作品。
声作是一款 Windows 本地声音创作工作台。

打开方法
--------

1. 右键 ZIP，选择“全部解压”。不要在压缩包预览里直接运行。
2. 双击“【启动.cmd】”，软件打开后命令窗口会自动退出。
3. app 文件夹是程序文件，不要单独移动、改名或删除。

启动不需要提前安装 Node.js、Python 或 FFmpeg。

第一次使用
----------

1. 准备模型：不知道选哪个就先下载 VoxCPM2。
2. 克隆声音：点击选择或从资源管理器拖入本人或已获授权的 3–60 秒清晰录音。只有能完整对应录音时才填写录音原文。
3. 输入文字：粘贴口播、旁白或台词，然后点击“生成配音”。VoxCPM2 也可以不选录音，直接用“描述造声”。

模型、Python、FFmpeg、官方源码和权重会由软件按需下载、校验和安装。点击下载时可以直接使用当前位置，也可以选择其他磁盘。
三款模型按需安装：综合创作选 VoxCPM2，更多中文方言选 Fun-CosyVoice3，细腻情绪和发音控制选 IndexTTS-2.5。
IndexTTS-2.5 当前组合包含仅限非商业使用的辅助权重，下载前软件会明确提示；商业用途请先取得授权或选择另外两款模型。
下载前会检查磁盘空间；中断后可继续，官方源慢时可切换备用源，也可以从完整模型文件夹离线导入。

长稿配音和连续任务
------------------

长稿配音会保留已经生成好的句子。中途失败、取消或重开软件后，只需重做未完成或修改过的句子。
可以连续提交多份配音，软件会依次生成；在“项目与记录”可以取消、重试或继续编辑已保存稿件。

需要更新时，在“设置”点击“检查更新”，有新版会打开 GitHub 下载页；模型库不需要重新下载。

模型文件夹
----------

模型默认保存在：
  %LOCALAPPDATA%\声作模型库

在“本地模型”或“设置”中可以打开模型文件夹。需要换磁盘时，在“设置”点击“迁移位置”，已下载和未下载完的文件会一起移动。
需要腾空间时，请先退出声作，再删除对应模型的整个文件夹；下次打开会自动刷新状态。

隐私与授权
----------

分享包不包含打包者的声音、模型权重、生成结果或缓存。
录音、文稿、声音档案和生成结果默认保存在每位使用者自己的电脑。
模型安装会联网下载官方文件，但应用不会把用户录音或文稿上传到模型下载站点。
只能克隆本人声音，或已经获得声音所有者明确授权的声音。

打不开时
--------

1. 确认已经完整解压，且“启动.cmd”和 app 文件夹在同一个总文件夹中。
2. 把整个文件夹复制到本机可写的短路径，例如 D:\ShengZuo，再试一次。
3. 不要放在网盘预览、邮件附件预览、只读目录或超长路径中运行。
4. 模型下载失败时，检查网络和剩余空间，然后在模型页点击重试。
5. 软件能打开时，可在“设置”运行“一键检查修复”或导出问题排查包。
"@

$versionInfo = @"
产品：声作
定位：本地声音创作工作台
主张：让自己的声音，成为作品。
版本：$version
发布日期：$ReleaseDate
启动方式：启动.cmd
支持系统：Windows 10/11 x64

本版包含：
- VoxCPM2（综合最推荐，可控克隆、极致克隆与描述造声）
- Fun-CosyVoice3（更多中文方言与口音）
- IndexTTS-2.5（情绪演绎、多语言与发音控制；当前组合仅限非商业）
- 本地声音克隆、单段配音、长稿配音、多人对话、项目和生成记录
- 长稿中途续做、保留已完成句子、多份配音依次生成与失败重试
- 模型一键下载、下载前检查空间、暂停后继续、换源、离线导入与统一文件夹
- 录音质量检查和一键问题排查包
- 模型下载位置选择、完整模型库迁移和录音拖入
- 自定义导出文件名规则、实时预览和上次导出位置记忆
- 手动检查 GitHub 正式更新并打开下载页
- 紧凑创作布局、全页面文字防裁切、API 智能处理、脚本角色提取与软件许可

权重说明：
每位使用者在软件内按需下载，关键文件通过 SHA-256 校验后启用；分享包本身不携带模型权重、私人录音或生成结果。

发布限制：
当前 Windows 程序尚未正式代码签名，首次运行时可能出现系统安全提示。
"@

$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $stagingRoot '使用说明.txt'), $usageGuide, $utf8NoBom)
[IO.File]::WriteAllText((Join-Path $stagingRoot '版本信息.txt'), $versionInfo, $utf8NoBom)

$manifestPath = Join-Path $stagingRoot 'app\文件清单.sha256.txt'
$manifestLines = Get-ChildItem -LiteralPath (Join-Path $stagingRoot 'app') -File -Recurse -Force |
  Where-Object { $_.FullName -ne $manifestPath } |
  Sort-Object FullName |
  ForEach-Object {
    $relativePath = $_.FullName.Substring($stagingRoot.Length + 1).Replace('\', '/')
    $hash = Get-Sha256Hash -Path $_.FullName
    "$hash  $relativePath"
  }
[IO.File]::WriteAllLines($manifestPath, $manifestLines, $utf8NoBom)

if (Test-Path -LiteralPath $targetRoot) {
  Remove-Item -LiteralPath $targetRoot -Recurse -Force
}
Move-Item -LiteralPath $stagingRoot -Destination $targetRoot

foreach ($oldFile in @($zipPath, $zipHashPath)) {
  if (Test-Path -LiteralPath $oldFile) {
    Remove-Item -LiteralPath $oldFile -Force
  }
}
Compress-Archive -LiteralPath $targetRoot -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = Get-Sha256Hash -Path $zipPath
[IO.File]::WriteAllText(
  $zipHashPath,
  "$zipHash  $([IO.Path]::GetFileName($zipPath))`n",
  $utf8NoBom
)

$fileCount = (Get-ChildItem -LiteralPath $targetRoot -File -Recurse -Force | Measure-Object).Count
$zipSize = (Get-Item -LiteralPath $zipPath).Length
[pscustomobject]@{
  Product = '声作'
  Version = $version
  Folder = $targetRoot
  Zip = $zipPath
  Files = $fileCount
  ZipBytes = $zipSize
  Sha256 = $zipHash
} | Format-List
