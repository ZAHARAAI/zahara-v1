'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UploadWizard() {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    taskName: '',
    description: '',
    parameters: {}
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  const steps = [
    { id: 1, name: 'Task Details', description: 'Define your task' },
    { id: 2, name: 'Configuration', description: 'Set parameters' },
    { id: 3, name: 'Review & Upload', description: 'Review and submit' }
  ]

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      // Simulate API call to agent-custom
      const response = await fetch(`${process.env.NEXT_PUBLIC_AGENT_CUSTOM_URL}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID()
        },
        body: JSON.stringify({
          task: formData.taskName,
          parameters: {
            description: formData.description,
            ...formData.parameters
          }
        })
      })

      if (response.ok) {
        const result = await response.json()
        // Redirect to clinic with the request ID
        router.push(`/clinic?requestId=${result.request_id}`)
      } else {
        throw new Error('Upload failed')
      }
    } catch (error) {
      console.error('Upload error:', error)
      alert('Upload failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div>
              <label htmlFor="taskName" className="block text-sm font-medium text-neutral-700 mb-2">
                Task Name
              </label>
              <input
                type="text"
                id="taskName"
                value={formData.taskName}
                onChange={(e) => handleInputChange('taskName', e.target.value)}
                className="input-field"
                placeholder="Enter task name"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="input-field"
                rows={4}
                placeholder="Describe your task"
                required
              />
            </div>
          </div>
        )
      
      case 2:
        return (
          <div className="space-y-6">
            <div>
              <label htmlFor="timeout" className="block text-sm font-medium text-neutral-700 mb-2">
                Timeout (seconds)
              </label>
              <input
                type="number"
                id="timeout"
                value={formData.parameters.timeout || 30}
                onChange={(e) => handleInputChange('parameters', { ...formData.parameters, timeout: parseInt(e.target.value) })}
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
                value={formData.parameters.retries || 3}
                onChange={(e) => handleInputChange('parameters', { ...formData.parameters, retries: parseInt(e.target.value) })}
                className="input-field"
                min="0"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                <input
                  type="checkbox"
                  checked={formData.parameters.enableLogging || false}
                  onChange={(e) => handleInputChange('parameters', { ...formData.parameters, enableLogging: e.target.checked })}
                  className="mr-2"
                />
                Enable Detailed Logging
              </label>
            </div>
          </div>
        )
      
      case 3:
        return (
          <div className="space-y-6">
            <div className="bg-neutral-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Review Your Task</h3>
              <div className="space-y-3">
                <div>
                  <span className="font-medium text-neutral-700">Task Name:</span>
                  <span className="ml-2 text-neutral-900">{formData.taskName}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700">Description:</span>
                  <span className="ml-2 text-neutral-900">{formData.description}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700">Timeout:</span>
                  <span className="ml-2 text-neutral-900">{formData.parameters.timeout || 30}s</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700">Max Retries:</span>
                  <span className="ml-2 text-neutral-900">{formData.parameters.retries || 3}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-700">Detailed Logging:</span>
                  <span className="ml-2 text-neutral-900">{formData.parameters.enableLogging ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>
          </div>
        )
      
      default:
        return null
    }
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 mb-8">Upload Wizard</h1>
        
        {/* Progress Steps */}
        <div className="mb-8">
          <nav aria-label="Progress">
            <ol className="flex items-center">
              {steps.map((step, stepIdx) => (
                <li key={step.name} className={`${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''} relative`}>
                  <div className="flex items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      step.id < currentStep ? 'bg-primary-600' : 
                      step.id === currentStep ? 'bg-primary-600' : 
                      'bg-neutral-200'
                    }`}>
                      <span className={`text-sm font-medium ${
                        step.id <= currentStep ? 'text-white' : 'text-neutral-500'
                      }`}>
                        {step.id}
                      </span>
                    </div>
                    <div className="ml-4 min-w-0">
                      <p className={`text-sm font-medium ${
                        step.id <= currentStep ? 'text-primary-600' : 'text-neutral-500'
                      }`}>
                        {step.name}
                      </p>
                      <p className="text-sm text-neutral-500">{step.description}</p>
                    </div>
                  </div>
                  {stepIdx !== steps.length - 1 && (
                    <div className="absolute top-4 left-4 -ml-px mt-0.5 h-full w-0.5 bg-neutral-300" />
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Step Content */}
        <div className="card">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              disabled={!formData.taskName || !formData.description}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Uploading...' : 'Upload & Run'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
