# Script d'installation automatique StockDash pour Boutique Locale
# Exécutez ce script en tant qu'Administrateur

Write-Host "🚀 Démarrage de l'installation du serveur local StockDash..." -ForegroundColor Cyan

# 1. Vérification / Installation de Node.js et MongoDB via Winget
function Install-Requirement {
    param([string]$name, [string]$id)
    if (Get-Command $name -ErrorAction SilentlyContinue) {
        Write-Host "✅ $name est déjà installé." -ForegroundColor Green
    } else {
        Write-Host "📥 Installation de $name..." -ForegroundColor Yellow
        winget install --id $id --silent --accept-package-agreements --accept-source-agreements
    }
}

Install-Requirement "node" "OpenJS.NodeJS.LTS"
Install-Requirement "mongod" "MongoDB.Server"

# 2. Installation de PM2 pour le maintien du serveur en arrière-plan
Write-Host "📦 Installation du gestionnaire de processus PM2..." -ForegroundColor Yellow
npm install pm2 -g

# 3. Installation des dépendances Backend
Write-Host "🔌 Installation des dépendances du Backend..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\backend"
npm install

# 4. Installation des dépendances Frontend
Write-Host "💻 Installation des dépendances du Frontend..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\stock-gestion-frontend"
npm install

# 5. Configuration des fichiers .env (Templates)
Write-Host "⚙️ Configuration des variables d'environnement..." -ForegroundColor Yellow

$ip = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi", "Ethernet" | Select-Object -First 1).IPAddress
if (!$ip) { $ip = "localhost" }

# Backend .env
$backendEnv = @"
PORT=3001
NODE_ENV=development
MONGO_URI_LOCAL=mongodb://127.0.0.1:27017/app-gestion-stock-local
MONGO_URI_REMOTE=mongodb://admin:M@madOU22@57.128.133.94:27017/app-gestion-stock?authSource=admin
JWT_SECRET=$( [Guid]::NewGuid().ToString() )
SYNC_TOKEN=M@madOU22@
BOUTIQUE_ID=A_REMPLIR_VIA_DASHBOARD_ADMIN
"@

if (!(Test-Path "$PSScriptRoot\..\backend\.env")) {
    $backendEnv | Out-File -FilePath "$PSScriptRoot\..\backend\.env" -Encoding utf8
    Write-Host "✅ Fichier backend/.env créé." -ForegroundColor Green
}

# Frontend .env
$frontendEnv = @"
REACT_APP_API_URL=http://$($ip):3001/api
REACT_APP_SOCKET_URL=http://$($ip):3001
HOST=0.0.0.0
"@
if (!(Test-Path "$PSScriptRoot\..\stock-gestion-frontend\.env.development")) {
    $frontendEnv | Out-File -FilePath "$PSScriptRoot\..\stock-gestion-frontend\.env.development" -Encoding utf8
    Write-Host "✅ Fichier frontend/.env.development créé avec l'IP : $ip" -ForegroundColor Green
}

# 6. Lancement des services via PM2
Write-Host "🏃 Lancement des serveurs..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\backend"
pm2 start server.js --name "stock-backend"

Set-Location "$PSScriptRoot\..\stock-gestion-frontend"
pm2 start node_modules\react-scripts\scripts\start.js --name "stock-frontend"

pm2 save
pm2 startup

Write-Host "--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "✅ INSTALLATION TERMINÉE AVEC SUCCÈS !" -ForegroundColor Green
Write-Host "📍 Adresse locale du PC : http://$ip:3000" -ForegroundColor Yellow
Write-Host "⚠️  N'oubliez pas de configurer le BOUTIQUE_ID dans le fichier backend/.env" -ForegroundColor Red
Write-Host "--------------------------------------------------------" -ForegroundColor Cyan