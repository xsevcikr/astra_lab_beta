# ASTRA LAB 2.6.2

## Fixes
- **The app no longer crashes at start on Windows 11 24H2 and newer.** Electron 22 (Chromium 108) crashed its GPU and display processes
  at start there; found by the first real install test on GitHub's Windows Server 2025 runner. The app now uses Electron 44.9.2
  (electron-builder 26.17.0, electron-updater 6.8.10). Windows 7 and 8 are no longer supported.
- app:// files are served with `protocol.handle` (the old `registerFileProtocol` API is gone in current Electron).

## CI
- Browser UI suites: Playwright 1.63.0 (1.48.2 polled with `eval`, which the app's CSP blocks).
- Windows build: the smoke test no longer passes when the app crashes and restarts itself; the installer is uploaded first, then
  installed silently, the installed app is smoke-tested and uninstalled.
- New job: the real Electron app starts on Windows Server 2022 and 2025 on every push.
