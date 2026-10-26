@echo off
setlocal
rem Creates an "ASTRA LAB" icon on your desktop that starts the app with one double-click.
set "ROOT=%~dp0"
if not exist "%ROOT%START-ASTRA-LAB.bat" (
  echo START-ASTRA-LAB.bat was not found next to this file. Extract the ZIP first.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\ASTRA LAB.lnk'); $s.TargetPath='%ROOT%START-ASTRA-LAB.bat'; $s.WorkingDirectory='%ROOT%'; $s.IconLocation='%ROOT%assets\icon.ico'; $s.WindowStyle=7; $s.Description='ASTRA LAB aerospace laboratory'; $s.Save()"
if errorlevel 1 (
  echo Could not create the shortcut. You can still start ASTRA LAB with START-ASTRA-LAB.bat.
  pause
  exit /b 1
)
echo.
echo Done. An "ASTRA LAB" icon is now on your desktop.
pause
