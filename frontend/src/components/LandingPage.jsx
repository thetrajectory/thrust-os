// components/LandingPage.jsx
import React from 'react';

const LandingPage = ({ onEngineSelect }) => {
  return (
    <div className="flex flex-col items-center justify-center pt-24">
      <h2 className="text-4xl font-bold text-center mb-24">
        What would you like to run today?
      </h2>
      <div className="flex space-x-6">
        <button
          onClick={() => onEngineSelect('Advisor Engine')}
          className="px-6 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors"
        >
          Advisor Engine
        </button>
        <button
          onClick={() => onEngineSelect('Account Engine')}
          className="px-6 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors"
        >
          Account Engine
        </button>
      </div>
    </div>
  );
};

export default LandingPage;