// components/AdvisorSelectionPage.jsx
import React, { useEffect, useState, useRef } from 'react';
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
  const [fetchStats, setFetchStats] = useState({ totalRows: 0, uniqueAdvisors: 0 });
  
  const dropdownRef = useRef(null);

  // Get client from storage
  const client = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
  const isCustomEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE);

  // Define advisors to exclude
  const excludedAdvisors = ['Unknown Advisor', 'Advsor 2', 'Advisor 2'];

  const fetchAllAdvisors = async () => {
    setIsLoading(true);
    try {
      console.log('Fetching ALL advisors from leads_db (no limit)...');
      
      let allData = [];
      let from = 0;
      const batchSize = 1000; // Fetch in batches of 1000
      let hasMore = true;

      while (hasMore) {
        console.log(`Fetching batch starting from row ${from}...`);
        
        const { data, error, count } = await supabase
          .from('leads_db')
          .select('connected_to', { count: 'exact' })
          .not('connected_to', 'is', null)
          .neq('connected_to', '')
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }

        console.log(`Batch fetched: ${data?.length || 0} rows`);
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += batchSize;
          
          // Check if we've fetched all available data
          if (data.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }

        // Safety check to prevent infinite loop
        if (from > 50000) { // Adjust this limit based on your expected data size
          console.warn('Reached safety limit of 50,000 rows');
          hasMore = false;
        }
      }

      console.log(`Total raw data fetched: ${allData.length} rows`);

      if (allData.length === 0) {
        console.log('No data found in leads_db');
        setAllAdvisors([]);
        setFilteredSuggestions([]);
        setFetchStats({ totalRows: 0, uniqueAdvisors: 0 });
        return;
      }

      // Process and get unique advisors
      const advisorSet = new Set();
      
      allData.forEach((row, index) => {
        if (row && row.connected_to) {
          const advisor = String(row.connected_to).trim();
          if (advisor.length > 0 && !excludedAdvisors.includes(advisor)) {
            advisorSet.add(advisor);
          }
        }
      });

      // Sort alphabetically (case-insensitive)
      const uniqueAdvisors = Array.from(advisorSet).sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
      );
      
      console.log(`Total unique advisors found (after filtering): ${uniqueAdvisors.length}`);
      console.log('Excluded advisors:', excludedAdvisors);
      console.log('All unique advisors (alphabetical):', uniqueAdvisors);

      setAllAdvisors(uniqueAdvisors);
      setFilteredSuggestions(uniqueAdvisors);
      setFetchStats({ 
        totalRows: allData.length, 
        uniqueAdvisors: uniqueAdvisors.length 
      });

    } catch (err) {
      console.error("Error fetching advisors:", err);
      setAllAdvisors([]);
      setFilteredSuggestions([]);
      setFetchStats({ totalRows: 0, uniqueAdvisors: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAdvisors();
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setAdvisorName(value);
    setShowSuggestions(true);

    if (value.trim().length > 0) {
      // Filter and keep alphabetical order
      const filtered = allAdvisors.filter(advisor =>
        advisor.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
    } else {
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
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ADVISOR, name);
      
      if (onAdvisorSelect) {
        onAdvisorSelect(name);
      }
      
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

  const handleInputFocus = () => {
    setShowSuggestions(true);
    if (!advisorName.trim()) {
      setFilteredSuggestions(allAdvisors);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={onBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      
      <div className="flex items-center gap-4 mb-8">
        <h2 className="text-4xl font-bold text-center">
          Choose Advisor for {client || 'Selected Client'}
        </h2>
        
        {/* Refresh button */}
        <button
          onClick={fetchAllAdvisors}
          disabled={isLoading}
          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Stats display */}
      {/* {!isLoading && (
        <div className="mb-4 text-sm text-gray-600 bg-gray-100 px-4 py-2 rounded">
          Fetched {fetchStats.totalRows.toLocaleString()} total rows, 
          found {fetchStats.uniqueAdvisors} unique advisors (alphabetical order)
        </div>
      )} */}

      {/* Name input form */}
      <div className="w-full max-w-md mb-8" ref={dropdownRef}>
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
                    key={`suggestion-${index}`}
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

      {/* All advisors section - Fixed height to show 8 advisors with scroll */}
      {!isLoading && allAdvisors.length > 0 ? (
        <>
          <h3 className="text-xl font-medium text-center mb-4">
            All Advisors ({allAdvisors.length})
          </h3>
          <div 
            className="w-full max-w-4xl p-4 overflow-y-auto"
            style={{ 
              height: '400px', // Fixed height to show exactly 8 advisor buttons
              scrollbarWidth: 'thin'
            }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {allAdvisors.map((advisor, index) => (
                <button
                  key={`advisor-${index}-${advisor}`}
                  onClick={() => handleSelectAdvisor(advisor)}
                  className="px-4 py-3 text-lg border-2 border-blue-300 rounded-full hover:bg-blue-50 transition-colors truncate h-12"
                  title={advisor}
                >
                  {advisor}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : !isLoading ? (
        <div className="mt-4 text-gray-500 text-center">
          <p>No advisors found in the database.</p>
          <p className="text-sm mt-2">
            Make sure you have data in the 'connected_to' column of leads_db table.
          </p>
          <button
            onClick={fetchAllAdvisors}
            className="mt-2 px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Try Refreshing
          </button>
        </div>
      ) : (
        <div className="mt-4 text-gray-500 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          Loading all advisors from database...
        </div>
      )}
    </div>
  );
};

export default AdvisorSelectionPage;