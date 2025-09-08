import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AgentClinicPage } from './pages/clinic';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000, // Data is stale after 1 second
      gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="App">
        {/* Main Agent Clinic Page */}
        <AgentClinicPage />
        
        {/* Toast Notifications */}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 5000,
            style: {
              background: '#1a1a1a',
              color: '#FFFFFF',
              border: '1px solid #FF6B35',
            },
            success: {
              iconTheme: {
                primary: '#FF6B35',
                secondary: '#FFFFFF',
              },
            },
            error: {
              iconTheme: {
                primary: '#EF4444',
                secondary: '#FFFFFF',
              },
            },
          }}
        />
      </div>
    </QueryClientProvider>
  );
}

export default App;