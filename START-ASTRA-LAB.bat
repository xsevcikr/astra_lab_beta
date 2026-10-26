@echo off
setlocal
title ASTRA LAB
rem ------------------------------------------------------------------
rem  ASTRA LAB - one-click launcher.
rem  Double-click this file. ASTRA LAB opens in its own window.
rem  Needs Microsoft Edge or Google Chrome (Edge is already in Windows 10/11).
rem  No installation, no internet and no Node.js needed.
rem ------------------------------------------------------------------
set "ROOT=%~dp0"
set "UI=%ROOT%ui\index.html"
if not exist "%UI%" goto notfound

set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER goto nobrowser

set "URL=file:///%UI:\=/%"
set "URL=%URL: =%20%"
set "PROFILE=%LocalAppData%\ASTRA-LAB\browser-profile"

start "" "%BROWSER%" --app="%URL%" --allow-file-access-from-files --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --window-size=1400,860
exit /b 0

:notfound
echo.
echo ASTRA LAB could not find its files next to this launcher.
echo.
echo If you opened this file from inside the ZIP, first right-click the ZIP,
echo choose "Extract All...", and then run START-ASTRA-LAB.bat from the extracted folder.
echo.
pause
exit /b 1

:nobrowser
echo.
echo Microsoft Edge or Google Chrome was not found on this computer.
echo Please install Google Chrome from https://www.google.com/chrome and run this file again.
echo.
pause
exit /b 1
