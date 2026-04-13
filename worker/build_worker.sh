#!/bin/bash
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

# Rename to match Tauri's expected sidecar filename
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  TARGET="aarch64-apple-darwin"
else
  TARGET="x86_64-apple-darwin"
fi
mv ../src-tauri/binaries/worker ../src-tauri/binaries/worker-${TARGET}
echo "✓ Worker binary: ../src-tauri/binaries/worker-${TARGET}"
