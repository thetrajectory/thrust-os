// components/LandingPage.jsx (update)
import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = ({ onEngineSelect }) => {
  const navigate = useNavigate();

  const handleBuildEngineClick = () => {
    navigate('/engine-builder');
  };

  return (
    <div className="flex flex-col items-center justify-center pt-24">
      <h2 className="text-4xl font-bold text-center mb-16">
        What would you like to run today?
      </h2>

      <div className="flex flex-col items-center">
        <div className="flex flex-wrap space-x-6 justify-center mb-16">
          <button
            onClick={() => onEngineSelect('Advisor Engine')}
            className="px-6 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors mb-4"
          >
            Advisor Engine
          </button>
          <button
            onClick={() => onEngineSelect('Account Engine')}
            className="px-6 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors mb-4"
          >
            Account Engine
          </button>
          <button
            onClick={() => onEngineSelect('Advisor Finder')}
            className="px-6 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors mb-4"
          >
            Advisor Finder - Via Client Connections
          </button>
        </div>

        <div className="border-t border-gray-300 w-1/2 my-8"></div>

        <div className="text-center mb-8">
          <h3 className="text-2xl font-bold mb-2">Or create your own custom engine</h3>
          <p className="text-gray-600">Build reusable enrichment pipelines for your specific needs</p>
        </div>

        <button
          onClick={handleBuildEngineClick}
          className="px-8 py-4 text-lg bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
        >
          Build Your Own Engine
        </button>
      </div>
    </div>
  );
};

export default LandingPage;