<#
  GlycIA - premier push vers GitHub
  Usage : .\push.ps1 "message de commit"
#>
param([string]$Message = "GlycIA : application complete")

$ErrorActionPreference = "Stop"
$repo = "https://github.com/ArgonTwice/GlycIA.git"

if (-not (Test-Path ".git")) {
    git init
    git branch -M main
    git remote add origin $repo
} elseif (-not (git remote | Select-String "origin")) {
    git remote add origin $repo
}

# Hook local : regénère standalone.html si ses sources changent
git config core.hooksPath .githooks

git add -A
git commit -m $Message
git push -u origin main

Write-Host ""
Write-Host "Pousse. Active maintenant GitHub Pages :" -ForegroundColor Green
Write-Host "  Settings > Pages > Source : GitHub Actions"
Write-Host "  Puis : https://argontwice.github.io/GlycIA/"
Write-Host ""
Write-Host "Pour publier une release :" -ForegroundColor Cyan
Write-Host "  git tag -a v1.0.0 -m 'Premiere version'"
Write-Host "  git push origin v1.0.0"
