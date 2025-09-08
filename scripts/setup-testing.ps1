# Zahara.ai Agent Clinic - Quick Testing Setup Script (PowerShell)
# This script sets up the complete testing environment on Windows

param(
    [switch]$SkipLLMKeys = $false
)

Write-Host "🚀 Zahara.ai Agent Clinic - Quick Testing Setup" -ForegroundColor Cyan
Write-Host "==============================================`n" -ForegroundColor Cyan

function Write-Info {
    param($Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Step 1: Create environment files
Write-Info "Creating environment configuration files..."

# Backend .env file
$backendEnv = @"
# === DEVELOPMENT ENVIRONMENT ===
NODE_ENV=development
DEV_MODE=true
DEBUG=false

# === API CONFIGURATION ===
API_BASE_URL=http://localhost:8000
API_VERSION=v1

# === AUTHENTICATION ===
DEMO_API_KEY=zhr_demo_clinic_2024_observability_key
JWT_SECRET=dev-jwt-secret-key-for-testing-only
API_KEY_BYPASS_IN_DEV=true

# === DATABASE CONFIGURATION ===
DATABASE_URL=postgresql://zahara_user:zahara_password@localhost:5432/zahara_clinic
POSTGRES_DB=zahara_clinic
POSTGRES_USER=zahara_user
POSTGRES_PASSWORD=zahara_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# === REDIS CONFIGURATION ===
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# === QDRANT CONFIGURATION ===
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# === LLM PROVIDER CONFIGURATION (Optional) ===
# Uncomment and add your keys if you want to test real LLM calls
# OPENAI_API_KEY=sk-your-openai-key-here
# ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
# GROQ_API_KEY=gsk_your-groq-key-here

# === FLOWISE INTEGRATION (Optional) ===
FLOWISE_API_URL=http://localhost:3001
FLOWISE_API_KEY=
FLOWISE_USERNAME=admin
FLOWISE_PASSWORD=admin123

# === OBSERVABILITY SETTINGS ===
ENABLE_TRACE_COLLECTION=true
TRACE_SAMPLING_RATE=1.0
LOG_LEVEL=debug

# === FRONTEND CONFIGURATION ===
VITE_API_BASE_URL=http://localhost:8000
VITE_DEMO_API_KEY=zhr_demo_clinic_2024_observability_key
VITE_DEV_MODE=true
VITE_POLLING_INTERVAL=5000
"@

# Frontend .env file
$frontendEnv = @"
# Frontend Environment Variables
VITE_API_BASE_URL=http://localhost:8000
VITE_DEMO_API_KEY=zhr_demo_clinic_2024_observability_key
VITE_DEV_MODE=true
VITE_POLLING_INTERVAL=5000
"@

# Write environment files
$backendEnv | Out-File -FilePath ".env" -Encoding UTF8
$frontendEnv | Out-File -FilePath "frontend\.env" -Encoding UTF8

Write-Success "Environment files created successfully"

# Step 2: Check Docker
Write-Info "Checking Docker availability..."

try {
    $dockerInfo = docker info 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not running"
    }
    Write-Success "Docker is running"
} catch {
    Write-Error "Docker is not running. Please start Docker Desktop and try again."
    exit 1
}

# Step 3: Start Docker services
Write-Info "Starting Docker services..."

# Stop any existing containers
docker-compose down 2>$null

# Start all services
Write-Info "Starting all services (this may take a few minutes)..."
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to start Docker services"
    exit 1
}

# Wait for services to initialize
Write-Info "Waiting for services to initialize..."
Start-Sleep -Seconds 30

# Step 4: Check service health
Write-Info "Checking service health..."

# Check if all containers are running
$runningContainers = docker-compose ps --filter "status=running" -q
if ($runningContainers.Count -gt 0) {
    Write-Success "Docker services are running"
} else {
    Write-Error "Some Docker services failed to start"
    docker-compose ps
    exit 1
}

