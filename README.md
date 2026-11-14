# Ryu’s Ledger Android adaptation kit, 5.1 preview

**This ZIP is source code, not an APK. It has not been Android-compiled or device-tested.**

This kit ports the supplied `vault.cjs` to a native Android backend and connects it to the existing desktop UI. To avoid changing your approved interface, the preparation helper copies `ui/index.html` and `ui/app.js` directly from your extracted Windows source folder on your PC. Those two UI files are not bundled in this kit. No account files, financial records or passwords are copied into the build.

## Windows steps
1. Install Android Studio from https://developer.android.com/studio and finish its setup wizard.
2. In SDK Manager, install **Android SDK Platform 35** and **Android SDK Build-Tools 35.0.0** and accept their licenses. The project uses Java 17-compatible code, Android Gradle Plugin 8.9.2 and Gradle 8.11.1. Android Studio’s bundled JBR is used by the helper when JAVA_HOME is not set.
3. Extract this kit. Double-click **PREPARE_ANDROID.cmd**. Select your existing extracted **Ryus_Ledger_Windows11_x64_Source_Preview** folder, the one containing the `ui` folder. No uploads or manual code edits are required.
4. Double-click **BUILD_APK.cmd**. Internet is needed to download Gradle and build dependencies. The Gradle download is checked against its published SHA-256 before extraction. This helper has not been run on Windows here.
5. Only after a successful build, find **dist/Ryus-Ledger-Mobile-Preview.apk**. It is a debug-signed personal testing build, not a Play Store release. Transfer it to your Android device and follow the normal installation prompts. Do not disable device security protections.

## Changes implemented in source
- Mobile/compact mode is applied in HTML and again before app.js runs. PC/mobile toggle remains available, but every app reload starts in mobile mode.
- Existing design, icons, accounting validator, charts, goals, budgets and XLSX writer are imported unchanged except platform wording.
- `window.desktop` becomes an asynchronous Android bridge. Password operations use a worker thread.
- Native scrypt parameters N=32768, r=8, p=1, 32-byte derived key; AES-256-GCM; same wrapper salt, IV, tag, ciphertext and AAD structure as the supplied desktop vault.
- Encrypted account files live in app-private storage with atomic writes and revision checks. Automatic OS backup is disabled. Uninstalling or clearing app data removes the local accounts. Keep independent exports.
- JSON/XLSX/recovery-key/encrypted-account exports use Android’s system Save picker. Encrypted account import and JSON restore use the system Open picker. Cancelling a picker returns without reporting a saved file.
- External WebView navigation and resource requests are blocked. No INTERNET permission is requested. Bundled assets are served with WebViewAssetLoader.
- Screenshots and recent-app previews are restricted using FLAG_SECURE. Lock/reload is requested on backgrounding and after 15 minutes idle. File-picker flows are exempt from background locking so exports/restores can finish. Device-lock and picker lifecycle behaviour still require testing.

## Important preview limitations
- Android SDK and dependency downloads were blocked in the authoring environment. **No APK, native type-check, emulator test, Windows helper execution or phone test was completed.** Java syntax parsing and the standalone JavaScript bridge checks are recorded in QA_STATUS.md.
- Desktop encrypted backup interoperability is a design goal, not a tested guarantee. First test a disposable desktop account and a copy of its encrypted backup. Do not overwrite your only backup.
- The native backend enforces ledger size and collection limits. Full ledger/accounting validation remains in your bundled app.js, including before saves and after login. This is not an independent native reimplementation of the entire validator.
- Authentication throttling is in memory, as in the supplied vault. It resets after process restart. Native strings and WebView memory cannot be guaranteed to be securely erased. This preview has not received a security audit.
- JSON, XLSX and recovery-key text exports are unencrypted. Choose local device storage if you do not want a document provider to upload exports to a cloud service.
- Large imports/exports and large ledgers need memory/performance tests on the intended phone. Keep the original desktop source and backups intact.
- Minimum Android version configured: Android 8.0 (API 26). A current Android System WebView is needed for the modern JavaScript features used by the supplied app.
- The launcher currently uses a standard Android placeholder icon. The icons inside your interface remain unchanged.

## Required acceptance tests before real data
Create a disposable account; save its recovery key; sign out and sign in; add funding, saving, spending, a goal and a budget; verify cash/reserve totals; close/reopen; export and restore JSON; open XLSX; export/import encrypted account on another test install; change password; reset with recovery; rotate recovery key; test wrong-password throttling, picker cancellation, background locking, orientation and offline launch. Keep a separate backup before any update or uninstall.

## Build references
- https://developer.android.com/build/releases/agp-8-9-0-release-notes
- https://developer.android.com/develop/ui/views/layout/webapps/load-local-content
- https://developer.android.com/training/data-storage/shared/documents-files
- https://developer.android.com/build/build-for-release
- https://gradle.org/release-checksums/#8.11.1
- https://www.bouncycastle.org/download/bouncy-castle-java/
