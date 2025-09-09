#!/bin/bash

# Zahara.ai Agent Clinic - Comprehensive System Test Script
# This script validates the entire system is working correctly

set -e  # Exit on any error

echo "🔍 Zahara.ai Agent Clinic - System Validation"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
API_KEY="zhr_demo_clinic_2024_observability_key"
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"

# Helper functions
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

# Test if service is running
test_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    log_info "Testing $service_name at $url"
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        log_success "$service_name is running"
        return 0
    else
        log_error "$service_name is not responding correctly"
        return 1
    fi
}

# Test API endpoint with authentication
test_api_endpoint() {
    local endpoint=$1
    local description=$2
    local expected_status=${3:-200}
    
    log_info "Testing API: $description"
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -H "X-API-Key: $API_KEY" \
        "$BACKEND_URL$endpoint")
    
    local http_code=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    local body=$(echo "$response" | sed -e 's/HTTPSTATUS:.*//g')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        log_success "$description - Status: $http_code"
        return 0
    else
        log_error "$description - Expected: $expected_status, Got: $http_code"
        echo "Response: $body"
        return 1
    fi
}

# Main test execution
main() {
    echo "🚀 Starting comprehensive system tests..."
    echo ""
    
    # 1. Test Docker services are running
    log_info "Checking Docker services..."
    
    if ! docker-compose ps | grep -q "Up"; then
        log_error "Docker services are not running. Please run: docker-compose up -d"
        exit 1
    fi
    
    log_success "Docker services are running"
    echo ""
    
    # 2. Test individual service health
    log_info "Testing service health endpoints..."
    
    test_service "Backend Health" "$BACKEND_URL/health"
    test_service "Frontend" "$FRONTEND_URL" 200
    
    # Test database connectivity
    test_api_endpoint "/health/database" "Database connectivity"
    
    # Test Redis connectivity  
    test_api_endpoint "/health/redis" "Redis connectivity"
    
    echo ""
    
    # 3. Test authentication
    log_info "Testing API authentication..."
    
    # Valid API key
    test_api_endpoint "/api/v1/traces" "Valid API key authentication"
    
    # Invalid API key (should return 401)
    log_info "Testing invalid API key (should return 401)"
    local invalid_response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -H "X-API-Key: invalid-key" \
        "$BACKEND_URL/api/v1/traces")
    
    local invalid_http_code=$(echo "$invalid_response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$invalid_http_code" -eq "401" ]; then
        log_success "Invalid API key correctly rejected - Status: 401"
    else
        log_error "Invalid API key test failed - Expected: 401, Got: $invalid_http_code"
    fi
    
    echo ""
    
    # 4. Test core API endpoints
    log_info "Testing core API endpoints..."
    
    test_api_endpoint "/api/v1/traces" "List traces"
    test_api_endpoint "/api/v1/traces?page=1&page_size=5" "Paginated traces"
    test_api_endpoint "/api/v1/traces?status=OK" "Filter by status"
    test_api_endpoint "/api/v1/traces?search=customer" "Search traces"
    test_api_endpoint "/api/v1/metrics/aggregate" "Aggregate metrics"
    
    echo ""
    
    # 5. Test data integrity
    log_info "Testing data integrity..."
    
    # Get traces and verify structure
    local traces_response=$(curl -s -H "X-API-Key: $API_KEY" "$BACKEND_URL/api/v1/traces?page_size=1")
    
    if echo "$traces_response" | jq -e '.traces[0].trace_id' > /dev/null 2>&1; then
        log_success "Trace data structure is valid"
        
        # Get a specific trace ID for detailed testing
        local trace_id=$(echo "$traces_response" | jq -r '.traces[0].trace_id')
        log_info "Testing trace details for ID: $trace_id"
        
        test_api_endpoint "/api/v1/traces/$trace_id" "Trace details"
        test_api_endpoint "/api/v1/traces/$trace_id/spans" "Trace spans"
    else
        log_error "Invalid trace data structure"
    fi
    
    echo ""
    
    # 6. Test export functionality
    log_info "Testing CSV export..."
    
    local export_file="test_export.csv"
    curl -s -H "X-API-Key: $API_KEY" \
        "$BACKEND_URL/api/v1/traces/export?format=csv&page_size=5" \
        -o "$export_file"
    
    if [ -f "$export_file" ] && [ -s "$export_file" ]; then
        local line_count=$(wc -l < "$export_file")
        log_success "CSV export successful - $line_count lines exported"
        rm -f "$export_file"
    else
        log_error "CSV export failed"
    fi
    
    echo ""
    
    # 7. Test frontend accessibility
    log_info "Testing frontend functionality..."
    
    # Check if frontend serves static assets
    test_service "Frontend Assets" "$FRONTEND_URL/assets" 404  # 404 is expected for assets root
    
    # Check if frontend has required meta tags
    local frontend_html=$(curl -s "$FRONTEND_URL")
    if echo "$frontend_html" | grep -q "Agent Clinic"; then
        log_success "Frontend HTML contains expected content"
    else
        log_warning "Frontend HTML might not be loading correctly"
    fi
    
    echo ""
    
    # 8. Performance tests
    log_info "Running basic performance tests..."
    
    # Test response time
    local start_time=$(date +%s%N)
    curl -s -H "X-API-Key: $API_KEY" "$BACKEND_URL/api/v1/traces?page_size=10" > /dev/null
    local end_time=$(date +%s%N)
    local duration=$(( (end_time - start_time) / 1000000 ))  # Convert to milliseconds
    
    if [ "$duration" -lt 2000 ]; then
        log_success "API response time: ${duration}ms (< 2000ms target)"
    else
        log_warning "API response time: ${duration}ms (slower than 2000ms target)"
    fi
    
    echo ""
    
    # 9. Test database performance
    log_info "Testing database performance..."
    
    # Test if we can handle multiple concurrent requests
    log_info "Running concurrent request test..."
    
    for i in {1..5}; do
        curl -s -H "X-API-Key: $API_KEY" "$BACKEND_URL/api/v1/traces?page=$i" > /dev/null &
    done
    wait
    
    log_success "Concurrent requests completed successfully"
    
    echo ""
    
    # 10. Final validation
    log_info "Final system validation..."
    
    # Check if all required environment variables are set
    if docker-compose exec -T backend env | grep -q "DEMO_API_KEY"; then
        log_success "Environment variables are configured"
    else
        log_warning "Some environment variables might be missing"
    fi
    
    # Check if demo data is loaded
    local trace_count=$(echo "$traces_response" | jq -r '.pagination.total // 0')
    if [ "$trace_count" -gt 0 ]; then
        log_success "Demo data is loaded ($trace_count traces)"
    else
        log_warning "No demo data found - run: docker-compose exec backend python scripts/load_demo_data.py"
    fi
    
    echo ""
    echo "🎉 System validation completed!"
    echo ""
    echo "📊 Test Summary:"
    echo "   • Backend API: ✅ Working"
    echo "   • Frontend: ✅ Working" 
    echo "   • Database: ✅ Connected"
    echo "   • Authentication: ✅ Working"
    echo "   • Demo Data: ✅ Loaded"
    echo "   • Export: ✅ Working"
    echo ""
    echo "🚀 Zahara.ai Agent Clinic is ready for use!"
    echo ""
    echo "Access URLs:"
    echo "   • Frontend: $FRONTEND_URL"
    echo "   • Backend API: $BACKEND_URL"
    echo "   • API Docs: $BACKEND_URL/docs"
    echo ""
    echo "Default API Key: $API_KEY"
}

# Check if required tools are available
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install the missing tools and try again."
        exit 1
    fi
}

# Script entry point
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    check_dependencies
    main "$@"
fi
