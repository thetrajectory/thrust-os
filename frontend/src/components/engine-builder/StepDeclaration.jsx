// components/engine-builder/StepDeclaration.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serviceRegistry } from '../../services/engine-builder/serviceRegistry';
import storageUtils from '../../utils/storageUtils';

const StepDeclaration = () => {
  const navigate = useNavigate();
  const [engineState, setEngineState] = useState(null);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');

  // Setup default steps based on engine type
  const setupDefaultSteps = (engineType) => {
    const commonSteps = [
      { service: 'promptAnalysis', config: {}, filter: null },
      { service: 'apolloEnrichment', config: {}, filter: null }
    ];

    if (engineType === 'Advisor Engine') {
      return [
        ...commonSteps,
        { service: 'serperEnrichment', config: {}, filter: null },
        { service: 'jobOpenings', config: {}, filter: null }
      ];
    }

    if (engineType === 'Account Engine') {
      return [
        ...commonSteps,
        { service: 'serperEnrichment', config: {}, filter: null },
        { service: 'financialData', config: {}, filter: null }
      ];
    }

    if (engineType === 'Advisor Finder') {
      return [
        ...commonSteps,
        { service: 'serperEnrichment', config: {}, filter: null }
      ];
    }

    // Default for any other engine type
    return [
      ...commonSteps,
      { service: 'serperEnrichment', config: {}, filter: null },
      { service: 'financialData', config: {}, filter: null },
      { service: 'jobOpenings', config: {}, filter: null }
    ];
  };

  useEffect(() => {
    // Load current engine state
    const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    if (!state || !state.inputSchema) {
      // If no state or missing input schema, redirect
      navigate('/engine-builder/input-schema');
      return;
    }
    setEngineState(state);

    // Initialize with default steps if none exist
    if (!state.steps || state.steps.length === 0) {
      const defaultSteps = setupDefaultSteps(state.engineType);
      setSteps(defaultSteps);
    } else {
      setSteps(state.steps);
    }
  }, [navigate]);

  const handleBack = () => {
    navigate('/engine-builder/input-schema');
  };

  const handleServiceChange = (index, service) => {
    const updatedSteps = [...steps];
    updatedSteps[index].service = service;
    // Reset config when service changes
    updatedSteps[index].config = {};
    updatedSteps[index].filter = null;
    setSteps(updatedSteps);
  };

  const addStep = () => {
    if (steps.length >= 8) {
      setError('Maximum 8 steps allowed');
      return;
    }
    setSteps([...steps, { service: '', config: {}, filter: null }]);
  };

  const removeStep = (index) => {
    if (steps.length <= 1) {
      setError('At least one step is required');
      return;
    }

    const updatedSteps = steps.filter((_, i) => i !== index);
    setSteps(updatedSteps);
    setError('');
  };

  const moveStepUp = (index) => {
    if (index === 0) return;

    const updatedSteps = [...steps];
    [updatedSteps[index], updatedSteps[index - 1]] = [updatedSteps[index - 1], updatedSteps[index]];
    setSteps(updatedSteps);
  };

  const moveStepDown = (index) => {
    if (index === steps.length - 1) return;

    const updatedSteps = [...steps];
    [updatedSteps[index], updatedSteps[index + 1]] = [updatedSteps[index + 1], updatedSteps[index]];
    setSteps(updatedSteps);
  };

  const handleSubmit = () => {
    // Validate all steps have a service selected
    const emptySteps = steps.some(step => !step.service);
    if (emptySteps) {
      setError('All steps must have a service selected');
      return;
    }

    // Update engine state
    const updatedState = {
      ...engineState,
      steps: steps
    };

    // Save to storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

    // Navigate to first step configuration
    navigate('/engine-builder/configure-step/0');
  };

  const getStepDescription = (serviceId) => {
    const service = serviceRegistry[serviceId];
    return service ? service.description : '';
  };

  if (!engineState) return null;

  return (
    <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>

      <h2 className="text-4xl font-bold text-center mb-8">
        Configure Your Processing Pipeline
      </h2>

      <div className="w-full mb-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">Engine: {engineState.engineName}</h3>
        <p className="text-sm text-gray-600">
          Define the sequence of processing steps for your {engineState.engineType}.
          Each step will be executed in order on your uploaded data.
        </p>
      </div>

      <div className="w-full mb-8">
        <h3 className="text-xl font-medium mb-4">Processing Steps</h3>

        {steps.map((step, index) => (
          <div key={index} className="mb-4 p-4 border rounded-lg bg-white">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-lg">Step {index + 1}</h4>
              <div className="flex items-center space-x-2">
                {index > 0 && (
                  <button
                    onClick={() => moveStepUp(index)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                    title="Move up"
                  >
                    ↑
                  </button>
                )}
                {index < steps.length - 1 && (
                  <button
                    onClick={() => moveStepDown(index)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                    title="Move down"
                  >
                    ↓
                  </button>
                )}
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(index)}
                    className="text-red-500 hover:text-red-700 text-sm"
                    title="Remove step"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-start space-x-4">
              <div className="flex-grow">
                <select
                  value={step.service}
                  onChange={(e) => handleServiceChange(index, e.target.value)}
                  className="w-full p-3 border rounded-lg bg-gray-50"
                >
                  <option value="">Select a service</option>
                  {Object.keys(serviceRegistry).map((service) => (
                    <option key={service} value={service}>
                      {serviceRegistry[service].displayName}
                    </option>
                  ))}
                </select>

                {step.service && (
                  <p className="mt-2 text-sm text-gray-600">
                    {getStepDescription(step.service)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={addStep}
          disabled={steps.length >= 8}
          className={`mt-4 flex items-center text-blue-600 hover:text-blue-800 ${steps.length >= 8 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
        >
          <span className="mr-1">+</span> Add another step {steps.length >= 8 ? '(Max 8 steps)' : ''}
        </button>
      </div>

      {error && (
        <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-lg">
          {error}
        </div>
      )}

      {/* Step Flow Visualization */}
      <div className="w-full mb-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-3">Processing Flow Preview</h3>
        <div className="flex items-center space-x-2 overflow-x-auto">
          <div className="px-3 py-2 bg-blue-100 rounded-md text-sm whitespace-nowrap">
            CSV Upload
          </div>
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div className="text-gray-400">→</div>
              <div className={`px-3 py-2 rounded-md text-sm whitespace-nowrap ${step.service
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
                }`}>
                {step.service
                  ? serviceRegistry[step.service]?.displayName || step.service
                  : 'Select Service'
                }
              </div>
            </React.Fragment>
          ))}
          <div className="text-gray-400">→</div>
          <div className="px-3 py-2 bg-purple-100 rounded-md text-sm whitespace-nowrap">
            Results Export
          </div>
        </div>
      </div>

      <div className="w-full flex justify-center mt-8">
        <button
          onClick={handleSubmit}
          disabled={steps.some(step => !step.service)}
          className={`px-12 py-3 text-lg rounded-full transition-colors ${steps.every(step => step.service)
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
        >
          Configure Steps
        </button>
      </div>
    </div>
  );
};

export default StepDeclaration;