$ErrorActionPreference = 'Stop'
$NewsroomRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $NewsroomRoot
$env:DATABASE_URL = 'postgres://newsroom:newsroom@127.0.0.1:55432/newsroom'
$env:STORE_BACKEND = 'postgres'
$env:TZ = 'Australia/Brisbane'
$env:RENDER_OUT_DIR = Join-Path $NewsroomRoot '.data/renders'
$env:AGENT_PROFILE_ROOT = Join-Path $NewsroomRoot '.data/profiles'
& node --env-file-if-exists=.env --experimental-strip-types apps/agent/src/index.ts
exit $LASTEXITCODE
