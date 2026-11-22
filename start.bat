@echo off
setlocal
cd /d "%~dp0"
title VRoid Hub Downloader

echo.
echo   VRoid Hub Downloader
echo   ==================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
	echo   Node.js was not found on this computer.
	echo   Install the latest version from https://nodejs.org/
	echo   then double-click this file again.
	echo.
	pause
	exit /b 1
)

for /f "delims=" %%v in ('node -v') do set "NODE_VERSION=%%v"
echo   Node.js %NODE_VERSION% detected.

if not exist "node_modules\" (
	echo   Installing dependencies, this only happens once...
	echo.
	where pnpm >nul 2>nul
	if errorlevel 1 (
		call npm install
	) else (
		call pnpm install
	)
	if errorlevel 1 (
		echo.
		echo   Dependency install failed. Run "pnpm install" in this folder
		echo   and start this file again.
		echo.
		pause
		exit /b 1
	)
)

echo.
echo   Starting the server and opening the page...
echo   Leave this window open while you use the app.
echo   Press Ctrl+C here, or use the "Shut down" button in the page, to stop.
echo.

node "src\server.js" --open

if errorlevel 1 (
	echo.
	echo   The server stopped with an error. Check the messages above.
	echo.
	pause
	exit /b 1
)

echo.
echo   Server stopped. Closing this window...
timeout /t 5 >nul
