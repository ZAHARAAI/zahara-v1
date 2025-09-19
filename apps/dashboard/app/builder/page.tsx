'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Builder() {
  const [config, setConfig] = useState({
    name: '',
    description: '',
    type: 'workflow',
    steps: [],
    settings: {
      timeout: 30,
      retries: 3,
      enableLogging: true
    }
  })
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const router = useRouter()

  const handleConfigChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSettingsChange = (field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [field]: value
      }
    }))
  }

  const handleSaveAndTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    
    try {
      // Simulate API call to agent-custom
      const response = await fetch(`${process.env.NEXT_PUBLIC_AGENT_CUSTOM_URL}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID()
        },
        body: JSON.stringify({
          task: `Build and test: ${config.name}`,
          parameters: {
            description: config.description,
            type: config.type,
            settings: config.settings
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        setTestResult({
          success: true,
          requestId: result.request_id,
          message: 'Configuration saved and test completed successfully!'
        })
        
        // Redirect to clinic after a short delay
        setTimeout(() => {
          router.push(`/clinic?requestId=${result.request_id}`)
        }, 2000)
      } else {
        throw new Error('Test failed')
      }
    } catch (error) {
      console.error('Test error:', error)
      setTestResult({
        success: false,
        message: 'Test failed. Please check your configuration and try again.'
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 mb-8">Agent Builder</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 mb-2">
                    Configuration Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={config.name}
                    onChange={(e) => handleConfigChange('name', e.target.value)}
                    className="input-field"
                    placeholder="Enter configuration name"
                  />
                </div>
                
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    value={config.description}
                    onChange={(e) => handleConfigChange('description', e.target.value)}
                    className="input-field"
                    rows={3}
                    placeholder="Describe your configuration"
                  />
                </div>
                
                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-neutral-700 mb-2">
                    Type
                  </label>
                  <select
                    id="type"
                    value={config.type}
                    onChange={(e) => handleConfigChange('type', e.target.value)}
                    className="input-field"
                  >
                    <option value="workflow">Workflow</option>
                    <option value="automation">Automation</option>
                    <option value="integration">Integration</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="card">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="timeout" className="block text-sm font-medium text-neutral-700 mb-2">
                    Timeout (seconds)
                  </label>
                  <input
                    type="number"
                    id="timeout"
                    value={config.settings.timeout}
                    onChange={(e) => handleSettingsChange('timeout', parseInt(e.target.value))}
                    className="input-field"
                    min="1"
                    max="300"
                  />
                </div>
                
                <div>
                  <label htmlFor="retries" className="block text-sm font-medium text-neutral-700 mb-2">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    id="retries"
                    value={config.settings.retries}
                    onChange={(e) => handleSettingsChange('retries', parseInt(e.target.value))}
                    className="input-field"
                    min="0"
                    max="10"
                  />
                </div>
                
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={config.settings.enableLogging}
                      onChange={(e) => handleSettingsChange('enableLogging', e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-neutral-700">Enable Detailed Logging</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Preview Panel */}
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">Preview</h2>
              
              <div className="bg-neutral-50 rounded-lg p-4">
                <pre className="text-sm text-neutral-700 whitespace-pre-wrap">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </div>
            
            <div className="card">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">Actions</h2>
              
              <div className="space-y-4">
                <button
                  onClick={handleSaveAndTest}
                  disabled={!config.name || isTesting}
                  className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTesting ? 'Testing...' : 'Save & Test'}
                </button>
                
                {testResult && (
                  <div className={`p-4 rounded-lg ${
                    testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center">
                      <div className={`w-4 h-4 rounded-full mr-3 ${
                        testResult.success ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <p className={`text-sm font-medium ${
                          testResult.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                          {testResult.message}
                        </p>
                        {testResult.requestId && (
                          <p className="text-xs text-green-600 mt-1">
                            Request ID: {testResult.requestId}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
