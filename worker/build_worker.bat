@echo off
REM Compiles worker.py into a standalone binary using PyInstaller.
REM Run this before `npm run tauri:build`.

cd /d "%~dp0"

echo Installing Python dependencies...
pip install -r requirements.txt --quiet

echo Building worker binary...
pyinstaller worker.py ^
  --onefile ^
  --name worker ^
  --distpath ..\src-tauri\binaries ^
  --workpath %TEMP%\pyinstaller-work ^
  --specpath %TEMP%\pyinstaller-spec ^
  --clean ^
  --noconfirm

echo.
echo Worker binary built: ..\src-tauri\binaries\worker.exe
echo.
echo Now run: npm run tauri:build
