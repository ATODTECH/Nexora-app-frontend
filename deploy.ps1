# Deploys the current `main` of Nexora-app-frontend to nexorabusinessai.com (Vercel, production).
# Builds on this computer and uploads the ready-made site, without git details
# (the Vercel Hobby plan blocks deploys whose commits aren't the account owner's).
# Run from the Nexora-app-frontend folder:   .\deploy.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location $root

Write-Host "1/5  Updating dev from main..." -ForegroundColor Cyan
git switch dev
if ($LASTEXITCODE -ne 0) { throw "Couldn't switch to dev. Commit or stash your changes first." }
git pull origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed. Fix the problem above, then run .\deploy.ps1 again." }

Write-Host "2/5  Building the web app (expo export)..." -ForegroundColor Cyan
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
npx expo export -p web
if ($LASTEXITCODE -ne 0 -or -not (Test-Path dist\index.html)) { throw "The build failed. Nothing was deployed." }

Write-Host "3/5  Preparing the Vercel output..." -ForegroundColor Cyan
if (Test-Path .vercel\output) { Remove-Item -Recurse -Force .vercel\output }
New-Item -ItemType Directory -Force .vercel\output\static | Out-Null
Copy-Item -Recurse -Force dist\* .vercel\output\static\
$config = @'
{"version":3,"routes":[
 {"src":"/(.*)","headers":{"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(self), microphone=(self), geolocation=()"},"continue":true},
 {"handle":"filesystem"},
 {"src":"/(.*)","dest":"/index.html"}
]}
'@
Set-Content -Encoding ascii .vercel\output\config.json $config
if (-not (Test-Path .vercel\project.json)) { throw "This folder isn't linked to Vercel yet. Run: npx vercel pull --yes --environment=production" }

Write-Host "4/5  Copying to a folder without git..." -ForegroundColor Cyan
$deploy = Join-Path (Split-Path $root -Parent) 'nexora-deploy'
if (Test-Path $deploy) { Remove-Item -Recurse -Force $deploy }
New-Item -ItemType Directory -Force (Join-Path $deploy '.vercel') | Out-Null
Copy-Item -Force .vercel\project.json (Join-Path $deploy '.vercel\project.json')
Copy-Item -Recurse -Force .vercel\output (Join-Path $deploy '.vercel\output')

Write-Host "5/5  Deploying to production..." -ForegroundColor Cyan
Set-Location $deploy
try {
  npx vercel deploy --prebuilt --prod --scope atod-techs-projects
  if ($LASTEXITCODE -ne 0) { throw "The Vercel deploy failed (see above)." }
} finally {
  Set-Location $root
}
Write-Host "Done. Open https://nexorabusinessai.com and press Ctrl+F5." -ForegroundColor Green
