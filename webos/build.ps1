# يبني «مكتب الخدمات الصحية المساندة» لشاشات إل جي (webOS)، ويثبّته إن طُلب.
#   powershell -File webos\build.ps1 [-Install] [-Device lgtv] [-AresBin <مجلد أدوات ares>]
#
# الغلاف index.html يفتح الصفحة الحية https://nadir-coderlab.github.io/sanad/tv.html داخل إطار،
# والنسخة الاحتياطية (إن لم يصل الموقع) من web/ مع ختم __V__ برقم الالتزام كما يفعل نشر GitHub Pages.
param(
  [switch]$Install,
  [string]$Device = 'lgtv',
  [string]$AresBin = ''
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = Split-Path $here
$utf8 = New-Object Text.UTF8Encoding $false
function Ares($name) {
  if ($AresBin) { return Join-Path $AresBin "$name.cmd" }
  $c = Get-Command $name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return "$env:USERPROFILE\tizen-studio-data\webos-tools\node_modules\.bin\$name.cmd"
}

$b = Join-Path $here 'build'
if (Test-Path $b) { Remove-Item -Recurse -Force $b }
New-Item -ItemType Directory "$b\web" | Out-Null
Copy-Item "$here\index.html" $b
Copy-Item "$here\keepawake.mp4" $b
Copy-Item "$repo\tizen\icon.png" "$b\icon.png"
Copy-Item "$repo\tizen\icon.png" "$b\largeIcon.png"
foreach ($x in 'tv.html', 'tv.css', 'tv.js', 'fonts', 'vendor', 'img') { Copy-Item "$repo\web\$x" "$b\web\" -Recurse }
$v = git -C $repo rev-parse --short=7 HEAD
$p = "$b\web\tv.html"; [IO.File]::WriteAllText($p, [IO.File]::ReadAllText($p, $utf8).Replace('__V__', $v), $utf8)

$info = [ordered]@{ id = 'com.nadircoderlab.sanad'; version = '1.0.0'; vendor = 'nadir-coderlab'; type = 'web'; main = 'index.html'
                    title = 'مكتب الخدمات الصحية المساندة'; icon = 'icon.png'; largeIcon = 'largeIcon.png'; bgColor = '#050d1a'
                    resolution = '1920x1080'; disallowScrollingInMainFrame = $true }
[IO.File]::WriteAllText("$b\appinfo.json", ($info | ConvertTo-Json), $utf8)

$outDir = Join-Path $here 'out'
New-Item -ItemType Directory -Force $outDir | Out-Null
& (Ares 'ares-package') $b -o $outDir --no-minify | Out-Null
$ipk = Get-ChildItem $outDir -Filter 'com.nadircoderlab.sanad_*.ipk' | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $ipk) { throw 'ما انبنى ملف ipk' }
Write-Host "• $($ipk.FullName) — النسخة الاحتياطية $v"
if ($Install) { & (Ares 'ares-install') -d $Device $ipk.FullName }
