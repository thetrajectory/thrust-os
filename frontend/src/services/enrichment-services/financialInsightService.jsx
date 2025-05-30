// services/enrichment-services/financialInsightService.js
import metricsStorageService from '../analytics/MetricsStorageService';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';
import financialInsightOrchestrator from './financialInsightOrchestrator';

/**
 * Financial Insight Service with DIRECT TRACKING
 */
const financialInsightService = {
  /**
   * Process data through the financial insight pipeline
   */
  async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
    logCallback("Starting Financial Insight Analysis Pipeline...");

    // DIRECT TRACKING: Initialize counters
    let totalTokensUsed = 0;
    let totalCreditsUsed = 0;
    let totalApiCalls = 0;
    let totalSupabaseHits = 0;
    let totalErrors = 0;

    const userPrompt = config.prompt || '';
    const useFileStorage = rows.length > 1000;

    if (useFileStorage) {
      logCallback('Large dataset detected - using file storage for optimal performance');

      const processFunction = async (chunk) => {
        const result = await this.processChunk(chunk, userPrompt, logCallback);

        // DIRECT TRACKING: Accumulate usage
        totalTokensUsed += result.tokensUsed || 0;
        totalCreditsUsed += result.creditsUsed || 0;
        totalApiCalls += result.apiCalls || 0;
        totalSupabaseHits += result.supabaseHits || 0;
        totalErrors += result.errors || 0;

        return result.data;
      };

      const progressFunction = (percent, message) => {
        progressCallback(percent);
        logCallback(message);
      };

      try {
        const results = await customEngineFileStorageService.processLargeDataset(
          rows,
          processFunction,
          progressFunction
        );

        logCallback(`Financial Insight Pipeline Complete - processed ${results.length} rows`);
        logCallback(`Total tokens used: ${totalTokensUsed}, credits used: ${totalCreditsUsed}`);

        return {
          data: results,
          analytics: {
            tokensUsed: totalTokensUsed,
            creditsUsed: totalCreditsUsed,
            apiCalls: totalApiCalls,
            supabaseHits: totalSupabaseHits,
            errors: totalErrors,
            processedCount: results.length
          }
        };
      } catch (error) {
        metricsStorageService.addError('financialInsight');
        logCallback(`Error in large dataset processing: ${error.message}`);
        throw error;
      }
    } else {
      // Process all rows through the orchestrator with enhanced tracking
      const enhancedLogCallback = (message) => {
        logCallback(message);

        // DIRECT TRACKING: Extract metrics from logs
        if (typeof message === 'string') {
          metricsStorageService.extractMetricsFromLog('financialInsight', message);
        }
      };

      const callbacks = {
        logCallback: enhancedLogCallback,
        progressCallback,
        statusCallback: () => { }
      };

      try {
        const result = await financialInsightOrchestrator.runPipeline(rows, userPrompt, callbacks);

        if (result.error) {
          metricsStorageService.addError('financialInsight');
          logCallback(`Error in pipeline: ${result.error.message}`);
          throw result.error;
        }

        // DIRECT TRACKING: Get actual metrics from orchestrator analytics
        const orchestratorAnalytics = result.analytics || {};
        totalTokensUsed = Object.values(orchestratorAnalytics).reduce((sum, step) =>
          sum + (step.tokensUsed || 0), 0);
        totalCreditsUsed = Object.values(orchestratorAnalytics).reduce((sum, step) =>
          sum + (step.creditsUsed || step.apiCallsCount || 0), 0);
        totalSupabaseHits = Object.values(orchestratorAnalytics).reduce((sum, step) =>
          sum + (step.supabaseHits || 0), 0);

        logCallback(`Financial Insight Pipeline Complete - processed ${result.data.length} rows`);
        logCallback(`Total tokens used: ${totalTokensUsed}, credits used: ${totalCreditsUsed}`);

        return {
          data: result.data,
          analytics: {
            tokensUsed: totalTokensUsed,
            creditsUsed: totalCreditsUsed,
            apiCalls: totalApiCalls,
            supabaseHits: totalSupabaseHits,
            errors: totalErrors,
            processedCount: result.data.length
          }
        };
      } catch (error) {
        metricsStorageService.addError('financialInsight');
        logCallback(`Error in pipeline processing: ${error.message}`);
        throw error;
      }
    }
  },

  /**
   * Process a chunk of data for file storage mechanism
   */
  async processChunk(chunk, userPrompt, logCallback) {
    logCallback(`Processing chunk of ${chunk.length} rows`);

    // Reset orchestrator state for this chunk
    financialInsightOrchestrator.reset();

    let chunkTokensUsed = 0;
    let chunkCreditsUsed = 0;
    let chunkApiCalls = 0;
    let chunkSupabaseHits = 0;
    let chunkErrors = 0;

    // Enhanced log callback for tracking
    const enhancedLogCallback = (message) => {
      logCallback(message);

      // DIRECT TRACKING: Extract metrics from logs
      if (typeof message === 'string') {
        // Parse token usage
        const tokenMatch = message.match(/(\d+)\s*tokens?\s*used/i);
        if (tokenMatch) {
          chunkTokensUsed += parseInt(tokenMatch[1]);
        }

        // Parse credit usage
        const creditMatch = message.match(/(\d+)\s*credits?\s*used/i);
        if (creditMatch) {
          chunkCreditsUsed += parseInt(creditMatch[1]);
        }

        // Count API calls
        if (message.toLowerCase().includes('api call') ||
          message.toLowerCase().includes('fetching') ||
          message.toLowerCase().includes('searching')) {
          chunkApiCalls++;
        }

        // Count Supabase hits
        if (message.toLowerCase().includes('supabase') ||
          message.toLowerCase().includes('existing') ||
          message.toLowerCase().includes('cache')) {
          chunkSupabaseHits++;
        }

        // Count errors
        if (message.toLowerCase().includes('error') ||
          message.toLowerCase().includes('failed')) {
          chunkErrors++;
        }
      }
    };

    const callbacks = {
      logCallback: enhancedLogCallback,
      progressCallback: () => { },
      statusCallback: () => { }
    };

    const result = await financialInsightOrchestrator.runPipeline(chunk, userPrompt, callbacks);

    if (result.error) {
      logCallback(`Error processing chunk: ${result.error.message}`);
      chunkErrors++;
      return {
        data: chunk.map(row => ({
          ...row,
          financialInsightError: result.error.message
        })),
        tokensUsed: chunkTokensUsed,
        creditsUsed: chunkCreditsUsed,
        apiCalls: chunkApiCalls,
        supabaseHits: chunkSupabaseHits,
        errors: chunkErrors
      };
    }

    return {
      data: result.data,
      tokensUsed: chunkTokensUsed,
      creditsUsed: chunkCreditsUsed,
      apiCalls: chunkApiCalls,
      supabaseHits: chunkSupabaseHits,
      errors: chunkErrors
    };
  },

  /**
   * Process with configuration (for compatibility with engine builder)
   */
  async processWithConfig(rows, config) {
    return this.processData(rows, config);
  }
};

export default financialInsightService;