// services/enrichmentOrchestrator.js
// Import individual services
import apiClient from '../utils/apiClient';
import apolloEnrichmentService from './apolloEnrichmentService';
import companyRelevanceService from './companyRelevanceService';
import domainScraperService from './domainScraperService';
import indianLeadsService from './indianLeadsService';
import openJobsService from './openJobsService';
import otherCountryLeadsService from './otherCountryLeadsService';
import titleRelevanceService from './titleRelevanceService';

/**
 * Orchestrates the entire lead enrichment pipeline
 * Follows the exact flow:
 * 1. Title Relevance - All data, categorize as "Founder", "Relevant", "Irrelevant"
 * 2. Apollo Enrichment - Only "Founder" and "Relevant" rows
 * 3. Headcount Filter - Between 10-1500 employees
 * 4. Domain Scraping - Rows that passed headcount filter
 * 5. Company Relevance - Keep rows with scores 3/5, 4/5, 5/5
 * 6. Indian Leads - Calculate Indian employees percentage 
 * 7. Open Jobs - Only rows with <20% Indian headcount
 */
class EnrichmentOrchestrator {
  constructor() {
    // Define the processing pipeline with step IDs
    this.pipeline = [
      'titleRelevance',
      'apolloEnrichment',
      'headcountFilter', // Not a service, but a filtering step
      'domainScraping',
      'companyRelevance',
      'indianLeads',
      'otherCountryLeads', // New step
      'openJobs'
    ];
    // Map of step descriptions
    this.stepDescriptions = {
      titleRelevance: 'Evaluating job titles to classify as Founder, Relevant, or Irrelevant',
      apolloEnrichment: 'Fetching detailed person and company information (only for Founder/Relevant)',
      headcountFilter: 'Filtering companies by employee count (10-1500)',
      domainScraping: 'Extracting content and sitemap from company websites',
      companyRelevance: 'Analyzing companies for relevance (keeping scores 3+)',
      indianLeads: 'Determining company presence in India (must be <20%)',
      otherCountryLeads: 'Determining company presence in other countries',
      openJobs: 'Collecting information about company job openings'
    };

    // Initialize processing state
    this.reset();
  }

  /**
   * Reset the orchestrator state
   */
  reset() {
    this.processedData = null;
    this.filteredData = null; // Track data after each filtering step
    this.currentStepIndex = 0;
    this.isProcessing = false;
    this.isCancelling = false;
    this.error = null;
    this.processingComplete = false;
    this.logs = [];
    this.progress = 0;
    this.analytics = {};
    this.filterAnalytics = {}; // Track filtering analytics
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
    this.reset();
    this.processedData = [...data];
    this.filteredData = [...data];
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
    console.log(`[${timestamp}] ${message}`);
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
      filteredData: this.filteredData,
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
      headcountFilter: 'Headcount Filtering',
      domainScraping: 'Website Scraping',
      companyRelevance: 'Company Relevance Scoring',
      indianLeads: 'Indian Presence Analysis',
      openJobs: 'Open Jobs Scraping'
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
   * Normalize data structure before domain scraping
   * This function converts flattened properties like 'organization.website_url'
   * to nested objects like organization.website_url
   * @param {Array} data - Data to normalize
   * @returns {Array} - Normalized data
   */
  normalizeDataStructure(data) {
    this.addLog('Normalizing data structure for domain scraping...');

    // Clone the data to avoid modifying the original objects
    const normalizedData = JSON.parse(JSON.stringify(data));

    let fixedCount = 0;
    let alreadyNestedCount = 0;
    let noDomainCount = 0;

    // Process each row
    const result = normalizedData.map(row => {
      // Create organization object if it doesn't exist
      if (!row.organization) {
        row.organization = {};
      }

      let domainFound = false;

      // Check for direct domain fields first
      if (row.organization.website_url || row.organization.primary_domain) {
        alreadyNestedCount++;
        domainFound = true;
      }

      // Process flattened fields
      Object.keys(row).forEach(key => {
        // Check for organization.* pattern
        if (key.includes('.')) {
          const [objName, fieldName] = key.split('.');

          // Handle organization.* fields
          if (objName === 'organization') {
            // Create nested path if it doesn't exist
            if (!row.organization) {
              row.organization = {};
            }

            // Copy value to nested path
            row.organization[fieldName] = row[key];

            // Track if we found domain info
            if ((fieldName === 'website_url' || fieldName === 'primary_domain') && row[key]) {
              domainFound = true;
              fixedCount++;
            }
          }
        }
      });

      // If we still don't have domain info, try other sources
      if (!domainFound) {
        // Try website field
        if (row.website) {
          domainFound = true;
        }
        // Try to create domain from company name as last resort
        else if (row.company) {
          // Create a simplified domain from company name
          const simplifiedName = row.company
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .trim();

          if (simplifiedName) {
            row.website = `https://${simplifiedName}.com`;
            this.addLog(`Created fallback domain for ${row.company}: ${row.website}`);
            domainFound = true;
          }
        }

        if (!domainFound) {
          noDomainCount++;
        }
      }

      return row;
    });

    this.addLog(`Data normalization complete: ${fixedCount} properties fixed, ${alreadyNestedCount} already properly nested, ${noDomainCount} with no domain info`);

    // Log some sample data for verification
    if (result.length > 0) {
      const sample = result[0];
      this.addLog(`Sample normalized data for ${sample.company || 'Unknown Company'}:
      - organization.website_url: ${sample.organization?.website_url || 'undefined'}
      - organization.primary_domain: ${sample.organization?.primary_domain || 'undefined'}
      - website: ${sample.website || 'undefined'}
      `);
    }

    return result;
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

      // If this is a filtering step, handle it differently
      if (stepId === 'headcountFilter') {
        await this.processHeadcountFilter();
      } else {
        // Special pre-processing for domain scraping
        if (stepId === 'domainScraping') {
          // Normalize data structure before domain scraping
          this.processedData = this.normalizeDataStructure(this.processedData);
          this.filteredData = this.normalizeDataStructure(this.filteredData);
        }

        // Make sure we have data to process
        if (stepId !== 'titleRelevance' && (!this.filteredData || this.filteredData.length === 0)) {
          this.addLog(`Warning: No filtered data available for ${stepName}. Skipping step.`);

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
            storageUtils.STORAGE_KEYS.ANALYTICS,
            this.analytics
          );

          // If we've updated filter analytics, save those too
          if (this.filterAnalytics && Object.keys(this.filterAnalytics).length > 0) {
            storageUtils.saveToStorage(
              storageUtils.STORAGE_KEYS.FILTER_ANALYTICS,
              this.filterAnalytics
            );
          }

          // Move to the next step without trying to process
          this.currentStepIndex++;
          this.isProcessing = false;

          return true; // Continue to next step
        }

        // Process the service step
        const processorResult = await this.processServiceStep(stepId);

        // Apply additional filtering based on the step
        if (processorResult) {
          await this.applyStepSpecificFiltering(stepId, processorResult.data);
        }
      }

      // Record end time for the current step
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
        if (this.filteredData.length === 0 && this.processedData.length > 0) {
          // If no data was filtered (possibly due to filtering errors), use processed data
          this.filteredData = this.processedData;
          this.addLog('Warning: No data passed filtering criteria. Using all processed data.');
        }

        return false;
      }

