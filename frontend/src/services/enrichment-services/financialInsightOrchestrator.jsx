// services/enrichment-services/financialInsightOrchestrator.js
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';
import annualReportFetchService from './annualReportFetchService';
import insightAnalysisService from './insightAnalysisService';
import publicCompanyService from './publicCompanyService';
import reportTextExtractionService from './reportTextExtractionService';

/**
 * Financial Insight Orchestrator
 * Handles the four-step process for financial insights:
 * 1. Public company detection
 * 2. Annual report fetching
 * 3. Text extraction
 * 4. Insight analysis
 */
class FinancialInsightOrchestrator {
  constructor() {
    this.reset();
  }

  reset() {
    this.initialData = [];
    this.processedData = [];
    this.currentStep = 0;
    this.isProcessing = false;
    this.isCancelling = false;
    this.processingComplete = false;
    this.error = null;
    this.stepStatus = {
      publicCompanyFilter: { status: 'pending', message: '' },
      annualReportFetch: { status: 'pending', message: '' },
      textExtraction: { status: 'pending', message: '' },
      insightAnalysis: { status: 'pending', message: '' }
    };
    this.logs = [];
    this.analytics = {};
    this.userPrompt = '';
  }

  setInitialData(data) {
    this.initialData = Array.isArray(data) ? [...data] : [];
    this.processedData = Array.isArray(data) ? [...data] : [];
  }

  setUserPrompt(prompt) {
    this.userPrompt = prompt;
  }

  setCallbacks(callbacks) {
    this.callbacks = {
      logCallback: callbacks.logCallback || (() => { }),
      progressCallback: callbacks.progressCallback || (() => { }),
      statusCallback: callbacks.statusCallback || (() => { })
    };
  }

