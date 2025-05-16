// App.jsx - Fixed version with proper Navigate component

import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './App.css';

// Import common components
import AdvisorSelectionPage from './components/AdvisorSelectionPage';
import ClientSelectionPage from './components/ClientSelectionPage';
import FileUploadPage from './components/FileUploadPage';
import LandingPage from './components/LandingPage';

// Import engine-specific components
import OrchestratedProcessingPage from './components/OrchestratedProcessingPage'; // Incommon
import ResultsPage from './components/ResultsPage'; // Incommon
import VideoCXProcessingPage from './components/videocx/VideoCXProcessingPage'; // VideoCX
import VideoCXResultsPage from './components/videocx/VideoCXResultsPage'; // VideoCX

// Import find-advisor components
import FindAdvisorProcessingPage from './components/find-advisor/videocx/FindAdvisorProcessingPage'; // New
import FindAdvisorResultsPage from './components/find-advisor/videocx/FindAdvisorResultsPage'; // New

// Import services
import enrichmentOrchestrator from './services/enrichmentOrchestrator'; // Incommon
import findAdvisorOrchestrator from './services/find-advisor/videocx/findAdvisorOrchestrator'; // New
import videoCXOrchestrator from './services/videocx/videoCXOrchestrator'; // VideoCX
import storageUtils from './utils/storageUtils';

