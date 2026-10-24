@echo off
setlocal
cd /d "%~dp0"
set "TOEFL_NODE=node"
where node >nul 2>nul
if errorlevel 1 goto bundled
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul
if not errorlevel 1 goto run
:bundled
set "TOEFL_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%TOEFL_NODE%" goto run
echo Node.js 22.13 or newer is required for the SQLite and MCP features.
echo You can still open index.html for the no-API workflow.
pause
exit /b 1
:run
if not defined TOEFL_PORT set "TOEFL_PORT=8765"
echo Open http://127.0.0.1:%TOEFL_PORT% in your browser.
echo Keep this window open while using the local app.
"%TOEFL_NODE%" "%~dp0server.mjs"
pause
