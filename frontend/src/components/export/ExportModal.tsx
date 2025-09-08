import React, { useState } from 'react';
import { X, Download, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import type { ExportRequest } from '../../types/api';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (request: ExportRequest) => Promise<void>;
  currentFilters: {
    status: string[];
    models: string[];
    operations: string[];
    search: string;
  };
  totalTraces: number;
}

type ExportStep = 'configure' | 'processing' | 'complete' | 'error';

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  currentFilters,
  totalTraces,
}) => {
  const [step, setStep] = useState<ExportStep>('configure');
  const [progress, setProgress] = useState(0);
  const [includeSpans, setIncludeSpans] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleExport = async () => {
    try {
      setStep('processing');
      setProgress(0);

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const exportRequest: ExportRequest = {
        format: 'csv',
        filters: {
          status: currentFilters.status.length > 0 ? currentFilters.status : undefined,
          models: currentFilters.models.length > 0 ? currentFilters.models : undefined,
          operations: currentFilters.operations.length > 0 ? currentFilters.operations : undefined,
          search: currentFilters.search || undefined,
        },
        options: {
          includeSpans,
          includeEvents,
          includeMetadata,
        },
      };

      await onExport(exportRequest);
      
      clearInterval(progressInterval);
      setProgress(100);
      setStep('complete');
      
      // Auto-close after success
      setTimeout(() => {
        onClose();
        setStep('configure');
        setProgress(0);
      }, 2000);
      
    } catch (error) {
      setStep('error');
      setErrorMessage(error instanceof Error ? error.message : 'Export failed');
      setProgress(0);
    }
  };

  const handleClose = () => {
    if (step !== 'processing') {
      onClose();
      setStep('configure');
      setProgress(0);
      setErrorMessage('');
    }
  };

  const getEstimatedFileSize = () => {
    const baseSize = totalTraces * 0.5; // ~0.5KB per trace
    const multiplier = 1 + (includeSpans ? 0.8 : 0) + (includeEvents ? 0.3 : 0) + (includeMetadata ? 0.2 : 0);
    return Math.round(baseSize * multiplier);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" data-testid="export-modal">
      <div className="bg-zahara-card rounded-lg shadow-zahara-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zahara-card-light">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-zahara-orange" />
            <h2 className="text-lg font-semibold text-zahara-text">Export Traces</h2>
          </div>
          {step !== 'processing' && (
            <button
              onClick={handleClose}
              className="text-zahara-text-secondary hover:text-zahara-text transition-colors"
              data-testid="close-modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {step === 'configure' && (
            <div className="space-y-6">
              {/* Export Info */}
              <div className="bg-zahara-dark p-4 rounded-lg">
                <h3 className="text-sm font-medium text-zahara-text mb-2">Export Summary</h3>
                <div className="text-sm text-zahara-text-secondary space-y-1">
                  <div>Traces to export: <span className="text-zahara-orange">{totalTraces}</span></div>
                  <div>Estimated size: <span className="text-zahara-orange">{getEstimatedFileSize()} KB</span></div>
                  <div>Format: <span className="text-zahara-orange">CSV</span></div>
                </div>
              </div>

              {/* Export Options */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-zahara-text">Include in Export</h3>
                
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-zahara-text-secondary">Span details</span>
                    <input
                      type="checkbox"
                      checked={includeSpans}
                      onChange={(e) => setIncludeSpans(e.target.checked)}
                      className="w-4 h-4 text-zahara-orange bg-transparent border border-zahara-card-light rounded focus:ring-zahara-orange focus:ring-2"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-zahara-text-secondary">Events and logs</span>
                    <input
                      type="checkbox"
                      checked={includeEvents}
                      onChange={(e) => setIncludeEvents(e.target.checked)}
                      className="w-4 h-4 text-zahara-orange bg-transparent border border-zahara-card-light rounded focus:ring-zahara-orange focus:ring-2"
                    />
                  </label>
                  
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-zahara-text-secondary">Metadata fields</span>
                    <input
                      type="checkbox"
                      checked={includeMetadata}
                      onChange={(e) => setIncludeMetadata(e.target.checked)}
                      className="w-4 h-4 text-zahara-orange bg-transparent border border-zahara-card-light rounded focus:ring-zahara-orange focus:ring-2"
                    />
                  </label>
                </div>
              </div>

              {/* Active Filters */}
              {(currentFilters.status.length > 0 || currentFilters.models.length > 0 || currentFilters.operations.length > 0 || currentFilters.search) && (
                <div className="bg-zahara-dark p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-zahara-text mb-2">Active Filters</h3>
                  <div className="text-sm text-zahara-text-secondary space-y-1">
                    {currentFilters.search && (
                      <div>Search: <span className="text-zahara-orange">"{currentFilters.search}"</span></div>
                    )}
                    {currentFilters.status.length > 0 && (
                      <div>Status: <span className="text-zahara-orange">{currentFilters.status.join(', ')}</span></div>
                    )}
                    {currentFilters.models.length > 0 && (
                      <div>Models: <span className="text-zahara-orange">{currentFilters.models.join(', ')}</span></div>
                    )}
                    {currentFilters.operations.length > 0 && (
                      <div>Operations: <span className="text-zahara-orange">{currentFilters.operations.join(', ')}</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-zahara-orange/20 rounded-full flex items-center justify-center">
                <Download className="w-8 h-8 text-zahara-orange animate-pulse" />
              </div>
              <h3 className="text-lg font-medium text-zahara-text">Preparing Export</h3>
              <p className="text-zahara-text-secondary">Processing {totalTraces} traces...</p>
              
              {/* Progress Bar */}
              <div className="w-full bg-zahara-card-light rounded-full h-2">
                <div 
                  className="bg-zahara-orange h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                  data-testid="progress-bar"
                />
              </div>
              <p className="text-sm text-zahara-text-secondary">{progress}% complete</p>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-lg font-medium text-zahara-text">Export Complete!</h3>
              <p className="text-zahara-text-secondary">Your CSV file has been downloaded successfully.</p>
            </div>
          )}

          {step === 'error' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-medium text-zahara-text">Export Failed</h3>
              <p className="text-zahara-text-secondary">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-zahara-card-light">
          {step === 'configure' && (
            <>
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                variant="primary" 
                icon={Download}
                onClick={handleExport}
              >
                Export CSV
              </Button>
            </>
          )}
          
          {step === 'error' && (
            <Button variant="primary" onClick={() => setStep('configure')}>
              Try Again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
