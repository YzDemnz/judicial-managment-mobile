$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsRoot = Join-Path $projectRoot 'assets'
$logoPath = Join-Path $assetsRoot 'company-logo.svg'
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'

if (-not (Test-Path -LiteralPath $edgePath)) {
  throw 'Microsoft Edge is required to render the mobile brand assets.'
}

if (-not (Test-Path -LiteralPath $logoPath)) {
  throw "Logo source not found: $logoPath"
}

$logoUri = ([System.Uri]$logoPath).AbsoluteUri
$tempRoot = Join-Path $env:TEMP "judicial-mobile-brand-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot | Out-Null

function Render-Asset {
  param(
    [Parameter(Mandatory = $true)][string]$OutputName,
    [Parameter(Mandatory = $true)][int]$Size,
    [Parameter(Mandatory = $true)][string]$Background,
    [Parameter(Mandatory = $true)][int]$LogoPercent,
    [switch]$Monochrome
  )

  $filter = if ($Monochrome) { 'filter: grayscale(1) brightness(0) invert(1);' } else { '' }
  $htmlPath = Join-Path $tempRoot "$OutputName.html"
  $outputPath = Join-Path $assetsRoot $OutputName
  $html = @"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: ${Size}px;
      height: ${Size}px;
      margin: 0;
      overflow: hidden;
      background: $Background;
    }
    body {
      display: grid;
      place-items: center;
    }
    img {
      width: $LogoPercent%;
      height: $LogoPercent%;
      object-fit: contain;
      $filter
    }
  </style>
</head>
<body><img src="$logoUri" alt=""></body>
</html>
"@

  Set-Content -LiteralPath $htmlPath -Value $html -Encoding utf8
  $htmlUri = ([System.Uri]$htmlPath).AbsoluteUri
  & $edgePath `
    --headless `
    --disable-gpu `
    --hide-scrollbars `
    --run-all-compositor-stages-before-draw `
    --virtual-time-budget=1500 `
    --default-background-color=00000000 `
    "--window-size=$Size,$Size" `
    "--screenshot=$outputPath" `
    $htmlUri | Out-Null

  if (-not (Test-Path -LiteralPath $outputPath)) {
    throw "Asset was not rendered: $outputName"
  }
}

try {
  Render-Asset -OutputName 'icon.png' -Size 1024 -Background '#0c1424' -LogoPercent 78
  Render-Asset -OutputName 'brand-icon.png' -Size 512 -Background 'transparent' -LogoPercent 92
  Render-Asset -OutputName 'splash-icon.png' -Size 512 -Background 'transparent' -LogoPercent 68
  Render-Asset -OutputName 'android-icon-foreground.png' -Size 1024 -Background 'transparent' -LogoPercent 58
  Render-Asset -OutputName 'android-icon-background.png' -Size 1024 -Background '#0c1424' -LogoPercent 0
  Render-Asset -OutputName 'android-icon-monochrome.png' -Size 1024 -Background 'transparent' -LogoPercent 58 -Monochrome
  Render-Asset -OutputName 'notification-icon.png' -Size 512 -Background 'transparent' -LogoPercent 72 -Monochrome
  Render-Asset -OutputName 'favicon.png' -Size 192 -Background '#0c1424' -LogoPercent 82
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Mobile brand assets rendered successfully.'
