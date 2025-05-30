// utils/storageUtils.js
const STORAGE_KEYS = {
  ENGINE: 'trajectory_engine',
  CLIENT: 'trajectory_client',
  ADVISOR: 'trajectory_advisor',
  CSV_DATA: 'trajectory_csvData',
  PROCESSED: 'trajectory_processed',
  FILTERED: 'trajectory_filtered',
  ANALYTICS: 'trajectory_analytics',
  FILTER_ANALYTICS: 'trajectory_filterAnalytics',
  LOGS: 'trajectory_logs',
  PROCESS_STATUS: 'trajectory_processStatus',
  CURRENT_STEP: 'trajectory_currentStep',
  PROCESSED_COUNT: 'trajectory_processed_count',

  // VideoCX Specific Keys
  VIDEOCX_PROCESSED: 'trajectory_videocx_processed',
  VIDEOCX_LOGS: 'trajectory_videocx_logs',
  VIDEOCX_ANALYTICS: 'trajectory_videocx_analytics',
  VIDEOCX_FILTER_ANALYTICS: 'trajectory_videocx_filterAnalytics',
  VIDEOCX_PROCESS_STATUS: 'trajectory_videocx_processStatus',
  VIDEOCX_CURRENT_STEP: 'trajectory_videocx_currentStep',
  VIDEOCX_PROCESSED_COUNT: 'trajectory_videocx_processed_count',

  // Find-Advisor Video-CX Specific Keys
  FIND_ADVISOR_PROCESSED: 'trajectory_find_advisor_processed',
  FIND_ADVISOR_LOGS: 'trajectory_find_advisor_logs',
  FIND_ADVISOR_ANALYTICS: 'trajectory_find_advisor_analytics',
  FIND_ADVISOR_FILTER_ANALYTICS: 'trajectory_find_advisor_filterAnalytics',
  FIND_ADVISOR_PROCESS_STATUS: 'trajectory_find_advisor_process_status',
  FIND_ADVISOR_CURRENT_STEP: 'trajectory_find_advisor_currentStep',
  FIND_ADVISOR_PROCESSED_COUNT: 'trajectory_find_advisor_processed_count',

  // Engine-Builder Specific Keys
  ENGINE_BUILDER_STATE: 'engine_builder_state',
  ENGINE_BUILDER_SELECTED: 'engine_builder_selected',
  PROCESSED_DATA: 'processed_data',
  PROCESSING_ANALYTICS: 'processing_analytics',

  CUSTOM_ENGINE_DATA: 'custom_engine_data',
  CUSTOM_ENGINE_LOGS: 'trajectory_custom_engine_logs',
  CUSTOM_ENGINE_STATUS: 'trajectory_custom_engine_status',
  CUSTOM_ENGINE_METRICS: 'trajectory_custom_engine_metrics', // ADD THIS
  CUSTOM_ENGINE_REAL_METRICS: 'trajectory_custom_engine_real_metrics',
};

// Save data to session storage with key
export const saveToStorage = (key, data) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const serializedData = typeof data === 'string' ? data : JSON.stringify(data);

      try {
        sessionStorage.setItem(key, serializedData);
        console.log(`Successfully saved ${key} to session storage`);
        return true;
      } catch (e) {
        console.error(`Failed to save ${key} to session storage:`, e);
        if (e.name === 'QuotaExceededError' || e.message.includes('quota')) {
          console.error('Session storage quota exceeded! Try reducing data size.');
        }
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error saving to session storage (${key}):`, error);
    return false;
  }
};

// Load data from session storage by key
export const loadFromStorage = (key) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const serializedData = sessionStorage.getItem(key);
      if (!serializedData) return null;

      try {
        return JSON.parse(serializedData);
      } catch (e) {
        // If not valid JSON, return as string
        return serializedData;
      }
    }
    return null;
  } catch (error) {
    console.error(`Error loading from session storage (${key}):`, error);
    return null;
  }
};

// Remove item from session storage
export const removeFromStorage = (key) => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(key);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error removing from session storage (${key}):`, error);
    return false;
  }
};

// Clear all app-related session storage
export const clearAppStorage = () => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      Object.values(STORAGE_KEYS).forEach(key => {
        sessionStorage.removeItem(key);
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error clearing session storage:', error);
    return false;
  }
};

// Add this to your storageUtils.js
export const checkStorageSize = (key, data) => {
  try {
    const serializedData = typeof data === 'string' ? data : JSON.stringify(data);
    const sizeInMB = new Blob([serializedData]).size / (1024 * 1024);
    console.log(`Size of ${key}: ${sizeInMB.toFixed(2)} MB`);

    if (sizeInMB > 4) {
      console.warn(`WARNING: Data for ${key} is ${sizeInMB.toFixed(2)} MB, approaching session storage limits!`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Error checking storage size:", e);
    return false;
  }
};

export default {
  STORAGE_KEYS,
  saveToStorage,
  loadFromStorage,
  removeFromStorage,
  clearAppStorage
};