      return true;
    } catch (err) {
      console.error(`Error processing ${stepId}:`, err);
      this.error = err;

      // Record end time even for errors
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
        case 'domainScraping':
          processorFunction = domainScraperService.scrapeDomain;
          break;
        case 'companyRelevance':
          processorFunction = companyRelevanceService.processCompanyRelevance;
          break;
        case 'indianLeads':
          processorFunction = indianLeadsService.processIndianLeads;
          break;
        case 'otherCountryLeads': // New case
          processorFunction = otherCountryLeadsService.processOtherCountryLeads;
          break;
        case 'openJobs':
          processorFunction = openJobsService.scrapeOpenJobs;
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
        dataToProcess = this.processedData;
      } else {
        // For steps after title relevance, use filtered data if available, otherwise use processed data
        dataToProcess = (this.filteredData && this.filteredData.length > 0) ? this.filteredData : this.processedData;
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

      // Add diagnostic log before domain scraping
      if (stepId === 'domainScraping') {
        let domainStats = {
          totalRows: dataToProcess.length,
          withWebsiteUrl: 0,
          withPrimaryDomain: 0,
          withWebsite: 0,
          withoutDomain: 0
        };

        dataToProcess.forEach(row => {
          if (row.organization?.website_url) domainStats.withWebsiteUrl++;
          if (row.organization?.primary_domain) domainStats.withPrimaryDomain++;
          if (row.website) domainStats.withWebsite++;
          if (!row.organization?.website_url && !row.organization?.primary_domain && !row.website) {
            domainStats.withoutDomain++;
          }
        });

        this.addLog(`Domain statistics before scraping: ${JSON.stringify(domainStats)}`);

        // Log first 3 rows for debugging
        for (let i = 0; i < Math.min(3, dataToProcess.length); i++) {
          const row = dataToProcess[i];
          this.addLog(`Sample row ${i + 1} domain info:
            - Company: ${row.company || row.organization?.name || 'Unknown'}
            - organization?.website_url: ${row.organization?.website_url || 'undefined'}
            - organization?.primary_domain: ${row.organization?.primary_domain || 'undefined'}
            - website: ${row.website || 'undefined'}
          `);
        }
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

      // Update processed data with full result
      this.processedData = result.data;

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
   * Process headcount filter step
   * @returns {Promise<void>}
   */
  async processHeadcountFilter() {
    this.addLog(`Applying headcount filter (10-1500 employees)...`);

    // Keep track of original count
    const originalCount = this.filteredData.length;
    let filteredCount = 0;
    let tooSmallCount = 0;
    let tooLargeCount = 0;
    let noDataCount = 0;

    // Create a copy of filtered data for filtering
    const previousData = [...this.filteredData];

    // Filter data based on headcount
    // Store all data in processedData, but only filter for headcount in filteredData
    this.filteredData = previousData.filter(row => {
      // Get employee count from multiple possible sources
      const employeeCount =
        row.organization?.estimated_num_employees ||
        row['organization.estimated_num_employees'] ||
        row.employees;

      if (employeeCount) {
        // Normalize the value by removing any non-numeric characters
        const normalizedCount = String(employeeCount).replace(/[^\d]/g, '');
        const count = parseInt(normalizedCount);

        if (!isNaN(count)) {
          if (count < 10) {
            tooSmallCount++;
            return false;
          }
          if (count > 1500) {
            tooLargeCount++;
            return false;
          }
          filteredCount++;
          return true;
        }
      }

      // If no employee count, add to no data count but keep it for now
      noDataCount++;
      return true;
    });

    // Store filter analytics
    const filterAnalytics = {
      originalCount,
      filteredCount,
      tooSmallCount,
      tooLargeCount,
      noDataCount
    };

    this.filterAnalytics.headcountFilter = filterAnalytics;

    // Update step status
    this.stepStatus.headcountFilter = {
      status: 'complete',
      message: `Filtered ${tooSmallCount + tooLargeCount} records based on headcount`,
      analytics: filterAnalytics
    };

    // Notify status change
    if (this.statusCallback) {
      this.statusCallback(this.stepStatus);
    }

    this.addLog(`Headcount filtering complete: ${filteredCount} records passed, ${tooSmallCount} too small, ${tooLargeCount} too large, ${noDataCount} with no data.`);
  }

  /**
   * Apply step-specific filtering
   * @param {string} stepId - Step ID
   * @param {Array} data - Data to filter
   */
  async applyStepSpecificFiltering(stepId, data) {
    // Original count before filtering
    const originalCount = data.length;
    let filteredCount = 0;
    let filterReason = {};

    // Create a copy of filtered data for filtering
    const previousData = [...data];

    switch (stepId) {
      case 'titleRelevance':
        // Only keep "Founder" and "Relevant" title relevance for filtered data
        this.addLog(`Filtering by title relevance (keeping Founder and Relevant)...`);

        this.filteredData = previousData.filter(row => {
          if (row.titleRelevance === 'Founder' || row.titleRelevance === 'Relevant') {
            filteredCount++;
            return true;
          }

          // Track reason for filtering
          filterReason[row.titleRelevance || 'Unknown'] =
            (filterReason[row.titleRelevance || 'Unknown'] || 0) + 1;

          return false;
        });

        this.filterAnalytics.titleRelevance = {
          originalCount,
          filteredCount,
          filterReason
        };

        this.addLog(`Title relevance filtering: ${filteredCount} records passed (Founder/Relevant), ${originalCount - filteredCount} filtered out.`);
        break;

      case 'companyRelevance':
        // Only keep relevance scores 3+
        this.addLog(`Filtering by company relevance (keeping scores 3, 4, and 5)...`);

        this.filteredData = previousData.filter(row => {
          const score = row.companyRelevanceScore || 0;

          if (score >= 3) {
            filteredCount++;
            return true;
          }

          // Track reason for filtering
          filterReason[`Score: ${score}`] = (filterReason[`Score: ${score}`] || 0) + 1;

          return false;
        });

        this.filterAnalytics.companyRelevance = {
          originalCount,
          filteredCount,
          filterReason
        };

        this.addLog(`Company relevance filtering: ${filteredCount} records passed (Score 3+), ${originalCount - filteredCount} filtered out.`);
        break;

      case 'indianLeads':
        // Only keep <20% Indian headcount
        const tooManyIndiansThreshold = parseInt(import.meta.env.VITE_REACT_APP_TOO_MANY_INDIANS_THRESHOLD || "20");
        this.addLog(`Filtering by Indian headcount percentage (keeping <${tooManyIndiansThreshold}%)...`);

        this.filteredData = previousData.filter(row => {
          const percentage = row.percentage_headcount_for_india || 0;

          if (percentage < tooManyIndiansThreshold) {
            filteredCount++;
            return true;
          }

          // Track reason for filtering
          filterReason[`Indian headcount ≥${tooManyIndiansThreshold}%`] = (filterReason[`Indian headcount ≥${tooManyIndiansThreshold}%`] || 0) + 1;

          return false;
        });

        this.filterAnalytics.indianLeads = {
          originalCount,
          filteredCount,
          filterReason
        };

        this.addLog(`Indian headcount filtering: ${filteredCount} records passed (<${tooManyIndiansThreshold}%), ${originalCount - filteredCount} filtered out.`);
        break;

      default:
        // For other steps, just update filtered data without filtering
        this.filteredData = data;
        filteredCount = data.length;
    }

    // Update step analytics with filtering info
    if (this.analytics[stepId]) {
      this.analytics[stepId].filtering = {
        originalCount,
        filteredCount,
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
    return this.filteredData || this.processedData || [];
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
      filteredData: this.filteredData,
      analytics: this.analytics,
      filterAnalytics: this.filterAnalytics
    };
  }
}

// Create and export a singleton instance
const orchestrator = new EnrichmentOrchestrator();
export default orchestrator;