# Test backend health
Write-Info "Testing backend health..."
$healthCheckPassed = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "Backend is healthy"
            $healthCheckPassed = $true
            break
        }
    } catch {
        if ($i -eq 10) {
            Write-Error "Backend health check failed after 10 attempts"
            exit 1
        }
        Write-Info "Waiting for backend to be ready... (attempt $i/10)"
        Start-Sleep -Seconds 5
    }
}

# Test API authentication
Write-Info "Testing API authentication..."
try {
    $headers = @{ "X-API-Key" = "zhr_demo_clinic_2024_observability_key" }
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/traces" -Headers $headers -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -eq 200) {
        Write-Success "API authentication working"
    }
} catch {
    Write-Warning "API authentication test failed, but continuing..."
}

# Step 5: Load demo data
Write-Info "Loading demo data..."
try {
    $output = docker-compose exec -T backend python scripts/load_demo_data.py
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Demo data loaded successfully"
    } else {
        Write-Warning "Demo data loading failed, but continuing..."
    }
} catch {
    Write-Warning "Demo data loading failed, but continuing..."
}

# Step 6: Test frontend
Write-Info "Testing frontend availability..."
$frontendReady = $false
for ($i = 1; $i -le 5; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "Frontend is accessible"
            $frontendReady = $true
            break
        }
    } catch {
        if ($i -eq 5) {
            Write-Warning "Frontend not yet accessible, but may still be starting"
        }
        Write-Info "Waiting for frontend... (attempt $i/5)"
        Start-Sleep -Seconds 3
    }
}

# Step 7: Display success information
Write-Host "`n🎉 Setup Complete! Zahara.ai Agent Clinic is ready for testing`n" -ForegroundColor Green

Write-Host "📊 Access URLs:" -ForegroundColor Cyan
Write-Host "   • Frontend Dashboard: http://localhost:3000"
Write-Host "   • Backend API: http://localhost:8000"
Write-Host "   • API Documentation: http://localhost:8000/docs`n"

Write-Host "🔑 Test Credentials:" -ForegroundColor Cyan
Write-Host "   • API Key: zhr_demo_clinic_2024_observability_key"
Write-Host "   • Demo Mode: Enabled with realistic sample data`n"

Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Open http://localhost:3000 in your browser"
Write-Host "   2. Follow the TESTING_GUIDE.md for comprehensive testing"
Write-Host "   3. Test all features according to client requirements`n"

Write-Host "🔧 Useful Commands:" -ForegroundColor Cyan
Write-Host "   • View logs: docker-compose logs -f"
Write-Host "   • Stop services: docker-compose down"
Write-Host "   • Restart services: docker-compose restart`n"

Write-Host "📖 For detailed testing instructions, see TESTING_GUIDE.md`n"

# Step 8: Run basic system validation
Write-Info "Running basic system validation..."

try {
    $headers = @{ "X-API-Key" = "zhr_demo_clinic_2024_observability_key" }
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/traces?page_size=1" -Headers $headers -UseBasicParsing
    $content = $response.Content | ConvertFrom-Json
    $traceCount = $content.pagination.total
    
    if ($traceCount -gt 0) {
        Write-Success "System validation passed - $traceCount traces available"
    } else {
        Write-Warning "System validation warning - no traces found, but system is running"
    }
} catch {
    Write-Warning "System validation failed, but system appears to be running"
}

# Test metrics endpoint
try {
    $headers = @{ "X-API-Key" = "zhr_demo_clinic_2024_observability_key" }
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/metrics/aggregate" -Headers $headers -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Success "Metrics endpoint working"
    }
} catch {
    Write-Warning "Metrics endpoint test failed"
}

Write-Host "`n" -NoNewline
Write-Success "🚀 Zahara.ai Agent Clinic is ready for comprehensive testing!"
Write-Host "`nHappy testing! 🧪`n" -ForegroundColor Cyan

# Optional: Open browser
$openBrowser = Read-Host "Would you like to open the dashboard in your browser? (y/N)"
if ($openBrowser -eq "y" -or $openBrowser -eq "Y") {
    Start-Process "http://localhost:3000"
}
