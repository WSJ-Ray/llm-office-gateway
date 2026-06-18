@echo off
title DeepSeek Gateway for Claude Office

echo ========================================
echo   DeepSeek Gateway for Claude Office
echo ========================================
echo.

REM ===== 编辑下面的两个值 =====
set DEEPSEEK_API_KEY=YOUR_DEEPSEEK_API_KEY_HERE
set GATEWAY_TOKEN=deepseek-office-key-2024
REM ============================

echo Starting gateway on http://127.0.0.1:4000 ...
echo.

cd /d "%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -Command "$env:DEEPSEEK_API_KEY='%DEEPSEEK_API_KEY%'; $env:GATEWAY_TOKEN='%GATEWAY_TOKEN%'; python '%~dp0gateway.py' 2>&1 | Tee-Object -FilePath '%~dp0gateway_log.txt'"

pause
