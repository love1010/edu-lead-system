param(
  [int]$Port = 3000
)

Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  成人高考招生系统 - PowerShell 启动" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
  $nodeVersion = node --version
  Write-Host "Node.js $nodeVersion 已检测" -ForegroundColor Green
} catch {
  Write-Host "[错误] 未检测到 Node.js，请先安装 Node.js (https://nodejs.org)" -ForegroundColor Red
  Read-Host "按回车键退出"
  exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules\")) {
  Write-Host "[信息] 正在安装依赖..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
  }
  Write-Host "[信息] 依赖安装完成" -ForegroundColor Green
}

Write-Host ""
Write-Host "  宣传页:     http://localhost:$Port/" -ForegroundColor Green
Write-Host "  管理后台:   http://localhost:$Port/admin" -ForegroundColor Yellow
Write-Host "  默认账号:   admin / admin123" -ForegroundColor Cyan
Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Try to get LAN IP for phone preview
try {
  $ipv4 = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } |
    Select-Object -ExpandProperty IPAddress -Unique
  if ($ipv4) {
    foreach ($ip in $ipv4) {
      Write-Host "手机预览 (同一Wi-Fi): http://$ip`:$Port/" -ForegroundColor Yellow
    }
  }
} catch {}

Write-Host ""

node server.js
