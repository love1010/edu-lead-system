@echo off
cd /d "%~dp0"

echo ====================================
echo  成人高考招生系统 - 启动脚本
echo ====================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js (https://nodejs.org)
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules\" (
    echo [信息] 正在安装依赖...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [信息] 依赖安装完成
)

echo.
echo [信息] 正在启动服务...
echo.
echo   宣传页:     http://localhost:3000
echo   管理后台:   http://localhost:3000/admin
echo   默认账号:   admin / admin123
echo.
echo ====================================
node server.js

pause
