// components/ClientSelectionPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../services/supabaseClient';
import storageUtils from '../utils/storageUtils';

const ClientSelectionPage = ({ engine, onClientSelect, onBack }) => {
  const navigate = useNavigate();

  // State for default and custom clients
  const [defaultClients, setDefaultClients] = useState([
    'Incommon AI', 'Video CX', 'Client C', 'Client D',
    'Client E', 'Client F', 'Client G', 'Client H'
  ]);
  const [customEngines, setCustomEngines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  console.log("ClientSelectionPage rendering with engine:", engine);

  useEffect(() => {
    // Fetch custom engines from Supabase based on engine type
    const fetchCustomEngines = async () => {
      setIsLoading(true);
      setFetchError(null);

      // If no engine type, try to load from storage
      let engineType = engine;
      if (!engineType) {
        engineType = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE);
        console.log("Loaded engine type from storage:", engineType);
      }

      if (!engineType) {
        console.warn("No engine type provided, cannot fetch custom engines");
        setIsLoading(false);
        setCustomEngines([]);
        return;
      }

      console.log("Fetching custom engines for type:", engineType);

      try {
        // Fetch engines with the current engine type
        const { data, error } = await supabase
          .from('engine_db')
          .select('*')
          .eq('engine_type', engineType)
          .eq('is_custom_engine', true);

        if (error) {
          console.error("Supabase error when filtering by engine type:", error);
          throw error;
        }

        console.log("Filtered custom engines for", engineType, ":", data);
        setCustomEngines(data || []);
      } catch (err) {
        console.error('Error fetching custom engines:', err);
        setFetchError(err.message || "Failed to fetch custom engines");
        setCustomEngines([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomEngines();
  }, [engine]);

  const debugCustomEngines = async () => {
    try {
      console.log("Current engine type:", engine);

      // Fetch ALL engines
      const { data, error } = await supabase
        .from('engine_db')
        .select('*');

      if (error) throw error;

      console.log("ALL engines in database:", data);

      // Check custom engines
      const customs = data.filter(e => e.is_custom_engine === true);
      console.log("Custom engines:", customs);

      // Check engines matching current type
      const matching = data.filter(e =>
        e.is_custom_engine === true &&
        e.engine_type === engine
      );
      console.log("Engines matching current type:", matching);

    } catch (err) {
      console.error("Debug error:", err);
      alert("Error in debug: " + err.message);
    }
  };

  const handleClientSelect = (client, isCustom = false, engineData = null) => {
    // Handle client selection (standard or custom engine)
    if (isCustom && engineData) {
      // For custom engines, store engine data for future use
      console.log("Selected custom engine:", engineData);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA, engineData);
      onClientSelect(client, true, engineData);
    } else {
      // Standard client selection
      console.log("Selected standard client:", client);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);
      onClientSelect(client, false);
    }
  };

  const getInstructionText = () => {
    if (engine === 'Advisor Finder') {
      return "Select client to analyze connections for advisor recommendations";
    }
    return `Choose client for ${engine || 'Selected Engine'}`;
  };

  const isClientEnabled = (client) => {
    if (engine === 'Advisor Finder') {
      // Only Video CX is enabled for Advisor Finder
      return client === 'Video CX';
    }
    // For other engines, only Incommon AI and Video CX are enabled
    return client === 'Incommon AI' || client === 'Video CX';
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={onBack}
        className="self-center mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      <h2 className="text-4xl font-bold text-center mb-12">
        {getInstructionText()}
      </h2>

      <div className="bg-blue-50 p-4 rounded-lg mb-8 max-w-xl text-center">
        {engine === 'Advisor Finder' ? (
          <p className="text-blue-700">
            <span className="font-bold">Note:</span> Currently, only VideoCX is available for Advisor Finder.
          </p>
        ) : (
          <p className="text-blue-700">
            <span className="font-bold">Note:</span> Choose from standard clients or your custom engines below.
          </p>
        )}
      </div>

      {/* Standard Clients */}
      <h3 className="text-xl font-medium text-center mb-4">Standard Clients</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mb-8">
        {defaultClients.map((client, index) => (
          <button
            key={index}
            onClick={() => handleClientSelect(client)}
            className={`px-4 py-3 text-lg border-2 ${isClientEnabled(client)
              ? 'border-blue-300 hover:bg-blue-50'
              : 'border-gray-300 text-gray-400 cursor-not-allowed'
              } rounded-full transition-colors`}
            disabled={!isClientEnabled(client)}
          >
            {client}
          </button>
        ))}
      </div>

      {/* Custom Engines Section */}
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-medium mb-4">Your Custom Engines</h3>
          <button
            onClick={debugCustomEngines}
            className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Debug
          </button>
        </div>

        {isLoading ? (
          <div className="text-center p-4">Loading custom engines...</div>
        ) : fetchError ? (
          <div className="bg-red-100 text-red-700 p-4 rounded mb-4">
            Error loading custom engines: {fetchError}
          </div>
        ) : customEngines.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
            {customEngines.map((engineData, index) => (
              <button
                key={index}
                onClick={() => handleClientSelect(engineData.engine_name, true, engineData)}
                className="px-6 py-4 text-lg border-2 border-green-300 hover:bg-green-50 rounded-lg transition-colors"
              >
                <div className="font-bold">{engineData.engine_name}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Type: {engineData.engine_type}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(engineData.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded">
            No custom engines found for {engine || "this engine type"}.
          </div>
        )}
      </div>

      {/* Custom Engine Button */}
      <div className="mt-12">
        <button
          onClick={() => navigate('/engine-builder')}
          className="px-6 py-3 text-lg border-2 border-green-400 rounded-full hover:bg-green-50 transition-colors"
        >
          Build a New Custom Engine
        </button>
      </div>
    </div>
  );
};

export default ClientSelectionPage;