import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  variant?: 'rectangular' | 'circular' | 'text';
  lines?: number;
  animation?: 'pulse' | 'shimmer' | 'wave';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  width,
  height,
  variant = 'rectangular',
  lines = 1,
  animation = 'shimmer',
}) => {
  const baseClasses = 'bg-zahara-card-light';
  
  const variantClasses = {
    rectangular: 'rounded',
    circular: 'rounded-full',
    text: 'rounded',
  };
  
  const animationClasses = {
    pulse: 'animate-pulse',
    shimmer: 'animate-shimmer',
    wave: 'animate-wave',
  };
  
  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;
  
  if (variant === 'text' && lines > 1) {
    return (
      <div className={clsx('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={clsx(
              baseClasses,
              variantClasses[variant],
              animationClasses[animation],
              index === lines - 1 ? 'w-3/4' : 'w-full',
              'h-4'
            )}
            style={index === 0 ? style : undefined}
          />
        ))}
      </div>
    );
  }
  
  return (
    <div
      className={clsx(
        baseClasses,
        variantClasses[variant],
        animationClasses[animation],
        variant === 'text' && 'h-4',
        className
      )}
      style={style}
    />
  );
};

// Specialized skeleton components for common use cases

export const SkeletonKPITile: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('p-6 rounded-lg border border-zahara-card-light bg-zahara-card', className)}>
    <div className="flex items-center justify-between mb-4">
      <Skeleton variant="circular" width={40} height={40} />
      <Skeleton width={20} height={16} />
    </div>
    <div className="space-y-2">
      <Skeleton width="60%" height={16} />
      <div className="flex items-baseline gap-2">
        <Skeleton width={80} height={32} />
        <Skeleton width={40} height={12} />
      </div>
    </div>
  </div>
);

export const SkeletonTraceRow: React.FC<{ className?: string }> = ({ className }) => (
  <tr className={clsx('border-b border-zahara-card-light', className)}>
    <td className="px-6 py-4">
      <Skeleton variant="circular" width={24} height={24} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={120} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={140} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={80} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={100} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={120} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={60} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={80} height={16} />
    </td>
    <td className="px-6 py-4">
      <Skeleton width={80} height={16} />
    </td>
    <td className="px-6 py-4">
      <div className="flex items-center gap-2">
        <Skeleton width={24} height={24} />
        <Skeleton width={24} height={24} />
      </div>
    </td>
  </tr>
);

export const SkeletonTraceTable: React.FC<{ rows?: number; className?: string }> = ({ 
  rows = 10, 
  className 
}) => (
  <div className={clsx('bg-zahara-card rounded-lg border border-zahara-card-light overflow-hidden', className)}>
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-zahara-card-light">
          <tr>
            <th className="px-6 py-3 text-left">
              <Skeleton width={60} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={80} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={100} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={80} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={60} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={100} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={60} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={80} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={60} height={16} />
            </th>
            <th className="px-6 py-3 text-left">
              <Skeleton width={80} height={16} />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <SkeletonTraceRow key={index} />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const SkeletonSpanCard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('bg-zahara-card rounded-lg p-4 border border-zahara-card-light', className)}>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="circular" width={60} height={20} />
        </div>
        <Skeleton width={120} height={16} />
      </div>
      <Skeleton width={24} height={24} />
    </div>
    
    <div className="grid grid-cols-2 gap-4 mb-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton width={16} height={16} />
          <Skeleton width={60} height={12} />
        </div>
        <Skeleton width={80} height={16} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton width={16} height={16} />
          <Skeleton width={40} height={12} />
        </div>
        <Skeleton width={60} height={16} />
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton width={16} height={16} />
          <Skeleton width={50} height={12} />
        </div>
        <Skeleton width={40} height={16} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton width={16} height={16} />
          <Skeleton width={30} height={12} />
        </div>
        <Skeleton width={50} height={16} />
      </div>
    </div>
  </div>
);

export const SkeletonDashboard: React.FC<{ className?: string }> = ({ className }) => (
  <div className={clsx('space-y-8', className)}>
    {/* Header skeleton */}
    <div className="bg-zahara-card border-b border-zahara-card-light p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton width={200} height={28} />
          <Skeleton width={300} height={16} />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton width={120} height={32} />
          <Skeleton width={100} height={32} />
        </div>
      </div>
    </div>
    
    {/* KPI tiles skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, index) => (
        <SkeletonKPITile key={index} />
      ))}
    </div>
    
    {/* Filters skeleton */}
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton width={120} height={24} />
        <Skeleton width={100} height={32} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <Skeleton width="100%" height={40} />
        </div>
        <Skeleton width="100%" height={40} />
        <Skeleton width="100%" height={40} />
      </div>
    </div>
    
    {/* Table skeleton */}
    <SkeletonTraceTable />
  </div>
);
