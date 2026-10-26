# Building the Windows installer (.exe)

ASTRA LAB is packaged with **Electron 22** (the last Electron line that runs on Windows 7 and 8; it also runs on Windows 10/11) and **electron-builder**. The installer is an NSIS setup that creates a desktop shortcut and a Start-menu entry. No browser is needed to run the installed app.

## Option A – on your Windows PC (about 5 minutes)

1. Install **Node.js 18 LTS** (64-bit) from https://nodejs.org (accept the defaults).
2. Unzip the ASTRA-LAB source folder, for example to `C:\ASTRA-LAB`.
3. Double-click **`installer-builder\BUILD-WINDOWS.bat`** (it asks for administrator permission, click Yes) (or open *Command Prompt* in that folder and run the three commands below):

```bat
npm install
npm test
npm run dist
```

4. The installer appears in `build\dist\` as **`ASTRA LAB Setup 2.2.0.exe`**. Run it. A shortcut called *ASTRA LAB* is placed on the desktop.

A portable version (no installation, single .exe) can be built with `npm run dist:portable`.

Notes
* The first `npm install` downloads Electron (about 80 MB) and the electron-builder tools; you need an internet connection for that step only. The finished app works offline.
* Windows may show *SmartScreen: unknown publisher* because the installer is not code-signed. Choose *More info → Run anyway*. Signing needs a paid certificate; if you have one, see the `win.certificateFile` options of electron-builder.
* Antivirus programs occasionally delay the first start of a new unsigned executable. This is normal.

## Option B – let GitHub build it (no tools on your PC)

1. Create a repository on GitHub and upload the source folder (all files, including the `.github` folder).
2. Open the **Actions** tab → *Build Windows installer* → *Run workflow*. (It also runs on every push.)
3. After a few minutes download the artifact **ASTRA-LAB-Windows** (it contains the setup .exe and the portable .exe). The workflow first runs all automated tests and a start-up smoke test of the packaged application.

## Option C – no installation at all (browser mode)

```bash
node scripts/serve.mjs      # then open http://127.0.0.1:8123/
```

This runs the same application in a normal browser. Projects are then stored in the browser (IndexedDB) and the API key is kept in memory only.

## Start the desktop app without building an installer

```bat
npm install
npm start
```

## Verifying the build

`npx electron . --smoke-test` starts the real desktop app hidden, builds a rocket through the AI engineer, runs a simulation, saves the project to disk, checks that WebGL is available and prints `SMOKE OK`. The GitHub workflow runs this on Windows.

## Changing the version, name or icon

* Version / name: `package.json` (`version`, `build.productName`).
* Icon: replace `assets/icon.ico` (multi-size, at least 256×256) and `assets/icon.png`.

## Troubleshooting: "Cannot create symbolic link"

electron-builder unpacks a helper archive that contains symbolic links, and Windows only allows that for administrators or when Developer Mode is on. This version of `BUILD-WINDOWS.bat` avoids the archive (`signAndEditExecutable: false`, no code signing). If you still see the message, right-click `installer-builder\BUILD-WINDOWS.bat` and choose **Run as administrator** (the script already asks for this itself), or enable *Settings, For developers, Developer Mode*, then run it again. Side effect of skipping the resource editing: the installed `ASTRA LAB.exe` shows the default Electron icon; the installer itself uses the ASTRA LAB icon. You do not need the installer at all: `START-ASTRA-LAB.bat` opens the app directly.
