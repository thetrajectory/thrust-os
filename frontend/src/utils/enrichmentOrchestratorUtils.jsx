// utils/enrichmentOrchestratorUtils.js
import storageUtils from './storageUtils';

/**
 * Save orchestrator state to session storage
 * @param {Object} orchestrator - The enrichment orchestrator instance
 */
export const saveOrchestratorState = (orchestrator) => {
  try {
    // Save current step
    storageUtils.saveToStorage(
      storageUtils.STORAGE_KEYS.CURRENT_STEP, 
      orchestrator.currentStepIndex
    );
    
    // Save step statuses
    storageUtils.saveToStorage(
      storageUtils.STORAGE_KEYS.PROCESS_STATUS, 
      orchestrator.stepStatus
    );
    
    // Save logs if available
    if (orchestrator.logs && orchestrator.logs.length > 0) {
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.LOGS, 
        orchestrator.logs
      );
    }
    
    // Save analytics if available
    if (orchestrator.analytics && Object.keys(orchestrator.analytics).length > 0) {
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.ANALYTICS, 
        orchestrator.analytics
      );
    }
    
    // Save filter analytics if available
    if (orchestrator.filterAnalytics && Object.keys(orchestrator.filterAnalytics).length > 0) {
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.FILTER_ANALYTICS, 
        orchestrator.filterAnalytics
      );
    }
    
    // Save processed data if available
    if (orchestrator.processedData && orchestrator.processedData.length > 0) {
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.PROCESSED, 
        orchestrator.processedData
      );
    }
    
    // Save filtered data if available
    if (orchestrator.filteredData && orchestrator.filteredData.length > 0) {
      storageUtils.saveToStorage(
        storageUtils.STORAGE_KEYS.FILTERED, 
        orchestrator.filteredData
      );
    }
    
    return true;
  } catch (error) {
    console.error('Error saving orchestrator state to storage:', error);
    return false;
  }
};

/**
 * Load orchestrator state from session storage
 * @param {Object} orchestrator - The enrichment orchestrator instance
 */
export const loadOrchestratorState = (orchestrator) => {
  try {
    // Load current step
    const currentStep = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CURRENT_STEP);
    if (currentStep !== null) orchestrator.currentStepIndex = currentStep;
    
    // Load step status
    const stepStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS);
    if (stepStatus) orchestrator.stepStatus = stepStatus;
    
    // Load logs
    const logs = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.LOGS);
    if (logs && logs.length > 0) orchestrator.logs = logs;
    
    // Load analytics
    const analytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ANALYTICS);
    if (analytics) orchestrator.analytics = analytics;
    
    // Load filter analytics
    const filterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTER_ANALYTICS);
    if (filterAnalytics) orchestrator.filterAnalytics = filterAnalytics;
    
    // Load processed data
    const processedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSED);
    if (processedData && processedData.length > 0) orchestrator.processedData = processedData;
    
    // Load filtered data
    const filteredData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTERED);
    if (filteredData && filteredData.length > 0) orchestrator.filteredData = filteredData;
    
    // Check processing completion
    orchestrator.processingComplete = orchestrator.currentStepIndex >= orchestrator.pipeline.length;
    
    return true;
  } catch (error) {
    console.error('Error loading orchestrator state from storage:', error);
    return false;
  }
};

export default {
  saveOrchestratorState,
  loadOrchestratorState
};