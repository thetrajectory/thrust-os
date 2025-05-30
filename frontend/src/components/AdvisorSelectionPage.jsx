// components/AdvisorSelectionPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../services/supabaseClient';
import storageUtils from '../utils/storageUtils';

const AdvisorSelectionPage = ({ onAdvisorSelect, onBack }) => {
  const navigate = useNavigate();
  const [advisorName, setAdvisorName] = useState('');
  const [allAdvisors, setAllAdvisors] = useState([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get client from storage
  const client = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
  const isCustomEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE);

  useEffect(() => {
    const fetchAdvisors = async () => {
      setIsLoading(true);
      try {
        // Fetch all rows with connected_to values
        const { data, error } = await supabase
          .from('leads_db')
          .select('connected_to')
          .not('connected_to', 'is', null)
          .neq('connected_to', '');

        if (error) throw error;

        // Extract all values and create a unique set client-side
        const allConnectedTo = data.map(item => item.connected_to);

        // Create a unique list by converting to Set and back to Array
        const uniqueAdvisors = [...new Set(allConnectedTo)]
          .filter(name => name && name.trim() !== '')
          .sort((a, b) => a.localeCompare(b));

        console.log(`Found ${uniqueAdvisors.length} unique advisors`);

        setAllAdvisors(uniqueAdvisors);
        setFilteredSuggestions(uniqueAdvisors);
      } catch (err) {
        console.error("Error fetching advisors:", err);
        setAllAdvisors([]);
        setFilteredSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdvisors();
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setAdvisorName(value);

    // Always show dropdown when typing
    setShowSuggestions(true);

    if (value.trim().length > 0) {
      // Filter suggestions based on input
      const filtered = allAdvisors.filter(advisor =>
        advisor.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else {
      // When input is empty, show all advisors
      setFilteredSuggestions(allAdvisors);
    }
  };

  const handleSelectSuggestion = (advisor) => {
    setAdvisorName(advisor);
    setShowSuggestions(false);
  };

  const handleSelectAdvisor = (advisor) => {
    const name = advisor || advisorName.trim();

    if (name) {
      // Save selected advisor to session storage
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ADVISOR, name);
      
      if (onAdvisorSelect) {
        onAdvisorSelect(name);
      }
      
      // Navigate to file upload page
      if (isCustomEngine) {
        navigate('/custom-engine/upload');
      } else {
        navigate('/upload');
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSelectAdvisor();
  };

  // Show dropdown when input is focused
  const handleInputFocus = () => {
    setShowSuggestions(true);
    // Show all advisors when input is empty
    if (!advisorName.trim()) {
      setFilteredSuggestions(allAdvisors);
    }
  };

  // Hide dropdown when clicking outside
  const handleClickOutside = () => {
    setShowSuggestions(false);
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={onBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-8">
        Choose Advisor for {client || 'Selected Client'}
      </h2>

      {/* Name input form */}
      <div className="w-full max-w-md mb-8">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex">
            <input
              type="text"
              value={advisorName}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              placeholder="Enter advisor name"
              className="flex-grow px-4 py-2 border-2 border-blue-300 rounded-l-lg focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600"
            >
              Select
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
              {isLoading ? (
                <div className="px-4 py-2 text-gray-500">Loading advisors...</div>
              ) : filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((advisor, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 cursor-pointer hover:bg-blue-50"
                    onClick={() => handleSelectSuggestion(advisor)}
                  >
                    {advisor}
                  </div>
                ))
              ) : (
                <div className="px-4 py-2 text-gray-500">
                  No matching advisors found. Enter a new name.
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* All advisors section */}
      {!isLoading && allAdvisors.length > 0 && (
        <>
          <h3 className="text-xl font-medium text-center mb-4">All Advisors ({allAdvisors.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 w-full max-w-4xl">
            {allAdvisors.map((advisor, index) => (
              <button
                key={index}
                onClick={() => handleSelectAdvisor(advisor)}
                className="px-4 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors truncate"
                title={advisor}
              >
                {advisor}
              </button>
            ))}
          </div>
        </>
      )}

      {isLoading && (
        <div className="mt-4 text-gray-500">Loading advisors...</div>
      )}

      {!isLoading && allAdvisors.length === 0 && (
        <div className="mt-4 text-gray-500">
          No advisors found. Enter a name to create the first advisor.
        </div>
      )}
    </div>
  );
};

export default AdvisorSelectionPage;