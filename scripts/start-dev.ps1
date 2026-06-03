# 本機啟動：啟用 Python venv → 載入環境變數 → npm run dev
# 用法：在專案根目錄執行  powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $ProjectRoot

Write-Host "==> Project: $ProjectRoot"

$venvCandidates = @(
    (Join-Path $ProjectRoot 'venv\Scripts\Activate.ps1'),
    (Join-Path $ProjectRoot 'pna-src\venv\Scripts\Activate.ps1')
)
$venvActivate = $venvCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $venvActivate) {
    Write-Host '==> No venv found. Creating venv and installing Python deps...'
    python -m venv (Join-Path $ProjectRoot 'venv')
    $venvActivate = Join-Path $ProjectRoot 'venv\Scripts\Activate.ps1'
}

Write-Host "==> Activating venv: $venvActivate"
. $venvActivate

Write-Host '==> Installing Python requirements (if needed)...'
python -m pip install -q -r requirements.txt

$loadDotEnv = Join-Path $PSScriptRoot 'load-dotenv.ps1'
if (Test-Path (Join-Path $ProjectRoot '.env')) {
    Write-Host '==> Loading .env'
    . $loadDotEnv (Join-Path $ProjectRoot '.env')
} else {
    Write-Warning '.env not found. Copy env.example and set DATABASE_URL for MySQL.'
}

if (Test-Path (Join-Path $ProjectRoot '.env.local')) {
    Write-Host '==> Loading .env.local'
    . $loadDotEnv (Join-Path $ProjectRoot '.env.local')
} else {
    Write-Warning '.env.local not found. Copy .env.local.example to .env.local and set AUTH_SECRET / Google OAuth.'
}

if (-not $env:DATABASE_URL -and -not $env:MYSQL_URL) {
    Write-Warning 'DATABASE_URL is not set. FastAPI cannot connect to MySQL (login / save network will fail).'
}

if (-not $env:AUTH_SECRET) {
    Write-Warning 'AUTH_SECRET is not set. NextAuth may fail.'
}

if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    Write-Host '==> Installing npm dependencies...'
    npm install
}

Write-Host '==> Starting Next.js + FastAPI (npm run dev)...'
Write-Host '    Open http://localhost:3000/login (do not use 172.26.x.x for Google login)'
npm run dev
