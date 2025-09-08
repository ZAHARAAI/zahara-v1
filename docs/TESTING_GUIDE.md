# 🚀 ZAHARA.AI AGENT CLINIC - REAL-TIME TESTING GUIDE

## 📋 STEP 1: ENVIRONMENT SETUP

### 1.1 Configure API Keys

**Root .env file:**
```bash
# Add your real OpenAI API key
OPENAI_API_KEY=sk-your-real-openai-key-here

# Add your real Anthropic API key (optional)
ANTHROPIC_API_KEY=sk-ant-your-real-anthropic-key-here

# Add your real Groq API key (optional)
GROQ_API_KEY=gsk_your-real-groq-key-here

# Flowise configuration (optional)
FLOWISE_USERNAME=admin
FLOWISE_PASSWORD=admin123
```

### 1.2 Start All Services

```bash
# Navigate to infra directory
cd zahara-v1/infra

# Start all services with Makefile (recommended)
make up

# Alternative: Start with Docker Compose directly
docker compose up -d

# Wait for services to initialize (30-60 seconds)
make logs

# Verify all services are running
make ps
```

**Expected Output:**
```
NAME              STATUS                   PORTS
zahara-api        Up (healthy)     0.0.0.0:8000->8000/tcp
zahara-frontend   Up               0.0.0.0:3001->3000/tcp
zahara-postgres   Up (healthy)     0.0.0.0:5432->5432/tcp
zahara-redis      Up (healthy)     0.0.0.0:6379->6379/tcp
zahara-qdrant     Up               0.0.0.0:6333->6333/tcp
zahara-router     Up (healthy)     0.0.0.0:7000->7000/tcp
```

---

## 🧪 STEP 2: BASIC SYSTEM VALIDATION

### 2.1 Health Checks

```bash
# API health check
curl http://localhost:8000/health/

# Expected: {"status":"healthy","message":"Zahara.ai API is running"...}

# Router health check
curl http://localhost:7000/health

# Expected: {"status":"healthy","service":"Zahara.ai Router"...}

# Frontend accessibility (port 3001)
curl -I http://localhost:3001

# Expected: HTTP/1.1 200 OK

# Database connectivity (optional)
curl -f http://localhost:6333/health || echo "Qdrant not responding"
```

### 2.2 API Authentication Test

```bash
# Test with correct API key
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/traces?limit=1

# Expected: JSON response with traces data

# Test with invalid API key
curl -H "X-API-Key: invalid-key" \
     http://localhost:8000/traces?limit=1

# Expected: 401 Unauthorized
```

---

## 🎯 STEP 3: REAL-TIME FUNCTIONALITY TESTING

### 3.1 Frontend Dashboard Testing

**Open the dashboard:**
```bash
# Open in browser (port 3001)
start http://localhost:3001
# or
open http://localhost:3001
# or manually navigate to: http://localhost:3001
```

**Manual Verification Checklist:**

✅ **Page Load & Branding**
- [ ] Page loads within 3 seconds
- [ ] "Agent Clinic" header visible
- [ ] Zahara.ai orange theme applied
- [ ] Dark theme active

✅ **Real-time Indicator**
- [ ] Real-time indicator shows "Live" status
- [ ] Last update timestamp visible
- [ ] Status updates every 5 seconds

✅ **KPI Tiles**
- [ ] 4 KPI tiles visible (Total Traces, Avg Latency, Success Rate, Total Cost)
- [ ] Real numbers displayed (not 0 or placeholders)
- [ ] Trend indicators (up/down arrows) visible
- [ ] Values update in real-time

✅ **Trace Table**
- [ ] Table loads with trace data
- [ ] Columns: Status, Trace ID, Time, Duration, Model, Operation
- [ ] Real trace IDs (UUIDs) visible
- [ ] Status badges (OK/ERROR/RATE_LIMIT) colored correctly
- [ ] Timestamps show recent dates

### 3.2 Interactive Features Testing

**Search Functionality:**
1. Type "gpt-4" in search box
2. ✅ Table filters to show only GPT-4 traces
3. Clear search
4. ✅ Table shows all traces again

**Sorting:**
1. Click "Time" column header
2. ✅ Table sorts by timestamp
3. Click again
4. ✅ Sort order reverses

**Filtering:**
1. Select "ERROR" from status dropdown
2. ✅ Table shows only error traces
3. Select "All Statuses"
4. ✅ Table shows all traces

**Trace Details:**
1. Click on any trace row
2. ✅ Span drawer opens on the right
3. ✅ "Trace Details" header visible
4. ✅ Span timeline with operations visible
5. ✅ Each span shows duration, tokens, cost
6. Click X to close
7. ✅ Drawer closes

