// components/engine-builder/InputSchemaSelection.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../../utils/storageUtils';

const InputSchemaSelection = () => {
  const navigate = useNavigate();
  const [selectedSchema, setSelectedSchema] = useState('');
  const [engineState, setEngineState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load current engine state
    const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    if (!state) {
      // If no state, redirect to start
      navigate('/engine-builder/initialize');
      return;
    }
    setEngineState(state);
  }, [navigate]);

  const handleBack = () => {
    navigate('/engine-builder/initialize');
  };

  const handleSubmit = () => {
    if (!selectedSchema) {
      setError('Please select an input schema');
      return;
    }

    // Define schema fields based on selection
    const schemaFields = {
      'Connection Data': [
        'first_name', 'last_name', 'connected_on', 'email_id', 
        'company', 'position', 'linkedin_url'
      ],
      'Apollo Data': [
        'apollo_person_id', 'first_name', 'last_name', 'email',
        'title', 'linkedin_url', 'company_name', 'website', 
        'industry', 'headcount', 'location'
      ]
    };

    // Update engine state
    const updatedState = {
      ...engineState,
      inputSchema: {
        type: selectedSchema,
        fields: schemaFields[selectedSchema]
      }
    };

    // Save to storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

    // Navigate to next step
    navigate('/engine-builder/step-declaration');
  };

  if (!engineState) return null;

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-12">
        What's your input
      </h2>
      
      <div className="w-full mb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            className={`px-4 py-3 text-lg border-2 rounded-full transition-colors ${
              selectedSchema === 'Connection Data' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-blue-300 hover:bg-blue-50'
            }`}
            onClick={() => setSelectedSchema('Connection Data')}
          >
            Connection Data
          </button>
          <button
            className={`px-4 py-3 text-lg border-2 rounded-full transition-colors ${
              selectedSchema === 'Apollo Data' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-blue-300 hover:bg-blue-50'
            }`}
            onClick={() => setSelectedSchema('Apollo Data')}
          >
            Apollo Account Data
          </button>
        </div>
      </div>
      
      {selectedSchema && (
        <div className="w-full p-4 bg-gray-50 rounded-lg mb-8">
          <h3 className="font-bold mb-2">Schema fields:</h3>
          <div className="flex flex-wrap gap-2">
            {selectedSchema === 'Connection Data' ? (
              <>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">fname</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">lname</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">connected_on</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">email</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">company_name</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">position</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">linkedin_url</span>
              </>
            ) : (
              <>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">apollo_person_id</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">first_name</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">last_name</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">email</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">title</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">linkedin_url</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">company_name</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">website</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">industry</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">headcount</span>
                <span className="px-2 py-1 bg-blue-100 rounded-md text-sm">location</span>
              </>
            )}
          </div>
        </div>
      )}
      
      {error && (
        <div className="text-red-500 mb-4">{error}</div>
      )}
      
      <div className="w-full flex justify-center mt-8">
        <button
          onClick={handleSubmit}
          disabled={!selectedSchema}
          className={`px-12 py-3 text-lg rounded-full transition-colors ${
            selectedSchema 
              ? 'bg-green-500 text-white hover:bg-green-600' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Go
        </button>
      </div>
    </div>
  );
};

export default InputSchemaSelection;