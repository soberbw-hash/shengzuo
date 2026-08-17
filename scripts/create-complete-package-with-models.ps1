[CmdletBinding()]
param(
  [string]$ReleaseDate = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$ModelLibraryRoot = (Join-Path $env:LOCALAPPDATA '声作模型库')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$deliverablesRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'deliverables'))
$thinRoot = [IO.Path]::GetFullPath((Join-Path $deliverablesRoot "声作-完整便携版-$ReleaseDate"))
$targetRoot = [IO.Path]::GetFullPath((Join-Path $deliverablesRoot "声作-完整便携版-含三模型-$ReleaseDate"))
$stagingRoot = [IO.Path]::GetFullPath((Join-Path $deliverablesRoot ".staging-声作-含三模型-$ReleaseDate"))
$sourceRoot = [IO.Path]::GetFullPath($ModelLibraryRoot)
$modelFolders = @('voxcpm2', 'fun-cosyvoice3', 'indextts2-5')
$minimumAssetReceipts = @{
  'voxcpm2' = 1
  'fun-cosyvoice3' = 3
  'indextts2-5' = 2
}

foreach ($pathToCheck in @($thinRoot, $targetRoot, $stagingRoot)) {
  if (-not $pathToCheck.StartsWith($deliverablesRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw '目标目录不在 deliverables 中。'
  }
}
if (-not (Test-Path -LiteralPath $thinRoot -PathType Container)) {
  & (Join-Path $PSScriptRoot 'create-share-package.ps1') -ReleaseDate $ReleaseDate
}

foreach ($model in $modelFolders) {
  $modelRoot = Join-Path $sourceRoot $model
  foreach ($required in @('runtime\runtime-receipt.json', 'runtime\python.exe', 'weights', 'sources')) {
    if (-not (Test-Path -LiteralPath (Join-Path $modelRoot $required))) {
      throw "模型不完整：$model 缺少 $required"
    }
  }
  $assetReceipts = Get-ChildItem -LiteralPath $modelRoot -Filter 'install-receipt.json' -File -Recurse -Force |
    Where-Object { $_.FullName -notlike '*\cache\*' }
  if ($assetReceipts.Count -lt $minimumAssetReceipts[$model]) {
    throw "模型校验收据不完整：$model"
  }
}

if (Test-Path -LiteralPath $stagingRoot) {
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

function Copy-DirectoryFast {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [Parameter(Mandatory = $true)]
    [string]$Destination
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  & robocopy.exe $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /MT:32 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "目录复制失败：$Source"
  }
}

Copy-DirectoryFast -Source $thinRoot -Destination $stagingRoot
$targetModelRoot = Join-Path $stagingRoot '模型库'
New-Item -ItemType Directory -Path $targetModelRoot -Force | Out-Null

$manifestModels = foreach ($model in $modelFolders) {
  $sourceModel = Join-Path $sourceRoot $model
  $destinationModel = Join-Path $targetModelRoot $model
  New-Item -ItemType Directory -Path $destinationModel -Force | Out-Null
  foreach ($folder in @('runtime', 'weights', 'sources')) {
    Copy-DirectoryFast `
      -Source (Join-Path $sourceModel $folder) `
      -Destination (Join-Path $destinationModel $folder)
  }
  $sourceFiles = foreach ($folder in @('runtime', 'weights', 'sources')) {
    Get-ChildItem -LiteralPath (Join-Path $sourceModel $folder) -File -Recurse -Force
  }
  $destinationFiles = Get-ChildItem -LiteralPath $destinationModel -File -Recurse -Force
  $sourceBytes = ($sourceFiles | Measure-Object Length -Sum).Sum
  $destinationBytes = ($destinationFiles | Measure-Object Length -Sum).Sum
  if ($sourceFiles.Count -ne $destinationFiles.Count -or $sourceBytes -ne $destinationBytes) {
    throw "模型复制校验失败：$model"
  }
  [ordered]@{
    folder = $model
    files = $destinationFiles.Count
    bytes = $destinationBytes
  }
}

$manifest = [ordered]@{
  product = '声作'
  releaseDate = $ReleaseDate
  purpose = '可选完整模型库；删除任一模型文件夹后，软件可按需重新下载。'
  models = $manifestModels
} | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText(
  (Join-Path $targetModelRoot '模型库清单.json'),
  $manifest + "`n",
  [Text.UTF8Encoding]::new($false)
)
[IO.File]::WriteAllText(
  (Join-Path $targetModelRoot 'model-library.json'),
  $manifest + "`n",
  [Text.UTF8Encoding]::new($false)
)

$completeUsage = @'
声作 1.0.1 · 含三模型完整便携版
================================

打开方法
--------
1. 双击“启动.cmd”。
2. 请保持 app、模型库和“启动.cmd”在同一个总文件夹中。

这个版本已经包含
----------------
- VoxCPM2：综合最推荐。
- Fun-CosyVoice3：中文方言更多。
- IndexTTS-2.5：情绪和发音控制更细。
- 三套隔离 Python、FFmpeg、模型源码和权重。

无需手动安装 Python、FFmpeg、CUDA Toolkit 或模型依赖。软件会自动检测 NVIDIA 显卡和显存；条件合适时使用 CUDA，没有合适显卡时自动改用 CPU。CPU 模式建议至少 16GB 内存，生成速度会慢一些。

模型文件夹
----------
三款模型都在旁边的“模型库”文件夹中。每个模型里的 runtime、sources、weights 是一整套，不要拆开。
需要精简分享包时，退出声作后删除不需要的整个模型文件夹；软件会显示为未安装，并可重新一键下载。

下载模型前可以在软件中选择保存位置；之后也可以到“设置”中迁移整个模型库，已下载的模型不需要重新下载。

软件内“本地引擎”和“设置”均可直接打开当前模型文件夹。
需要换到固定位置或其他磁盘时，直接在“设置”中点击“迁移位置”，软件会复制、核对并切换模型库。
设置中的“一键检查修复”可以检查本地后台、模型环境、FFmpeg、文件权限和硬件配置。
克隆声音时可以点击选择录音，也可以从资源管理器直接把音频拖进窗口。
设置中可以修改导出文件名规则；导出时会显示最终名称，也可以临时改名。
'@
[IO.File]::WriteAllText(
  (Join-Path $stagingRoot '使用说明.txt'),
  $completeUsage,
  [Text.UTF8Encoding]::new($true)
)

$completeVersion = @"
产品：声作
版本：1.0.1
发布日期：$ReleaseDate
系统：Windows 10/11 x64
入口：启动.cmd

模型：VoxCPM2、Fun-CosyVoice3、IndexTTS-2.5
运行方式：自动检测 NVIDIA CUDA；显卡不适用时自动切换 CPU
随包内容：Electron、隔离 Python、FFmpeg、模型源码和官方权重
模型管理：下载前选择位置、迁移完整模型库、打开目录、暂停续传、换源和离线导入
录音导入：点击选择，或从资源管理器直接拖入
导出命名：设置中自定义规则，记住上次规则和导出文件夹
"@
[IO.File]::WriteAllText(
  (Join-Path $stagingRoot '版本信息.txt'),
  $completeVersion,
  [Text.UTF8Encoding]::new($true)
)

if (Test-Path -LiteralPath $targetRoot) {
  Remove-Item -LiteralPath $targetRoot -Recurse -Force
}
Move-Item -LiteralPath $stagingRoot -Destination $targetRoot

$total = Get-ChildItem -LiteralPath $targetRoot -File -Recurse -Force | Measure-Object Length -Sum
[pscustomobject]@{
  Product = '声作'
  Folder = $targetRoot
  Models = $modelFolders.Count
  Files = $total.Count
  Bytes = $total.Sum
  GB = [math]::Round($total.Sum / 1GB, 2)
}
