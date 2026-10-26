@echo off
setlocal
title ASTRA LAB - build Windows installer
cd /d "%~dp0"
echo ============================================================
echo  ASTRA LAB - building the Windows installer
echo ============================================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found. Install Node.js 18 LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
echo.
echo [1/3] Installing build tools (needs internet, first time only)...
call npm install
if errorlevel 1 goto fail
echo.
echo [2/3] Running the automated tests...
call npm test
if errorlevel 1 (
  echo The tests reported a problem. The installer will still be built, but please check the messages above.
)
echo.
echo [3/3] Building the installer...
call npm run dist
if errorlevel 1 goto fail
echo.
echo ============================================================
echo  DONE. The installer is in the folder:  build\dist
echo  Run "ASTRA LAB Setup 1.0.0.exe" to install ASTRA LAB
echo  (a desktop shortcut is created).
echo ============================================================
explorer "%~dp0build\dist"
pause
exit /b 0
:fail
echo.
echo The build failed. Read the messages above. Common causes: no internet connection during npm install,
echo or an antivirus program blocking the download. Run the file again.
pause
exit /b 1
