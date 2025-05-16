// File: src/services/find-advisor/findAdvisorOrchestrator.jsx
import apiClient from '../../../utils/apiClient';
import storageUtils from '../../../utils/storageUtils';
import apolloEnrichmentService from './apolloEnrichmentService';
import connectionTimeService from './connectionTimeService';
import employmentHistoryAnalysisService from './employmentHistoryAnalysisService';
import titleRelevanceService from './titleRelevanceService';

/**
 * Orchestrates the entire Advisor Finder pipeline
 * Follows the exact flow:
 * 1. Title Relevance - All data, categorize as "Founder", "Relevant", "Irrelevant"
 * 2. Apollo Enrichment - Only "Founder" and "Relevant" rows
 * 3. Employment History Analysis - Analyze work history for client connections
 * 4. Connection Time Analysis - Check how long the connections have been established
 */
class FindAdvisorOrchestrator {
    constructor() {
        // Define the processing pipeline with step IDs
        this.pipeline = [
            'titleRelevance',
            'apolloEnrichment',
            'employmentHistoryAnalysis',
            'connectionTimeAnalysis'
        ];

        // Map of step descriptions
        this.stepDescriptions = {
            titleRelevance: 'Evaluating job titles to classify as Founder, Relevant, or Irrelevant',
            apolloEnrichment: 'Fetching detailed person and company information',
            employmentHistoryAnalysis: 'Analyzing employment history to find advisor connections',
            connectionTimeAnalysis: 'Calculating time since connection to evaluate relationship age'
        };

        // Initialize processing state
        this.reset();
    }

    /**
     * Reset the orchestrator state
     */
    reset() {
        this.processedData = null;
        this.currentStepIndex = 0;
        this.isProcessing = false;
        this.isCancelling = false;
        this.error = null;
        this.processingComplete = false;
        this.logs = [];
        this.progress = 0;
        this.analytics = {};
        this.filterAnalytics = {};
        this.stepStatus = {};

        // Initialize step status
        this.pipeline.forEach(stepId => {
            this.stepStatus[stepId] = {
                status: 'pending',
                message: '',
                analytics: null
            };
        });
    }

