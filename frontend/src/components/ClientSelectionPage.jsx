// components/ClientSelectionPage.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../utils/storageUtils';

const ClientSelectionPage = ({ engine, onClientSelect, onBack }) => {
  const navigate = useNavigate();

  // Define clients array directly in the component
  const clients = [
    'Incommon AI', 'Video CX', 'Client C', 'Client D',
    'Client E', 'Client F', 'Client G', 'Client H'
  ];

  const handleClientSelect = (client) => {
    // Save selected client to session storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);
    onClientSelect(client);
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
            <span className="font-bold">Note:</span> Currently, VideoCX and Incommon AI processing pipelines are fully implemented and available.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        {clients.map((client, index) => (
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
    </div>
  )
};
export default ClientSelectionPage;