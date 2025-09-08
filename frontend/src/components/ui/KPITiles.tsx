import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { formatDuration, formatTokens, formatCost, formatPercentage } from '../../utils/formatters';
import type { DashboardMetrics } from '../../types/trace';
import { TrendingUp, TrendingDown, Activity, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { SkeletonKPITile } from './SkeletonLoader';

interface KPITileProps {
  title: string;
  value: string | number;
  previousValue?: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'orange' | 'green' | 'red' | 'blue';
  loading?: boolean;
}

const KPITile: React.FC<KPITileProps> = ({
  title,
  value,
  previousValue,
  icon: Icon,
  trend = 'neutral',
  color = 'orange',
  loading = false,
}) => {
  const [displayValue, setDisplayValue] = useState<string | number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  
  useEffect(() => {
    if (loading) return;
    
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setDisplayValue(value);
      setIsAnimating(false);
    }, 150);
    
    return () => clearTimeout(timer);
  }, [value, loading]);
  
  const colorClasses = {
    orange: 'border-zahara-orange bg-gradient-to-br from-zahara-orange/10 to-zahara-card',
    green: 'border-green-500 bg-gradient-to-br from-green-500/10 to-zahara-card',
    red: 'border-red-500 bg-gradient-to-br from-red-500/10 to-zahara-card',
    blue: 'border-blue-500 bg-gradient-to-br from-blue-500/10 to-zahara-card',
  };
  
  const iconColorClasses = {
    orange: 'text-zahara-orange',
    green: 'text-green-500',
    red: 'text-red-500',
    blue: 'text-blue-500',
  };
  
  const trendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;
  const TrendIcon = trendIcon;
  
  return (
    <div
      className={clsx(
        'p-6 rounded-lg border transition-all duration-300 hover:shadow-zahara',
        colorClasses[color],
        isAnimating && 'animate-pulse-orange'
      )}
      data-testid="kpi-tile"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={clsx('p-2 rounded-lg bg-zahara-card', iconColorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        {TrendIcon && (
          <TrendIcon
            className={clsx(
              'w-4 h-4',
              trend === 'up' ? 'text-green-500' : 'text-red-500'
            )}
          />
        )}
      </div>
      
      <div className="space-y-1">
        <p className="text-sm text-zahara-text-secondary font-medium">{title}</p>
        <div className="flex items-baseline gap-2">
          {loading ? (
            <div className="h-8 w-24 bg-zahara-card-light rounded animate-pulse" />
          ) : (
            <p
              className={clsx(
                'text-2xl font-bold text-zahara-text transition-all duration-1500',
                isAnimating && 'animate-count-up'
              )}
            >
              {displayValue}
            </p>
          )}
          {previousValue && !loading && (
            <span className="text-xs text-zahara-text-muted">
              vs {previousValue}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface KPITilesProps {
  metrics: DashboardMetrics | undefined;
  loading?: boolean;
}

export const KPITiles: React.FC<KPITilesProps> = ({ metrics, loading = false }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="kpi-tiles">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonKPITile key={i} />
        ))}
      </div>
    );
  }
  
  const tiles = [
    {
      title: 'Total Traces (24h)',
      value: metrics?.total_traces_24h?.toLocaleString() || '--',
      icon: Activity,
      color: 'orange' as const,
    },
    {
      title: 'Avg Latency',
      value: metrics ? formatDuration(metrics.avg_latency * 1000) : '--',
      icon: Clock,
      color: 'blue' as const,
    },
    {
      title: 'Success Rate',
      value: metrics ? formatPercentage(metrics.success_rate) : '--',
      icon: TrendingUp,
      color: 'green' as const,
      trend: (metrics?.success_rate || 0) > 90 ? 'up' : 'down' as const,
    },
    {
      title: 'Total Cost (24h)',
      value: metrics ? formatCost(metrics.total_cost_24h) : '--',
      icon: DollarSign,
      color: 'orange' as const,
    },
    {
      title: 'P95 Latency',
      value: metrics ? formatDuration(metrics.p95_latency * 1000) : '--',
      icon: Clock,
      color: 'blue' as const,
    },
    {
      title: 'Error Rate',
      value: metrics ? formatPercentage(metrics.error_rate) : '--',
      icon: AlertTriangle,
      color: 'red' as const,
      trend: (metrics?.error_rate || 0) < 5 ? 'down' : 'up' as const,
    },
    {
      title: 'Total Tokens (24h)',
      value: metrics ? formatTokens(metrics.total_tokens_24h) : '--',
      icon: Activity,
      color: 'orange' as const,
    },
    {
      title: 'Rate Limit Rate',
      value: metrics ? formatPercentage(metrics.rate_limit_rate) : '--',
      icon: AlertTriangle,
      color: 'red' as const,
      trend: (metrics?.rate_limit_rate || 0) < 3 ? 'down' : 'up' as const,
    },
  ];
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="kpi-tiles">
      {tiles.map((tile, index) => (
        <KPITile
          key={index}
          title={tile.title}
          value={tile.value}
          icon={tile.icon}
                color={tile.color}
      trend={tile.trend as 'up' | 'down' | 'neutral' | undefined}
          loading={loading}
        />
      ))}
    </div>
  );
};
