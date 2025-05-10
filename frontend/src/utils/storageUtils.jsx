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
    CURRENT_STEP: 'trajectory_currentStep'
  };
  
  // Save data to session storage with key
  export const saveToStorage = (key, data) => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const serializedData = typeof data === 'string' ? data : JSON.stringify(data);
        sessionStorage.setItem(key, serializedData);
        return true;
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
  
  export default {
    STORAGE_KEYS,
    saveToStorage,
    loadFromStorage,
    removeFromStorage,
    clearAppStorage
  };