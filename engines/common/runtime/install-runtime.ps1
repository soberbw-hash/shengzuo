[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('voxcpm', 'cosyvoice', 'indextts')]
  [string]$Flavor,
  [ValidateSet('cuda', 'cpu')]
  [string]$Compute = 'cuda',
  [Parameter(Mandatory)]
  [string]$RuntimeRoot,
  [Parameter(Mandatory)]
  [string]$CacheRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:PIP_CACHE_DIR = Join-Path $CacheRoot 'pip'
$env:PIP_DISABLE_PIP_VERSION_CHECK = '1'

$pythonVersion = if ($Flavor -in @('cosyvoice', 'indextts')) { '3.10.11' } else { '3.12.10' }
$pythonSha256 = if ($pythonVersion -eq '3.10.11') {
  '608619f8619075629c9c69f361352a0da6ed7e62f83a0e19c63e0ea32eb7629d'
} else {
  '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3'
}
$getPipSha256 = '25b5c39ade96bab5eabe6404ce83cab6da2deb5fe3c07d9881f43803edb6f9c8'
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
$getPipUrl = 'https://raw.githubusercontent.com/pypa/get-pip/953091ced35f07ab1b09f79ddb864779bd06a78b/public/get-pip.py'
$pythonArchive = Join-Path $CacheRoot "python-$pythonVersion-embed-amd64.zip"
$getPipPath = Join-Path $CacheRoot 'get-pip.py'
$runtimeStaging = "$RuntimeRoot.installing"
$pythonExe = Join-Path $runtimeStaging 'python.exe'
$finalPythonExe = Join-Path $RuntimeRoot 'python.exe'
$markerPath = Join-Path $RuntimeRoot 'runtime-receipt.json'
$pythonDigits = $pythonVersion.Replace('.', '').Substring(0, 3)
$torchIndex = if ($Compute -eq 'cuda') {
  if ($Flavor -eq 'cosyvoice') { 'https://download.pytorch.org/whl/cu121' } else { 'https://download.pytorch.org/whl/cu128' }
} else {
  'https://download.pytorch.org/whl/cpu'
}

function Write-ProgressEvent {
  param([int]$Progress, [string]$Message)
  [pscustomobject]@{ progress = $Progress; message = $Message } |
    ConvertTo-Json -Compress |
    Write-Output
}

function Invoke-CheckedProcess {
  param([string]$FilePath, [string[]]$ArgumentList)
  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Child process exited with code $LASTEXITCODE"
  }
}

function Invoke-ResumableDownload {
  param([string]$Uri, [string]$Destination)
  $partial = "$Destination.part"
  $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
  if ($null -eq $curl) {
    Invoke-WebRequest -Uri $Uri -OutFile $partial -UseBasicParsing
  } else {
    & $curl.Source --location --fail --retry 3 --continue-at - --output $partial $Uri
    if ($LASTEXITCODE -ne 0) {
      # Some small source servers do not accept Range. Restart only that file.
      Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
      & $curl.Source --location --fail --retry 3 --output $partial $Uri
      if ($LASTEXITCODE -ne 0) {
        throw "Download failed with code $LASTEXITCODE"
      }
    }
  }
  Move-Item -LiteralPath $partial -Destination $Destination -Force
}

function Install-PythonPackages {
  param([string[]]$Packages, [string[]]$ExtraArguments = @())
  Invoke-CheckedProcess -FilePath $pythonExe -ArgumentList (@(
      '-m', 'pip', '--disable-pip-version-check', 'install',
      '--no-warn-script-location'
    ) + $ExtraArguments + $Packages)
}

