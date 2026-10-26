# Updates (new in 2.3)

ASTRA LAB can update itself, but only when you tell it where to look. By default it never contacts any server.

## What you do
1. Put the files that the Windows build makes (`ASTRA LAB Setup <version>.exe`, its `.blockmap` and `latest.yml`, all in `build/dist`) on a web page that you control, for example `https://example.org/astra-lab/`. A GitHub release of this project also works: type `github:owner/repo`.
2. In ASTRA LAB open **Settings > Updates**, type the address and press **Check now**. Tick the box if you want a check 20 seconds after every start.
3. When a newer version exists the panel says so. **Download the update** fetches it; **Restart and install** closes the app, installs it and starts the new version. Your projects are in `Documents\ASTRA-LAB` and are not touched.

## Safety
* The address must start with `https://` (or `github:`). Anything else is refused.
* Nothing is downloaded or installed without a click.
* The installer is **not code-signed**. Windows may warn about it, and the update is only as trustworthy as the address it comes from. Only use an address that you control.
* Updates work in the installed app only. They do not work with `npm start` (running from source) or the portable build; the panel says so.
* The update code is in `src/main/updater.cjs`. It uses `electron-updater` 5.3.0.

## What was tested, and what was not
* Tested (Linux, no Windows): the wrapper's IPC handling (`tests/updater.test.js`), and the real `electron-updater` against a local mock server (`node scripts/updater-live-check.cjs`, needs `npm install`): it reads `latest.yml`, sees the newer version, downloads the installer and checks its sha512; a modified installer is refused (`--tamper`).
* Found by that test: the 2.3 build had no `publish` setting, so the Windows build would not have written `latest.yml` or `app-update.yml`. `package.json` now has `build.publish` (a placeholder address that is replaced by the one you type) and the build commands use `--publish never`.
* NOT tested: the Windows installer itself (the NSIS step needs Windows or wine; the unpacked Windows app does build), the restart-and-install step, Windows code signing, Electron's own network stack, and a real server on the internet.
