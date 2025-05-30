// services/enrichment-services/financialInsightService.js
import financialInsightOrchestrator from './financialInsightOrchestrator';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';

/**
 * Financial Insight Service
 * Main service interface for the financial insight pipeline
 */
const financialInsightService = {
  /**
   * Process data through the financial insight pipeline
   * @param {Array} rows - Array of data rows to process
   * @param {Object} config - Configuration including user prompt
   * @param {Function} logCallback - Optional callback for logging
   * @param {Function} progressCallback - Optional callback for progress updates
   * @returns {Promise<Array>} - Processed rows with insights
   */
  async processData(rows, config = {}, logCallback = () => {}, progressCallback = () => {}) {
    logCallback("Starting Financial Insight Analysis Pipeline...");
    
    // Get user prompt from config
    const userPrompt = config.prompt || '';
    
    // Use file storage for large datasets
    const useFileStorage = rows.length > 1000;
    
    if (useFileStorage) {
      logCallback('Large dataset detected - using file storage for optimal performance');
      
      // Process using file storage service for large datasets
      const processFunction = async (chunk) => {
        return await this.processChunk(chunk, userPrompt, logCallback);
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
        return results;
      } catch (error) {
        logCallback(`Error in large dataset processing: ${error.message}`);
        throw error;
      }
    } else {
      // Process all rows through the orchestrator
      const callbacks = {
        logCallback,
        progressCallback,
        statusCallback: () => {}
      };
      
      try {
        const result = await financialInsightOrchestrator.runPipeline(rows, userPrompt, callbacks);
        
        if (result.error) {
          logCallback(`Error in pipeline: ${result.error.message}`);
          throw result.error;
        }
        
        logCallback(`Financial Insight Pipeline Complete - processed ${result.data.length} rows`);
        return result.data;
      } catch (error) {
        logCallback(`Error in pipeline processing: ${error.message}`);
        throw error;
      }
    }
  },
  
  /**
   * Process a chunk of data for file storage mechanism
   * @param {Array} chunk - Chunk of data to process
   * @param {string} userPrompt - User provided prompt for insight analysis
   * @param {Function} logCallback - Callback for logging
   * @returns {Promise<Array>} - Processed chunk
   */
  async processChunk(chunk, userPrompt, logCallback) {
    logCallback(`Processing chunk of ${chunk.length} rows`);
    
    // Reset orchestrator state for this chunk
    financialInsightOrchestrator.reset();
    
    // Run the pipeline for this chunk
    const callbacks = {
      logCallback,
      progressCallback: () => {},
      statusCallback: () => {}
    };
    
    const result = await financialInsightOrchestrator.runPipeline(chunk, userPrompt, callbacks);
    
    if (result.error) {
      logCallback(`Error processing chunk: ${result.error.message}`);
      // Return the chunk with error markers
      return chunk.map(row => ({
        ...row,
        financialInsightError: result.error.message
      }));
    }
    
    return result.data;
  },
  
  /**
   * Process with configuration (for compatibility with engine builder)
   * @param {Array} rows - Array of data rows
   * @param {Object} config - Configuration object
   * @returns {Promise<Array>} - Processed rows
   */
  async processWithConfig(rows, config) {
    return this.processData(rows, config);
  }
};

export default financialInsightService;