const App = () => {
  // Navigation hooks
  const navigate = useNavigate();
  const location = useLocation();

  // State management
  const [selectedEngine, setSelectedEngine] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [analytics, setAnalytics] = useState({});
  const [filterAnalytics, setFilterAnalytics] = useState({});

  // Load state from storage on component mount
  useEffect(() => {
    const storedClient = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
    const storedEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE);
    const storedAdvisor = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ADVISOR);

    if (storedClient) setSelectedClient(storedClient);
    if (storedEngine) setSelectedEngine(storedEngine);
    if (storedAdvisor) setSelectedAdvisor(storedAdvisor);

    console.log("Loaded client from storage:", storedClient);
  }, []);

  useEffect(() => {
    // If we don't have a selected client but we're on a client-specific path
    if (!selectedClient && location.pathname) {
      if (location.pathname.includes('/videocx/')) {
        console.log("Restoring client to Video CX from URL path");
        setSelectedClient('Video CX');
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, 'Video CX');
      } else if (location.pathname.includes('/incommon/')) {
        console.log("Restoring client to Incommon AI from URL path");
        setSelectedClient('Incommon AI');
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, 'Incommon AI');
      } else if (location.pathname.includes('/find-advisor/')) {
        console.log("Restoring client to Advisor Finder from URL path");
        setSelectedClient('Video CX'); // For Advisor Finder, we're still using Video CX as the client
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, 'Video CX');
      }
    }
  }, [location.pathname, selectedClient]);

  // Get client path prefix
  const getClientPathPrefix = (client = null) => {
    // Use passed client parameter or the state value
    const clientName = client || selectedClient;
    const engineName = selectedEngine;

    console.log("Getting path prefix for client:", clientName, "and engine:", engineName);

    // For the Advisor Finder engine, return a different path prefix
    if (engineName === 'Advisor Finder') {
      return 'find-advisor';
    }

    // Convert client name to lowercase and remove spaces for URL
    if (clientName === 'Incommon AI') return 'incommon';
    if (clientName === 'Video CX') return 'videocx';

    // Check if we're on a videocx path but don't have client info
    if (location.pathname.includes('/videocx/')) return 'videocx';
    if (location.pathname.includes('/incommon/')) return 'incommon';
    if (location.pathname.includes('/find-advisor/')) return 'find-advisor';

    return 'default'; // Fallback
  };

  // Navigation handlers
  const handleEngineSelection = (engine) => {
    setSelectedEngine(engine);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE, engine);
    navigate('/client');
  };

  const handleClientSelection = (client) => {
    console.log("Selected client:", client);
    setSelectedClient(client);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);

    // For Advisor Finder, skip the advisor selection step
    if (selectedEngine === 'Advisor Finder') {
      navigate('/upload');
    } else {
      navigate('/advisor');
    }
  };

  const handleAdvisorSelection = (advisor) => {
    setSelectedAdvisor(advisor);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ADVISOR, advisor);
    navigate('/upload');
  };

  const handleFileUpload = (file, data) => {
    setCsvFile(file);

    // Add advisor info to the data
    const enrichedData = data.map(row => ({
      ...row,
      advisorName: selectedAdvisor,
      connected_on: row.connected_on || new Date().toISOString(),
      relevanceTag: ''
    }));

    setCsvData(enrichedData);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, enrichedData);

    // Navigate to the client-specific processing route
    const clientPrefix = getClientPathPrefix();
    navigate(`/${clientPrefix}/processing`);
  };

  const handleProcessingComplete = (data, clientType = null) => {
    // Use passed client type or current selected client
    const client = clientType || selectedClient;
    console.log("Processing complete for client:", client); // Debug log

    // Get the right orchestrator based on client and engine
    let orchestrator;
    if (selectedEngine === 'Advisor Finder') {
      orchestrator = findAdvisorOrchestrator;
    } else if (client === 'Video CX') {
      orchestrator = videoCXOrchestrator;
    } else {
      orchestrator = enrichmentOrchestrator;
    }

    // Make sure we have data
    const orchestratorData = orchestrator.processedData || csvData || [];

    if (!Array.isArray(orchestratorData)) {
      console.error("Invalid processed data from orchestrator:", orchestratorData);
      return;
    }

    setProcessedData(orchestratorData);

    // Update analytics state from orchestrator
    setAnalytics(orchestrator.analytics || {});
    setFilterAnalytics(orchestrator.filterAnalytics || {});

    // Navigate to client-specific results page - use the client parameter for prefix
    const clientPrefix = getClientPathPrefix(client);
    console.log("Navigating to results with prefix:", clientPrefix); // Debug log
    navigate(`/${clientPrefix}/results`);
  };

  const handleBackNavigation = () => {
    const path = location.pathname;
    const clientPrefix = getClientPathPrefix();

    // Common paths
    if (path === '/client') {
      navigate('/');
      return;
    } else if (path === '/advisor') {
      navigate('/client');
      return;
    } else if (path === '/upload') {
      // If we came from Advisor Finder, go back to client selection
      if (selectedEngine === 'Advisor Finder') {
        navigate('/client');
      } else {
        navigate('/advisor');
      }
      return;
    }

    // Client-specific paths
    if (path === `/${clientPrefix}/processing`) {
      navigate('/upload');
      resetProcessing();
      return;
    }

    if (path === `/${clientPrefix}/results`) {
      navigate(`/${clientPrefix}/processing`);
      return;
    }

    // Default fallback - go to home
    navigate('/');
  };

  // Handle going back to home
  const handleGoToHome = () => {
    const clientPrefix = getClientPathPrefix();

    // If currently processing, ask for confirmation
    if (location.pathname === `/${clientPrefix}/processing` &&
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
    setAnalytics({});
    setFilterAnalytics({});

    // Reset all orchestrators to be safe
    if (selectedEngine === 'Advisor Finder') {
      findAdvisorOrchestrator.reset();
    } else if (selectedClient === 'Video CX') {
      videoCXOrchestrator.reset();
    } else {
      enrichmentOrchestrator.reset();
    }

    // Navigate to home
    navigate('/');
  };

  const resetProcessing = () => {
    setProcessedData(null);
    setAnalytics({});
    setFilterAnalytics({});

    // Reset the appropriate orchestrator
    if (selectedEngine === 'Advisor Finder') {
      findAdvisorOrchestrator.reset();
    } else if (selectedClient === 'Video CX') {
      videoCXOrchestrator.reset();
    } else {
      enrichmentOrchestrator.reset();
    }
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <header className="mb-12 flex items-center">
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
      </header>

      <Routes>
        {/* Common routes */}
        <Route path="/" element={<LandingPage onEngineSelect={handleEngineSelection} />} />
        <Route path="/client" element={<ClientSelectionPage engine={selectedEngine} onClientSelect={handleClientSelection} onBack={handleBackNavigation} />} />
        <Route path="/advisor" element={<AdvisorSelectionPage client={selectedClient} onAdvisorSelect={handleAdvisorSelection} onBack={handleBackNavigation} />} />
        <Route path="/upload" element={<FileUploadPage onFileUpload={handleFileUpload} onBack={handleBackNavigation} />} />

        {/* Incommon AI specific routes */}
        <Route path="/incommon/processing" element={
          <OrchestratedProcessingPage
            csvData={csvData}
            onProcessingComplete={(data) => handleProcessingComplete(data, 'Incommon AI')}
            onBack={handleBackNavigation}
          />
        } />
        <Route path="/incommon/results" element={
          <ResultsPage
            processedData={processedData}
            originalCount={csvData?.length || 0}
            analytics={analytics}
            finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
            filterAnalytics={filterAnalytics}
            onBack={handleBackNavigation}
          />
        } />

        {/* VideoCX specific routes */}
        <Route path="/videocx/processing" element={
          <VideoCXProcessingPage
            csvData={csvData}
            onProcessingComplete={(data) => handleProcessingComplete(data, 'Video CX')}
            onBack={handleBackNavigation}
          />
        } />
        <Route path="/videocx/results" element={
          <VideoCXResultsPage
            processedData={processedData}
            originalCount={csvData?.length || 0}
            analytics={analytics}
            finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
            filterAnalytics={filterAnalytics}
            onBack={handleBackNavigation}
          />
        } />

        {/* FindAdvisor specific routes */}
        <Route path="/find-advisor/videocx/processing" element={
          <FindAdvisorProcessingPage
            csvData={csvData}
            onProcessingComplete={(data) => handleProcessingComplete(data, 'Find Advisor')}
            onBack={handleBackNavigation}
          />
        } />
        <Route path="/find-advisor/videocx/results" element={
          <FindAdvisorResultsPage
            processedData={processedData}
            originalCount={csvData?.length || 0}
            analytics={analytics}
            finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
            filterAnalytics={filterAnalytics}
            onBack={handleBackNavigation}
          />
        } />
      </Routes>
    </div>
  );
};

export default App;