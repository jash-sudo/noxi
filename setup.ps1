$ErrorActionPreference = 'Stop'

Write-Host "NOXI setup"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20+ is required. Install Node.js, then run this script again."
}

$major = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($major -lt 20) { throw "NOXI requires Node.js 20 or newer." }

Write-Host "Installing packages..."
npm install

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created private .env"
} else {
  Write-Host ".env already exists; keeping it."
}

function New-NoxiSecret {
  return (node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")
}

$content = Get-Content ".env" -Raw
if ($content -match 'SESSION_SECRET=replace-with-long-random-secret') {
  $content = $content.Replace('SESSION_SECRET=replace-with-long-random-secret', "SESSION_SECRET=$(New-NoxiSecret)")
}
if ($content -match 'OWNER_SETUP_TOKEN=replace-with-different-long-random-secret') {
  $content = $content.Replace('OWNER_SETUP_TOKEN=replace-with-different-long-random-secret', "OWNER_SETUP_TOKEN=$(New-NoxiSecret)")
}
if ($content -match 'NOXI_INTERNAL_API_SECRET=replace-with-another-long-random-secret') {
  $content = $content.Replace('NOXI_INTERNAL_API_SECRET=replace-with-another-long-random-secret', "NOXI_INTERNAL_API_SECRET=$(New-NoxiSecret)")
}
Set-Content ".env" $content -NoNewline

Write-Host "Generated private NOXI secrets inside .env. They were not printed."
Write-Host ""
Write-Host "NEXT: open .env and paste your private Supabase Postgres connection URL after DATABASE_URL="
Write-Host "Then run:"
Write-Host "  npm run db:init"
Write-Host "  npm run check"
Write-Host "  npm start"
Write-Host ""
Write-Host "Before any git push, run: git status"
Write-Host ".env must never appear in the commit list."
