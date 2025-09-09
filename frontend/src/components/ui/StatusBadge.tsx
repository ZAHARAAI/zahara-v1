import React from 'react';
import { Check, X, Clock } from 'lucide-react';
import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: 'OK' | 'ERROR' | 'RATE-LIMIT';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'OK':
        return {
          icon: Check,
          text: 'OK',
          bgColor: 'bg-zahara-orange',
          textColor: 'text-white',
          borderColor: 'border-zahara-orange',
        };
      case 'ERROR':
        return {
          icon: X,
          text: 'ERROR',
          bgColor: 'bg-red-500',
          textColor: 'text-white',
          borderColor: 'border-red-500',
        };
      case 'RATE-LIMIT':
        return {
          icon: Clock,
          text: 'RATE LIMITED',
          bgColor: 'bg-amber-500',
          textColor: 'text-white',
          borderColor: 'border-amber-500',
        };
      default:
        return {
          icon: Clock,
          text: 'UNKNOWN',
          bgColor: 'bg-gray-500',
          textColor: 'text-white',
          borderColor: 'border-gray-500',
        };
    }
  };
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-2 py-1 text-xs gap-1.5',
    lg: 'px-3 py-1.5 text-sm gap-2',
  };
  
  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };
  
  const config = getStatusConfig();
  const Icon = config.icon;
  
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeClasses[size],
        className
      )}
      data-testid="status-badge"
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{config.text}</span>
    </span>
  );
};
