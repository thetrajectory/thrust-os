// ProxyConnectionTest.jsx
import React, { useState, useEffect } from 'react';
import apiClient from '../utils/apiClient';

const ProxyConnectionTest = () => {
  const [status, setStatus] = useState('Testing connection...');
  const [details, setDetails] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const result = await apiClient.testConnection();
        
        if (result.success) {
          setStatus('Connection successful!');
          setIsConnected(true);
          setDetails('The proxy server is working correctly.');
        } else {
          setStatus('Connection failed');
          setIsConnected(false);
          setDetails(result.message);
        }
      } catch (error) {
        setStatus('Connection failed');
        setIsConnected(false);
        setDetails(`Error: ${error.message}. Ensure the proxy server is running on http://localhost:5000`);
      }
    };

    testConnection();
  }, []);

  const handleRetry = () => {
    setStatus('Testing connection...');
    setDetails('');
    setIsConnected(false);
    
    // Retry the connection test
    apiClient.testConnection()
      .then(result => {
        if (result.success) {
          setStatus('Connection successful!');
          setIsConnected(true);
          setDetails('The proxy server is working correctly.');
        } else {
          setStatus('Connection failed');
          setIsConnected(false);
          setDetails(result.message);
        }
      })
      .catch(error => {
        setStatus('Connection failed');
        setIsConnected(false);
        setDetails(`Error: ${error.message}. Ensure the proxy server is running on http://localhost:5000`);
      });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Proxy Server Connection Test</h2>
      
      <div className={`p-4 mb-4 rounded-lg ${
        status === 'Testing connection...' ? 'bg-yellow-100 text-yellow-800' :
        isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}>
        <p className="font-bold">{status}</p>
        {details && <p className="mt-2">{details}</p>}
      </div>
      
      {!isConnected && status !== 'Testing connection...' && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">Troubleshooting steps:</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ensure the proxy server is running on port 5000</li>
            <li>Check your .env file has all required API keys</li>
            <li>Verify there are no errors in the server console</li>
            <li>Check your browser's console for CORS errors</li>
          </ul>
          
          <button 
            onClick={handleRetry}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry Connection
          </button>
        </div>
      )}
    </div>
  );
};

export default ProxyConnectionTest;