    /**
     * Set initial data to process
     * @param {Array} data - Initial data to process
     */
    setInitialData(data) {
        // Clear session storage of previous data first
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_LOGS);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_FILTER_ANALYTICS);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESS_STATUS);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_CURRENT_STEP);

        this.reset();

        // Initialize or ensure all rows have an empty relevanceTag
        this.processedData = data.map(row => ({
            ...row,
            relevanceTag: row.relevanceTag || ''
        }));

        this.addLog('Initialized with ' + data.length + ' records.');
    }

    /**
     * Add a log message
     * @param {string} message - Log message
     */
    addLog(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message };
        this.logs.push(logEntry);

        // Call the log callback if provided
        if (this.logCallback) {
            this.logCallback(logEntry);
        }

        // Also log to console for debugging
        console.log(`[Find Advisor][${timestamp}] ${message}`);
    }

    /**
     * Update progress
     * @param {number} percent - Progress percentage (0-100)
     */
    updateProgress(percent) {
        this.progress = Math.min(Math.max(0, percent), 100); // Ensure between 0-100

        // Call the progress callback if provided
        if (this.progressCallback) {
            this.progressCallback(this.progress);
        }
    }

    /**
     * Set callbacks for logging and progress updates
     * @param {Object} callbacks - Callback functions
     */
    setCallbacks(callbacks) {
        this.logCallback = callbacks.logCallback || null;
        this.progressCallback = callbacks.progressCallback || null;
        this.statusCallback = callbacks.statusCallback || null;
    }

    /**
     * Cancel the current processing
     */
    cancelProcessing() {
        if (!this.isProcessing) return;

        this.isCancelling = true;
        this.addLog('Cancelling processing... Please wait for current operations to complete.');

        // Force stop after a timeout if needed
        setTimeout(() => {
            if (this.isCancelling) {
                this.isProcessing = false;
                this.isCancelling = false;
                this.addLog('Processing cancelled by force after timeout.');

                // Update step status
                const currentStepId = this.pipeline[this.currentStepIndex];
                if (currentStepId) {
                    this.stepStatus[currentStepId] = {
                        status: 'cancelled',
                        message: 'Cancelled by user'
                    };
                }

                // Notify status change
                if (this.statusCallback) {
                    this.statusCallback(this.stepStatus);
                }
            }
        }, 5000); // Force cancel after 5 seconds
    }

    /**
     * Get current pipeline state
     * @returns {Object} - Current state of the pipeline
     */
    getState() {
        return {
            currentStep: this.pipeline[this.currentStepIndex],
            currentStepIndex: this.currentStepIndex,
            isProcessing: this.isProcessing,
            isCancelling: this.isCancelling,
            error: this.error,
            processingComplete: this.processingComplete,
            logs: this.logs,
            progress: this.progress,
            analytics: this.analytics,
            filterAnalytics: this.filterAnalytics,
            stepStatus: this.stepStatus,
            processedData: this.processedData,
            pipeline: this.pipeline.map(stepId => ({
                id: stepId,
                name: this.getStepName(stepId),
                description: this.stepDescriptions[stepId],
                status: this.stepStatus[stepId]
            }))
        };
    }

    /**
     * Get a user-friendly step name
     * @param {string} stepId - Step ID
     * @returns {string} - User-friendly step name
     */
    getStepName(stepId) {
        const names = {
            titleRelevance: 'Title Relevance Analysis',
            apolloEnrichment: 'Apollo Lead Enrichment',
            employmentHistoryAnalysis: 'Employment History Analysis',
            connectionTimeAnalysis: 'Connection Time Analysis'
        };

        return names[stepId] || stepId;
    }

    /**
     * Test API client connection before starting the pipeline
     * @returns {Promise<boolean>} - True if connection successful
     */
    async testApiConnection() {
        try {
            this.addLog('Testing API client connection...');
            const result = await apiClient.testConnection();

            if (result.success) {
                this.addLog('API client connection successful.');
                return true;
            } else {
                this.addLog(`API client connection failed: ${result.message}`);
                this.error = new Error(`API client connection failed: ${result.message}`);
                return false;
            }
        } catch (error) {
            this.addLog(`API client connection error: ${error.message}`);
            this.error = error;
            return false;
        }
    }

    /**
     * Process the current step
     * @returns {Promise<boolean>} - True if processing should continue, false otherwise
     */
    async processCurrentStep() {
        // Check for cancellation
        if (this.isCancelling) {
            this.addLog('Processing cancelled by user.');

            // Update step status
            const currentStepId = this.pipeline[this.currentStepIndex];
            if (currentStepId) {
                this.stepStatus[currentStepId] = {
                    status: 'cancelled',
                    message: 'Cancelled by user'
                };

                // Notify status change
                if (this.statusCallback) {
                    this.statusCallback(this.stepStatus);
                }
            }

            this.isProcessing = false;
            this.isCancelling = false;
            return false;
        }

        // Check if we have data to process
        if (!this.processedData || this.processedData.length === 0) {
            this.addLog(this.processedData ? 'Warning: Empty data set.' : 'No initial data available.');

            if (!this.processedData) {
                this.error = new Error('No initial data available');
                this.isProcessing = false;
                return false;
            }
        }

        // Check if we've reached the end of the pipeline
        if (this.currentStepIndex >= this.pipeline.length) {
            this.addLog('All steps already completed.');
            this.processingComplete = true;
            this.isProcessing = false;
            return false;
        }

        this.isProcessing = true;
        this.error = null;

        const stepId = this.pipeline[this.currentStepIndex];
        const stepName = this.getStepName(stepId);

        // Initialize analytics for this step if not already present
        if (!this.analytics[stepId]) {
            this.analytics[stepId] = {};
        }

        // Record start time
        this.analytics[stepId].startTime = Date.now();

        // Update step status
        this.stepStatus[stepId] = {
            status: 'processing',
            message: 'Processing...'
        };

        // Notify status change
        if (this.statusCallback) {
            this.statusCallback(this.stepStatus);
        }

        this.addLog(`Starting ${stepName}...`);

        try {
            // For first step, test API connection
            if (this.currentStepIndex === 0) {
                const connectionSuccess = await this.testApiConnection();
                if (!connectionSuccess) {
                    throw new Error('API connection test failed. Please check your proxy server and API keys.');
                }
            }

            // Count untagged rows for this step
            const untaggedRows = stepId === 'titleRelevance'
                ? this.processedData  // For first step, process all rows
                : this.processedData.filter(row => !row.relevanceTag);  // For subsequent steps, only process untagged rows

            // Make sure we have processed data and it's an array
            if (!this.processedData || !Array.isArray(this.processedData)) {
                this.addLog(`Error: No valid processed data available for ${stepName}.`);
                throw new Error(`No valid processed data available for ${stepName}`);
            }

            // Make sure we have data to process
            if (!untaggedRows || untaggedRows.length === 0) {
                this.addLog(`Warning: No untagged rows available for ${stepName}. Skipping step.`);

                // Mark step as complete but skipped
                this.stepStatus[stepId] = {
                    status: 'complete',
                    message: 'Skipped - No data to process',
                    analytics: { skipped: true }
                };

                // Record end time even for skipped steps
                this.analytics[stepId].endTime = Date.now();
                const timeInSeconds = (this.analytics[stepId].endTime - this.analytics[stepId].startTime) / 1000;
                this.addLog(`Step completed in ${timeInSeconds.toFixed(2)} seconds`);

                // Save analytics to storage after each step
                storageUtils.saveToStorage(
                    storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS,
                    this.analytics
                );

                // If we've updated filter analytics, save those too
                if (this.filterAnalytics && Object.keys(this.filterAnalytics).length > 0) {
                    storageUtils.saveToStorage(
                        storageUtils.STORAGE_KEYS.FIND_ADVISOR_FILTER_ANALYTICS,
                        this.filterAnalytics
                    );
                }

                // Move to the next step without trying to process
                this.currentStepIndex++;
                this.isProcessing = false;

                return true; // Continue to next step
            }

            // Log the number of untagged rows to be processed
            this.addLog(`Found ${untaggedRows.length} untagged rows to process in ${stepName}`);

            // Process the service step
            const processorResult = await this.processServiceStep(stepId);

            // Apply additional filtering based on the step
            if (processorResult) {
                await this.applyStepSpecificFiltering(stepId, processorResult.data);
            }

            // Record end time for the current step
            if (!this.analytics[stepId]) {
                this.analytics[stepId] = {};
            }
            this.analytics[stepId].endTime = Date.now();
            const timeInSeconds = (this.analytics[stepId].endTime - this.analytics[stepId].startTime) / 1000;
            this.addLog(`Step completed in ${timeInSeconds.toFixed(2)} seconds`);

            // Check if processing was cancelled
            if (this.isCancelling) {
                this.addLog('Processing cancelled by user.');
                this.stepStatus[stepId] = {
                    status: 'cancelled',
                    message: 'Cancelled by user'
                };
                this.isProcessing = false;
                this.isCancelling = false;

                // Notify status change
                if (this.statusCallback) {
                    this.statusCallback(this.stepStatus);
                }

                return false;
            }

            // Mark the step as complete
            this.stepStatus[stepId].status = 'complete';
            this.addLog(`Completed ${stepName} successfully.`);

            // Move to next step
            this.currentStepIndex++;
            this.isProcessing = false;

            // Check if all steps are complete
            if (this.currentStepIndex >= this.pipeline.length) {
                this.addLog('All processing steps completed successfully!');
                this.processingComplete = true;

                // Make sure we have the final filtered data
                // Just log the count of untagged rows
                if (this.processedData && Array.isArray(this.processedData)) {
                    const untaggedCount = this.processedData.filter(row => !row.relevanceTag).length;
                    this.addLog(`Processing complete: ${untaggedCount} rows remained untagged (passed all filters).`);
                } else {
                    this.addLog('Warning: Processed data is not available or not an array.');
                }

                return false;
            }

            return true;
        } catch (err) {
            console.error(`Error processing ${stepId}:`, err);
            this.error = err;

            // Record end time even for errors
            if (!this.analytics[stepId]) {
                this.analytics[stepId] = {};
            }
            this.analytics[stepId].endTime = Date.now();
            const timeInSeconds = (this.analytics[stepId].endTime - this.analytics[stepId].startTime) / 1000;
            this.addLog(`Step failed after ${timeInSeconds.toFixed(2)} seconds`);

            // Update step status
            this.stepStatus[stepId] = {
                status: 'error',
                message: `Error: ${err.message || 'Failed to process data'}`
            };

            // Notify status change
            if (this.statusCallback) {
                this.statusCallback(this.stepStatus);
            }

            this.addLog(`Error in ${stepName}: ${err.message}`);
            this.isProcessing = false;
            return false;
        }
    }

    /**
     * Process a service step
     * @param {string} stepId - Step ID
     * @returns {Promise<Object>} - Processing result
     */
    async processServiceStep(stepId) {
        try {
            // Get the appropriate processor function
            let processorFunction;

            switch (stepId) {
                case 'titleRelevance':
                    processorFunction = titleRelevanceService.processTitleRelevance;
                    break;
                case 'apolloEnrichment':
                    processorFunction = apolloEnrichmentService.processApolloEnrichment;
                    break;
                case 'employmentHistoryAnalysis':
                    processorFunction = employmentHistoryAnalysisService.processEmploymentHistoryAnalysis;
                    break;
                case 'connectionTimeAnalysis':
                    processorFunction = connectionTimeService.processConnectionTime;
                    break;
                default:
                    throw new Error(`No processor function found for step: ${stepId}`);
            }

            if (!processorFunction) {
                throw new Error(`No processor function found for step: ${stepId}`);
            }

            // Define the data to process
            let dataToProcess;
            if (stepId === 'titleRelevance') {
                // For first step, process all data
                dataToProcess = this.processedData;
            } else {
                // For all other steps, only process untagged rows
                dataToProcess = this.processedData.filter(row => !row.relevanceTag);
            }

            // Check if data is available
            if (!dataToProcess || dataToProcess.length === 0) {
                this.addLog(`Warning: No data available for ${this.getStepName(stepId)}. Skipping.`);
                // Return a dummy result to allow the pipeline to continue
                return {
                    data: this.processedData || [],
                    analytics: {
                        skipped: true,
                        reason: 'No data to process'
                    }
                };
            }

            // Create wrapped callback functions to ensure 'this' context
            const logCallback = (message) => this.addLog(message);
            const progressCallback = (percent) => this.updateProgress(percent);

            // Call the processor function with callbacks
            const result = await processorFunction(
                dataToProcess,
                logCallback,
                progressCallback
            );

            // Store more detailed analytics with timestamps
            if (result && result.analytics) {
                this.analytics[stepId] = {
                    ...result.analytics,
                    // Ensure we have startTime and endTime for reporting
                    startTime: result.analytics.startTime || Date.now() - (result.analytics.processingTimeSeconds * 1000 || 0),
                    endTime: result.analytics.endTime || Date.now()
                };
            }

            // Save analytics to storage after each step - use the correct storage key
            storageUtils.saveToStorage(
                storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS,
                this.analytics
            );

            // Update processed data with result
            // First, create a map of the processed data by some unique identifier
            const processedMap = new Map();
            result.data.forEach(row => {
                // Use linkedin_url as a unique ID if available, otherwise fall back to index
                const id = row.linkedin_url || row.person?.linkedin_url || row.id;
                if (id) {
                    processedMap.set(id, row);
                }
            });

            // Now update the original processedData array
            this.processedData = this.processedData.map(row => {
                const rowId = row.linkedin_url || row.person?.linkedin_url || row.id;
                if (rowId && processedMap.has(rowId)) {
                    // Return the processed row from the result
                    return processedMap.get(rowId);
                }
                // Return the original row if not processed
                return row;
            });

            // Store analytics
            this.analytics[stepId] = result.analytics;

            // Update step status
            this.stepStatus[stepId] = {
                status: 'complete',
                message: `Processed ${result.data.length} records successfully`,
                analytics: result.analytics
            };

            // Notify status change
            if (this.statusCallback) {
                this.statusCallback(this.stepStatus);
            }

            this.addLog(`Completed ${this.getStepName(stepId)}.`);

            return result;
        } catch (error) {
            this.addLog(`Error in ${this.getStepName(stepId)}: ${error.message}`);

            // Set specific error message in step status
            this.stepStatus[stepId] = {
                status: 'error',
                message: `Error: ${error.message || 'Unknown error'}`,
                details: error.details || ''
            };

            // Notify status change
            if (this.statusCallback) {
                this.statusCallback(this.stepStatus);
            }

            throw error; // Re-throw to be handled by the caller
        }
    }

    /**
     * Apply step-specific filtering
     * @param {string} stepId - Step ID
     * @param {Array} data - Data to filter
     */
    async applyStepSpecificFiltering(stepId, data) {
        // Original count before filtering
        const originalCount = data.length;
        let untaggedCount = 0;
        let taggedCount = 0;
        let filterReason = {};

        this.addLog(`Applying tag-based filtering for step: ${stepId}...`);

        switch (stepId) {
            case 'titleRelevance':
                // Add tags for irrelevant titles only, let Founder and Relevant pass through
                this.processedData = this.processedData.map(row => {
                    // Skip if already tagged
                    if (row.relevanceTag) {
                        return row;
                    }

                    if (row.titleRelevance === 'Founder' || row.titleRelevance === 'Relevant' || row.titleRelevance === 'founder' || row.titleRelevance === 'relevant') {
                        untaggedCount++;
                        return row; // No tag for Founder or Relevant
                    } else {
                        // Apply tag for Irrelevant titles
                        taggedCount++;
                        filterReason[row.titleRelevance || 'Unknown'] =
                            (filterReason[row.titleRelevance || 'Unknown'] || 0) + 1;

                        return {
                            ...row,
                            relevanceTag: `Irrelevant Title: ${row.titleRelevance || 'Unknown'}`
                        };
                    }
                });

                this.addLog(`Title relevance filtering: ${untaggedCount} rows untagged (Founder/Relevant), ${taggedCount} tagged with "Irrelevant".`);
                break;

            case 'employmentHistoryAnalysis':
                // For employment history, we don't apply any filtering
                // Just count the untagged and tagged rows
                untaggedCount = this.processedData.filter(row => !row.relevanceTag).length;
                taggedCount = this.processedData.filter(row => row.relevanceTag).length;
                this.addLog(`Employment history analysis complete: ${untaggedCount} rows remain untagged, ${taggedCount} were previously tagged.`);
                break;

            default:
                // For other steps, don't apply tags
                untaggedCount = this.processedData.filter(row => !row.relevanceTag).length;
                taggedCount = this.processedData.filter(row => row.relevanceTag).length;
                this.addLog(`No tag filtering applied for step: ${stepId}`);
        }

        // Update analytics with filtering info
        if (this.analytics[stepId]) {
            this.analytics[stepId].filtering = {
                originalCount,
                untaggedCount,
                taggedCount,
                filterReason
            };

            // Update status
            this.stepStatus[stepId].analytics = this.analytics[stepId];

            // Notify status change
            if (this.statusCallback) {
                this.statusCallback(this.stepStatus);
            }
        }
    }

    /**
     * Get the final filtered data (fully processed)
     * @returns {Array} - Final filtered data
     */
    getFinalFilteredData() {
        // Return all data, both tagged and untagged
        return this.processedData || [];
    }

    /**
     * Run the entire pipeline
     * @param {Array} initialData - Initial data to process
     * @param {Object} callbacks - Callbacks for logging, progress and status updates
     * @returns {Promise<Object>} - Processing result
     */
    async runPipeline(initialData, callbacks = {}) {
        this.setInitialData(initialData);

        if (callbacks) {
            this.setCallbacks(callbacks);
        }

        let continueProcessing = true;

        while (continueProcessing && !this.processingComplete && !this.error) {
            continueProcessing = await this.processCurrentStep();
        }

        return {
            completed: this.processingComplete,
            error: this.error,
            data: this.processedData,
            analytics: this.analytics,
            filterAnalytics: this.filterAnalytics
        };
    }
}

// Create and export a singleton instance
const findAdvisorOrchestrator = new FindAdvisorOrchestrator();
export default findAdvisorOrchestrator;