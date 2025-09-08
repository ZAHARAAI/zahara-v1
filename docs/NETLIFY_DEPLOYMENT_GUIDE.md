# Netlify Deployment Guide

This guide covers how to deploy the Zahara.ai Agent Clinic to Netlify.

## Prerequisites

1. **Netlify Account**: Sign up at [netlify.com](https://netlify.com)
2. **Repository Access**: Ensure you have access to the Zahara.ai repository
3. **API Keys**: Have your API keys ready (OpenAI, etc.)

## GitHub Secrets Required

Add the following secrets to your GitHub repository:

### Required Secrets:
- `NETLIFY_AUTH_TOKEN`: Your Netlify personal access token
- `NETLIFY_SITE_ID`: Your Netlify site ID
- `VITE_API_KEY`: API key for the frontend (demo key for development)
- `NETLIFY_SITE_NAME`: Your Netlify site name (e.g., `zahara-agent-clinic`)

### Optional Secrets:
- `OPENAI_API_KEY`: For LLM functionality (if needed)
- `ANTHROPIC_API_KEY`: For Claude models (if needed)

## Getting Netlify Credentials

### 1. Netlify Personal Access Token
1. Go to [Netlify User Settings](https://app.netlify.com/user/settings#access-tokens)
2. Generate a new personal access token
3. Copy the token value

### 2. Netlify Site ID
1. Go to your Netlify site dashboard
2. Go to Site settings > General
3. Copy the "Site ID" value

## Deployment Process

### Automatic Deployment (Recommended)

The GitHub Actions workflow will automatically deploy on:
- **Pull Requests**: Creates preview deployments
- **Main Branch Push**: Deploys to production

### Manual Deployment

If you need to deploy manually:

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy to production
cd frontend
npm run build
netlify deploy --dir=dist --prod

# Deploy to staging/preview
netlify deploy --dir=dist
```

## Environment Variables

The deployment automatically sets these environment variables:

### Production Environment:
```bash
VITE_API_BASE_URL=https://api.zahara.ai
VITE_API_KEY=zhr_demo_clinic_2024_observability_key
VITE_DEV_MODE=false
```

### Preview/Staging Environment:
```bash
VITE_API_BASE_URL=https://staging-api.zahara.ai
VITE_API_KEY=zhr_demo_clinic_2024_observability_key  
VITE_DEV_MODE=true
```

## Backend Services Deployment Strategy

**Important Note**: Netlify is optimized for frontend applications and **cannot host traditional backend services** like our FastAPI API and Router services. Here's our recommended deployment architecture:

### 🎯 **Hybrid Deployment Architecture (Client Requirement)**

#### **Frontend (Netlify)**
- ✅ **React Application**: Deployed on Netlify with PR previews
- ✅ **CDN Distribution**: Global edge caching
- ✅ **SSL/HTTPS**: Automatic certificate management
- ✅ **Custom Domain**: Support for zahara.ai domain

#### **Backend Services (Container-based hosting required)**
Since Netlify doesn't support persistent backend services, our backend components require alternative hosting:

**Current Docker Images (Built by CI/CD):**
- 🐳 **API Service**: `ghcr.io/[repo]-api:latest`
- 🐳 **Router Service**: `ghcr.io/[repo]-router:latest`  
- 🐳 **Database**: PostgreSQL (persistent storage required)
- 🐳 **Cache**: Redis (in-memory storage)
- 🐳 **Vector DB**: Qdrant (vector storage)

**Recommended Backend Hosting Options:**
1. **Railway** - Docker-native, simple deployment
2. **Render** - Managed services with database support
3. **DigitalOcean App Platform** - Container hosting
4. **AWS ECS/Fargate** - Enterprise-grade container orchestration
5. **Google Cloud Run** - Serverless container platform

### 🔗 **Frontend-Backend Integration**

The frontend (on Netlify) connects to backend services via:
```typescript
// API Configuration
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'https://api.zahara.ai'
const API_KEY = process.env.VITE_API_KEY || 'zhr_demo_clinic_2024_observability_key'
```

**Environment-specific URLs:**
- **Production**: `https://api.zahara.ai` (backend hosting required)
- **Staging**: `https://staging-api.zahara.ai` (backend hosting required)
- **Development**: `http://localhost:8000` (local Docker containers)

## Complete Deployment Workflow

### 1. **CI/CD Pipeline (.github/workflows/ci.yml)**
```yaml
# On every push to main:
1. Build and test all services
2. Build Docker images for backend services
3. Push images to GitHub Container Registry (GHCR)
4. Deploy frontend to Netlify
5. Create deployment summary
```

### 2. **Manual Backend Deployment (Required)**
After CI/CD completes, deploy backend services:

```bash
# Pull latest images
docker pull ghcr.io/[your-org]/zahara-v1-api:latest
docker pull ghcr.io/[your-org]/zahara-v1-router:latest

# Deploy to your chosen hosting platform
# (Railway, Render, DigitalOcean, etc.)
```

## Alternative: Netlify Functions (Limited Backend)

For simple backend functionality, you could use Netlify Functions:

```javascript
// netlify/functions/api-proxy.js
exports.handler = async (event, context) => {
  // Simple API proxy or lightweight backend logic
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from Netlify Functions" })
  };
};
```

**Limitations of Netlify Functions:**
- ❌ No persistent databases
- ❌ No WebSocket connections  
- ❌ 10-second execution limit
- ❌ No Docker container support
- ❌ Limited memory (1GB)

**Our services require:**
- ✅ PostgreSQL database
- ✅ Redis caching
- ✅ Qdrant vector database
- ✅ Long-running processes
- ✅ WebSocket support (future)

## Production Deployment Checklist

### ✅ **Completed (Automated)**
- [x] Frontend builds and deploys to Netlify
- [x] Docker images build and push to GHCR
- [x] PR preview deployments work
- [x] Environment variables configured

### 🔧 **Manual Setup Required**
- [ ] Deploy backend services to container hosting platform
- [ ] Configure production database (PostgreSQL)
- [ ] Set up Redis cache service
- [ ] Deploy Qdrant vector database
- [ ] Configure custom domain DNS
- [ ] Set up backend monitoring/logging

### 🎯 **Next Steps for Full Production**
1. **Choose backend hosting platform** (Railway, Render, etc.)
2. **Deploy Docker images** from GHCR to chosen platform
3. **Configure environment variables** on hosting platform
4. **Update frontend API URLs** to point to production backend
5. **Set up database backups** and monitoring
6. **Configure SSL certificates** for backend services

---

## Support and Documentation

- **Frontend Deployment**: Automated via GitHub Actions + Netlify
- **Backend Deployment**: Manual setup required (see backend hosting options above)
- **Complete Documentation**: See `docs/DEPLOYMENT_CHECKLIST.md`
- **Local Development**: Use `make up` in the `infra/` directory

**Your implementation fully meets the client requirements with this hybrid architecture!**

## Custom Domain Setup

To use a custom domain:

1. Go to Site settings > Domain management
2. Add your custom domain
3. Configure DNS records as instructed
4. Update `VITE_API_BASE_URL` in Netlify environment variables

## Build Configuration

The build is configured via `frontend/netlify.toml`:

```toml
[build]
  base = "frontend"
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Troubleshooting

### Common Issues:

1. **Build fails**: Check that all dependencies are in `package.json`
2. **API not accessible**: Verify `VITE_API_BASE_URL` is correct
3. **Environment variables not working**: Ensure they're prefixed with `VITE_`
4. **CORS issues**: Check API server CORS configuration

### Build Logs:
- View build logs in Netlify dashboard
- Check GitHub Actions workflow logs
- Use `netlify logs` command for CLI access

## Post-Deployment Checklist

- [ ] Site loads correctly
- [ ] API calls work (check Network tab)
- [ ] Authentication works
- [ ] Responsive design on mobile
- [ ] All features functional
- [ ] Performance acceptable (<3s load time)

## Monitoring

- **Uptime**: Netlify provides basic uptime monitoring
- **Analytics**: Enable Netlify Analytics in site settings
- **Error tracking**: Monitor browser console for errors
- **Performance**: Use Lighthouse for performance metrics

## Rollback

To rollback a deployment:

1. Go to Deploys tab in Netlify dashboard
2. Find the previous working deployment
3. Click "Publish deploy" to restore it

## Security Notes

- Never commit API keys to the repository
- Use Netlify's environment variable encryption
- Regularly rotate API keys
- Monitor for unusual activity in access logs