// components/engine-builder/ResultsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import storageUtils from '../../utils/storageUtils';
import supabase from '../../services/supabaseClient';

const ResultsPage = () => {
  const navigate = useNavigate();
  const [engineData, setEngineData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [filterView, setFilterView] = useState('all');

  useEffect(() => {
    // Load engine state and processed data
    const engine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    const data = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA);
    const analyticsData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS);
    
    if (!engine || !data) {
      // If missing data, redirect
      navigate('/engine-builder');
      return;
    }
    
    setEngineData(engine);
    setProcessedData(data);
    setAnalytics(analyticsData || {
      originalCount: data.length,
      finalCount: data.filter(row => !row.relevanceTag).length,
      filteredCounts: {},
      stepMetrics: []
    });
  }, [navigate]);

  const handleBack = () => {
    navigate('/engine-builder/execute');
  };

  const handleNewEngine = () => {
    // Clear all engine builder data
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA);
    storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS);
    
    // Navigate to engine builder home
    navigate('/engine-builder');
  };

  const handleDownloadCSV = () => {
    // Filter data based on current view
    let dataToExport = [];
    
    if (filterView === 'all') {
      dataToExport = processedData;
    } else if (filterView === 'qualified') {
      dataToExport = processedData.filter(row => !row.relevanceTag);
    } else if (filterView === 'disqualified') {
      dataToExport = processedData.filter(row => row.relevanceTag);
    }
    
    // Convert to CSV
    const csv = Papa.unparse(dataToExport);
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${engineData.engineName}-results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReport = () => {
    // Create analytics report
    const reportData = [
      {
        'Metric': 'Engine Name',
        'Value': engineData.engineName
      },
      {
        'Metric': 'Engine Type',
        'Value': engineData.engineType
      },
      {
        'Metric': 'Input Schema',
        'Value': engineData.inputSchema?.type
      },
      {
        'Metric': 'Original Row Count',
        'Value': analytics.originalCount
      },
      {
        'Metric': 'Final Qualified Row Count',
        'Value': analytics.finalCount
      },
      {
        'Metric': 'Pass Rate',
        'Value': `${((analytics.finalCount / analytics.originalCount) * 100).toFixed(2)}%`
      }
    ];
    
    // Add step metrics
    analytics.stepMetrics.forEach((metric, index) => {
      reportData.push({
        'Metric': `Step ${index + 1} - ${metric.stepName}`,
        'Value': ''
      });
      reportData.push({
        'Metric': '  Input Count',
        'Value': metric.inputCount
      });
      reportData.push({
        'Metric': '  Output Count',
        'Value': metric.outputCount
      });
      reportData.push({
        'Metric': '  Filtered Count',
        'Value': metric.filteredCount
      });
      reportData.push({
        'Metric': '  Processing Time',
        'Value': `${(metric.processingTime / 1000).toFixed(2)} seconds`
      });
    });
    
    // Convert to CSV
    const csv = Papa.unparse(reportData);
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${engineData.engineName}-report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!engineData || !processedData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Loading results...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to processing
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-8">
        Processing Complete!
      </h2>
      
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-100 p-6 rounded-lg text-center">
          <div className="text-4xl font-bold text-gray-800">
            {analytics.originalCount}
          </div>
          <div className="text-gray-600 mt-2">Original Rows</div>
        </div>
        
        <div className="bg-green-100 p-6 rounded-lg text-center">
          <div className="text-4xl font-bold text-green-800">
            {analytics.finalCount}
          </div>
          <div className="text-green-600 mt-2">Qualified Leads</div>
        </div>
        
        <div className="bg-yellow-100 p-6 rounded-lg text-center">
          <div className="text-4xl font-bold text-yellow-800">
            {analytics.originalCount - analytics.finalCount}
          </div>
          <div className="text-yellow-600 mt-2">Tagged Leads</div>
        </div>
      </div>
      
      <div className="w-full mb-8">
        <h3 className="text-xl font-bold mb-4">Processing Steps</h3>
        
        {analytics.stepMetrics.map((metric, index) => (
          <div key={index} className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-bold mb-2">Step {index + 1}: {metric.stepName}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Input Count</div>
                <div className="font-medium">{metric.inputCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Output Count</div>
                <div className="font-medium">{metric.outputCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Filtered Count</div>
                <div className="font-medium">{metric.filteredCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Processing Time</div>
                <div className="font-medium">{(metric.processingTime / 1000).toFixed(2)} sec</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="w-full mb-8">
        <h3 className="text-xl font-bold mb-4">Preview Results</h3>
        
        <div className="mb-4 flex space-x-4">
          <button
            onClick={() => setFilterView('all')}
            className={`px-4 py-2 rounded ${
              filterView === 'all' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            All Rows ({processedData.length})
          </button>
          <button
            onClick={() => setFilterView('qualified')}
            className={`px-4 py-2 rounded ${
              filterView === 'qualified' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            Qualified ({analytics.finalCount})
          </button>
          <button
            onClick={() => setFilterView('disqualified')}
            className={`px-4 py-2 rounded ${
              filterView === 'disqualified' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
            }`}
          >
            Tagged ({analytics.originalCount - analytics.finalCount})
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                {Object.keys(processedData[0]).slice(0, 6).map((key, index) => (
                  <th key={index} className="py-2 px-4 border-b text-left text-sm font-medium text-gray-700">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processedData
                .filter(row => {
                  if (filterView === 'all') return true;
                  if (filterView === 'qualified') return !row.relevanceTag;
                  if (filterView === 'disqualified') return !!row.relevanceTag;
                  return true;
                })
                .slice(0, 10)
                .map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    {Object.keys(row).slice(0, 6).map((key, colIndex) => (
                      <td key={colIndex} className="py-2 px-4 border-b text-sm">
                        {key === 'relevanceTag' && row[key] 
                          ? <span className="px-2 py-1 bg-yellow-100 rounded text-xs">{row[key]}</span>
                          : String(row[key]).substring(0, 30) + (String(row[key]).length > 30 ? '...' : '')
                        }
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="mt-2 text-sm text-gray-500">
            Showing 10 of {
              filterView === 'all' 
                ? processedData.length 
                : filterView === 'qualified' 
                  ? analytics.finalCount 
                  : analytics.originalCount - analytics.finalCount
            } rows
          </div>
        </div>
      </div>
      
      <div className="w-full flex flex-wrap justify-center space-x-4 space-y-4 md:space-y-0">
        <button
          onClick={handleDownloadCSV}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Download Results CSV
        </button>
        
        <button
          onClick={handleDownloadReport}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Download Analytics Report
        </button>
        
        <button
          onClick={handleNewEngine}
          className="px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Build Another Engine
        </button>
      </div>
    </div>
  );
};

export default ResultsPage;