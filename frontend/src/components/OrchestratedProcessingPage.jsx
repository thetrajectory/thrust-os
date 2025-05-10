// components/OrchestratedProcessingPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import enrichmentOrchestrator from '../services/enrichmentOrchestrator';
import enrichmentOrchestratorUtils from '../utils/enrichmentOrchestratorUtils';
import storageUtils from '../utils/storageUtils';

const OrchestratedProcessingPage = () => {
  const navigate = useNavigate();

  // State management
  const [processStatus, setProcessStatus] = useState({});
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [analytics, setAnalytics] = useState({});
  const [filterAnalytics, setFilterAnalytics] = useState({});
  const [isCancelling, setIsCancelling] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [csvData, setCsvData] = useState(null);

  const [userScrolling, setUserScrolling] = useState(false);
  const logsContainerRef = useRef(null);

  // Refs
  const logsEndRef = useRef(null);
  const initRef = useRef(false);


  // Add handlers for detecting user scroll interaction
  const handleScroll = () => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10; // Within 10px of bottom

    // User is considered to be manually scrolling if they're not at the bottom
    setUserScrolling(!isAtBottom);
  };


  // Start processing when component mounts or if not started yet
  useEffect(() => {
    // Try to get CSV data from session storage
    if (!csvData) {
      const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
      if (storedCsvData) {
        setCsvData(storedCsvData);
      }
    }

    if (!initRef.current && csvData && csvData.length > 0) {
      console.log("Starting orchestrator pipeline");
      initRef.current = true;

      // Set up callbacks
      const logCallback = (logEntry) => {
        setLogs(prevLogs => [...prevLogs, logEntry]);
        // Save logs to session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.LOGS, [...logs, logEntry]);
      };

      const progressCallback = (percent) => {
        setProgress(percent);
      };

      const statusCallback = (status) => {
        setProcessStatus(status);
        // Save status to session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS, status);
      };

      // Initialize the orchestrator with the CSV data and callbacks
      enrichmentOrchestrator.setInitialData(csvData);
      enrichmentOrchestrator.setCallbacks({
        logCallback,
        progressCallback,
        statusCallback
      });

      // Start processing the first step
      const startPipeline = async () => {
        try {
          setIsProcessing(true);
          await enrichmentOrchestrator.processCurrentStep();
          setIsProcessing(false);
          // Continue processing is handled by the continueProcessing function
        } catch (error) {
          setIsProcessing(false);
          console.error("Error starting pipeline:", error);
        }
      };

      startPipeline();
    } else if (!initRef.current) {
      // Try to load state from storage
      const storedLogs = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.LOGS);
      const storedStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS);

      if (storedLogs) setLogs(storedLogs);
      if (storedStatus) setProcessStatus(storedStatus);

      if (csvData && csvData.length > 0) {
        console.log("Resuming from stored data");
        initRef.current = true;

        // Set up the same callbacks
        const logCallback = (logEntry) => {
          setLogs(prevLogs => [...prevLogs, logEntry]);
          storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.LOGS, [...logs, logEntry]);
        };

        const progressCallback = (percent) => {
          setProgress(percent);
        };

        const statusCallback = (status) => {
          setProcessStatus(status);
          storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS, status);
        };

        // Load orchestrator state
        enrichmentOrchestrator.setInitialData(csvData);
        enrichmentOrchestrator.setCallbacks({
          logCallback,
          progressCallback,
          statusCallback
        });

        // Try to load orchestrator state
        enrichmentOrchestratorUtils.loadOrchestratorState(enrichmentOrchestrator);

        // Continue processing if not complete
        if (!enrichmentOrchestrator.processingComplete &&
          enrichmentOrchestrator.currentStepIndex < enrichmentOrchestrator.pipeline.length) {
          continueProcessing();
        } else if (enrichmentOrchestrator.processingComplete) {
          setProcessingComplete(true);
        }
      }
    }
  }, [csvData, logs]);

  // Monitor orchestrator state changes
  useEffect(() => {
    const interval = setInterval(() => {
      const state = enrichmentOrchestrator.getState();

      // Update processing and cancelling state
      setIsProcessing(state.isProcessing);
      setIsCancelling(state.isCancelling);

      // Update completion state
      if (state.processingComplete !== processingComplete) {
        setProcessingComplete(state.processingComplete);
      }

      // Update analytics
      if (state.analytics !== analytics) {
        setAnalytics(state.analytics);
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ANALYTICS, state.analytics);
      }

      // Update filter analytics
      if (state.filterAnalytics !== filterAnalytics) {
        setFilterAnalytics(state.filterAnalytics);
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FILTER_ANALYTICS, state.filterAnalytics);
      }

      // Update status
      if (state.stepStatus !== processStatus) {
        setProcessStatus(state.stepStatus);
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS, state.stepStatus);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [processingComplete, analytics, filterAnalytics, processStatus]);

  // Define the enrichment steps based on the orchestrator pipeline
  const steps = [
    {
      id: 'titleRelevance',
      name: 'Title Relevance Analysis',
      description: 'Evaluating job titles to classify as Founder, Relevant, or Irrelevant'
    },
    {
      id: 'apolloEnrichment',
      name: 'Apollo Lead Enrichment',
      description: 'Fetching detailed person and company information (only for Founder/Relevant)'
    },
    {
      id: 'headcountFilter',
      name: 'Headcount Filtering',
      description: 'Filtering companies by employee count (10-1500)'
    },
    {
      id: 'domainScraping',
      name: 'Website Scraping',
      description: 'Extracting content and sitemap from company websites'
    },
    {
      id: 'companyRelevance',
      name: 'Company Relevance Scoring',
      description: 'Analyzing companies for relevance (keeping scores 3+)'
    },
    {
      id: 'indianLeads',
      name: 'Indian Presence Analysis',
      description: 'Determining company presence in India (must be <20%)'
    },
    {
      id: 'otherCountryLeads',
      name: 'Other Country Presence Analysis',
      description: 'Determining company presence in other countries'
    },
    {
      id: 'openJobs',
      name: 'Open Jobs Scraping',
      description: 'Collecting information about company job openings'
    }
  ];

  // Status indicator component
  const StatusIndicator = ({ status }) => {
    if (status === 'pending') {
      return <div className="w-4 h-4 rounded-full bg-gray-300"></div>;
    } else if (status === 'processing') {
      return <div className="w-4 h-4 rounded-full bg-yellow-400 animate-pulse"></div>;
    } else if (status === 'complete') {
      return <div className="w-4 h-4 rounded-full bg-green-500"></div>;
    } else if (status === 'error') {
      return <div className="w-4 h-4 rounded-full bg-red-500"></div>;
    } else if (status === 'cancelled') {
      return <div className="w-4 h-4 rounded-full bg-orange-500"></div>;
    }
    return null;
  };

  // Analytics display component
  const AnalyticsDisplay = ({ stepId, analytics }) => {
    if (!analytics) return null;

    const safeNumber = (value) => {
      if (value === undefined || value === null || isNaN(value)) {
        return 0;
      }
      return Number.isInteger(value) ? value : Number(value.toFixed(0));
    };

    switch (stepId) {
      case 'titleRelevance':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.founderCount)}</div>
              <div>Founder</div>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-bold text-blue-700">{safeNumber(analytics.relevantCount)}</div>
              <div>Relevant</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="font-bold text-gray-700">{safeNumber(analytics.irrelevantCount)}</div>
              <div>Irrelevant</div>
            </div>
          </div>
        );

      case 'apolloEnrichment':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.supabaseHits)}</div>
              <div>From Supabase</div>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-bold text-blue-700">{safeNumber(analytics.apolloFetches)}</div>
              <div>From Apollo</div>
            </div>
            <div className="bg-red-50 p-2 rounded">
              <div className="font-bold text-red-700">{safeNumber(analytics.errorCount)}</div>
              <div>Errors</div>
            </div>
          </div>
        );

      case 'headcountFilter':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.filteredCount)}</div>
              <div>Passed Filter</div>
            </div>
            <div className="bg-red-50 p-2 rounded">
              <div className="font-bold text-red-700">{safeNumber(analytics.tooSmallCount)}</div>
              <div>Too Small</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.tooLargeCount)}</div>
              <div>Too Large</div>
            </div>
          </div>
        );

      case 'domainScraping':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.supabaseHits)}</div>
              <div>From Supabase</div>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-bold text-blue-700">{safeNumber(analytics.scrapeSuccesses)}</div>
              <div>Freshly Scraped</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.totalCreditsUsed)}</div>
              <div>Credits Used</div>
            </div>
          </div>
        );

      case 'companyRelevance':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.highRelevance)}</div>
              <div>High Relevance (3-5)</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.lowRelevance)}</div>
              <div>Low Relevance (1-2)</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="font-bold text-gray-700">{safeNumber(analytics.tooSmallCount + (analytics.tooLargeCount || 0))}</div>
              <div>Size Filtered</div>
            </div>
          </div>
        );

      case 'indianLeads':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-red-50 p-2 rounded">
              <div className="font-bold text-red-700">{safeNumber(analytics.tooManyIndiansCount)}</div>
              <div>High Indian Presence</div>
            </div>
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.totalProcessed - (analytics.tooManyIndiansCount || 0))}</div>
              <div>Acceptable Level</div>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-bold text-blue-700">{safeNumber(analytics.supabaseHits)}</div>
              <div>From Supabase</div>
            </div>
          </div>
        );

      case 'openJobs':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.jobCounts?.high)}</div>
              <div>High Hiring (20+)</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.jobCounts?.medium)}</div>
              <div>Medium Hiring (11-20)</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="font-bold text-gray-700">{safeNumber(analytics.jobCounts?.low)}</div>
              <div>Low Hiring (1-10)</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Handle automatic pipeline execution
  const continueProcessing = async () => {
    // Get current state to avoid race conditions
    const state = enrichmentOrchestrator.getState();

    // Check if we should continue processing
    if (state.currentStepIndex < enrichmentOrchestrator.pipeline.length &&
      !state.isProcessing &&
      !state.processingComplete &&
      !state.error) {
      try {
        setIsProcessing(true);
        const shouldContinue = await enrichmentOrchestrator.processCurrentStep();
        setIsProcessing(false);

        // Add a counter to prevent infinite loops
        if (shouldContinue &&
          !enrichmentOrchestrator.error &&
          !enrichmentOrchestrator.isCancelling &&
          enrichmentOrchestrator.currentStepIndex < enrichmentOrchestrator.pipeline.length) {
          // Use a setTimeout to prevent stack overflow
          setTimeout(continueProcessing, 500);
        } else if (!shouldContinue && !processingComplete) {
          // Check if we're done with processing
          if (enrichmentOrchestrator.processingComplete) {
            setProcessingComplete(true);
            // Save final state
            storageUtils.saveToStorage(
              storageUtils.STORAGE_KEYS.PROCESSED,
              enrichmentOrchestrator.processedData
            );
            storageUtils.saveToStorage(
              storageUtils.STORAGE_KEYS.FILTERED,
              enrichmentOrchestrator.filteredData
            );
          }
        }
      } catch (error) {
        setIsProcessing(false);
        console.error("Error in pipeline:", error);
      }
    }
  };

  // Handle cancellation
  const handleCancelProcessing = () => {
    // Log termination message
    const terminationLog = {
      timestamp: new Date().toLocaleTimeString(),
      message: "PROCESSING TERMINATED BY USER"
    };

    // Add termination message to logs
    setLogs(prevLogs => [...prevLogs, terminationLog]);

    // Save logs to storage with termination message
    const updatedLogs = [...logs, terminationLog];
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.LOGS, updatedLogs);

    // Force all processing to stop immediately
    setIsProcessing(false);
    setIsCancelling(false);

    // Mark orchestrator as complete to prevent further processing
    enrichmentOrchestrator.processingComplete = true;

    // Mark the current step as terminated
    const currentStepId = enrichmentOrchestrator.pipeline[enrichmentOrchestrator.currentStepIndex];
    if (currentStepId) {
      const updatedStatus = { ...processStatus };
      updatedStatus[currentStepId] = {
        status: 'cancelled',
        message: 'Terminated by user'
      };
      setProcessStatus(updatedStatus);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS, updatedStatus);
    }

    // Save the current state of data processing
    storageUtils.saveToStorage(
      storageUtils.STORAGE_KEYS.PROCESSED,
      enrichmentOrchestrator.processedData || csvData
    );
    storageUtils.saveToStorage(
      storageUtils.STORAGE_KEYS.FILTERED,
      enrichmentOrchestrator.filteredData || enrichmentOrchestrator.processedData || csvData
    );

    // Optional: Jump directly to results page instead of waiting
    handleViewResults();
  };

  // Enhance handleViewResults to handle terminated state
  const handleViewResults = () => {
    // Get the data regardless of completion state
    const allData = enrichmentOrchestrator.processedData || csvData;

    // Save processed data
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSED, allData);

    // Get any filtered data if available, otherwise use all processed data
    const filteredData = enrichmentOrchestrator.filteredData || allData;
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FILTERED, filteredData);

    // Add termination analytics if cancelled
    if (isCancelling) {
      const terminationAnalytics = {
        terminated: true,
        terminationTime: new Date().toISOString(),
        completedSteps: enrichmentOrchestrator.currentStepIndex,
        totalSteps: enrichmentOrchestrator.pipeline.length
      };

      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.ANALYTICS,
        { ...analytics, termination: terminationAnalytics }
      );
    }

    // Navigate to results page
    navigate('/results');
  };

  // Ensure the pipeline continues automatically
  useEffect(() => {
    if (initRef.current && !isProcessing &&
      !processingComplete &&
      !enrichmentOrchestrator.error) {
      continueProcessing();
    }
  }, [isProcessing, enrichmentOrchestrator.currentStepIndex]);


  const handleBack = () => {
    navigate('/upload');
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
        disabled={isProcessing && !isCancelling}
      >
        Back to previous screen
      </button>

      <h2 className="text-4xl font-bold text-center mb-8">
        Processing Data
      </h2>

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6">
        {/* Left side: Steps and progress */}
        <div className="w-full md:w-1/2">
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">Enrichment Progress</h3>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-4 mb-6">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {/* Steps */}
            <div className="space-y-4">
              {steps.map((step, index) => {
                const currentStep = enrichmentOrchestrator.currentStepIndex;
                return (
                  <div
                    key={step.id}
                    className={`flex flex-col p-4 border rounded-lg ${index === currentStep && isProcessing
                      ? 'border-yellow-400 bg-yellow-50'
                      : index < currentStep
                        ? 'border-green-500 bg-green-50'
                        : index === currentStep && !isProcessing && processStatus[step.id]?.status === 'error'
                          ? 'border-red-500 bg-red-50'
                          : 'border-gray-200'
                      }`}
                  >
                    <div className="flex items-center">
                      <StatusIndicator status={processStatus[step.id]?.status} />

                      <div className="ml-4 flex-grow">
                        <div className="font-medium">{step.name}</div>
                        <div className="text-sm text-gray-600">{step.description}</div>
                        {processStatus[step.id]?.message && (
                          <div className={`text-sm ${processStatus[step.id]?.status === 'error'
                            ? 'text-red-600'
                            : processStatus[step.id]?.status === 'cancelled'
                              ? 'text-orange-600'
                              : 'text-gray-600'
                            }`}>
                            {processStatus[step.id].message}
                          </div>
                        )}
                      </div>

                      {/* Step indicator */}
                      <div className="text-sm text-gray-500">
                        {processStatus[step.id]?.status === 'complete'
                          ? '✓ Complete'
                          : processStatus[step.id]?.status === 'processing'
                            ? 'In Progress'
                            : processStatus[step.id]?.status === 'error'
                              ? '✗ Error'
                              : processStatus[step.id]?.status === 'cancelled'
                                ? '✓ Cancelled'
                                : 'Pending'}
                      </div>
                    </div>

                    {/* Show analytics if available */}
                    {analytics && analytics[step.id] && (
                      <AnalyticsDisplay
                        stepId={step.id}
                        analytics={analytics[step.id]}
                      />
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
                  className={`px-4 py-2 bg-red-600 text-white rounded-lg ${isCancelling
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-red-700'
                    }`}
                >
                  {isCancelling ? 'Cancelling...' : 'Cancel Processing'}
                </button>
              ) : (
                enrichmentOrchestrator.error ? (
                  <button
                    onClick={() => {
                      enrichmentOrchestrator.error = null;
                      enrichmentOrchestrator.processCurrentStep().then(() => {
                        continueProcessing();
                      });
                    }}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
                  >
                    Retry Current Step
                  </button>
                ) : null
              )}

              {/* Always provide view results button for early export */}
              <button
                onClick={handleViewResults}
                className={`px-4 py-2 ${processingComplete || !isProcessing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600'} text-white rounded-lg`}
                disabled={isProcessing && !isCancelling}
              >
                {processingComplete ? 'View Results' : 'Export Current Results'}
              </button>
            </div>
          </div>

          {/* Data preview */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-4">Data Preview</h3>

            {enrichmentOrchestrator.error && (
              <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded mb-4">
                <p className="font-bold">Error:</p>
                <p>{enrichmentOrchestrator.error.message}</p>
              </div>
            )}

            {csvData && csvData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        First Name
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        Last Name
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        Company
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        Position
                      </th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-600 bg-gray-100">
                        Title Relevance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {csvData.slice(0, 3).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td className="px-3 py-2 text-sm text-gray-800">
                          {row.first_name || row.person?.first_name || ''}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-800">
                          {row.last_name || row.person?.last_name || ''}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-800">
                          {row.company || row.organization?.name || ''}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-800">
                          {row.position || row.person?.title || ''}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-800">
                          {row.titleRelevance || 'Pending'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvData.length > 3 && (
                  <div className="mt-2 text-sm text-gray-500 text-center">
                    Showing 3 of {csvData.length} rows
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Right side: Logs */}
        <div className="w-full md:w-1/2">
          <div className="bg-white shadow-md rounded-lg p-6 h-full">
            <h3 className="text-xl font-semibold mb-4">Processing Logs</h3>

            <div
              className="bg-gray-900 text-gray-100 p-4 rounded-lg h-[500px] overflow-y-auto font-mono text-sm text-left"
              style={{ overflowY: 'auto', maxHeight: '500px' }}
            >
              {logs && logs.length > 0 ? (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-blue-400">[{log.timestamp}]</span>{' '}
                    <span>{log.message}</span>
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
                  Processing in progress...
                </div>
              ) : (
                processingComplete ? (
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                    Processing complete. Click "View Results" to continue.
                  </div>
                ) : (
                  enrichmentOrchestrator.error ? (
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 mr-2"></div>
                      Processing failed. Check the logs above and try to retry the current step.
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-gray-500 mr-2"></div>
                      Processing not started or paused.
                    </div>
                  )
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrchestratedProcessingPage;