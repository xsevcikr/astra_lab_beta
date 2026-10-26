# Put ASTRA LAB on GitHub and get automatic updates

Do this once on your laptop. About 10 minutes.

## 1. Make the repository
1. Go to https://github.com/new
2. Repository name: `astra-lab`. Choose **Public** (the updater downloads without a login, so it must be public). Leave "Add a README" unticked. Click **Create repository**.

## 2. Upload the project
Easiest way, no git needed:
1. Unzip `ASTRA-LAB-2.6.zip` to a folder.
2. On the new repository page click **uploading an existing file**.
3. Drag in everything from inside the unzipped folder (including the hidden `.github` folder). Click **Commit changes**.

(If you use git: `git init`, `git add .`, `git commit -m "ASTRA LAB 2.6"`, `git branch -M main`, `git remote add origin https://github.com/YOU/astra-lab.git`, `git push -u origin main`.)

## 3. Check the tests run
Open the **Actions** tab. "Build Windows installer" and the tests start on their own. Green tick = fine.

## 4. Make your first release
1. **Releases** (right side of the repo page) → **Draft a new release**.
2. **Choose a tag**: type `v2.6.0` and press "Create new tag".
3. Click **Publish release**. This starts the "Release (auto-update)" action (about 10 minutes). When it finishes, the release page shows `ASTRA LAB Setup 2.6.0.exe` and `latest.yml`.
4. Download the setup `.exe`, install it on Windows. Windows SmartScreen may say "unknown publisher": click **More info → Run anyway** (the app is not code-signed).

## 5. How updates then work
- To ship a new version: change `"version"` in `package.json` (for example to `2.6.1`), commit, then publish a new release with tag `v2.6.1`.
- In the installed app go to **Settings → Updates**, switch updates on and press **Check now**. It downloads the new version and installs it when you close the app.
- Nothing is sent anywhere except the check for `latest.yml` on your repository.

## Notes
- The workflow fills in your repository address by itself; you do not edit `package.json`.
- Private repositories do not work with this simple updater.
- Tell me when it is up and which step fails, if any: paste the red error from the Actions tab.
