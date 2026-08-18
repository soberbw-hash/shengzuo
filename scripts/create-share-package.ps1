[CmdletBinding()]
param(
  [string]$ReleaseDate = (Get-Date -Format 'yyyy-MM-dd')
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deliverablesRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'deliverables'))
$desktopRoot = Join-Path $repositoryRoot 'apps\desktop'
$desktopPackagePath = Join-Path $desktopRoot 'package.json'
$desktopPackage = Get-Content -LiteralPath $desktopPackagePath -Raw -Encoding utf8 | ConvertFrom-Json
$version = [string]$desktopPackage.version
$packageName = "声作-完整便携版-$ReleaseDate"
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
  (Join-Path $desktopRoot 'node_modules\electron\dist\electron.exe')
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

Get-ChildItem -LiteralPath $appRoot -Directory -Recurse -Force |
  Where-Object { $_.Name -eq '__pycache__' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
Get-ChildItem -LiteralPath $appRoot -File -Recurse -Force |
  Where-Object { $_.Extension -eq '.pyc' } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

$normalLauncher = @'
@echo off
setlocal
set "APPROOT=%~dp0app\source\apps\desktop"
set "ELECTRON=%APPROOT%\node_modules\electron\dist\electron.exe"
set "MAIN=%APPROOT%\dist-electron\main\index.cjs"
set "RENDERER=%APPROOT%\dist\index.html"
set "MODELLIB="
for /d %%D in ("%~dp0*") do if exist "%%~fD\model-library.json" set "MODELLIB=%%~fD"

if not exist "%ELECTRON%" goto missing
if not exist "%MAIN%" goto missing
if not exist "%RENDERER%" goto missing

set "AVS_USE_DIST=1"
if defined MODELLIB set "SHENGZUO_MODEL_LIBRARY=%MODELLIB%"
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
2. 克隆声音：点击选择或从资源管理器拖入本人或已获授权的 3–60 秒清晰录音，并逐字填写录音原文。
3. 输入文字：粘贴口播、旁白或台词，然后点击“生成配音”。

模型、Python、FFmpeg、官方源码和权重会由软件按需下载、校验和安装。点击下载时可以直接使用当前位置，也可以选择其他磁盘。
三款模型按需安装：综合创作选 VoxCPM2，更多中文方言选 Fun-CosyVoice3，细腻情绪和发音控制选 IndexTTS-2.5。
下载前会检查磁盘空间；中断后可继续，官方源慢时可切换备用源，也可以从完整模型文件夹离线导入。

长字幕和多个任务
------------------

字幕配音会逐句缓存。中途失败、取消或重开软件后，重试只生成未完成或修改过的句子。
可以连续提交多份配音，在“项目与记录”查看后台队列、取消、失败重试或继续编辑已保存稿件。

需要更新时，在“设置”点击“检查更新”，有新版会打开 GitHub 下载页；模型库不需要重新下载。

模型文件夹
----------

模型默认保存在：
  %LOCALAPPDATA%\声作模型库

在“本地引擎”或“设置”中可以打开模型文件夹。需要换磁盘时，在“设置”点击“迁移位置”，已下载模型和断点会一起移动。
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
5. 软件能打开时，可在“设置”运行“一键检查修复”或导出脱敏诊断 ZIP。
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
- VoxCPM2（综合最推荐，真实克隆、情绪与声音设计）
- Fun-CosyVoice3（更多中文方言与口音）
- IndexTTS-2.5（情绪演绎、多语言与发音控制）
- 本地声音克隆、单段配音、字幕配音、多人对话、项目和生成记录
- 长任务断点续做、逐句缓存、后台任务队列与失败重试
- 模型一键下载、磁盘预检、续传、换源、离线导入与统一文件夹
- 录音质量检查和一键脱敏诊断包
- 模型下载位置选择、完整模型库迁移和录音拖入
- 自定义导出文件名规则、实时预览和上次导出位置记忆
- 手动检查 GitHub 正式更新并打开下载页
- 首页三步引导、API 文稿整理、脚本角色提取、隐私说明与软件许可

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
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
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
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
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
