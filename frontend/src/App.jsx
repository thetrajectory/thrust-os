// App.jsx
import React, { useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AdvisorSelectionPage from './components/AdvisorSelectionPage';
import ClientSelectionPage from './components/ClientSelectionPage';
import FileUploadPage from './components/FileUploadPage';
import LandingPage from './components/LandingPage';
import OrchestratedProcessingPage from './components/OrchestratedProcessingPage';
import ProxyConnectionTest from './components/ProxyConnectionTest';
import ResultsPage from './components/ResultsPage';
import enrichmentOrchestrator from './services/enrichmentOrchestrator';
import './App.css'

const App = () => {
  // Navigation hooks (now works because we're inside BrowserRouter)
  const navigate = useNavigate();
  const location = useLocation();

  // State management
  const [selectedEngine, setSelectedEngine] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [filteredData, setFilteredData] = useState(null);
  const [analytics, setAnalytics] = useState({});
  const [filterAnalytics, setFilterAnalytics] = useState({});

  // Navigation handlers
  const handleEngineSelection = (engine) => {
    setSelectedEngine(engine);
    navigate('/client');
  };

  const handleClientSelection = (client) => {
    setSelectedClient(client);
    navigate('/advisor');
  };

  const handleAdvisorSelection = (advisor) => {
    setSelectedAdvisor(advisor);
    navigate('/upload');
  };

  const handleFileUpload = (file, data) => {
    setCsvFile(file);

    // Add advisor info to the data
    const enrichedData = data.map(row => ({
      ...row,
      advisorName: selectedAdvisor
    }));

    setCsvData(enrichedData);
    navigate('/processing');
  };

  const handleProcessingComplete = (filteredData) => {
    // Make sure we have data
    if (filteredData && filteredData.length > 0) {
      console.log(`Processing complete: ${filteredData.length} rows of filtered data`);
      setFilteredData(filteredData);
    } else {
      // If no filtered data, use the processed data
      console.warn("No filtered data received. Using all processed data.");
      const orchestratorData = enrichmentOrchestrator.processedData || csvData;
      setFilteredData(orchestratorData);
    }

    // Update analytics state from orchestrator
    setAnalytics(enrichmentOrchestrator.analytics || {});
    setFilterAnalytics(enrichmentOrchestrator.filterAnalytics || {});

    navigate('/results');
  };

  const handleBackNavigation = () => {
    const path = location.pathname;

    if (path === '/client') {
      navigate('/');
    } else if (path === '/advisor') {
      navigate('/client');
    } else if (path === '/upload') {
      navigate('/advisor');
    } else if (path === '/processing') {
      navigate('/upload');
      resetProcessing();
    } else if (path === '/results') {
      navigate('/processing');
    }
  };

  // Handle going back to home
  const handleGoToHome = () => {
    // If currently processing, ask for confirmation
    if (location.pathname === '/processing' &&
      !window.confirm('Going back to the homepage will cancel the current processing. Continue?')) {
      return;
    }

    // Reset state and go to landing page
    setSelectedEngine('');
    setSelectedClient('');
    setSelectedAdvisor('');
    setCsvFile(null);
    setCsvData(null);
    setProcessedData(null);
    setFilteredData(null);
    setAnalytics({});
    setFilterAnalytics({});

    // Reset orchestrator
    resetProcessing();

    // Navigate to home
    navigate('/');
  };

  const resetProcessing = () => {
    setProcessedData(null);
    setFilteredData(null);
    setAnalytics({});
    setFilterAnalytics({});
    // Reset orchestrator
    enrichmentOrchestrator.reset();
  };

  // Mock client and advisor data
  const clients = [
    'Incommon AI', 'Client B', 'Client C', 'Client D',
    'Client E', 'Client F', 'Client G', 'Client H'
  ];

  const advisors = [
    'Advisor 1', 'Advisor 2', 'Advisor 3', 'Advisor 4'
  ];

  return (
    <div className="min-h-screen bg-white p-6">
      <header className="mb-12 flex items-center">
        {/* Make the app name clickable with cursor-pointer and hover effect */}
        <h1
          className="text-2xl font-bold cursor-pointer hover:text-blue-600 transition-colors"
          onClick={handleGoToHome}
        >
          Trajectory
        </h1>
        {selectedClient && (
          <span className="ml-4 text-gray-600">
            Client: {selectedClient} {selectedAdvisor && `| Advisor: ${selectedAdvisor}`}
          </span>
        )}
        {/* <ProxyConnectionTest /> */}
      </header>

      <Routes>
        <Route
          path="/"
          element={<LandingPage onEngineSelect={handleEngineSelection} />}
        />
        <Route
          path="/client"
          element={
            <ClientSelectionPage
              clients={clients}
              engine={selectedEngine}
              onClientSelect={handleClientSelection}
              onBack={handleBackNavigation}
            />
          }
        />
        <Route
          path="/advisor"
          element={
            <AdvisorSelectionPage
              advisors={advisors}
              client={selectedClient}
              onAdvisorSelect={handleAdvisorSelection}
              onBack={handleBackNavigation}
            />
          }
        />
        <Route
          path="/upload"
          element={
            <FileUploadPage
              onFileUpload={handleFileUpload}
              onBack={handleBackNavigation}
            />
          }
        />
        <Route
          path="/processing"
          element={
            <OrchestratedProcessingPage
              csvData={csvData}
              onProcessingComplete={handleProcessingComplete}
              onBack={handleBackNavigation}
            />
          }
        />
        <Route
          path="/results"
          element={
            <ResultsPage
              processedData={filteredData}
              originalCount={csvData?.length || 0}
              finalCount={filteredData?.length || 0}
              analytics={analytics}
              filterAnalytics={filterAnalytics}
              onBack={handleBackNavigation}
            />
          }
        />
      </Routes>
    </div>
  );
};

export default App;