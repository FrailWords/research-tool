@echo off
cd /d "%~dp0"

echo Installing Python dependencies...
pip install -r requirements.txt --quiet

echo Building worker binary...
pyinstaller worker.py ^
  --onefile ^
  --name worker ^
  --distpath ..\src-tauri\binaries ^
  --workpath %CD%\pyinstaller-work ^
  --specpath %CD%\pyinstaller-spec ^
  --clean ^
  --noconfirm

rename ..\src-tauri\binaries\worker.exe worker-x86_64-pc-windows-msvc.exe
echo.
echo Worker binary built: ..\src-tauri\binaries\worker-x86_64-pc-windows-msvc.exe
