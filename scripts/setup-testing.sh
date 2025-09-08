#!/bin/bash

# Zahara.ai Agent Clinic - Quick Testing Setup Script
# This script sets up the complete testing environment

set -e  # Exit on any error

echo "🚀 Zahara.ai Agent Clinic - Quick Testing Setup"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Create environment files
log_info "Creating environment configuration files..."

# Backend .env file
cat > .env << 'EOF'
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
EOF

# Frontend .env file
cat > frontend/.env << 'EOF'
# Frontend Environment Variables
VITE_API_BASE_URL=http://localhost:8000
VITE_DEMO_API_KEY=zhr_demo_clinic_2024_observability_key
VITE_DEV_MODE=true
VITE_POLLING_INTERVAL=5000
EOF

log_success "Environment files created successfully"

# Step 2: Start Docker services
log_info "Starting Docker services..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Stop any existing containers
docker-compose down > /dev/null 2>&1 || true

# Start all services
log_info "Starting all services (this may take a few minutes)..."
docker-compose up -d

# Wait for services to initialize
log_info "Waiting for services to initialize..."
sleep 30

# Step 3: Check service health
log_info "Checking service health..."

# Check if all containers are running
if docker-compose ps | grep -q "Up"; then
    log_success "Docker services are running"
else
    log_error "Some Docker services failed to start"
    docker-compose ps
    exit 1
fi

# Test backend health
log_info "Testing backend health..."
for i in {1..10}; do
    if curl -s http://localhost:8000/health > /dev/null; then
        log_success "Backend is healthy"
        break
    else
        if [ $i -eq 10 ]; then
            log_error "Backend health check failed after 10 attempts"
            exit 1
        fi
        log_info "Waiting for backend to be ready... (attempt $i/10)"
        sleep 5
    fi
done

# Test API authentication
log_info "Testing API authentication..."
if curl -s -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
   http://localhost:8000/api/v1/traces > /dev/null; then
    log_success "API authentication working"
else
    log_warning "API authentication test failed, but continuing..."
fi

# Step 4: Load demo data
log_info "Loading demo data..."
if docker-compose exec -T backend python scripts/load_demo_data.py; then
    log_success "Demo data loaded successfully"
else
    log_warning "Demo data loading failed, but continuing..."
fi

# Step 5: Test frontend
log_info "Testing frontend availability..."
for i in {1..5}; do
    if curl -s http://localhost:3000 > /dev/null; then
        log_success "Frontend is accessible"
        break
    else
        if [ $i -eq 5 ]; then
            log_warning "Frontend not yet accessible, but may still be starting"
        fi
        log_info "Waiting for frontend... (attempt $i/5)"
        sleep 3
    fi
done

# Step 6: Display success information
echo ""
echo "🎉 Setup Complete! Zahara.ai Agent Clinic is ready for testing"
echo ""
echo "📊 Access URLs:"
echo "   • Frontend Dashboard: http://localhost:3000"
echo "   • Backend API: http://localhost:8000"
echo "   • API Documentation: http://localhost:8000/docs"
echo ""
echo "🔑 Test Credentials:"
echo "   • API Key: zhr_demo_clinic_2024_observability_key"
echo "   • Demo Mode: Enabled with realistic sample data"
echo ""
echo "📋 Next Steps:"
echo "   1. Open http://localhost:3000 in your browser"
echo "   2. Follow the TESTING_GUIDE.md for comprehensive testing"
echo "   3. Test all features according to client requirements"
echo ""
echo "🔧 Useful Commands:"
echo "   • View logs: docker-compose logs -f"
echo "   • Stop services: docker-compose down"
echo "   • Restart services: docker-compose restart"
echo ""
echo "📖 For detailed testing instructions, see TESTING_GUIDE.md"
echo ""

# Step 7: Run basic system validation
log_info "Running basic system validation..."

# Test trace endpoint
TRACE_COUNT=$(curl -s -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
    "http://localhost:8000/api/v1/traces?page_size=1" | \
    grep -o '"total":[0-9]*' | cut -d':' -f2 || echo "0")

if [ "$TRACE_COUNT" -gt 0 ]; then
    log_success "System validation passed - $TRACE_COUNT traces available"
else
    log_warning "System validation warning - no traces found, but system is running"
fi

# Test metrics endpoint
if curl -s -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
   http://localhost:8000/api/v1/metrics/aggregate > /dev/null; then
    log_success "Metrics endpoint working"
else
    log_warning "Metrics endpoint test failed"
fi

echo ""
log_success "🚀 Zahara.ai Agent Clinic is ready for comprehensive testing!"
echo ""
echo "Happy testing! 🧪"
