$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path 'app/src/main/assets/ui/app.js')) { & "$PSScriptRoot/prepare.ps1" }
if (-not $env:JAVA_HOME) {
 $jbr = Join-Path $env:ProgramFiles 'Android/Android Studio/jbr'
 if (Test-Path "$jbr/bin/java.exe") { $env:JAVA_HOME = $jbr }
}
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME/bin/java.exe")) { throw 'Install Android Studio or JDK 17, then set JAVA_HOME. See README.md.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not (Test-Path "$env:ANDROID_HOME/platforms/android-35/android.jar")) { throw 'In Android Studio > SDK Manager, install Android SDK Platform 35 and Build-Tools 35.0.0, accept the licenses, then rerun this helper.' }
$tools = Join-Path $PSScriptRoot '.tools'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$gradle = Join-Path $tools 'gradle-8.11.1/bin/gradle.bat'
if (-not (Test-Path $gradle)) {
 $zip = Join-Path $tools 'gradle-8.11.1-bin.zip'
 Write-Host 'Downloading Gradle 8.11.1 from its official distribution service...'
 Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip' -OutFile $zip
 $expected = 'f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6'
 if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { Remove-Item $zip; throw 'Gradle checksum mismatch. Download was not executed.' }
 Expand-Archive -Path $zip -DestinationPath $tools -Force
}
& $gradle --no-daemon --console=plain assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'Android compilation failed. Keep the full error message.' }
$apk = Join-Path $PSScriptRoot 'app/build/outputs/apk/debug/app-debug.apk'
if (-not (Test-Path $apk)) { throw 'Build returned without the expected APK.' }
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
Copy-Item $apk 'dist/Ryus-Ledger-Mobile-Preview.apk' -Force
Write-Host 'APK generated: dist/Ryus-Ledger-Mobile-Preview.apk'
Write-Host 'Debug-signed preview only. Test disposable records before real use.'
