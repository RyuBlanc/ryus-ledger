param([string]$SourceRoot)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $SourceRoot) {
 Add-Type -AssemblyName System.Windows.Forms
 $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
 $dialog.Description = 'Select the extracted Windows source folder containing ui/index.html and ui/app.js'
 $dialog.SelectedPath = Join-Path $env:USERPROFILE 'Downloads'
 if ($dialog.ShowDialog() -ne 'OK') { throw 'No source folder selected. Nothing was changed.' }
 $SourceRoot = $dialog.SelectedPath
}
$ui = Join-Path $SourceRoot 'ui'
if ((Test-Path (Join-Path $SourceRoot 'index.html')) -and (Test-Path (Join-Path $SourceRoot 'app.js'))) { $ui = $SourceRoot }
if (-not (Test-Path (Join-Path $ui 'index.html'))) { throw 'Select the extracted source folder, not the ZIP or node_modules folder.' }
if (-not (Test-Path (Join-Path $ui 'app.js'))) { throw 'ui/app.js was not found.' }
$html = [IO.File]::ReadAllText((Join-Path $ui 'index.html'))
$js = [IO.File]::ReadAllText((Join-Path $ui 'app.js'))
if (-not $js.Contains('window.desktop') -or -not $js.Contains('function validate(')) { throw 'This is not the supplied encrypted-account desktop edition.' }
# Never modify the original desktop source or copy account/backup files.
$dest = Join-Path $root 'app/src/main/assets/ui'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$html = $html.Replace('<body>', '<body class="compact">')
if (-not $html.Contains('class="compact"')) { throw 'Unexpected body markup. Mobile default could not be applied safely.' }
$html = $html.Replace('<script src="app.js" defer></script>', '<script src="android-bridge.js" defer></script><script src="app.js" defer></script>')
if (-not $html.Contains('android-bridge.js')) { throw 'Unexpected script markup. Bridge was not inserted.' }
foreach ($pair in @(
 @('Desktop preview 5.0', 'Android preview 5.1'),
 @('Desktop preview', 'Android preview'),
 @('desktop account data', 'Android account data'),
 @('Offline desktop account', 'Offline Android account'),
 @('Offline desktop application', 'Offline Android application'),
 @('Encrypted desktop storage', 'Encrypted Android storage'),
 @('this PC', 'this Android device'),
 @('off this PC', 'off this Android device'),
 @('Windows lock/sleep', 'app backgrounding'),
 @('installed desktop application', 'installed Android application')
)) { $html=$html.Replace($pair[0],$pair[1]);$js=$js.Replace($pair[0],$pair[1]) }
# Preserve the original validator, accounting logic, theme and layout switch.
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $dest 'index.html'), $html, $utf8)
[IO.File]::WriteAllText((Join-Path $dest 'app.js'), $js, $utf8)
Write-Host 'Prepared: existing UI copied; mobile mode is the startup default.'
Write-Host 'Original Windows source and financial records were not modified.'
Write-Host 'Next: open this Android project in Android Studio. See README.md.'
