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