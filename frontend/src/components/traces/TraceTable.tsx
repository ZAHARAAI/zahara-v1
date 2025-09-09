import React, { useState, useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from '@tanstack/react-table';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown, Copy, ExternalLink, MoreHorizontal } from 'lucide-react';
import type { Trace } from '../../types/trace';
import { StatusBadge } from '../ui/StatusBadge';
import { Button } from '../common/Button';
import { SkeletonTraceTable } from '../ui/SkeletonLoader';
import { 
  formatDuration, 
  formatTokens, 
  formatCost, 
  formatTimestamp,
  copyToClipboard 
} from '../../utils/formatters';
import toast from 'react-hot-toast';

interface TraceTableProps {
  traces: Trace[];
  loading?: boolean;
  onTraceSelect?: (trace: Trace) => void;
  onTraceOpen?: (traceId: string) => void;
  onUserInteraction?: () => void;
}

const columnHelper = createColumnHelper<Trace>();

export const TraceTable: React.FC<TraceTableProps> = ({
  traces,
  loading = false,
  onTraceSelect,
  onTraceOpen,
  onUserInteraction,
}) => {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'timestamp', desc: true }, // Default sort by newest first
  ]);

  const handleCopyTraceId = useCallback(async (traceId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onUserInteraction?.();
    const success = await copyToClipboard(traceId);
    if (success) {
      toast.success('Trace ID copied to clipboard');
    } else {
      toast.error('Failed to copy trace ID');
    }
  }, [onUserInteraction]);

  const handleTraceClick = useCallback((trace: Trace) => {
    onUserInteraction?.();
    onTraceSelect?.(trace);
  }, [onUserInteraction, onTraceSelect]);

  const handleOpenTrace = useCallback((traceId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onUserInteraction?.();
    onTraceOpen?.(traceId);
  }, [onUserInteraction, onTraceOpen]);

  const columns = useMemo(() => [
    columnHelper.accessor('status', {
      header: 'Status',
      size: 100,
      cell: ({ getValue }) => (
        <StatusBadge status={getValue()} size="sm" />
      ),
    }),
    columnHelper.accessor('trace_id', {
      header: 'Trace ID',
      size: 200,
      cell: ({ getValue }) => {
        const traceId = getValue();
        const truncatedId = traceId.length > 12 
          ? `${traceId.slice(0, 8)}...${traceId.slice(-4)}`
          : traceId;
        
        return (
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono text-zahara-text-secondary">
              {truncatedId}
            </code>
            <Button
              variant="ghost"
              size="sm"
              icon={Copy}
              onClick={(e) => handleCopyTraceId(traceId, e)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid="copy-trace-id"
            />
          </div>
        );
      },
    }),
    columnHelper.accessor('operation', {
      header: 'Operation',
      size: 200,
      cell: ({ getValue }) => (
        <span className="text-sm text-zahara-text font-medium">
          {getValue().replace(/_/g, ' ')}
        </span>
      ),
    }),
    columnHelper.accessor('model', {
      header: 'Model',
      size: 150,
      cell: ({ getValue }) => (
        <span className="text-sm text-zahara-text-secondary">
          {getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('total_duration', {
      header: 'Duration',
      size: 100,
      cell: ({ getValue }) => (
        <span className="text-sm font-mono text-zahara-text">
          {formatDuration(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('total_tokens', {
      header: 'Tokens',
      size: 100,
      cell: ({ getValue }) => (
        <span className="text-sm font-mono text-zahara-text">
          {formatTokens(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('total_cost', {
      header: 'Cost',
      size: 100,
      cell: ({ getValue }) => (
        <span className="text-sm font-mono text-zahara-text">
          {formatCost(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('timestamp', {
      header: 'Time',
      size: 120,
      cell: ({ getValue }) => (
        <span className="text-sm text-zahara-text-secondary">
          {formatTimestamp(getValue())}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      size: 80,
      cell: ({ row }) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            icon={ExternalLink}
            onClick={(e) => handleOpenTrace(row.original.trace_id, e)}
            title="Open trace details"
          />
          <Button
            variant="ghost"
            size="sm"
            icon={MoreHorizontal}
            onClick={(e) => e.stopPropagation()}
            title="More actions"
          />
        </div>
      ),
    }),
  ], [handleCopyTraceId, handleOpenTrace]);

  const table = useReactTable({
    data: traces,
    columns,
    state: {
      sorting,
    },
    onSortingChange: (updater) => {
      onUserInteraction?.();
      setSorting(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Loading state with professional skeleton
  if (loading) {
    return <SkeletonTraceTable rows={10} />;
  }

  return (
            <div className="bg-zahara-card rounded-lg border border-zahara-card-light overflow-hidden" data-testid="trace-table">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full">
          <thead className="bg-zahara-card-light">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={clsx(
                      'px-6 py-3 text-left text-xs font-medium text-zahara-text-secondary uppercase tracking-wider',
                      header.column.getCanSort() && 'cursor-pointer hover:text-zahara-text'
                    )}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <span className="text-zahara-text-muted">
                          {header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <div className="w-4 h-4" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zahara-card-light">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <div className="text-zahara-text-secondary">
                    <p className="text-lg font-medium mb-2">No traces found</p>
                    <p className="text-sm">Try adjusting your filters or check back later.</p>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={clsx(
                    'group cursor-pointer hover:bg-zahara-card-light transition-colors',
                    'border-b border-zahara-card-light'
                  )}
                  onClick={() => handleTraceClick(row.original)}
                  data-testid="trace-row"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-6 py-4 whitespace-nowrap"
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
