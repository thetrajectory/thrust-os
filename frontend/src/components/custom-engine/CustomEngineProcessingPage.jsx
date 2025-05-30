// components/custom-engine/CustomEngineProcessingPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customEngineFileStorageService from '../../services/custom-engine/customEngineFileStorageService';
import customEngineOrchestrator from '../../services/custom-engine/customEngineOrchestrator';
import { serviceRegistry } from '../../services/engine-builder/serviceRegistry';
import storageUtils from '../../utils/storageUtils';

const CustomEngineProcessingPage = ({ engineData, onProcessingComplete, onBack }) => {
  const navigate = useNavigate();

  // State management
  const [processStatus, setProcessStatus] = useState({});
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [analytics, setAnalytics] = useState({});
  const [isCancelling, setIsCancelling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvData, setCsvData] = useState(null);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  // Refs
  const logsEndRef = useRef(null);
  const initRef = useRef(false);
  const logsContainerRef = useRef(null);

  // Load CSV data and engine configuration
  useEffect(() => {
    if (!csvData) {
      const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
      if (storedCsvData) {
        setCsvData(storedCsvData);
        setTotalRows(storedCsvData.length);
      }
    }

    // Ensure the custom engine data is loaded
    if (!engineData) {
      const storedEngineData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);
      if (!storedEngineData) {
        navigate('/client');
        return;
      }
    }
  }, [csvData, navigate, engineData]);

  // Initialize processing
  useEffect(() => {
    if (!initRef.current && csvData && csvData.length > 0 && engineData) {
      console.log("Starting custom engine orchestrator pipeline");
      initRef.current = true;

      // Set up callbacks
      const logCallback = (logEntry) => {
        setLogs(prevLogs => {
          // Ensure the log entry is properly formatted
          const formattedLog = formatLogEntry(logEntry);
          const newLogs = [...prevLogs, formattedLog];
          // Save logs to session storage
          storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_LOGS, newLogs);
          return newLogs;
        });
      };

      const progressCallback = (percent, message) => {
        setProgress(percent);
        if (message) {
          logCallback({
            timestamp: new Date().toLocaleTimeString(),
            message
          });
        }
      };

      const statusCallback = (status) => {
        setProcessStatus(status);
        // Save status to session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_STATUS, status);
      };

      // Initialize the orchestrator
      customEngineOrchestrator.setEngine(engineData);
      customEngineOrchestrator.setInitialData(csvData);
      customEngineOrchestrator.setCallbacks({
        logCallback,
        progressCallback,
        statusCallback
      });

      // Start processing
      startPipeline();
    }
  }, [csvData, engineData]);

  // Format log entry to ensure it has proper structure
  const formatLogEntry = (logEntry) => {
    // If logEntry is already properly formatted
    if (logEntry && typeof logEntry === 'object' && logEntry.timestamp && logEntry.message) {
      return {
        timestamp: logEntry.timestamp,
        message: typeof logEntry.message === 'object'
          ? JSON.stringify(logEntry.message)
          : String(logEntry.message)
      };
    }

    // If logEntry is a string
    if (typeof logEntry === 'string') {
      return {
        timestamp: new Date().toLocaleTimeString(),
        message: logEntry
      };
    }

    // If logEntry is an object but not properly formatted
    if (logEntry && typeof logEntry === 'object') {
      return {
        timestamp: logEntry.timestamp || new Date().toLocaleTimeString(),
        message: logEntry.message
          ? (typeof logEntry.message === 'object' ? JSON.stringify(logEntry.message) : String(logEntry.message))
          : JSON.stringify(logEntry)
      };
    }

    // Fallback for any other type
    return {
      timestamp: new Date().toLocaleTimeString(),
      message: String(logEntry)
    };
  };

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current && !userScrolling) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle scroll for logs
  const [userScrolling, setUserScrolling] = useState(false);

  const handleScroll = () => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    setUserScrolling(!isAtBottom);
  };

  // Start pipeline processing
  const startPipeline = async () => {
    try {
      setIsProcessing(true);

      // Calculate batches for large datasets
      const batchSize = 100; // Process 100 rows at a time
      const batches = Math.ceil(csvData.length / batchSize);
      setTotalBatches(batches);

      if (csvData.length > 1000) {
        // Use file storage service for large datasets
        await processLargeDataset();
      } else {
        // Use standard orchestrator for smaller datasets
        await processStandardDataset();
      }

    } catch (error) {
      setIsProcessing(false);
      console.error("Error starting pipeline:", error);
      addLog(`Error: ${error.message}`);
    }
  };

  // Process large datasets using file storage service
  const processLargeDataset = async () => {
    try {
      const processFunction = async (chunk) => {
        setCurrentBatch(prev => prev + 1);

        // Process chunk through orchestrator
        customEngineOrchestrator.setInitialData(chunk);
        await customEngineOrchestrator.processCurrentStep();

        // Continue processing all steps for this chunk
        while (customEngineOrchestrator.currentStepIndex < customEngineOrchestrator.pipeline.length) {
          await customEngineOrchestrator.processCurrentStep();
        }

        setProcessedRows(prev => prev + chunk.length);
        return customEngineOrchestrator.processedData;
      };

      const progressCallback = (percent, message) => {
        setProgress(percent);
        addLog(message);
      };

      const results = await customEngineFileStorageService.processLargeDataset(
        csvData,
        processFunction,
        progressCallback
      );

      // Store results
      customEngineFileStorageService.storeProcessedData(results);
      setProcessingComplete(true);
      setIsProcessing(false);

      addLog(`Large dataset processing complete! Processed ${results.length} rows.`);

    } catch (error) {
      console.error("Error in large dataset processing:", error);
      addLog(`Error in large dataset processing: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // Process standard datasets using orchestrator
  const processStandardDataset = async () => {
    try {
      let shouldContinue = true;

      while (shouldContinue && !customEngineOrchestrator.processingComplete) {
        shouldContinue = await customEngineOrchestrator.processCurrentStep();

        // Update UI state
        const state = customEngineOrchestrator.getState();
        setIsProcessing(state.isProcessing);
        setIsCancelling(state.isCancelling);
        setProcessingComplete(state.processingComplete);
        setAnalytics(state.analytics);
        setProcessStatus(state.stepStatus);

        if (state.processingComplete) {
          // Store processed data
          storageUtils.saveToStorage(
            storageUtils.STORAGE_KEYS.PROCESSED_DATA,
            customEngineOrchestrator.processedData
          );

          customEngineFileStorageService.storeProcessedData(customEngineOrchestrator.processedData);
          addLog('All processing steps completed successfully!');
          break;
        }

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setIsProcessing(false);

    } catch (error) {
      console.error("Error in standard processing:", error);
      addLog(`Error in processing: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // Add log entry
  const addLog = (message) => {
    if (message === undefined || message === null) {
      message = "Undefined log message";
    }

    const logEntry = formatLogEntry({
      timestamp: new Date().toLocaleTimeString(),
      message
    });

    setLogs(prevLogs => [...prevLogs, logEntry]);
  };

  // Cancel processing
  const handleCancelProcessing = () => {
    if (!customEngineOrchestrator) return;

    const terminationLog = {
      timestamp: new Date().toLocaleTimeString(),
      message: "PROCESSING TERMINATED BY USER"
    };

    setLogs(prevLogs => [...prevLogs, terminationLog]);
    setIsProcessing(false);
    setIsCancelling(false);

    customEngineOrchestrator.cancelProcessing();

    // Save current results
    const currentData = customEngineOrchestrator.processedData || csvData;
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA, currentData);
    customEngineFileStorageService.storeProcessedData(currentData);

    handleViewResults();
  };

  // View results
  const handleViewResults = () => {
    const data = customEngineOrchestrator?.processedData ||
      customEngineFileStorageService.getProcessedData() ||
      csvData;

    if (!data || data.length === 0) {
      addLog('No processed data available');
      return;
    }

    // Save data and analytics
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA, data);

    const processingStats = customEngineFileStorageService.getProcessingStats(data);
    const finalAnalytics = {
      originalCount: csvData?.length || 0,
      finalCount: processingStats.qualifiedLeads,
      filteredCounts: analytics,
      stepMetrics: Object.keys(analytics).map(key => ({
        stepName: key,
        inputCount: analytics[key]?.inputCount || 0,
        outputCount: analytics[key]?.outputCount || 0,
        filteredCount: analytics[key]?.filteredCount || 0,
        processingTime: analytics[key]?.processingTime || 0
      })),
      processingStats
    };

    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS, finalAnalytics);

    if (onProcessingComplete) {
      onProcessingComplete(data);
    } else {
      navigate('/custom-engine/results');
    }
  };

  // Status indicator component
  const StatusIndicator = ({ status }) => {
    const getStatusColor = () => {
      switch (status) {
        case 'pending': return 'bg-gray-300';
        case 'processing': return 'bg-yellow-400 animate-pulse';
        case 'complete': return 'bg-green-500';
        case 'error': return 'bg-red-500';
        case 'cancelled': return 'bg-orange-500';
        default: return 'bg-gray-300';
      }
    };

    return <div className={`w-4 h-4 rounded-full ${getStatusColor()}`}></div>;
  };

  // Get display name for service
  const getDisplayName = (serviceId) => {
    if (serviceRegistry[serviceId]) {
      return serviceRegistry[serviceId].displayName;
    }
    return serviceId.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  // Render service-specific progress indicators
  const renderServiceProgress = (stepId, status) => {
    // Apollo enrichment additional analyses
    if (stepId === 'apolloEnrichment') {
      const step = engineData?.pipeline?.steps?.find(s => s.service === stepId);
      if (step?.config?.options) {
        const options = step.config.options;
        
        if (options.analyzeWebsite || options.analyzeExperience || options.analyzeSitemap) {
          return (
            <div className="mt-2 pl-6">
              <p className="text-sm font-medium mb-1">Additional Analyses:</p>
              {options.analyzeWebsite && (
                <div className="flex items-center mb-1">
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    status === 'complete' ? 'bg-green-500' :
                    status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-xs">Website Analysis</span>
                </div>
              )}
              {options.analyzeExperience && (
                <div className="flex items-center mb-1">
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    status === 'complete' ? 'bg-green-500' :
                    status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-xs">Experience Analysis</span>
                </div>
              )}
              {options.analyzeSitemap && (
                <div className="flex items-center mb-1">
                  <div className={`w-3 h-3 rounded-full mr-2 ${
                    status === 'complete' ? 'bg-green-500' :
                    status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
                  }`}></div>
                  <span className="text-xs">Sitemap Analysis</span>
                </div>
              )}
            </div>
          );
        }
      }
    }

    // Job openings service progress
    if (stepId === 'jobOpenings') {
      return (
        <div className="mt-2 pl-6">
          <p className="text-sm font-medium mb-1">Job Analysis Process:</p>
          <div className="flex items-center mb-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              status === 'complete' ? 'bg-green-500' :
              status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
            }`}></div>
            <span className="text-xs">Coresignal API Fetch</span>
          </div>
          <div className="flex items-center mb-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              status === 'complete' ? 'bg-green-500' :
              status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
            }`}></div>
            <span className="text-xs">Jobs Count Extraction</span>
          </div>
          {engineData?.pipeline?.steps?.find(s => s.service === stepId)?.config?.prompt && (
            <div className="flex items-center mb-1">
              <div className={`w-3 h-3 rounded-full mr-2 ${
                status === 'complete' ? 'bg-green-500' :
                status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
              }`}></div>
              <span className="text-xs">AI Insights Analysis</span>
            </div>
          )}
        </div>
      );
    }

    // Financial data service progress
    if (stepId === 'financialData') {
      return (
        <div className="mt-2 pl-6">
          <p className="text-sm font-medium mb-1">Financial Analysis Steps:</p>
          <div className="flex items-center mb-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              status === 'complete' ? 'bg-green-500' :
              status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
            }`}></div>
            <span className="text-xs">Public Company Detection</span>
          </div>
          <div className="flex items-center mb-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              status === 'complete' ? 'bg-green-500' :
              status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
            }`}></div>
            <span className="text-xs">Annual Report Fetch</span>
          </div>
          <div className="flex items-center mb-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${
              status === 'complete' ? 'bg-green-500' :
              status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-gray-300'
            }`}></div>
            <span className="text-xs">Financial Insights Analysis</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const currentEngineData = engineData || storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);

  return (
    <div className="flex flex-col items-center justify-center max-w-7xl mx-auto">
      <button
        onClick={onBack}
        className="self-start mb-4 text-blue-600 hover:underline"
        disabled={isProcessing && !isCancelling}
      >
        Back to previous screen
      </button>

      <h2 className="text-4xl font-bold text-center mb-8">
        Processing Your Data with {currentEngineData?.engine_name || 'Custom Engine'}
      </h2>

      {/* Processing Overview */}
      <div className="w-full mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{totalRows.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Total Rows</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{processedRows.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Processed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{currentBatch}</div>
            <div className="text-sm text-gray-600">Current Batch</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{progress}%</div>
            <div className="text-sm text-gray-600">Complete</div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col lg:flex-row gap-6">
        {/* Left side: Steps and progress */}
        <div className="w-full lg:w-1/2">
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">Processing Progress</h3>

            {/* Overall progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 mb-6">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {currentEngineData?.pipeline?.steps?.map((step, index) => {
                const currentStep = customEngineOrchestrator?.currentStepIndex || 0;
                const stepId = step.service;
                const stepStatus = processStatus[stepId]?.status;

                return (
                  <div
                    key={stepId}
                    className={`flex flex-col p-4 border rounded-lg ${
                      index === currentStep && isProcessing
                      ? 'border-yellow-400 bg-yellow-50'
                      : index < currentStep
                        ? 'border-green-500 bg-green-50'
                        : index === currentStep && !isProcessing && stepStatus === 'error'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center">
                    <StatusIndicator status={stepStatus} />

                    <div className="ml-4 flex-grow">
                      <div className="font-medium">{getDisplayName(stepId)}</div>
                      {processStatus[stepId]?.message && (
                        <div className={`text-sm ${
                          stepStatus === 'error' ? 'text-red-600' :
                          stepStatus === 'cancelled' ? 'text-orange-600' : 'text-gray-600'
                        }`}>
                          {typeof processStatus[stepId].message === 'object'
                            ? JSON.stringify(processStatus[stepId].message)
                            : processStatus[stepId].message}
                        </div>
                      )}

                      {/* Render service-specific progress */}
                      {renderServiceProgress(stepId, stepStatus)}
                    </div>

                    <div className="text-sm text-gray-500">
                      {stepStatus === 'complete' ? '✓ Complete' :
                        stepStatus === 'processing' ? 'In Progress' :
                          stepStatus === 'error' ? '✗ Error' :
                            stepStatus === 'cancelled' ? '✓ Cancelled' : 'Pending'}
                    </div>
                  </div>

                  {/* Show analytics if available */}
                  {analytics && analytics[stepId] && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-green-50 p-2 rounded">
                        <div className="font-bold text-green-700">{analytics[stepId].inputCount || 0}</div>
                        <div>Input Count</div>
                      </div>
                      <div className="bg-blue-50 p-2 rounded">
                        <div className="font-bold text-blue-700">{analytics[stepId].outputCount || 0}</div>
                        <div>Output Count</div>
                      </div>
                      <div className="bg-red-50 p-2 rounded">
                        <div className="font-bold text-red-700">{analytics[stepId].filteredCount || 0}</div>
                        <div>Filtered</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Control buttons */}
          <div className="mt-6 flex justify-between">
            {isProcessing ? (
              <button
                onClick={handleCancelProcessing}
                disabled={isCancelling}
                className={`px-4 py-2 bg-red-600 text-white rounded-lg ${
                  isCancelling ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-700'
                }`}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Processing'}
              </button>
            ) : (
              customEngineOrchestrator?.error && (
                <button
                  onClick={startPipeline}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
                >
                  Retry Processing
                </button>
              )
            )}

            <button
              onClick={handleViewResults}
              className={`px-4 py-2 ${
                processingComplete || !isProcessing
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-600'
              } text-white rounded-lg`}
              disabled={isProcessing && !isCancelling}
            >
              {processingComplete ? 'View Results' : 'Export Current Results'}
            </button>
          </div>
        </div>

        {/* Data preview */}
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Data Preview</h3>

          {customEngineOrchestrator?.error && (
            <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded mb-4">
              <p className="font-bold">Error:</p>
              <p>{customEngineOrchestrator.error.message}</p>
            </div>
          )}

          {csvData && csvData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    {Object.keys(csvData[0]).slice(0, 4).map((key, index) => (
                      <th key={index} className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {csvData.slice(0, 3).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {Object.keys(row).slice(0, 4).map((key, colIndex) => (
                        <td key={colIndex} className="px-3 py-2 text-sm text-gray-800">
                          {typeof row[key] === 'object'
                            ? JSON.stringify(row[key]).substring(0, 30)
                            : String(row[key] || '').substring(0, 30)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length > 3 && (
                <div className="mt-2 text-sm text-gray-500 text-center">
                  Showing 3 of {csvData.length.toLocaleString()} rows
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-500">No data available</div>
          )}
        </div>
      </div>

      {/* Right side: Logs */}
      <div className="w-full lg:w-1/2">
        <div className="bg-white shadow-md rounded-lg p-6 h-full">
          <h3 className="text-xl font-semibold mb-4">Processing Logs</h3>

          <div
            ref={logsContainerRef}
            onScroll={handleScroll}
            className="bg-gray-900 text-gray-100 p-4 rounded-lg h-[600px] overflow-y-auto font-mono text-sm text-left"
          >
            {logs && logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  <span className="text-blue-400">[{log.timestamp || ''}]</span>{' '}
                  <span>
                    {typeof log.message === 'object'
                      ? JSON.stringify(log.message)
                      : String(log.message || '')}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">Waiting to start processing...</div>
            )}
            <div ref={logsEndRef} />
          </div>

          <div className="mt-4 text-sm text-gray-500">
            {isProcessing ? (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
                Processing in progress... {totalRows > 1000 ? '(Large dataset mode)' : ''}
              </div>
            ) : processingComplete ? (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                Processing complete. Click "View Results" to continue.
              </div>
            ) : customEngineOrchestrator?.error ? (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                Processing failed. Check the logs and try to retry.
              </div>
            ) : (
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-gray-500 mr-2"></div>
                Processing not started or paused.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
};

export default CustomEngineProcessingPage;