// components/engine-builder/StepConfiguration/ServiceSelection.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { serviceRegistry } from '../../../services/engine-builder/serviceRegistry';
import storageUtils from '../../../utils/storageUtils';

const ServiceSelection = () => {
  const navigate = useNavigate();
  const { stepIndex } = useParams();
  const stepIdx = parseInt(stepIndex, 10);

  const [engineState, setEngineState] = useState(null);
  const [selectedService, setSelectedService] = useState('');
  const [error, setError] = useState('');

  // First useEffect - Load engine state
  useEffect(() => {
    const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    if (!state || !state.steps || !state.steps[stepIdx]) {
      navigate('/engine-builder/step-declaration');
      return;
    }

    setEngineState(state);
    setSelectedService(state.steps[stepIdx].service || '');
  }, [navigate, stepIdx]);

  // Second useEffect - Auto-redirect if service is already selected
  useEffect(() => {
    if (engineState && engineState.steps[stepIdx]?.service) {
      // If the step already has a service, go directly to prompt configuration
      navigate(`/engine-builder/configure-step/${stepIdx}/prompt`);
    }
  }, [engineState, stepIdx, navigate]);

  const handleBack = () => {
    if (stepIdx === 0) {
      navigate('/engine-builder/step-declaration');
    } else {
      navigate(`/engine-builder/configure-step/${stepIdx - 1}/filter`);
    }
  };

  const handleServiceChange = (service) => {
    setSelectedService(service);
  };

  const handleSubmit = () => {
    if (!selectedService) {
      setError('Please select a service');
      return;
    }

    const updatedSteps = [...engineState.steps];
    updatedSteps[stepIdx] = {
      ...updatedSteps[stepIdx],
      service: selectedService,
      config: {}
    };

    const updatedState = {
      ...engineState,
      steps: updatedSteps
    };

    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);
    navigate(`/engine-builder/configure-step/${stepIdx}/prompt`);
  };

  // Early return after all hooks have been called
  if (!engineState) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>

      <h2 className="text-4xl font-bold text-center mb-6">
        Configure step {stepIdx + 1}
      </h2>

      <h3 className="text-xl text-center mb-12">
        Service for this step: {engineState?.steps[stepIdx]?.service ?
          serviceRegistry[engineState.steps[stepIdx].service]?.displayName :
          'No service selected'}
      </h3>

      <div className="w-full mb-8">
        <p className="text-center text-gray-600">
          You selected this service in the pipeline configuration.
          Click continue to configure the prompt and settings.
        </p>
      </div>

      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}

      <div className="w-full flex justify-center mt-8">
        <button
          onClick={() => navigate(`/engine-builder/configure-step/${stepIdx}/prompt`)}
          className="px-12 py-3 text-lg bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
        >
          Configure This Step
        </button>
      </div>
    </div>
  );
};

export default ServiceSelection;