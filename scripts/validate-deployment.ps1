# === ZAHARA.AI AGENT CLINIC - DEPLOYMENT VALIDATION SCRIPT ===

Write-Host "🔍 Starting deployment validation..." -ForegroundColor Green

# Function to print status
function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Check if required files exist
Write-Host "`n📁 Checking required files..." -ForegroundColor Cyan

$requiredFiles = @(
    "README.md",
    "frontend/package.json",
    "frontend/netlify.toml",
    "infra/docker-compose.yml",
    "infra/Makefile",
    "services/api/requirements.txt",
    "services/api/app/main.py",
    "services/router/requirements.txt",
    "services/router/app/main.py",
    ".env.example",
    ".gitignore",
    "docs/README.md",
    "docs/HANDOFF.md",
    "docs/NETLIFY_DEPLOYMENT_GUIDE.md"
)

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Success "Found: $file"
    } else {
        Write-Error "Missing: $file"
        exit 1
    }
}

# Check Docker Compose configuration
Write-Host "`n🐳 Validating Docker Compose configuration..." -ForegroundColor Cyan
try {
    docker compose -f infra/docker-compose.yml config | Out-Null
    Write-Success "Docker Compose configuration is valid"
} catch {
    Write-Error "Docker Compose configuration has errors"
    exit 1
}

# Check if services can build
Write-Host "`n🏗️  Checking service build configurations..." -ForegroundColor Cyan
$services = @("api", "router", "frontend")

foreach ($service in $services) {
    Write-Host "Building $service..."
    try {
        docker compose -f infra/docker-compose.yml build $service | Out-Null
        Write-Success "$service builds successfully"
    } catch {
        Write-Error "$service failed to build"
        exit 1
    }
}

# Check Node.js dependencies
Write-Host "`n📦 Checking Node.js dependencies..." -ForegroundColor Cyan
Push-Location frontend
try {
    npm ci | Out-Null
    Write-Success "Frontend dependencies installed successfully"
} catch {
    Write-Error "Frontend dependency installation failed"
    Pop-Location
    exit 1
}

# Check if frontend builds
try {
    npm run build | Out-Null
    Write-Success "Frontend builds successfully"
} catch {
    Write-Error "Frontend build failed"
    Pop-Location
    exit 1
}
Pop-Location

# Check GitHub Actions workflow
Write-Host "`n🚀 Checking GitHub Actions configuration..." -ForegroundColor Cyan
if (Test-Path ".github/workflows/unified-ci.yml") {
    Write-Success "GitHub Actions workflow exists"
} else {
    Write-Error "GitHub Actions workflow missing"
    exit 1
}

# Check Netlify configuration
Write-Host "`n🌐 Checking Netlify configuration..." -ForegroundColor Cyan
if (Test-Path "frontend/netlify.toml") {
    Write-Success "Netlify configuration exists"
} else {
    Write-Error "Netlify configuration missing"
    exit 1
}

# Check environment variables
Write-Host "`n🔧 Checking environment configuration..." -ForegroundColor Cyan
if (Test-Path ".env.example") {
    Write-Success "Environment template exists"
} else {
    Write-Error "Environment template missing"
    exit 1
}

# Check documentation
Write-Host "`n📚 Checking documentation..." -ForegroundColor Cyan
$docFiles = @(
    "docs/README.md",
    "docs/HANDOFF.md",
    "docs/DEPLOYMENT_CHECKLIST.md",
    "docs/NETLIFY_DEPLOYMENT_GUIDE.md",
    "docs/PROJECT_STATUS.md",
    "docs/QUICK_START.md",
    "docs/TESTING_GUIDE.md",
    "docs/TESTING_SUMMARY.md",
    "docs/REAL_USAGE_TESTING.md"
)

foreach ($doc in $docFiles) {
    if (Test-Path $doc) {
        Write-Success "Documentation: $doc"
    } else {
        Write-Warning "Documentation missing: $doc"
    }
}

# Final validation
Write-Host "`n🎉 DEPLOYMENT VALIDATION COMPLETE!" -ForegroundColor Green
Write-Host ""
Write-Host "✅ All required files present" -ForegroundColor Green
Write-Host "✅ Docker Compose configuration valid" -ForegroundColor Green
Write-Host "✅ All services build successfully" -ForegroundColor Green
Write-Host "✅ Dependencies install correctly" -ForegroundColor Green
Write-Host "✅ Frontend builds successfully" -ForegroundColor Green
Write-Host "✅ GitHub Actions workflow configured" -ForegroundColor Green
Write-Host "✅ Netlify deployment ready" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Ready for production deployment!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Set up GitHub repository secrets (NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID, etc.)" -ForegroundColor White
Write-Host "2. Configure Netlify site with custom domain (optional)" -ForegroundColor White
Write-Host "3. Push code to trigger CI/CD pipeline" -ForegroundColor White
Write-Host "4. Monitor deployment in Netlify dashboard" -ForegroundColor White
