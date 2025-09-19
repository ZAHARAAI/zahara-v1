'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface RunData {
  request_id: string
  status: 'success' | 'error' | 'running' | 'pending'
  task: string
  duration_ms: number
  timestamp: string
  retries: number
  error?: string
  result?: any
}

export default function Clinic() {
  const [runs, setRuns] = useState<RunData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const searchParams = useSearchParams()

  // Mock data for demonstration
  const mockRuns: RunData[] = [
    {
      request_id: 'req-001',
      status: 'success',
      task: 'Process user data',
      duration_ms: 1250,
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      retries: 0,
      result: { processed: 150, errors: 0 }
    },
    {
      request_id: 'req-002',
      status: 'error',
      task: 'Generate report',
      duration_ms: 5000,
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      retries: 2,
      error: 'Connection timeout'
    },
    {
      request_id: 'req-003',
      status: 'running',
      task: 'Data analysis',
      duration_ms: 0,
      timestamp: new Date(Date.now() - 1000 * 30).toISOString(),
      retries: 0
    },
    {
      request_id: 'req-004',
      status: 'success',
      task: 'File upload',
      duration_ms: 800,
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      retries: 1,
      result: { files_uploaded: 5, size: '2.3MB' }
    }
  ]

  useEffect(() => {
    // Simulate loading runs data
    const loadRuns = async () => {
      setIsLoading(true)
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      setRuns(mockRuns)
      setIsLoading(false)
    }

    loadRuns()

    // Check if we have a specific request ID from URL params
    const requestId = searchParams.get('requestId')
    if (requestId) {
      setSelectedRequestId(requestId)
    }
  }, [searchParams])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="badge-success">Success</span>
      case 'error':
        return <span className="badge-error">Error</span>
      case 'running':
        return <span className="badge-warning">Running</span>
      case 'pending':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Pending</span>
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">Unknown</span>
    }
  }

  const formatDuration = (ms: number) => {
    if (ms === 0) return '-'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const selectedRun = runs.find(run => run.request_id === selectedRequestId)

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900">Clinic</h1>
          <div className="text-sm text-neutral-500">
            Monitor and analyze agent runs
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Runs Table */}
            <div className="lg:col-span-2">
              <div className="card">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">Recent Runs</h2>
                
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Request ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Task
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Retries
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Timestamp
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {runs.map((run) => (
                        <tr
                          key={run.request_id}
                          className={`cursor-pointer hover:bg-neutral-50 ${
                            selectedRequestId === run.request_id ? 'bg-primary-50' : ''
                          }`}
                          onClick={() => setSelectedRequestId(run.request_id)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-neutral-900">
                            {run.request_id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                            {run.task}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(run.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                            {formatDuration(run.duration_ms)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                            {run.retries}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {formatTimestamp(run.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Run Details */}
            <div className="lg:col-span-1">
              <div className="card">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">Run Details</h2>
                
                {selectedRun ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Request ID
                      </label>
                      <p className="text-sm font-mono text-neutral-900 bg-neutral-100 p-2 rounded">
                        {selectedRun.request_id}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Task
                      </label>
                      <p className="text-sm text-neutral-900">{selectedRun.task}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Status
                      </label>
                      <div>{getStatusBadge(selectedRun.status)}</div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Duration
                      </label>
                      <p className="text-sm text-neutral-900">{formatDuration(selectedRun.duration_ms)}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Retries
                      </label>
                      <p className="text-sm text-neutral-900">{selectedRun.retries}</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Timestamp
                      </label>
                      <p className="text-sm text-neutral-900">{formatTimestamp(selectedRun.timestamp)}</p>
                    </div>
                    
                    {selectedRun.error && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Error
                        </label>
                        <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {selectedRun.error}
                        </p>
                      </div>
                    )}
                    
                    {selectedRun.result && (
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Result
                        </label>
                        <pre className="text-xs text-neutral-700 bg-neutral-100 p-2 rounded overflow-auto">
                          {JSON.stringify(selectedRun.result, null, 2)}
                        </pre>
                      </div>
                    )}
                    
                    <div className="pt-4 border-t border-neutral-200">
                      <a
                        href={`http://localhost:16686/trace/${selectedRun.request_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full text-center"
                      >
                        View in Jaeger
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-neutral-500 py-8">
                    <p>Select a run to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
