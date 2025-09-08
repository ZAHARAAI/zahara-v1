// Utility functions for formatting data in the Agent Clinic

export const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  } else if (milliseconds < 60000) {
    return `${(milliseconds / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

export const formatTokens = (tokens: number): string => {
  if (tokens < 1000) {
    return tokens.toString();
  } else if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  } else {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
};

export const formatCost = (cost: number | string): string => {
  // Convert string to number if needed
  const numericCost = typeof cost === 'string' ? parseFloat(cost) : cost;
  
  if (isNaN(numericCost)) {
    return '$0.00';
  }
  
  if (numericCost < 0.01) {
    return `$${(numericCost * 1000).toFixed(2)}m`; // Show in millidollars for very small amounts
  } else if (numericCost < 1) {
    return `$${numericCost.toFixed(3)}`;
  } else {
    return `$${numericCost.toFixed(2)}`;
  }
};

export const formatPercentage = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  if (diffMs < 60000) {
    return 'Just now';
  } else if (diffMs < 3600000) {
    const minutes = Math.floor(diffMs / 60000);
    return `${minutes}m ago`;
  } else if (diffMs < 86400000) {
    const hours = Math.floor(diffMs / 3600000);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffMs / 86400000);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }
};

export const formatAbsoluteTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

export const getStatusColor = (status: 'OK' | 'ERROR' | 'RATE-LIMIT'): string => {
  switch (status) {
    case 'OK':
      return 'zahara-orange';
    case 'ERROR':
      return 'red-500';
    case 'RATE-LIMIT':
      return 'amber-500';
    default:
      return 'gray-500';
  }
};

export const getStatusIcon = (status: 'OK' | 'ERROR' | 'RATE-LIMIT'): string => {
  switch (status) {
    case 'OK':
      return 'check';
    case 'ERROR':
      return 'x';
    case 'RATE-LIMIT':
      return 'clock';
    default:
      return 'help-circle';
  }
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (fallbackError) {
      console.error('Copy to clipboard failed:', fallbackError);
      return false;
    }
  }
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const generateExportFilename = (type: 'csv', prefix: string = 'zahara_traces'): string => {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace(/[T:]/g, '_');
  return `${prefix}_${timestamp}.${type}`;
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const highlightSearchTerm = (text: string, searchTerm: string): string => {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark class="bg-zahara-orange bg-opacity-30 text-zahara-text">$1</mark>');
};
