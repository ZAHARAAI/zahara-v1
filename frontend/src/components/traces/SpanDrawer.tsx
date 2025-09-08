import React from 'react';
import { X, Copy, Clock, Zap, DollarSign, Server, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import type { Trace, Span } from '../../types/trace';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../common/Button';
import { 
  formatDuration, 
  formatTokens, 
  formatCost, 
  formatAbsoluteTimestamp,
  copyToClipboard 
} from '../../utils/formatters';
import toast from 'react-hot-toast';

interface SpanDrawerProps {
  trace: Trace | null;
  isOpen: boolean;
  onClose: () => void;
}

export const SpanDrawer: React.FC<SpanDrawerProps> = ({
  trace,
  isOpen,
  onClose,
}) => {
  const handleCopy = async (text: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      toast.success(`${label} copied to clipboard`);
    } else {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  if (!trace) return null;

  const SpanCard: React.FC<{ span: Span; index: number }> = ({ span, index }) => (
    <div className="bg-zahara-card-light rounded-lg p-4 border border-zahara-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-zahara-orange text-white rounded-full flex items-center justify-center text-xs font-medium">
              {index + 1}
            </div>
            <StatusBadge status={span.status} size="sm" />
          </div>
          <h4 className="text-sm font-medium text-zahara-text">
            {span.operation.replace(/_/g, ' ')}
          </h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={Copy}
          onClick={() => handleCopy(span.span_id, 'Span ID')}
          title="Copy span ID"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zahara-text-secondary">
            <Clock className="w-3 h-3" />
            <span>Duration</span>
          </div>
          <p className="text-sm font-mono text-zahara-text">
            {formatDuration(span.duration)}
          </p>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zahara-text-secondary">
            <Zap className="w-3 h-3" />
            <span>Tokens</span>
          </div>
          <p className="text-sm font-mono text-zahara-text">
            {formatTokens(span.tokens)}
          </p>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zahara-text-secondary">
            <DollarSign className="w-3 h-3" />
            <span>Cost</span>
          </div>
          <p className="text-sm font-mono text-zahara-text">
            {formatCost(span.cost)}
          </p>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-zahara-text-secondary">
            <Server className="w-3 h-3" />
            <span>Provider</span>
          </div>
          <p className="text-sm text-zahara-text">
            {span.provider}
          </p>
        </div>
      </div>

      <div className="space-y-2 text-xs text-zahara-text-secondary">
        <div className="flex justify-between">
          <span>Start:</span>
          <span className="font-mono">{formatAbsoluteTimestamp(span.start_time)}</span>
        </div>
        <div className="flex justify-between">
          <span>End:</span>
          <span className="font-mono">{formatAbsoluteTimestamp(span.end_time)}</span>
        </div>
        <div className="flex justify-between">
          <span>Model:</span>
          <span className="font-mono">{span.model}</span>
        </div>
      </div>

      {span.metadata && Object.keys(span.metadata).length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-zahara-text-secondary cursor-pointer hover:text-zahara-text">
            Metadata
          </summary>
          <pre className="mt-2 p-2 bg-zahara-card rounded text-xs text-zahara-text-muted overflow-x-auto">
            {JSON.stringify(span.metadata, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          'fixed inset-0 bg-black bg-opacity-50 transition-opacity z-40',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed right-0 top-0 h-full w-full max-w-2xl bg-zahara-dark border-l border-zahara-card-light transform transition-transform duration-300 ease-in-out z-50 custom-scrollbar overflow-y-auto',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        data-testid="span-drawer"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-zahara-orange" />
              <h2 className="text-lg font-semibold text-zahara-text">Trace Details</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={X}
              onClick={onClose}
              title="Close drawer"
              data-testid="close-drawer"
            />
          </div>

          {/* Trace Overview */}
          <div className="bg-zahara-card rounded-lg p-4 border border-zahara-card-light mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <StatusBadge status={trace.status} />
                <h3 className="text-lg font-medium text-zahara-text">
                  {trace.operation.replace(/_/g, ' ')}
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={Copy}
                onClick={() => handleCopy(trace.trace_id, 'Trace ID')}
                title="Copy trace ID"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-zahara-text-secondary mb-1">Total Duration</p>
                  <p className="text-lg font-mono text-zahara-text">
                    {formatDuration(trace.total_duration)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zahara-text-secondary mb-1">Total Tokens</p>
                  <p className="text-lg font-mono text-zahara-text">
                    {formatTokens(trace.total_tokens)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-zahara-text-secondary mb-1">Total Cost</p>
                  <p className="text-lg font-mono text-zahara-text">
                    {formatCost(trace.total_cost)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zahara-text-secondary mb-1">Model</p>
                  <p className="text-sm text-zahara-text">{trace.model}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-zahara-card-light">
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zahara-text-secondary">Timestamp:</span>
                  <span className="font-mono text-zahara-text-muted">
                    {formatAbsoluteTimestamp(trace.timestamp)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zahara-text-secondary">Total Spans:</span>
                  <span className="text-zahara-text">{trace.spans.length}</span>
                </div>
                {trace.workflow_id && (
                  <div className="flex justify-between">
                    <span className="text-zahara-text-secondary">Workflow ID:</span>
                    <span className="font-mono text-zahara-text-muted">{trace.workflow_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Spans */}
          <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-zahara-text flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Spans ({trace.spans.length})
            </h3>
            
            {trace.spans.length === 0 ? (
              <div className="text-center py-8 text-zahara-text-secondary">
                <p>No spans found for this trace</p>
              </div>
            ) : (
              <div className="space-y-3">
                {trace.spans.map((span, index) => (
                  <SpanCard key={span.span_id} span={span} index={index} />
                ))}
              </div>
            )}
          </div>

          {/* Events */}
          {trace.events.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-zahara-text flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Events ({trace.events.length})
              </h3>
              
              <div className="space-y-2">
                {trace.events.map((event) => (
                  <div key={event.event_id} className="bg-zahara-card-light rounded p-3 border border-zahara-card">
                    <div className="flex items-center justify-between mb-2">
                      <span className={clsx(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        event.level === 'error' ? 'bg-red-500 text-white' :
                        event.level === 'warning' ? 'bg-amber-500 text-white' :
                        'bg-blue-500 text-white'
                      )}>
                        {event.level.toUpperCase()}
                      </span>
                      <span className="text-xs text-zahara-text-secondary font-mono">
                        {formatAbsoluteTimestamp(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-zahara-text">{event.message}</p>
                    {event.metadata && (
                      <details className="mt-2">
                        <summary className="text-xs text-zahara-text-secondary cursor-pointer">
                          Event Data
                        </summary>
                        <pre className="mt-1 p-2 bg-zahara-card rounded text-xs text-zahara-text-muted overflow-x-auto">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
