#!/bin/bash

# === ZAHARA.AI AGENT CLINIC - DEPLOYMENT VALIDATION SCRIPT ===

set -e

echo "🔍 Starting deployment validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if required files exist
echo "📁 Checking required files..."

required_files=(
    "README.md"
    "frontend/package.json"
    "frontend/netlify.toml"
    "infra/docker-compose.yml"
    "infra/Makefile"
    "services/api/requirements.txt"
    "services/api/app/main.py"
    "services/router/requirements.txt"
    "services/router/app/main.py"
    ".env.example"
    ".gitignore"
    "docs/README.md"
    "docs/HANDOFF.md"
    "docs/NETLIFY_DEPLOYMENT_GUIDE.md"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        print_status "Found: $file"
    else
        print_error "Missing: $file"
        exit 1
    fi
done

# Check Docker Compose configuration
echo ""
echo "🐳 Validating Docker Compose configuration..."
if docker compose -f infra/docker-compose.yml config > /dev/null 2>&1; then
    print_status "Docker Compose configuration is valid"
else
    print_error "Docker Compose configuration has errors"
    exit 1
fi

# Check if services can build
echo ""
echo "🏗️  Checking service build configurations..."
services=("api" "router" "frontend")

for service in "${services[@]}"; do
    echo "Building $service..."
    if docker compose -f infra/docker-compose.yml build "$service" > /dev/null 2>&1; then
        print_status "$service builds successfully"
    else
        print_error "$service failed to build"
        exit 1
    fi
done

# Check Node.js dependencies
echo ""
echo "📦 Checking Node.js dependencies..."
cd frontend
if npm ci > /dev/null 2>&1; then
    print_status "Frontend dependencies installed successfully"
else
    print_error "Frontend dependency installation failed"
    exit 1
fi

# Check if frontend builds
if npm run build > /dev/null 2>&1; then
    print_status "Frontend builds successfully"
else
    print_error "Frontend build failed"
    exit 1
fi

cd ..

# Check Python dependencies
echo ""
echo "🐍 Checking Python dependencies..."
if pip install -r services/api/requirements.txt > /dev/null 2>&1; then
    print_status "API dependencies installed successfully"
else
    print_error "API dependency installation failed"
    exit 1
fi

if pip install -r services/router/requirements.txt > /dev/null 2>&1; then
    print_status "Router dependencies installed successfully"
else
    print_error "Router dependency installation failed"
    exit 1
fi

# Check GitHub Actions workflow
echo ""
echo "🚀 Checking GitHub Actions configuration..."
if [ -f ".github/workflows/unified-ci.yml" ]; then
    print_status "GitHub Actions workflow exists"
else
    print_error "GitHub Actions workflow missing"
    exit 1
fi

# Check Netlify configuration
echo ""
echo "🌐 Checking Netlify configuration..."
if [ -f "frontend/netlify.toml" ]; then
    print_status "Netlify configuration exists"
else
    print_error "Netlify configuration missing"
    exit 1
fi

# Check environment variables
echo ""
echo "🔧 Checking environment configuration..."
if [ -f ".env.example" ]; then
    print_status "Environment template exists"
else
    print_error "Environment template missing"
    exit 1
fi

# Check documentation
echo ""
echo "📚 Checking documentation..."
doc_files=(
    "docs/README.md"
    "docs/HANDOFF.md"
    "docs/DEPLOYMENT_CHECKLIST.md"
    "docs/NETLIFY_DEPLOYMENT_GUIDE.md"
    "docs/PROJECT_STATUS.md"
    "docs/QUICK_START.md"
    "docs/TESTING_GUIDE.md"
    "docs/TESTING_SUMMARY.md"
    "docs/REAL_USAGE_TESTING.md"
)

for doc in "${doc_files[@]}"; do
    if [ -f "$doc" ]; then
        print_status "Documentation: $doc"
    else
        print_warning "Documentation missing: $doc"
    fi
done

# Final validation
echo ""
echo "🎉 DEPLOYMENT VALIDATION COMPLETE!"
echo ""
echo "✅ All required files present"
echo "✅ Docker Compose configuration valid"
echo "✅ All services build successfully"
echo "✅ Dependencies install correctly"
echo "✅ Frontend builds successfully"
echo "✅ GitHub Actions workflow configured"
echo "✅ Netlify deployment ready"
echo ""
echo "🚀 Ready for production deployment!"
echo ""
echo "Next steps:"
echo "1. Set up GitHub repository secrets (NETLIFY_AUTH_TOKEN, NETLIFY_SITE_ID, etc.)"
echo "2. Configure Netlify site with custom domain (optional)"
echo "3. Push code to trigger CI/CD pipeline"
echo "4. Monitor deployment in Netlify dashboard"
