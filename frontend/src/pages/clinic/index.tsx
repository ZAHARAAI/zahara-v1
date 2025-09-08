import React, { useState } from 'react';
import { Search, Download, RefreshCw, Settings } from 'lucide-react';
import type { Trace } from '../../types/trace';
import { TraceTable } from '../../components/traces/TraceTable';
import { SpanDrawer } from '../../components/traces/SpanDrawer';
import { KPITiles } from '../../components/ui/KPITiles';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { RealTimeIndicator } from '../../components/common/RealTimeIndicator';
import { ExportModal } from '../../components/export/ExportModal';
import { SkeletonDashboard } from '../../components/ui/SkeletonLoader';
import { useTraces } from '../../hooks/useTraces';
import { useDashboardMetrics } from '../../hooks/useDashboardMetrics';
import { apiService } from '../../services/api';
import { generateExportFilename, downloadBlob } from '../../utils/formatters';
import type { ExportRequest } from '../../types/api';
import toast from 'react-hot-toast';

export const AgentClinicPage: React.FC = () => {
  // State management
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: [] as string[],
    models: [] as string[],
    operations: [] as string[],
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);

  // Data fetching with real-time features
  const {
    data: tracesData,
    isLoading: tracesLoading,
    error: tracesError,
    refetch: refetchTraces,
    lastFetchTime,
    newTraceCount,
    isPollingPaused,
    pausePolling,
    acknowledgeNewTraces,
  } = useTraces({
    page: currentPage,
    limit: 25,
    search: searchTerm,
    status: filters.status.length > 0 ? filters.status : undefined,
    models: filters.models.length > 0 ? filters.models : undefined,
    operations: filters.operations.length > 0 ? filters.operations : undefined,
    refetchInterval: 5000, // 5-second polling as specified
  });

  const {
    data: metricsData,
    isLoading: metricsLoading
  } = useDashboardMetrics();

  // Event handlers
  const handleTraceSelect = (trace: Trace) => {
    setSelectedTrace(trace);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedTrace(null);
  };

  const handleTraceOpen = (traceId: string) => {
    // Open trace in new tab/window (future enhancement)
    console.log('Opening trace:', traceId);
  };

  const handleSearch = (value: string) => {
    handleUserInteraction();
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page on search
  };

  const handleFilterChange = (filterType: string, values: string[]) => {
    handleUserInteraction();
    setFilters(prev => ({
      ...prev,
      [filterType]: values
    }));
    setCurrentPage(1); // Reset to first page on filter change
  };

  const handleExport = async (exportRequest: ExportRequest) => {
    const blob = await apiService.exportTraces(exportRequest);
    const filename = generateExportFilename('csv', 'zahara_traces');
    downloadBlob(blob, filename);
    toast.success('Traces exported successfully');
  };

  const handleExportClick = () => {
    handleUserInteraction();
    setShowExportModal(true);
  };

  const handleRefresh = () => {
    refetchTraces();
    acknowledgeNewTraces();
    toast.success('Data refreshed');
  };

  // Handle user interactions that should pause polling
  const handleUserInteraction = () => {
    pausePolling();
  };

  const handleResumePolling = () => {
    acknowledgeNewTraces();
    refetchTraces();
  };

  // Get available filter options from data
  const availableModels = React.useMemo(() => {
    if (!tracesData?.traces) return [];
    const models = new Set(tracesData.traces.map(t => t.model));
    return Array.from(models);
  }, [tracesData]);

  // const availableOperations = React.useMemo(() => {
  //   if (!tracesData?.traces) return [];
  //   const operations = new Set(tracesData.traces.map(t => t.operation));
  //   return Array.from(operations);
  // }, [tracesData]);

  const statusOptions = ['OK', 'ERROR', 'RATE-LIMIT'];

  // Handle pagination
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Show full dashboard skeleton on initial load
  if (tracesLoading && !tracesData && metricsLoading && !metricsData) {
    return <SkeletonDashboard />;
  }

  return (
    <div className="min-h-screen bg-zahara-dark">
      {/* Header */}
      <div className="bg-zahara-card border-b border-zahara-card-light">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zahara-text">Agent Clinic</h1>
              <p className="text-zahara-text-secondary mt-1">
                Monitor and debug your AI agent executions
              </p>
            </div>
            <div className="flex items-center gap-3">
              <RealTimeIndicator
                isPolling={!isPollingPaused}
                lastFetchTime={lastFetchTime}
                newTraceCount={newTraceCount}
                onAcknowledge={handleResumePolling}
              />
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={handleRefresh}
                title="Refresh data"
              >
                Refresh
              </Button>
              <Button
                variant="secondary"
                icon={Settings}
                title="Settings"
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* KPI Metrics */}
        <section>
          <h2 className="text-lg font-semibold text-zahara-text mb-4">
            Performance Overview
          </h2>
          <KPITiles metrics={metricsData} loading={metricsLoading} />
        </section>

        {/* Filters and Search */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zahara-text">
              Trace History
            </h2>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                icon={Download}
                onClick={handleExportClick}
              >
                Export CSV
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <Input
                placeholder="Search traces, operations, or models..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                icon={Search}
                variant="search"
              />
            </div>

            {/* Status Filter */}
            <div>
              <select
                className="input-primary w-full"
                value={filters.status[0] || ''}
                onChange={(e) => handleFilterChange('status', e.target.value ? [e.target.value] : [])}
              >
                <option value="">All Statuses</option>
                {statusOptions.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>

            {/* Model Filter */}
            <div>
              <select
                className="input-primary w-full"
                value={filters.models[0] || ''}
                onChange={(e) => handleFilterChange('models', e.target.value ? [e.target.value] : [])}
              >
                <option value="">All Models</option>
                {availableModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Trace Table */}
        <section>
          {tracesError ? (
            <div className="card p-8 text-center">
              <p className="text-red-500 mb-4">Failed to load traces</p>
              <Button onClick={handleRefresh} variant="primary">
                Retry
              </Button>
            </div>
          ) : (
            <TraceTable
              traces={tracesData?.traces || []}
              loading={tracesLoading}
              onTraceSelect={handleTraceSelect}
              onTraceOpen={handleTraceOpen}
              onUserInteraction={handleUserInteraction}
            />
          )}

          {/* Pagination */}
          {tracesData?.pagination && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-zahara-text-secondary">
                Showing {((tracesData.pagination.page - 1) * tracesData.pagination.limit) + 1} to{' '}
                {Math.min(
                  tracesData.pagination.page * tracesData.pagination.limit,
                  tracesData.pagination.total
                )} of {tracesData.pagination.total} traces
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!tracesData.pagination.hasPrev}
                >
                  Previous
                </Button>
                
                <span className="text-sm text-zahara-text px-3 py-1">
                  Page {tracesData.pagination.page}
                </span>
                
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!tracesData.pagination.hasNext}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Span Drawer */}
      <SpanDrawer
        trace={selectedTrace}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        currentFilters={{
          status: filters.status,
          models: filters.models,
          operations: filters.operations,
          search: searchTerm,
        }}
        totalTraces={tracesData?.pagination?.total || 0}
      />
    </div>
  );
};
