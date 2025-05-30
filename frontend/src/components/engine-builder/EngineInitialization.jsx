// components/engine-builder/EngineInitialization.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../../utils/storageUtils';

const EngineInitialization = () => {
  const navigate = useNavigate();
  const [engineName, setEngineName] = useState('');
  const [engineType, setEngineType] = useState('');
  const [error, setError] = useState('');

  const handleBack = () => {
    navigate('/engine-builder');
  };

  const handleSubmit = () => {
    if (!engineName.trim()) {
      setError('Engine name is required');
      return;
    }

    if (!engineType) {
      setError('Please select an engine type');
      return;
    }

    // Initialize engine builder state
    const initialState = {
      engineName: engineName.trim(),
      engineType,
      steps: [],
      inputSchema: null,
    };

    // Save to storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, initialState);

    // Navigate to next step
    navigate('/engine-builder/input-schema');
  };

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-12">
        Let's start building your engine
      </h2>
      
      <div className="w-full mb-8">
        <label className="block text-center mb-2">Name your engine</label>
        <input
          type="text"
          value={engineName}
          onChange={(e) => setEngineName(e.target.value)}
          placeholder="e.g. Outbound BD India Engine"
          className="w-full p-3 border rounded-lg text-center"
        />
      </div>
      
      <div className="w-full mb-8">
        <label className="block text-center mb-4">What type of engine is this</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            className={`px-4 py-3 text-lg border-2 rounded-full transition-colors ${
              engineType === 'Advisor Engine' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-blue-300 hover:bg-blue-50'
            }`}
            onClick={() => setEngineType('Advisor Engine')}
          >
            Advisor Engine
          </button>
          <button
            className={`px-4 py-3 text-lg border-2 rounded-full transition-colors ${
              engineType === 'Account Engine' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-blue-300 hover:bg-blue-50'
            }`}
            onClick={() => setEngineType('Account Engine')}
          >
            Account Engine
          </button>
          <button
            className={`px-4 py-3 text-lg border-2 rounded-full transition-colors ${
              engineType === 'Advisor Finder' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-blue-300 hover:bg-blue-50'
            }`}
            onClick={() => setEngineType('Advisor Finder')}
          >
            Advisor Finder - Via Client Connection
          </button>
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}
      
      <div className="w-full flex justify-center mt-8">
        <button
          onClick={handleSubmit}
          className="px-12 py-3 text-lg bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
        >
          Go
        </button>
      </div>
    </div>
  );
};

export default EngineInitialization;