  addLog(message) {
    const logEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message
    };
    this.logs.push(logEntry);
    if (this.callbacks && this.callbacks.logCallback) {
      this.callbacks.logCallback(logEntry);
    }
    console.log(`[Financial Insight][${logEntry.timestamp}] ${message}`);
  }

  updateStepStatus(stepId, status, message = '') {
    if (!this.stepStatus[stepId]) {
      this.stepStatus[stepId] = { status, message };
    } else {
      this.stepStatus[stepId].status = status;
      if (message) {
        this.stepStatus[stepId].message = message;
      }
    }

    if (this.callbacks && this.callbacks.statusCallback) {
      this.callbacks.statusCallback(this.stepStatus);
    }
  }

  getState() {
    return {
      currentStep: this.currentStep,
      isProcessing: this.isProcessing,
      isCancelling: this.isCancelling,
      processingComplete: this.processingComplete,
      stepStatus: this.stepStatus,
      analytics: this.analytics,
      error: this.error
    };
  }

  async processCurrentStep() {
    if (this.isProcessing || this.processingComplete || this.isCancelling) {
      return false;
    }
    const stepStartTime = Date.now();

    const steps = [
      'publicCompanyFilter',
      'annualReportFetch',
      'textExtraction',
      'insightAnalysis'
    ];

    if (this.currentStep >= steps.length) {
      this.processingComplete = true;
      return false;
    }

    const currentStepId = steps[this.currentStep];

    try {
      this.isProcessing = true;
      this.updateStepStatus(currentStepId, 'processing', 'Processing in progress...');
      this.addLog(`Starting processing step: ${currentStepId}`);

      const startTime = Date.now();

      let result;

      switch (currentStepId) {
        case 'publicCompanyFilter':
          result = await this.processPublicCompanyFilter();
          break;
        case 'annualReportFetch':
          result = await this.processAnnualReportFetch();
          break;
        case 'textExtraction':
          result = await this.processTextExtraction();
          break;
        case 'insightAnalysis':
          result = await this.processInsightAnalysis();
          break;
        default:
          throw new Error(`Unknown step: ${currentStepId}`);
      }

      if (!result) {
        throw new Error(`No result from ${currentStepId}`);
      }

      // Update processed data
      this.processedData = result.data || this.processedData;

      // Update analytics
      const endTime = Date.now();
      this.analytics[currentStepId] = {
        ...result.analytics,
        processingTime: endTime - startTime
      };

      // Mark step as complete
      this.updateStepStatus(currentStepId, 'complete', 'Processing complete');
      this.addLog(`Completed step ${currentStepId}`);

      const stepEndTime = Date.now();
      this.analytics[currentStepId] = {
        ...result.analytics,
        stepName: currentStepId,
        processingTime: stepEndTime - stepStartTime,
        inputCount: result.analytics.totalProcessed || 0,
        outputCount: result.analytics.insightsExtracted || result.analytics.extractionSuccesses || 0,
        filteredCount: result.analytics.insightsFailed || result.analytics.extractionFailures || 0,
        tokensUsed: result.analytics.tokensUsed || 0,
        creditsUsed: result.analytics.creditsUsed || result.analytics.apiCallsCount || 0,
        averageTokensPerRow: result.analytics.averageTokensPerRow || 0,
        averageTimePerRow: result.analytics.averageTimePerRow || 0
      };

      // Move to next step
      this.currentStep++;
      if (this.currentStep >= steps.length) {
        this.processingComplete = true;
        this.addLog('All processing steps complete!');

        // Store final results in file storage
        customEngineFileStorageService.storeProcessedData(this.processedData);

        return false;
      }

      return true;
    } catch (error) {
      this.error = error;
      this.addLog(`Error in step ${currentStepId}: ${error.message}`);
      this.updateStepStatus(currentStepId, 'error', error.message);
      return false;
    } finally {
      this.isProcessing = false;
    }
  }

  async processPublicCompanyFilter() {
    this.addLog('Starting Public Company Detection...');

    const logCallback = (message) => this.addLog(message);
    const progressCallback = (percent) => {
      if (this.callbacks && this.callbacks.progressCallback) {
        this.callbacks.progressCallback(percent);
      }
    };

    return await publicCompanyService.processPublicCompanyFilter(
      this.processedData,
      logCallback,
      progressCallback
    );
  }

  async processAnnualReportFetch() {
    this.addLog('Starting Annual Report Fetching...');

    const logCallback = (message) => this.addLog(message);
    const progressCallback = (percent) => {
      if (this.callbacks && this.callbacks.progressCallback) {
        this.callbacks.progressCallback(percent);
      }
    };

    return await annualReportFetchService.fetchAnnualReports(
      this.processedData,
      logCallback,
      progressCallback
    );
  }

  async processTextExtraction() {
    this.addLog('Starting Annual Report Text Extraction...');

    const logCallback = (message) => this.addLog(message);
    const progressCallback = (percent) => {
      if (this.callbacks && this.callbacks.progressCallback) {
        this.callbacks.progressCallback(percent);
      }
    };

    return await reportTextExtractionService.extractAnnualReportText(
      this.processedData,
      logCallback,
      progressCallback
    );
  }

  async processInsightAnalysis() {
    this.addLog('Starting Financial Insight Analysis...');

    if (!this.userPrompt) {
      this.addLog('Warning: No user prompt provided. Using default prompt.');
    }

    const logCallback = (message) => this.addLog(message);
    const progressCallback = (percent) => {
      if (this.callbacks && this.callbacks.progressCallback) {
        this.callbacks.progressCallback(percent);
      }
    };

    return await insightAnalysisService.processInsightsAnalysis(
      this.processedData,
      this.userPrompt,
      logCallback,
      progressCallback
    );
  }

  async runPipeline(initialData, userPrompt, callbacks = {}) {
    this.setInitialData(initialData);
    this.setUserPrompt(userPrompt);

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
      analytics: this.analytics
    };
  }

  cancelProcessing() {
    this.isCancelling = true;
    this.addLog('Cancelling processing...');

    const steps = [
      'publicCompanyFilter',
      'annualReportFetch',
      'textExtraction',
      'insightAnalysis'
    ];
    const currentStepId = steps[this.currentStep];
    this.updateStepStatus(currentStepId, 'cancelled', 'Cancelled by user');

    this.isProcessing = false;
    this.isCancelling = false;

    this.addLog('Processing cancelled');

    // Store current results in file storage
    customEngineFileStorageService.storeProcessedData(this.processedData);
  }
}

// Export a singleton instance
const financialInsightOrchestrator = new FinancialInsightOrchestrator();
export default financialInsightOrchestrator;