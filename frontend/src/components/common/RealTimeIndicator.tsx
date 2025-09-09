import React from 'react';
import { clsx } from 'clsx';
import { Wifi, Pause, Clock } from 'lucide-react';

interface RealTimeIndicatorProps {
  isPolling: boolean;
  lastFetchTime: Date | null;
  newTraceCount: number;
  className?: string;
  onAcknowledge: () => void;
}

export const RealTimeIndicator: React.FC<RealTimeIndicatorProps> = ({
  isPolling,
  lastFetchTime,
  newTraceCount,
  className,
  onAcknowledge,
}) => {
  const formatLastUpdate = (date: Date | null) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 10) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  const getStatusIcon = () => {
    if (!isPolling) return Pause;
    return Wifi;
  };

  const getStatusColor = () => {
    if (!isPolling) return 'text-amber-500';
    return 'text-zahara-orange';
  };

  const getStatusText = () => {
    if (!isPolling) return 'Paused';
    return 'Live';
  };

  const StatusIcon = getStatusIcon();

  return (
    <div className={clsx('flex items-center gap-3 text-sm', className)} data-testid="real-time-indicator">
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <StatusIcon className={clsx('w-4 h-4', getStatusColor())} />
          {isPolling && (
            <div 
              className="absolute -top-1 -right-1 w-2 h-2 bg-zahara-orange rounded-full animate-pulse-orange"
              style={{
                animation: 'pulse-orange 2s infinite'
              }}
            />
          )}
        </div>
        <span className={clsx('font-medium', getStatusColor())}>
          {getStatusText()}
        </span>
      </div>

      {/* Last Update Time */}
      <div className="flex items-center gap-1 text-zahara-text-secondary">
        <Clock className="w-3 h-3" />
        <span className="text-xs">
          {formatLastUpdate(lastFetchTime)}
        </span>
      </div>

      {/* New Items Badge */}
      {newTraceCount > 0 && (
        <div className="flex items-center">
          <div className="bg-zahara-orange text-white px-2 py-1 rounded-full text-xs font-medium animate-pulse">
            {newTraceCount} new
          </div>
        </div>
      )}

      {/* Resume Button */}
      {!isPolling && (
        <button
          onClick={onAcknowledge}
          className="text-xs text-zahara-orange hover:text-zahara-text transition-colors underline"
        >
          Resume updates
        </button>
      )}
    </div>
  );
};
