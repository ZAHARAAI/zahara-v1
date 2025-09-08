# 🚀 Zahara.ai Agent Clinic - Quick Start Guide

## ⚡ 5-Minute Setup

### Option 1: Automated Setup (Recommended)

**For Linux/Mac:**
```bash
# Run the automated setup script
bash scripts/setup-testing.sh
```

**For Windows:**
```powershell
# Run the PowerShell setup script
.\scripts\setup-testing.ps1
```

### Option 2: Manual Setup

**Step 1: Create Environment Files**
```bash
# Copy the environment template
cp .env.example .env
cp frontend/.env.example frontend/.env
```

**Step 2: Start Services**
```bash
# Navigate to infra directory
cd infra

# Start all services with Makefile (recommended)
make up

# Alternative: Start with Docker Compose directly
docker compose up -d

# Wait 30 seconds for initialization
sleep 30

# Load demo data
make seed
```

**Step 3: Access the Application**
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Router Service**: http://localhost:7000

---

## 🔑 Default Credentials

**API Key**: `zhr_demo_clinic_2024_observability_key`

This key is pre-configured and works immediately for testing all features.

---

## 🧪 Quick Feature Test

### 1. Dashboard (http://localhost:3001)
- ✅ **KPI Tiles**: 6 animated metrics tiles
- ✅ **Trace Table**: Real-time trace data with filtering
- ✅ **Copy-to-Clipboard**: Click copy button next to trace IDs
- ✅ **Real-time Updates**: 5-second polling with smart pausing

### 2. Filtering & Search
- ✅ **Search**: Type "customer" in search box
- ✅ **Status Filter**: Select "ERROR" from dropdown
- ✅ **Model Filter**: Type "gpt-4" to filter by model
- ✅ **Date Range**: Set start/end dates

### 3. Span Details
- ✅ **Click any trace row** → Span drawer opens
- ✅ **View timeline** → Visual span sequence
- ✅ **Check metrics** → Tokens, cost, duration per span

### 4. CSV Export
- ✅ **Click Export button** → Modal opens
- ✅ **Configure options** → Include spans/events
- ✅ **Download CSV** → File downloads automatically

---

## 📊 Expected Demo Data

The system includes realistic demo data with:

- **140+ traces** across 7 different operation types
- **Customer Support AI** (gpt-4, 2.3s, 1,247 tokens, $0.087)
- **Code Review Analysis** (claude-3-sonnet, 5.7s, 3,891 tokens, $0.234)
- **Document Summarization** (gpt-3.5-turbo, 1.2s, 2,156 tokens, $0.032)
- **Rate Limited Requests** (0.1s, RATE-LIMIT status)
- **Authentication Failures** (0.05s, ERROR status)
- **Legal Document Analysis** (gpt-4-turbo, 12.4s, 8,247 tokens, $0.412)
- **Multi-Model Workflows** (gpt-4 + claude-3, 4.1s, 2,847 tokens, $0.156)

---

## 🎯 Key Features to Test

### ✅ Real-time Dashboard
1. **KPI Tiles animate** on page load
2. **Metrics update** every 5 seconds
3. **Pulse effects** on data changes

### ✅ Advanced Filtering
1. **Search works** with debouncing
2. **Status filtering** shows correct traces
3. **Combined filters** work together

### ✅ Professional UI
1. **Dark theme** with orange accents (#FF6B35)
2. **Responsive design** on mobile/desktop
3. **Smooth animations** throughout

### ✅ Copy-to-Clipboard
1. **Hover over trace** → Copy button appears
2. **Click copy** → Green toast notification
3. **Trace ID copied** to clipboard

### ✅ CSV Export
1. **Export modal** with configuration options
2. **Progress tracking** during export
3. **Proper CSV formatting** with headers

---

## 🔧 Troubleshooting

### Services Won't Start
```bash
# Navigate to infra directory
cd infra

# Clean restart
make clean
make up
```

### No Demo Data
```bash
# Generate API key and seed demo data
make seed
```

### Frontend Can't Connect
Check that `.env` files have correct URLs:
- Frontend: `VITE_API_BASE_URL=http://localhost:8000`
- API Key: `VITE_DEMO_API_KEY=zhr_demo_clinic_2024_observability_key`
- Port: Frontend runs on port 3001

### Check Service Status
```bash
# View all services
make ps
# or
docker compose ps

# Check logs
make logs
# or
docker compose logs api
docker compose logs frontend
```

---

## 📖 Complete Testing

For comprehensive testing of all features, see **[TESTING_GUIDE.md](TESTING_GUIDE.md)** which includes:

- ✅ **40+ detailed test cases**
- ✅ **Step-by-step instructions**
- ✅ **Expected results for each test**
- ✅ **Performance validation**
- ✅ **Error scenario testing**
- ✅ **API testing with curl examples**

---

## 🎉 Success Criteria

**The system is working correctly when:**

✅ Dashboard loads in <2 seconds  
✅ All 6 KPI tiles display with animations  
✅ Trace table shows realistic data  
✅ Copy-to-clipboard works with toast feedback  
✅ Real-time updates every 5 seconds  
✅ Filtering and search work accurately  
✅ Span drawer opens with detailed metrics  
✅ CSV export downloads properly  
✅ Responsive design works on all devices  
✅ No console errors in browser dev tools  

---

**🚀 Ready to test! The Zahara.ai Agent Clinic MVP is production-ready.**
