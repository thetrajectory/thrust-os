// App.jsx
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';


// Import services
import defaultCustomOrchestrator from './services/custom-engine/customEngineOrchestrator'; // Default custom orchestrator
import orchestratorFactory from './services/custom-engine/customEngineOrchestratorFactory'; // Factory for custom orchestrators
import enrichmentOrchestrator from './services/enrichmentOrchestrator'; // Incommon
import findAdvisorOrchestrator from './services/find-advisor/videocx/findAdvisorOrchestrator'; // Advisor Finder
import videoCXOrchestrator from './services/videocx/videoCXOrchestrator'; // VideoCX
import storageUtils from './utils/storageUtils';

// Import dynamic router
import DynamicRoutes from './routes/dynamicRoutes';

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
  const [isCustomEngine, setIsCustomEngine] = useState(false);
  const [customEngineData, setCustomEngineData] = useState(null);

  // Load state from storage on component mount
  useEffect(() => {
    const storedClient = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
    const storedEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE);
    const storedAdvisor = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ADVISOR);
    const storedIsCustom = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE);
    const storedCustomData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);

    if (storedClient) setSelectedClient(storedClient);
    if (storedEngine) setSelectedEngine(storedEngine);
    if (storedAdvisor) setSelectedAdvisor(storedAdvisor);
    if (storedIsCustom) setIsCustomEngine(storedIsCustom === true);
    if (storedCustomData) {
      setCustomEngineData(storedCustomData);
      // Initialize the custom engine orchestrator with the stored data
      if (storedIsCustom) {
        const customOrchestrator = orchestratorFactory.getOrCreateOrchestrator(
          storedCustomData.engine_name,
          storedCustomData
        );
        console.log("Initialized custom engine orchestrator for:", storedCustomData.engine_name);
      }
    }

    console.log("Loaded client from storage:", storedClient);
    console.log("Is custom engine:", storedIsCustom);
  }, []);

  // When custom engine data changes, update the orchestrator
  useEffect(() => {
    if (isCustomEngine && customEngineData) {
      const customOrchestrator = orchestratorFactory.getOrCreateOrchestrator(
        customEngineData.engine_name,
        customEngineData
      );
      console.log("Updated custom engine orchestrator for:", customEngineData.engine_name);
    }
  }, [isCustomEngine, customEngineData]);

  // Map of orchestrators for different engines
  const orchestratorMap = {
    'Incommon AI': enrichmentOrchestrator,
    'Video CX': videoCXOrchestrator,
    'Advisor Finder': findAdvisorOrchestrator,
    'customEngine': {
      orchestrator: customEngineData ?
        orchestratorFactory.getOrCreateOrchestrator(customEngineData.engine_name, customEngineData) :
        defaultCustomOrchestrator,
      engineData: customEngineData
    }
  };

  // Get client path prefix based on selected engine/client
  const getClientPathPrefix = (client = null) => {
    // Use passed client parameter or the state value
    const clientName = client || selectedClient;
    const engineName = selectedEngine;

    // Handle custom engines
    if (isCustomEngine) {
      return 'custom-engine';
    }

    // For the Advisor Finder engine, return a specific path prefix
    if (engineName === 'Advisor Finder') {
      return 'find-advisor/videocx';
    }

    // Convert client name to lowercase and remove spaces for URL
    if (clientName === 'Incommon AI') return 'incommon';
    if (clientName === 'Video CX') return 'videocx';

    // Detect client from path if not in state
    if (location.pathname.includes('/videocx/')) return 'videocx';
    if (location.pathname.includes('/incommon/')) return 'incommon';
    if (location.pathname.includes('/find-advisor/')) return 'find-advisor/videocx';
    if (location.pathname.includes('/custom-engine/')) return 'custom-engine';

    return 'default'; // Fallback
  };

  // Handle engine selection
  const handleEngineSelection = (engine) => {
    setSelectedEngine(engine);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE, engine);

    // Reset custom engine flag
    setIsCustomEngine(false);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE, false);

    navigate('/client');
  };

  // Handle client selection
  // Handle client selection
  const handleClientSelection = (client, isCustom = false, engineData = null) => {
    console.log("Selected client:", client, "isCustom:", isCustom);
    setSelectedClient(client);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, client);

    // Handle custom engine
    if (isCustom && engineData) {
      setIsCustomEngine(true);
      setCustomEngineData(engineData);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE, true);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA, engineData);

      // Initialize the custom engine orchestrator
      const customOrchestrator = orchestratorFactory.getOrCreateOrchestrator(
        engineData.engine_name,
        engineData
      );
    }

    // Always navigate to advisor selection for all engines
    navigate('/advisor');
  };

  // Handle advisor selection
  const handleAdvisorSelection = (advisor) => {
    setSelectedAdvisor(advisor);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ADVISOR, advisor);
    navigate('/upload');
  };

  // Handle file upload
  const handleFileUpload = (file, data) => {
    setCsvFile(file);

    // Add advisor info to the data
    const enrichedData = data.map(row => ({
      ...row,
      advisorName: selectedAdvisor || 'Unknown',
      connected_on: row.connected_on || new Date().toISOString(),
      relevanceTag: ''
    }));

    setCsvData(enrichedData);
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, enrichedData);

    // Get the correct orchestrator and initialize it
    if (isCustomEngine && customEngineData) {
      const customOrchestrator = orchestratorFactory.getOrCreateOrchestrator(
        customEngineData.engine_name,
        customEngineData
      );
      customOrchestrator.setInitialData(enrichedData);
    } else if (selectedEngine === 'Advisor Finder') {
      findAdvisorOrchestrator.setInitialData(enrichedData);
    } else if (selectedClient === 'Video CX') {
      videoCXOrchestrator.setInitialData(enrichedData);
    } else {
      enrichmentOrchestrator.setInitialData(enrichedData);
    }

    // Navigate to the appropriate processing route
    const clientPrefix = getClientPathPrefix();
    navigate(`/${clientPrefix}/processing`);
  };

  // Handle processing completion
  const handleProcessingComplete = (data, clientType = null) => {
    // Use passed client type or current selected client
    const client = clientType || selectedClient;
    console.log("Processing complete for client:", client, "isCustom:", isCustomEngine);

    // Get the right orchestrator
    let orchestrator;
    if (isCustomEngine && customEngineData) {
      orchestrator = orchestratorFactory.getOrCreateOrchestrator(
        customEngineData.engine_name,
        customEngineData
      );
    } else if (selectedEngine === 'Advisor Finder') {
      orchestrator = findAdvisorOrchestrator;
    } else if (client === 'Video CX') {
      orchestrator = videoCXOrchestrator;
    } else {
      orchestrator = enrichmentOrchestrator;
    }

    // Make sure we have data
    const orchestratorData = orchestrator.processedData || data || csvData || [];

    if (!Array.isArray(orchestratorData)) {
      console.error("Invalid processed data from orchestrator:", orchestratorData);
      return;
    }

    setProcessedData(orchestratorData);

    // Update analytics state from orchestrator
    setAnalytics(orchestrator.analytics || {});
    setFilterAnalytics(orchestrator.filterAnalytics || {});

    // Navigate to appropriate results page
    const clientPrefix = getClientPathPrefix(client);
    console.log("Navigating to results with prefix:", clientPrefix);
    navigate(`/${clientPrefix}/results`);
  };

  // Handle back navigation
  const handleBackNavigation = () => {
    const path = location.pathname;
    const clientPrefix = getClientPathPrefix();

    console.log("Back navigation from:", path, "prefix:", clientPrefix);

    // Common paths
    if (path === '/client') {
      navigate('/');
      return;
    } else if (path === '/advisor') {
      navigate('/client');
      return;
    } else if (path === '/upload') {
      // If we came from Advisor Finder or custom engine, go back to client selection
      if (selectedEngine === 'Advisor Finder' || isCustomEngine) {
        navigate('/client');
      } else {
        navigate('/advisor');
      }
      return;
    }

    // Client-specific paths
    if (path.includes(`/${clientPrefix}/processing`)) {
      navigate('/upload');
      resetProcessing();
      return;
    }

    if (path.includes(`/${clientPrefix}/results`)) {
      navigate(`/${clientPrefix}/processing`);
      return;
    }

    // Custom engine paths
    if (path === '/custom-engine/upload') {
      navigate('/client');
      return;
    }

    // Default fallback - go to home
    navigate('/');
  };

  // Reset processing state
  const resetProcessing = () => {
    setProcessedData(null);
    setAnalytics({});
    setFilterAnalytics({});

    // Reset the appropriate orchestrator
    if (isCustomEngine && customEngineData) {
      orchestratorFactory.resetOrchestrator(customEngineData.engine_name);
    } else if (selectedEngine === 'Advisor Finder') {
      findAdvisorOrchestrator.reset();
    } else if (selectedClient === 'Video CX') {
      videoCXOrchestrator.reset();
    } else {
      enrichmentOrchestrator.reset();
    }
  };

  // Handle going back to home
  const handleGoToHome = () => {
    const clientPrefix = getClientPathPrefix();

    // If currently processing, ask for confirmation
    if (location.pathname.includes(`/${clientPrefix}/processing`) &&
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
    setIsCustomEngine(false);
    setCustomEngineData(null);

    // Reset all orchestrators
    if (isCustomEngine && customEngineData) {
      orchestratorFactory.resetOrchestrator(customEngineData.engine_name);
    }
    orchestratorFactory.resetAll();
    findAdvisorOrchestrator.reset();
    videoCXOrchestrator.reset();
    enrichmentOrchestrator.reset();

    // Clear storage
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.ENGINE);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.ADVISOR);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);

    // Navigate to home
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center">
          <h1
            className="text-2xl font-bold cursor-pointer hover:text-blue-600 transition-colors"
            onClick={handleGoToHome}
          >
            Trajectory
          </h1>
          {selectedClient && (
            <span className="ml-4 text-gray-600">
              {isCustomEngine ? 'Engine: ' : 'Client: '}{selectedClient}
              {selectedAdvisor && ` | Advisor: ${selectedAdvisor}`}
            </span>
          )}
        </div>

        {isCustomEngine && customEngineData && (
          <div className="bg-blue-50 px-3 py-1 rounded-full text-sm">
            Custom Engine: {customEngineData.engine_name}
          </div>
        )}
      </header>

      <DynamicRoutes
        handleEngineSelection={handleEngineSelection}
        handleClientSelection={handleClientSelection}
        handleAdvisorSelection={handleAdvisorSelection}
        handleFileUpload={handleFileUpload}
        handleProcessingComplete={handleProcessingComplete}
        handleBackNavigation={handleBackNavigation}
        orchestratorMap={orchestratorMap}
        csvData={csvData}
        processedData={processedData}
        analytics={analytics}
        filterAnalytics={filterAnalytics}
        isCustomEngine={isCustomEngine}
        customEngineData={customEngineData}
        selectedEngine={selectedEngine}
      />
    </div>
  );
};

export default App;