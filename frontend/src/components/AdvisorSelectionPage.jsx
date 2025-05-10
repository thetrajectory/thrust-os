// components/AdvisorSelectionPage.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../utils/storageUtils';

const AdvisorSelectionPage = () => {
  const navigate = useNavigate();
  
  // Get client from storage
  const client = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
  
  // Define advisors array directly in the component
  const advisors = [
    'Cliff', 'Advisor 2', 'Advisor 3', 'Advisor 4'
  ];

  const handleAdvisorSelect = (advisor) => {
    // Save selected advisor to session storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ADVISOR, advisor);
    // Navigate to file upload page
    navigate('/upload');
  };

  const handleBack = () => {
    navigate('/client');
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
        Choose Advisor for {client || 'Selected Client'}
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
        {advisors.map((advisor, index) => (
          <button
            key={index}
            onClick={() => handleAdvisorSelect(advisor)}
            className="px-4 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors"
          >
            {advisor}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AdvisorSelectionPage;