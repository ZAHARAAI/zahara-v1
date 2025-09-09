import { useQuery } from '@tanstack/react-query';
import { apiService } from '../services/api';
import type { DashboardMetrics } from '../types/trace';
import { generateDemoDashboardMetrics } from '../utils/demoData';

export const useDashboardMetrics = () => {
  return useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async (): Promise<DashboardMetrics> => {
      try {
        return await apiService.getDashboardMetrics();
      } catch (error) {
        console.warn('API unavailable for metrics, using demo data:', error);
        
        // Fallback to demo metrics as specified
        return generateDemoDashboardMetrics();
      }
    },
    refetchInterval: 5000, // 5-second polling as specified
    staleTime: 1000,
    gcTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
