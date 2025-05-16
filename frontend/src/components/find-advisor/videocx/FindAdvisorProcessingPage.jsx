// File: src/components/find-advisor/videocx/FindAdvisorProcessingPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import findAdvisorOrchestrator from '../../../services/find-advisor/videocx/findAdvisorOrchestrator';
import storageUtils from '../../../utils/storageUtils';

const FindAdvisorProcessingPage = () => {
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
  const [loadedCsvData, setLoadedCsvData] = useState(null);

  // Refs
  const logsEndRef = useRef(null);
  const initRef = useRef(false);
  const logsContainerRef = useRef(null);

  useEffect(() => {
    // Ensure the correct client is set in storage when this component mounts
    const currentClient = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
    if (currentClient !== 'Video CX') {
      console.log("Setting client to Video CX in FindAdvisorProcessingPage");
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, 'Video CX');
    }
  }, []);

  // Start processing when component mounts or if not started yet
  useEffect(() => {
    // Try to get CSV data from props or session storage
    if (!loadedCsvData) {
      const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
      if (storedCsvData) {
        setLoadedCsvData(storedCsvData);
      }
    }

    if (!initRef.current && loadedCsvData && loadedCsvData.length > 0) {
      console.log("Starting Find Advisor orchestrator pipeline");
      initRef.current = true;

      // Set up callbacks
      const logCallback = (logEntry) => {
        setLogs(prevLogs => [...prevLogs, logEntry]);
        // Save logs to session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_LOGS, [...logs, logEntry]);
      };

      const progressCallback = (percent) => {
        setProgress(percent);
      };

      const statusCallback = (status) => {
        setProcessStatus(status);
        // Save status to session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESS_STATUS, status);
      };

      // Initialize the orchestrator with the CSV data and callbacks
      findAdvisorOrchestrator.setInitialData(loadedCsvData);
      findAdvisorOrchestrator.setCallbacks({
        logCallback,
        progressCallback,
        statusCallback
      });

      // Start processing the first step
      const startPipeline = async () => {
        try {
          setIsProcessing(true);
          await findAdvisorOrchestrator.processCurrentStep();
          setIsProcessing(false);
          // Continue processing is handled by the continueProcessing function
        } catch (error) {
          setIsProcessing(false);
          console.error("Error starting pipeline:", error);
        }
      };

      startPipeline();
    }
  }, [loadedCsvData, logs]);

  // Scroll to bottom of logs when new logs are added
  useEffect(() => {
    if (logsEndRef.current && !userScrolling) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Monitor orchestrator state changes
  useEffect(() => {
    const interval = setInterval(() => {
      const state = findAdvisorOrchestrator.getState();

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
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS, state.analytics);
      }

      // Update filter analytics
      if (state.filterAnalytics !== filterAnalytics) {
        setFilterAnalytics(state.filterAnalytics);
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_FILTER_ANALYTICS, state.filterAnalytics);
      }

      // Update status
      if (state.stepStatus !== processStatus) {
        setProcessStatus(state.stepStatus);
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESS_STATUS, state.stepStatus);
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
      description: 'Fetching detailed person and company information'
    },
    {
      id: 'employmentHistoryAnalysis',
      name: 'Employment History Analysis',
      description: 'Analyzing employment history to find advisor connections'
    },
    {
      id: 'connectionTimeAnalysis',
      name: 'Connection Time Analysis',
      description: 'Calculating time since connection to evaluate relationship age'
    }
  ];

  // User scrolling state
  const [userScrolling, setUserScrolling] = useState(false);

  // Handle scroll in logs container
  const handleScroll = () => {
    if (!logsContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10; // Within 10px of bottom

    // User is considered to be manually scrolling if they're not at the bottom
    setUserScrolling(!isAtBottom);
  };

  // Handle automatic pipeline execution
  const continueProcessing = async () => {
    // Get current state to avoid race conditions
    const state = findAdvisorOrchestrator.getState();

    // Check if we should continue processing
    if (state.currentStepIndex < findAdvisorOrchestrator.pipeline.length &&
      !state.isProcessing &&
      !state.processingComplete &&
      !state.error) {
      try {
        setIsProcessing(true);
        const shouldContinue = await findAdvisorOrchestrator.processCurrentStep();
        setIsProcessing(false);

        // Add a counter to prevent infinite loops
        if (shouldContinue &&
          !findAdvisorOrchestrator.error &&
          !findAdvisorOrchestrator.isCancelling &&
          findAdvisorOrchestrator.currentStepIndex < findAdvisorOrchestrator.pipeline.length) {
          // Use a setTimeout to prevent stack overflow
          setTimeout(continueProcessing, 500);
        } else if (!shouldContinue && !processingComplete) {
          // Check if we're done with processing
          if (findAdvisorOrchestrator.processingComplete) {
            setProcessingComplete(true);
            // Save final state
            storageUtils.saveToStorage(
              storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED,
              findAdvisorOrchestrator.processedData
            );
          }
        }
      } catch (error) {
        setIsProcessing(false);
        console.error("Error in pipeline:", error);
      }
    }
  };

  // Ensure the pipeline continues automatically
  useEffect(() => {
    if (initRef.current && !isProcessing &&
      !processingComplete &&
      !findAdvisorOrchestrator.error) {
      continueProcessing();
    }
  }, [isProcessing, findAdvisorOrchestrator.currentStepIndex]);

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
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_LOGS, updatedLogs);

    // Force all processing to stop immediately
    setIsProcessing(false);
    setIsCancelling(false);

    // Mark orchestrator as complete to prevent further processing
    findAdvisorOrchestrator.processingComplete = true;

    // Mark the current step as terminated
    const currentStepId = findAdvisorOrchestrator.pipeline[findAdvisorOrchestrator.currentStepIndex];
    if (currentStepId) {
      const updatedStatus = { ...processStatus };
      updatedStatus[currentStepId] = {
        status: 'cancelled',
        message: 'Terminated by user'
      };
      setProcessStatus(updatedStatus);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESS_STATUS, updatedStatus);
    }

    // Save the current state of data processing
    storageUtils.saveToStorage(
      storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED,
      findAdvisorOrchestrator.processedData || loadedCsvData
    );

    // Jump directly to results page
    handleViewResults();
  };

  // Handle viewing results
  const handleViewResults = () => {
    // Get the FULL processed data regardless of completion state
    const allData = findAdvisorOrchestrator.processedData || loadedCsvData;
  
    // Save processed data
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED, allData);
  
    // Add termination analytics if cancelled
    if (isCancelling) {
      const terminationAnalytics = {
        terminated: true,
        terminationTime: new Date().toISOString(),
        completedSteps: findAdvisorOrchestrator.currentStepIndex,
        totalSteps: findAdvisorOrchestrator.pipeline.length
      };
  
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS,
        { ...analytics, termination: terminationAnalytics }
      );
    }

    // Navigate to results page
    navigate('/find-advisor/videocx/results');
  };

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

      case 'employmentHistoryAnalysis':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.highPotentialCount)}</div>
              <div>High Potential</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.mediumPotentialCount)}</div>
              <div>Medium Potential</div>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <div className="font-bold text-gray-700">{safeNumber(analytics.lowPotentialCount)}</div>
              <div>Low Potential</div>
            </div>
          </div>
        );

      case 'connectionTimeAnalysis':
        return (
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-50 p-2 rounded">
              <div className="font-bold text-green-700">{safeNumber(analytics.longTermCount)}</div>
              <div>Long Term</div>
            </div>
            <div className="bg-blue-50 p-2 rounded">
              <div className="font-bold text-blue-700">{safeNumber(analytics.mediumTermCount)}</div>
              <div>Medium Term</div>
            </div>
            <div className="bg-yellow-50 p-2 rounded">
              <div className="font-bold text-yellow-700">{safeNumber(analytics.recentCount)}</div>
              <div>Recent</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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
        Advisor Finder Processing
      </h2>

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6">
        {/* Left side: Steps and progress */}
        <div className="w-full md:w-1/2">
          <div className="bg-white shadow-md rounded-lg p-6 mb-6">
            <h3 className="text-xl font-semibold mb-4">Advisor Finder Progress</h3>

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
                const currentStep = findAdvisorOrchestrator.currentStepIndex;
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
                findAdvisorOrchestrator.error ? (
                  <button
                    onClick={() => {
                      findAdvisorOrchestrator.error = null;
                      findAdvisorOrchestrator.processCurrentStep().then(() => {
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

            {findAdvisorOrchestrator.error && (
              <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded mb-4">
                <p className="font-bold">Error:</p>
                <p>{findAdvisorOrchestrator.error.message}</p>
              </div>
            )}

            {loadedCsvData && loadedCsvData.length > 0 ? (
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
                        Connected On
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loadedCsvData.slice(0, 3).map((row, rowIndex) => (
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
                          {row.connected_on || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {loadedCsvData.length > 3 && (
                  <div className="mt-2 text-sm text-gray-500 text-center">
                    Showing 3 of {loadedCsvData.length} rows
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
              ref={logsContainerRef}
              onScroll={handleScroll}
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
                  findAdvisorOrchestrator.error ? (
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

export default FindAdvisorProcessingPage;