### 3.3 Export Functionality Testing

**CSV Export:**
1. Click "Export CSV" button
2. ✅ Export modal opens
3. ✅ "Export Summary" shows trace count and estimated size
4. ✅ Checkboxes for "Span details", "Events and logs", "Metadata fields"
5. Toggle some checkboxes
6. ✅ Estimated size updates
7. Click "Export CSV" button
8. ✅ Progress bar appears
9. ✅ File downloads automatically
10. Open downloaded CSV
11. ✅ Real trace data in CSV format

---

## 🔄 STEP 4: REAL-TIME TRACE GENERATION

### 4.1 Generate Live Traces via API

**Create a test script to generate real traces:**

```bash
# Create test script
cat > generate_test_traces.py << 'EOF'
import requests
import json
import time
import uuid
from datetime import datetime

API_KEY = "zhr_demo_clinic_2024_observability_key"
BASE_URL = "http://localhost:8000"

def create_trace():
    trace_id = str(uuid.uuid4())
    
    # Create trace
    trace_data = {
        "trace_id": trace_id,
        "operation": "live_test_operation",
        "model": "gpt-4",
        "status": "OK",
        "user_id": "test_user",
        "workflow_id": "live_test_workflow",
        "metadata": {
            "test": True,
            "timestamp": datetime.now().isoformat()
        }
    }
    
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    
    try:
        response = requests.post(f"{BASE_URL}/traces/", 
                               json=trace_data, 
                               headers=headers)
        print(f"✅ Created trace: {trace_id} - Status: {response.status_code}")
        return trace_id
    except Exception as e:
        print(f"❌ Error creating trace: {e}")
        return None

def add_span(trace_id, operation, duration_ms=1000):
    span_data = {
        "trace_id": trace_id,
        "span_id": str(uuid.uuid4()),
        "operation": operation,
        "model": "gpt-4",
        "provider": "openai",
        "duration": duration_ms,
        "tokens": 150,
        "cost": 0.01,
        "status": "OK"
    }
    
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    
    try:
        response = requests.post(f"{BASE_URL}/traces/{trace_id}/spans", 
                               json=span_data, 
                               headers=headers)
        print(f"  ➕ Added span: {operation} - Status: {response.status_code}")
    except Exception as e:
        print(f"  ❌ Error adding span: {e}")

# Generate traces every 10 seconds
print("🚀 Starting live trace generation...")
print("📊 Watch the dashboard at http://localhost:3000")
print("⏹️  Press Ctrl+C to stop")

try:
    while True:
        trace_id = create_trace()
        if trace_id:
            add_span(trace_id, "input_validation", 200)
            add_span(trace_id, "llm_call", 1500)
            add_span(trace_id, "output_formatting", 300)
        
        print(f"⏰ Waiting 10 seconds... (Dashboard should update in ~5s)")
        time.sleep(10)
        
except KeyboardInterrupt:
    print("\n🛑 Stopped trace generation")
EOF

# Run the script
python generate_test_traces.py
```

### 4.2 Real-time Dashboard Verification

**While the script runs, verify in the dashboard:**

✅ **Real-time Updates**
- [ ] New traces appear in the table every ~10 seconds
- [ ] KPI tiles update with new data
- [ ] "Live" indicator remains active
- [ ] Total trace count increases

✅ **User Interaction Pausing**
1. While traces are generating, click on a table header to sort
2. ✅ Real-time indicator changes to "Paused"
3. ✅ New traces stop appearing temporarily
4. Wait 10 seconds without interaction
5. ✅ Indicator returns to "Live"
6. ✅ New traces resume appearing

---

## 🤖 STEP 5: FLOWISE INTEGRATION TESTING

### 5.1 Flowise Setup

**Access Flowise:**
```bash
# Open Flowise
start http://localhost:3001
# or
open http://localhost:3001
```

**Login:**
- Username: `admin`
- Password: `admin123`

### 5.2 Create Test Flow

**Create a simple chatflow:**
1. ✅ Create new chatflow
2. ✅ Add "Chat Model" node (OpenAI)
3. ✅ Configure with your OpenAI API key
4. ✅ Add "Conversation Chain" node
5. ✅ Connect the nodes
6. ✅ Save the flow

### 5.3 Test Flow Execution

**Execute the flow:**
1. Click "Test" in Flowise
2. Send message: "Hello, this is a test"
3. ✅ Flow executes successfully
4. ✅ Response received

**Verify in Agent Clinic:**
1. Go back to http://localhost:3000
2. ✅ New trace appears from Flowise execution
3. ✅ Trace shows Flowise-specific metadata
4. ✅ Spans include OpenAI API call details

---

## 📊 STEP 6: ADVANCED FEATURES TESTING

### 6.1 Metrics API Testing

```bash
# Test aggregate metrics
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     http://localhost:8000/traces/metrics/aggregate

# Expected: Real metrics with your generated traces
```

### 6.2 Search and Filter Testing

**Complex Filtering:**
```bash
# Filter by status and model
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/traces?status=OK&models=gpt-4&limit=5"

# Search for specific operation
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/traces?search=live_test_operation&limit=5"
```

### 6.3 Export API Testing

```bash
# Test CSV export
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     "http://localhost:8000/traces/export?format=csv&limit=10" \
     -o test_export.csv

# Verify CSV content
head -5 test_export.csv
```

---

## 🔍 STEP 7: PERFORMANCE & RELIABILITY TESTING

### 7.1 Load Testing

**Generate high-frequency traces:**
```python
# Modify the test script for rapid generation
# Change sleep time to 1 second instead of 10
time.sleep(1)  # Generate traces every second
```

**Verify:**
- [ ] Dashboard remains responsive
- [ ] Real-time updates continue working
- [ ] No memory leaks in browser
- [ ] API response times stay low

### 7.2 Error Handling Testing

**Test error scenarios:**
```bash
# Test with invalid API key
curl -H "X-API-Key: invalid-key" \
     http://localhost:8000/traces

# Test with malformed request
curl -H "X-API-Key: zhr_demo_clinic_2024_observability_key" \
     -X POST http://localhost:8000/traces/ \
     -d "invalid json"
```

**Verify in dashboard:**
- [ ] Error messages appear in UI
- [ ] Toast notifications show appropriate errors
- [ ] Application doesn't crash
- [ ] Graceful error recovery

---

## ✅ STEP 8: FINAL VALIDATION CHECKLIST

### 8.1 Complete System Check

**Backend Services:**
- [ ] All Docker containers running
- [ ] Database connections healthy
- [ ] Redis caching working
- [ ] API endpoints responding
- [ ] Authentication working
- [ ] Rate limiting active

**Frontend Application:**
- [ ] Page loads quickly
- [ ] All components render
- [ ] Real-time updates working
- [ ] Interactive features functional
- [ ] Export functionality working
- [ ] Mobile responsive
- [ ] Error handling graceful

**Data Flow:**
- [ ] Traces created via API appear in dashboard
- [ ] Flowise executions tracked
- [ ] Real-time metrics calculated
- [ ] Search and filtering working
- [ ] Export generates real data

**Performance:**
- [ ] API responses < 100ms
- [ ] Dashboard updates smoothly
- [ ] No console errors
- [ ] Memory usage stable
- [ ] CPU usage reasonable

### 8.2 Production Readiness

**Security:**
- [ ] API key authentication enforced
- [ ] Rate limiting prevents abuse
- [ ] CORS configured properly
- [ ] No sensitive data exposed

**Monitoring:**
- [ ] Health endpoints responding
- [ ] Logs being generated
- [ ] Metrics being collected
- [ ] Error tracking working

**Deployment:**
- [ ] Docker images building
- [ ] Environment variables configured
- [ ] Database migrations working
- [ ] Services starting automatically

---

## 🎯 SUCCESS CRITERIA

**✅ SYSTEM IS PRODUCTION READY WHEN:**

1. **All services start automatically** with `make up` or `docker compose up -d`
2. **Dashboard loads within 3 seconds** at http://localhost:3001
3. **Real traces appear** from API calls and Flowise executions
4. **Real-time updates work** with 5-second polling
5. **All interactive features respond** (search, filter, sort, export)
6. **API authentication enforces** X-API-Key requirement
7. **Error handling is graceful** with user-friendly messages
8. **Performance is acceptable** with smooth UI interactions

**🚀 READY FOR CLIENT DELIVERY!**

---

## 📞 TROUBLESHOOTING

**Common Issues:**

1. **Services not starting:**
   ```bash
   make clean
   make up
   ```

2. **No traces appearing:**
   ```bash
   make seed
   ```

3. **API key errors:**
   - Check .env files have correct API keys
   - Restart services after updating keys

4. **Frontend not loading:**
   ```bash
   make logs
   curl http://localhost:3001
   ```

5. **Database connection issues:**
   ```bash
   make logs
   make test-python  # This will run database migrations automatically
   ```

**Need Help?**
- Check Docker logs: `make logs` or `docker compose logs [service-name]`
- Verify environment variables: `docker compose exec api env`
- Check service status: `make ps` or `docker compose ps`
- Test API directly: `curl -H "X-API-Key: ..." http://localhost:8000/health`