New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
if ((Test-Path -LiteralPath $finalPythonExe -PathType Leaf) -and (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
  $receipt = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($receipt.flavor -eq $Flavor -and ((-not $receipt.PSObject.Properties['compute']) -or $receipt.compute -eq $Compute)) {
    Write-ProgressEvent -Progress 42 -Message 'RUNTIME_READY'
    exit 0
  }
}

Write-ProgressEvent -Progress 4 -Message 'PYTHON_DOWNLOAD'
if (-not (Test-Path -LiteralPath $pythonArchive -PathType Leaf)) {
  Invoke-ResumableDownload -Uri $pythonUrl -Destination $pythonArchive
}
if (-not (Test-Path -LiteralPath $getPipPath -PathType Leaf)) {
  Invoke-ResumableDownload -Uri $getPipUrl -Destination $getPipPath
}

$actualPythonSha256 = (Get-FileHash -LiteralPath $pythonArchive -Algorithm SHA256).Hash.ToLowerInvariant()
$actualGetPipSha256 = (Get-FileHash -LiteralPath $getPipPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualPythonSha256 -ne $pythonSha256 -or $actualGetPipSha256 -ne $getPipSha256) {
  throw 'Python runtime SHA-256 verification failed.'
}

Write-ProgressEvent -Progress 10 -Message 'PYTHON_VERIFIED'
if (Test-Path -LiteralPath $runtimeStaging) {
  $quarantine = "$runtimeStaging.incomplete.$([guid]::NewGuid().ToString('N'))"
  Move-Item -LiteralPath $runtimeStaging -Destination $quarantine
}
New-Item -ItemType Directory -Force -Path $runtimeStaging | Out-Null
Expand-Archive -LiteralPath $pythonArchive -DestinationPath $runtimeStaging -Force
@("python$pythonDigits.zip", '.', 'Lib\site-packages', 'import site') |
  Set-Content -LiteralPath (Join-Path $runtimeStaging "python$pythonDigits._pth") -Encoding ASCII
New-Item -ItemType Directory -Force -Path (Join-Path $runtimeStaging 'Lib\site-packages') | Out-Null
Invoke-CheckedProcess -FilePath $pythonExe -ArgumentList @($getPipPath, '--no-warn-script-location')
Invoke-CheckedProcess -FilePath $pythonExe -ArgumentList @(
  '-m', 'pip', 'install', '--no-warn-script-location', 'setuptools==80.9.0'
)

Write-ProgressEvent -Progress 18 -Message 'TORCH_INSTALL'
if ($Flavor -eq 'indextts') {
  Install-PythonPackages -ExtraArguments @('--index-url', $torchIndex) -Packages @(
    'torch==2.8.0', 'torchaudio==2.8.0'
  )
  Write-ProgressEvent -Progress 27 -Message 'ENGINE_DEPENDENCIES'
  Install-PythonPackages -Packages @(
    'accelerate==1.8.1', 'cn2an==0.5.22', 'cython==3.0.7',
    'descript-audiotools==0.7.2', 'einops==0.8.1', 'ffmpeg-python==0.2.0',
    'fugashi==1.5.2', 'unidic-lite==1.0.8', 'g2p-en==2.1.0',
    'jieba==0.42.1', 'json5==0.12.1', 'keras==3.10.0',
    'librosa==0.10.2.post1', 'matplotlib==3.10.0', 'modelscope==1.27.0',
    'munch==4.0.0', 'numba==0.63.0', 'numpy==2.2.6',
    'omegaconf==2.3.0', 'opencv-python==4.11.0.86', 'pandas==2.3.0',
    'safetensors==0.5.2', 'sentencepiece==0.2.0', 'soundfile==0.13.1',
    'tensorboard==2.19.0', 'textstat==0.7.7', 'tiktoken==0.9.0',
    'tokenizers==0.21.1', 'transformers==4.52.1', 'requests==2.32.4',
    'tqdm==4.67.1', 'wetext==0.0.9', 'imageio-ffmpeg==0.6.0',
    'huggingface-hub>=0.31,<1.0', 'hf-xet>=1.1,<2.0'
  )
  Install-PythonPackages -ExtraArguments @('--no-build-isolation') -Packages @(
    'openai-whisper==20250625'
  )
} elseif ($Flavor -eq 'cosyvoice') {
  Install-PythonPackages -ExtraArguments @('--index-url', $torchIndex) -Packages @(
    'torch==2.3.1', 'torchaudio==2.3.1'
  )
  Write-ProgressEvent -Progress 27 -Message 'ENGINE_DEPENDENCIES'
  Install-PythonPackages -Packages @(
    'numpy==1.26.4', 'scipy', 'soundfile==0.12.1', 'librosa==0.10.2',
    'onnxruntime==1.18.0', 'transformers==4.51.3', 'accelerate',
    'HyperPyYAML==1.2.3', 'omegaconf==2.3.0', 'hydra-core==1.3.2',
    'conformer==0.3.2', 'diffusers==0.29.0', 'inflect==7.3.1',
    'x-transformers==2.11.24', 'wetext==0.0.4', 'lightning==2.2.4',
    'matplotlib==3.7.5', 'rich==13.7.1', 'rootutils', 'gdown==5.1.0',
    'pyarrow==18.1.0', 'pyworld==0.3.4', 'tqdm', 'wget',
    'imageio-ffmpeg==0.6.0', 'huggingface-hub>=0.36,<1.0', 'hf-xet>=1.1,<2.0'
  )
  Install-PythonPackages -ExtraArguments @('--no-build-isolation') -Packages @(
    'openai-whisper==20231117'
  )
} else {
  Install-PythonPackages -ExtraArguments @('--index-url', $torchIndex) -Packages @(
    'torch==2.9.1', 'torchaudio==2.9.1'
  )
  Write-ProgressEvent -Progress 27 -Message 'ENGINE_DEPENDENCIES'
  Install-PythonPackages -Packages @(
    'numpy==1.26.4', 'soundfile==0.13.1', 'librosa==0.11.0',
    'imageio-ffmpeg==0.6.0', 'transformers==4.57.1', 'safetensors==0.6.2',
    'huggingface-hub>=0.36,<1.0', 'hf-xet>=1.1,<2.0', 'einops==0.8.1',
    'inflect==7.5.0', 'pydantic>=2.10,<3', 'regex', 'tqdm', 'wetext==0.0.4'
  )
  Install-PythonPackages -ExtraArguments @('--no-deps') -Packages @('voxcpm==2.0.3')
}

$stagingMarker = Join-Path $runtimeStaging 'runtime-receipt.json'
$temporaryMarker = "$stagingMarker.tmp"
[pscustomobject]@{
  flavor = $Flavor
  compute = $Compute
  python = $pythonVersion
  installedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $temporaryMarker -Encoding UTF8
Move-Item -LiteralPath $temporaryMarker -Destination $stagingMarker -Force
if (Test-Path -LiteralPath $RuntimeRoot) {
  $quarantinePath = "$RuntimeRoot.incomplete.$([guid]::NewGuid().ToString('N'))"
  Move-Item -LiteralPath $RuntimeRoot -Destination $quarantinePath
}
Move-Item -LiteralPath $runtimeStaging -Destination $RuntimeRoot
Write-ProgressEvent -Progress 42 -Message 'RUNTIME_READY'
