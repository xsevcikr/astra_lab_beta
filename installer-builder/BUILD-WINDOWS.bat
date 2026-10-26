@echo off
setlocal
set CSC_IDENTITY_AUTO_DISCOVERY=false
net session >nul 2>&1
if errorlevel 1 (
  echo Windows needs administrator rights for this step. Asking for permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
title ASTRA LAB - build Windows installer
cd /d "%~dp0.."
set "ROOT=%CD%\"
echo ============================================================
echo  ASTRA LAB - building the Windows installer (OPTIONAL)
echo  You do not need this to use ASTRA LAB. To just open the app,
echo  close this window and double-click START-ASTRA-LAB.bat instead.
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
echo  Run "ASTRA LAB Setup 2.2.0.exe" to install ASTRA LAB
echo  (a desktop shortcut is created).
echo ============================================================
explorer "%ROOT%build\dist"
pause
exit /b 0
:fail
echo.
echo The build failed. Read the messages above. Common causes: no internet connection during npm install,
echo or an antivirus program blocking the download. Run the file again.
echo If the message says "Cannot create symbolic link": right-click BUILD-WINDOWS.bat and choose "Run as administrator",
echo or turn on Windows Settings, For developers, Developer Mode, and run it again.
echo You do NOT need the installer to use ASTRA LAB: START-ASTRA-LAB.bat opens it directly.
pause
exit /b 1
