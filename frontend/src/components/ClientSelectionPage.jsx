// components/ClientSelectionPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../utils/storageUtils';

const ClientSelectionPage = () => {
  const navigate = useNavigate();
  // Get the engine from storage
  const engine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE);

  // Define clients array directly in the component
  const clients = [
    'Incommon AI', 'Client B', 'Client C', 'Client D',
    'Client E', 'Client F', 'Client G', 'Client H'
  ];

  const handleClientSelect = (client) => {
    // Save selected client to session storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);
    // Navigate to advisor selection
    navigate('/advisor');
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={handleBack}
        className="self-center mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      <h2 className="text-4xl font-bold text-center mb-12">
        Choose client for {engine || 'Selected Engine'}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        {clients.map((client, index) => (
          <button
            key={index}
            onClick={() => handleClientSelect(client)}
            className="px-4 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors"
          >
            {client}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ClientSelectionPage;