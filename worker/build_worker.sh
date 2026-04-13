#!/bin/bash
# Compiles worker.py into a standalone binary using PyInstaller.
# Run this before `npm run tauri:build`.
# Output goes to ../src-tauri/binaries/worker (or worker.exe on Windows).

set -e
cd "$(dirname "$0")"

echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

echo "Building worker binary..."
pyinstaller worker.py \
  --onefile \
  --name worker \
  --distpath ../src-tauri/binaries \
  --workpath /tmp/pyinstaller-work \
  --specpath /tmp/pyinstaller-spec \
  --clean \
  --noconfirm

echo "✓ Worker binary built: ../src-tauri/binaries/worker"
echo ""
echo "Now run: npm run tauri:build"
