# Zahara.ai Agent Clinic - Frontend

A modern React application for monitoring and debugging AI agent executions with real-time observability.

## 🚀 Features

- **Real-time Trace Monitoring**: 5-second polling for live trace updates
- **Advanced Filtering**: Filter by status, model, operation, date range, and search
- **Detailed Span Analysis**: Drill down into individual spans with performance metrics
- **Export Functionality**: Export traces to CSV format
- **Professional UI**: Dark theme with Zahara.ai branding and animations
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## 🛠 Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom Zahara.ai theme
- **Data Fetching**: TanStack Query (React Query) with 5-second polling
- **Table**: TanStack Table with sorting and filtering
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Forms**: React Hook Form with Zod validation

## 📁 Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── common/           # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   └── Input.tsx
│   │   ├── layout/           # Layout components
│   │   ├── traces/           # Trace-related components
│   │   │   ├── TraceTable.tsx
│   │   │   ├── SpanDrawer.tsx
│   │   │   └── ExportButton.tsx
│   │   └── ui/               # UI components
│   │       ├── KPITiles.tsx
│   │       └── StatusBadge.tsx
│   ├── hooks/                # Custom React hooks
│   │   ├── useTraces.ts
│   │   └── useDashboardMetrics.ts
│   ├── pages/                # Page components
│   │   └── clinic/
│   │       └── index.tsx
│   ├── services/             # API services
│   │   └── api.ts
│   ├── types/                # TypeScript type definitions
│   │   ├── trace.ts
│   │   └── api.ts
│   ├── utils/                # Utility functions
│   │   ├── demoData.ts
│   │   └── formatters.ts
│   └── App.tsx
├── public/
├── .env.example              # Environment variables template
├── netlify.toml              # Netlify deployment configuration
├── package.json
├── tailwind.config.js        # Tailwind configuration with Zahara theme
└── vite.config.ts
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running on `http://localhost:8000`

### Installation

1. **Clone and navigate to frontend directory**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:5173`

### Environment Variables

Create a `.env` file with the following variables:

```env
# Backend API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=zhr_demo_clinic_2024_observability_key

# Development Configuration  
VITE_NODE_ENV=development
VITE_DEBUG=true
```

## 🎨 Design System

### Color Palette

- **Primary Brand**: Vibrant orange (`#FF6B35`)
- **Background**: Deep black/dark gray (`#000000` to `#1a1a1a`)
- **Text**: Pure white (`#FFFFFF`) and light gray (`#B0B0B0`)
- **Cards**: Dark gray (`#2a2a2a` to `#333333`)

### Typography

- **Font**: Inter or Roboto
- **Hierarchy**: Bold headings with strong contrast
- **Body Text**: Clean, readable light gray text

### Components

All components follow the Zahara.ai design system with:
- High contrast dark theme
- Orange accent colors for CTAs and highlights
- Smooth animations and transitions
- Professional enterprise software feel

## 📊 Data Flow

1. **API Integration**: Frontend connects to backend at `/traces` endpoints
2. **Real-time Updates**: 5-second polling using React Query
3. **Fallback Strategy**: Uses demo data when backend is unavailable
4. **Error Handling**: Graceful degradation with user-friendly messages
5. **Export**: Direct API calls for CSV export functionality

## 🧪 Testing

### Development Testing

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Build for production
npm run build
```

### E2E Testing (Planned)

- Playwright tests for main user flows
- Dashboard loading and KPI display
- Trace table filtering and sorting
- Span drawer functionality
- Export functionality

## 🚀 Deployment

### Netlify Deployment

The application is configured for Netlify deployment with:

- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **SPA Routing**: Configured in `netlify.toml`
- **Environment Variables**: Managed through Netlify UI

### Manual Deployment

```bash
# Build for production
npm run build

# Serve locally to test
npm run preview

# Deploy dist/ folder to your hosting provider
```

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/frontend.yml`) includes:

1. **Linting**: ESLint checks
2. **Type Checking**: TypeScript validation
3. **Building**: Production build verification
4. **Testing**: Unit and E2E tests
5. **Deployment**: Automatic Netlify deployment

## 🔧 Development

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Configured with React and TypeScript rules
- **Prettier**: Code formatting (integrate with your editor)
- **Naming**: camelCase for variables, PascalCase for components

### Performance Considerations

- **Bundle Splitting**: Vite handles automatic code splitting
- **Tree Shaking**: Unused code is automatically removed
- **React Query**: Intelligent caching and background updates
- **Lazy Loading**: Components and data are loaded on demand

### Adding New Features

1. **Create types**: Add TypeScript interfaces in `/types`
2. **API integration**: Extend `/services/api.ts`
3. **Hooks**: Create custom hooks in `/hooks`
4. **Components**: Build reusable components in `/components`
5. **Pages**: Add new pages in `/pages`

## 🐛 Troubleshooting

### Common Issues

**API Connection Errors**:
- Verify backend is running on `http://localhost:8000`
- Check CORS configuration in backend
- Validate API key in environment variables

**Build Errors**:
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript errors with `npm run type-check`
- Verify environment variables are set correctly

**Styling Issues**:
- Ensure Tailwind CSS is properly configured
- Check custom CSS classes in `/src/index.css`
- Verify dark theme variables are loaded

## 🤝 Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new interfaces
3. Test your changes thoroughly
4. Update documentation for new features
5. Ensure CI pipeline passes

## 📄 License

This project is licensed under the MIT License - see the main repository LICENSE file for details.

## 🔗 Related

- [Backend API Documentation](../services/api/README.md)
- [Deployment Guide](../docs/DEPLOYMENT.md)
- [API Reference](http://localhost:8000/docs)