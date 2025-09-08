import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { Trace, TraceListResponse, DashboardMetrics, FlowiseExecution } from '../types/trace';
import type { ApiResponse, ApiError, ExportRequest } from '../types/api';
import toast from 'react-hot-toast';

class ApiService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    // Default to demo API key as specified in requirements
    this.apiKey = import.meta.env.VITE_API_KEY || 'zhr_demo_clinic_2024_observability_key';
    
    this.client = axios.create({
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.headers['X-API-Key'] = this.apiKey;
      }
      return config;
    });

    // Add response interceptor for error handling with toast notifications
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status || 500;
        const message = (error.response?.data as Record<string, unknown>)?.message as string || error.message || 'An error occurred';
        
        // Show appropriate toast notifications based on error type
        switch (status) {
          case 401:
            toast.error('Authentication failed. Please check your API key.');
            break;
          case 429:
            toast.error('Rate limit exceeded. Please try again later.');
            break;
          case 403:
            toast.error('Access denied. Check your permissions.');
            break;
          case 404:
            toast.error('Resource not found.');
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            toast.error('Server error. Please contact support if this persists.');
            break;
          default:
            if (status >= 400) {
              toast.error(message);
            }
        }
        
        const apiError: ApiError = {
          message,
          status,
          code: (error.response?.data as Record<string, unknown>)?.code as string,
        };
        return Promise.reject(apiError);
      }
    );
  }

  // Auth methods
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  // Trace endpoints
  async getTraces(params?: {
    page?: number;
    limit?: number;
    status?: string[];
    models?: string[];
    operations?: string[];
    search?: string;
    dateRange?: { start: string; end: string };
  }): Promise<TraceListResponse> {
    const response = await this.client.get<TraceListResponse>('/traces', {
      params: {
        page: params?.page || 1,
        limit: params?.limit || 25,
        ...(params?.status && { status: params.status.join(',') }),
        ...(params?.models && { models: params.models.join(',') }),
        ...(params?.operations && { operations: params.operations.join(',') }),
        ...(params?.search && { search: params.search }),
        ...(params?.dateRange && {
          start_date: params.dateRange.start,
          end_date: params.dateRange.end,
        }),
      },
    });
    // The traces endpoint returns data directly, not wrapped in ApiResponse
    return response.data;
  }

  async getTrace(traceId: string): Promise<Trace> {
    const response = await this.client.get<ApiResponse<Trace>>(`/traces/${traceId}`);
    return response.data.data;
  }

  async getTraceSpans(traceId: string): Promise<Trace['spans']> {
    const response = await this.client.get<ApiResponse<Trace['spans']>>(`/traces/${traceId}/spans`);
    return response.data.data;
  }

  // Metrics endpoints
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const response = await this.client.get<ApiResponse<DashboardMetrics>>('/traces/metrics/aggregate');
    return response.data.data;
  }

  // Export endpoints
  async exportTraces(request: ExportRequest): Promise<Blob> {
    const response = await this.client.post('/traces/export', request, {
      responseType: 'blob',
      headers: {
        'Accept': 'text/csv',
      },
    });
    return response.data;
  }

  // Flowise endpoints
  async getFlowiseExecutions(): Promise<FlowiseExecution[]> {
    const response = await this.client.get<ApiResponse<FlowiseExecution[]>>('/flowise/executions');
    return response.data.data;
  }

  // Health check
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    const response = await this.client.get<ApiResponse<{ status: string; timestamp: string }>>('/health');
    return response.data.data;
  }

}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;
