import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { apiService } from '../services/api';
import type { TraceListResponse, Trace } from '../types/trace';
import { generateDemoTraces } from '../utils/demoData';

export interface UseTracesOptions {
  page?: number;
  limit?: number;
  status?: string[];
  models?: string[];
  operations?: string[];
  search?: string;
  dateRange?: { start: string; end: string };
  refetchInterval?: number;
}

export const useTraces = (options: UseTracesOptions = {}) => {
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [isPollingPaused, setIsPollingPaused] = useState(false);
  const [newTraceCount, setNewTraceCount] = useState(0);
  const lastDataRef = useRef<TraceListResponse | null>(null);
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Smart polling - pause during user interactions
  const pausePolling = () => {
    setIsPollingPaused(true);
    
    // Clear existing timeout
    if (userInteractionTimeoutRef.current) {
      clearTimeout(userInteractionTimeoutRef.current);
    }
    
    // Resume polling after 10 seconds of no interaction
    userInteractionTimeoutRef.current = setTimeout(() => {
      setIsPollingPaused(false);
    }, 10000);
  };
  
  const query = useQuery({
    queryKey: ['traces', options],
    queryFn: async (): Promise<TraceListResponse> => {
      try {
        // Try to fetch from real API
        const result = await apiService.getTraces(options);
        setLastFetchTime(new Date());
        
        // Check for new traces
        if (lastDataRef.current && lastDataRef.current.traces.length > 0) {
          const lastTrace = lastDataRef.current.traces[0];
          const newTraces = result.traces.filter(trace => 
            new Date(trace.timestamp) > new Date(lastTrace.timestamp)
          );
          setNewTraceCount(newTraces.length);
        }
        
        lastDataRef.current = result;
        return result;
        
      } catch (error) {
        console.warn('API unavailable, using demo data:', error);
        
        // Fallback to demo data with simulated updates
        const demoTraces = generateDemoTraces(100);
        let filteredTraces = demoTraces;
        
        // Simulate new traces occasionally
        if (Math.random() > 0.7 && lastDataRef.current) {
          const newTrace = generateDemoTraces(1)[0];
          newTrace.timestamp = new Date().toISOString();
          filteredTraces = [newTrace, ...filteredTraces];
          setNewTraceCount(1);
        }
        
        // Apply filters to demo data
        if (options.status?.length) {
          filteredTraces = filteredTraces.filter(trace => 
            options.status!.includes(trace.status)
          );
        }
        
        if (options.models?.length) {
          filteredTraces = filteredTraces.filter(trace => 
            options.models!.includes(trace.model)
          );
        }
        
        if (options.operations?.length) {
          filteredTraces = filteredTraces.filter(trace => 
            options.operations!.includes(trace.operation)
          );
        }
        
        if (options.search) {
          const searchTerm = options.search.toLowerCase();
          filteredTraces = filteredTraces.filter(trace => 
            trace.trace_id.toLowerCase().includes(searchTerm) ||
            trace.operation.toLowerCase().includes(searchTerm) ||
            trace.model.toLowerCase().includes(searchTerm)
          );
        }
        
        if (options.dateRange) {
          const start = new Date(options.dateRange.start);
          const end = new Date(options.dateRange.end);
          filteredTraces = filteredTraces.filter(trace => {
            const traceDate = new Date(trace.timestamp);
            return traceDate >= start && traceDate <= end;
          });
        }
        
        // Apply pagination
        const page = options.page || 1;
        const limit = options.limit || 25;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedTraces = filteredTraces.slice(startIndex, endIndex);
        
        const result = {
          traces: paginatedTraces,
          pagination: {
            page,
            limit,
            total: filteredTraces.length,
            hasNext: endIndex < filteredTraces.length,
            hasPrev: page > 1,
          },
          filters: {
            status: options.status,
            models: options.models,
            operations: options.operations,
            dateRange: options.dateRange,
            search: options.search,
          },
        };
        
        setLastFetchTime(new Date());
        lastDataRef.current = result;
        return result;
      }
    },
    refetchInterval: isPollingPaused ? false : (options.refetchInterval || 5000), // Smart polling
    staleTime: 1000, // Consider data stale after 1 second
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
  
  // Reset new trace count when data is acknowledged
  const acknowledgeNewTraces = () => {
    setNewTraceCount(0);
  };
  
  return {
    ...query,
    lastFetchTime,
    newTraceCount,
    isPollingPaused,
    pausePolling,
    acknowledgeNewTraces,
  };
};

export const useTrace = (traceId: string) => {
  return useQuery({
    queryKey: ['trace', traceId],
    queryFn: async (): Promise<Trace> => {
      try {
        return await apiService.getTrace(traceId);
      } catch (error) {
        console.warn('API unavailable for single trace, using demo data:', error);
        
        // Fallback to demo data
        const demoTraces = generateDemoTraces(100);
        const trace = demoTraces.find(t => t.trace_id === traceId);
        
        if (!trace) {
          throw new Error(`Trace ${traceId} not found`);
        }
        
        return trace;
      }
    },
    enabled: !!traceId,
    staleTime: 30000, // Single traces can be cached longer
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });
};

// Hook for prefetching traces (for performance)
export const usePrefetchTrace = () => {
  const queryClient = useQueryClient();
  
  return (traceId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['trace', traceId],
      queryFn: () => apiService.getTrace(traceId),
      staleTime: 30000,
    });
  };
};
