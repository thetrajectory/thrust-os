// pages/IndexPage.js
import Papa from 'papaparse';
import React, { useState } from 'react';
import OrchestratedProcessingPage from '../components/OrchestratedProcessingPage';
import ResultsPage from '../components/ResultsPage';

/**
 * Main application page that handles file uploads, processing and results
 */
const IndexPage = () => {
  // Application state
  const [currentPage, setCurrentPage] = useState('landing');
  const [selectedEngine, setSelectedEngine] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [processStatus, setProcessStatus] = useState({});
  const [error, setError] = useState(null);
  
  // Mock data
  const clients = [
    'Acme Corp', 'TechGiant', 'InnovateSoft', 'CloudWave', 
    'DataStream', 'NextEdge', 'PulseFinance', 'QuantumAI'
  ];
  
  const advisors = [
    'Robert Smith', 'Jennifer Lee', 'Michael Chen', 'Sarah Johnson'
  ];
  
  // Engine options
  const engines = [
    { id: 'client1', name: 'CLIENT 1 Engine', description: 'For enriching tech company leads' },
    { id: 'client2', name: 'CLIENT 2 Engine', description: 'For financial services leads' }
  ];
  
  // Handle file upload and parsing
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCsvFile(file);
      
      // Parse CSV file
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvData(results.data);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
          setError(`Error parsing CSV: ${error.message}`);
        }
      });
    }
  };
  
  // Start processing
  const startProcessing = () => {
    if (!csvData || csvData.length === 0) {
      setError('No data to process. Please upload a CSV file first.');
      return;
    }
    
    if (!selectedEngine) {
      setError('Please select an engine before processing.');
      return;
    }
    
    // Initialize processing status
    setProcessStatus({
      titleRelevance: { status: 'pending', message: '' },
      apolloEnrichment: { status: 'pending', message: '' },
      domainScraping: { status: 'pending', message: '' },
      companyRelevance: { status: 'pending', message: '' },
      indianLeads: { status: 'pending', message: '' },
      openJobs: { status: 'pending', message: '' }
    });
    
    // Navigate to processing page
    setCurrentPage('processing');
  };
  
  // Handle processing completion
  const handleProcessingComplete = (data) => {
    setProcessedData(data);
    setCurrentPage('results');
  };
  
  // Return to previous page
  const handleBack = () => {
    switch (currentPage) {
      case 'results':
        setCurrentPage('processing');
        break;
      case 'processing':
        setCurrentPage('landing');
        break;
      default:
        // In landing page, do nothing
        break;
    }
  };
  
  // Reset the application
  const handleReset = () => {
    setCurrentPage('landing');
    setSelectedEngine('');
    setSelectedClient('');
    setSelectedAdvisor('');
    setCsvFile(null);
    setCsvData(null);
    setProcessedData(null);
    setProcessStatus({});
    setError(null);
  };
  
  // Render appropriate page based on currentPage state
  switch (currentPage) {
    case 'processing':
      return (
        <OrchestratedProcessingPage
          csvData={csvData}
          onProcessingComplete={handleProcessingComplete}
          onBack={handleBack}
        />
      );
    
    case 'results':
      return (
        <ResultsPage
          processedData={processedData}
          processStatus={processStatus}
          onBack={handleBack}
        />
      );
    
    default:
      // Landing page
      return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center">
              <h1 className="text-4xl font-extrabold text-gray-900 mb-6">
                Trajectory
              </h1>
              <p className="text-xl text-gray-600 mb-12">
                Lead enrichment and qualification platform
              </p>
            </div>
            
            <div className="bg-white shadow-md rounded-lg p-8 mb-8">
              <h2 className="text-2xl font-bold mb-6">Start New Enrichment</h2>
              
              {/* Show error if any */}
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
                  <span className="block sm:inline">{error}</span>
                  <span 
                    className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
                    onClick={() => setError(null)}
                  >
                    <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                </div>
              )}
              
              {/* Configuration Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Engine Selection */}
                <div>
                  <label className="block text-gray-700 font-medium mb-2">
                    Select Engine
                  </label>
                  <div className="space-y-4">
                    {engines.map(engine => (
                      <div 
                        key={engine.id}
                        className={`border rounded-lg p-4 cursor-pointer ${
                          selectedEngine === engine.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                        onClick={() => setSelectedEngine(engine.id)}
                      >
                        <div className="font-medium">{engine.name}</div>
                        <div className="text-sm text-gray-600">{engine.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Client and Advisor Selection */}
                <div className="space-y-6">
                  {/* Client Dropdown */}
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      Client
                    </label>
                    <select
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                      value={selectedClient}
                      onChange={(e) => setSelectedClient(e.target.value)}
                    >
                      <option value="">Select a client</option>
                      {clients.map(client => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Advisor Dropdown */}
                  <div>
                    <label className="block text-gray-700 font-medium mb-2">
                      Advisor
                    </label>
                    <select
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
                      value={selectedAdvisor}
                      onChange={(e) => setSelectedAdvisor(e.target.value)}
                    >
                      <option value="">Select an advisor</option>
                      {advisors.map(advisor => (
                        <option key={advisor} value={advisor}>{advisor}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* File Upload */}
              <div className="mb-8">
                <label className="block text-gray-700 font-medium mb-2">
                  Upload CSV File
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H8m36-12h-4a4 4 0 00-4 4v4m8-20V8a4 4 0 00-4-4H8a4 4 0 00-4 4v36a4 4 0 004 4h36a4 4 0 004-4v-4"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                      >
                        <span>Upload a file</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          accept=".csv"
                          onChange={handleFileUpload}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">CSV files only</p>
                  </div>
                </div>
                {csvFile && (
                  <div className="mt-2 text-sm text-gray-600">
                    Selected file: <span className="font-medium">{csvFile.name}</span> 
                    ({csvData ? `${csvData.length} records` : 'Parsing...'})
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex justify-end">
                <button
                  onClick={startProcessing}
                  disabled={!csvData || !selectedEngine}
                  className={`px-6 py-3 rounded-lg bg-blue-600 text-white font-medium ${
                    !csvData || !selectedEngine
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-blue-700'
                  }`}
                >
                  Start Enrichment
                </button>
              </div>
            </div>
            
            {/* Additional Information */}
            <div className="bg-white shadow-md rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-6">About Trajectory</h2>
              <p className="text-gray-700 mb-6">
                Trajectory is a lead enrichment platform designed to help you identify and qualify prospects. 
                Upload a CSV file with lead information, and our system will enrich it with data from various 
                sources, analyze company relevance, and filter out irrelevant leads.
              </p>
              
              <h3 className="text-xl font-bold mb-4">How It Works</h3>
              <div className="space-y-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600">
                      1
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium">Upload CSV</h4>
                    <p className="text-gray-600">Start by uploading a CSV file with lead information.</p>
                  </div>
                </div>
                
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600">
                      2
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium">Enrichment</h4>
                    <p className="text-gray-600">Our system enriches your data with additional information from Apollo and other sources.</p>
                  </div>
                </div>
                
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600">
                      3
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium">Analysis</h4>
                    <p className="text-gray-600">Data is analyzed for relevance and qualified based on your criteria.</p>
                  </div>
                </div>
                
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600">
                      4
                    </div>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-medium">Results</h4>
                    <p className="text-gray-600">Review and download your enriched and qualified leads.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
  }
};

export default IndexPage;