// components/RouteGuard.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import storageUtils from '../utils/storageUtils';

const RouteGuard = ({ children, requiredState, redirectTo }) => {
  // Check if the required state is present in session storage
  const stateExists = requiredState.every(key => {
    const value = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS[key]);
    return value !== null && value !== undefined;
  });

  // Special case for custom engine upload route
  if (redirectTo === '/upload' && requiredState.includes('CSV_DATA')) {
    const isCustomEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE);
    if (isCustomEngine) {
      return stateExists ? children : <Navigate to="/custom-engine/upload" />;
    }
  }

  // If state exists, render children, otherwise redirect
  return stateExists ? children : <Navigate to={redirectTo} />;
};

export default RouteGuard;