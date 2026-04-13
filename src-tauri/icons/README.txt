Place your app icons here. Tauri requires:

  32x32.png
  128x128.png
  128x128@2x.png
  icon.icns   (Mac)
  icon.ico    (Windows)

Quick way to generate all from a single 1024x1024 PNG:

  npm install -g @tauri-apps/cli
  tauri icon path/to/your-icon-1024.png

This will auto-generate all required sizes into this folder.
