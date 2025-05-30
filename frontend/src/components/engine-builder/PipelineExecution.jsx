// components/engine-builder/PipelineExecution.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../../utils/storageUtils';
import engineBuilderService from '../../services/engine-builder/engineBuilderService';

const PipelineExecution = () => {
  const navigate = useNavigate();
  const [engineData, setEngineData] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [processedData, setProcessedData] = useState(null);
  const [error, setError] = useState('');
  const [analytics, setAnalytics] = useState({});
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    // Load engine state and CSV data
    const engine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    const data = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
    
    if (!engine || !data) {
      // If missing data, redirect
      navigate('/engine-builder/upload');
      return;
    }
    
    setEngineData(engine);
    setCsvData(data);
    
    // Start processing
    processSteps(engine, data);
  }, [navigate]);

  const processSteps = async (engine, initialData) => {
    try {
      let currentData = [...initialData];
      let stepIndex = 0;
      let processingAnalytics = {
        originalCount: initialData.length,
        filteredCounts: {},
        finalCount: 0,
        stepMetrics: []
      };
      
      // Process each step sequentially
      for (const step of engine.steps) {
        setCurrentStep(stepIndex);
        setProgress(Math.floor((stepIndex / engine.steps.length) * 100));
        setStepProgress(0);
        
        // Process current step
        const { data, metrics } = await processStep(step, currentData, (percentComplete) => {
          setStepProgress(percentComplete);
        });
        
        // Update processed data
        currentData = data;
        
        // Update analytics
        processingAnalytics.stepMetrics.push({
          stepName: step.service,
          inputCount: metrics.inputCount,
          outputCount: metrics.outputCount,
          filteredCount: metrics.filteredCount,
          processingTime: metrics.processingTime
        });
        
        if (step.filter) {
          processingAnalytics.filteredCounts[step.service] = metrics.filteredCount;
        }
        
        stepIndex++;
      }
      
      // Final count is rows without relevanceTag
      processingAnalytics.finalCount = currentData.filter(row => !row.relevanceTag).length;
      
      // Save results
      setProcessedData(currentData);
      setAnalytics(processingAnalytics);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA, currentData);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS, processingAnalytics);
      
      // Complete
      setProgress(100);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error processing pipeline:', err);
      setError(`Error processing pipeline: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const processStep = async (step, data, progressCallback) => {
    const startTime = Date.now();
    const validRows = data.filter(row => !row.relevanceTag);
    const metrics = {
      inputCount: validRows.length,
      outputCount: 0,
      filteredCount: 0,
      processingTime: 0
    };
    
    // Process in batches to show progress
    const batchSize = 10;
    const batches = Math.ceil(validRows.length / batchSize);
    let processedRows = 0;
    let results = [];
    
    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, validRows.length);
      const batch = validRows.slice(start, end);
      
      // Process batch
      const processedBatch = await engineBuilderService.processStepBatch(step, batch);
      results = [...results, ...processedBatch];
      
      // Update progress
      processedRows += batch.length;
      progressCallback(Math.floor((processedRows / validRows.length) * 100));
    }
    
    // Merge results with existing data
    const resultMap = new Map();
    results.forEach(row => {
      resultMap.set(row.id || `${row.fname}_${row.lname}_${row.position}`, row);
    });
    
    const mergedData = data.map(row => {
      const rowKey = row.id || `${row.fname}_${row.lname}_${row.position}`;
      if (resultMap.has(rowKey)) {
        return resultMap.get(rowKey);
      }
      return row;
    });
    
    // Calculate metrics
    metrics.outputCount = results.filter(row => !row.relevanceTag).length;
    metrics.filteredCount = results.filter(row => row.relevanceTag).length;
    metrics.processingTime = Date.now() - startTime;
    
    return { data: mergedData, metrics };
  };

  const handleViewResults = () => {
    navigate('/engine-builder/results');
  };

  const handleCancel = () => {
    if (window.confirm('Are you sure you want to cancel processing? All progress will be lost.')) {
      navigate('/engine-builder/upload');
    }
  };

  if (!engineData || !csvData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Loading data...</div>
      </div>
    );
  }

  const getStepName = (index) => {
    if (!engineData?.steps?.[index]?.service) return `Step ${index + 1}`;
    
    const service = engineData.steps[index].service;
    const displayName = service.replace(/([A-Z])/g, ' $1').trim();
    return `${index + 1}. ${displayName}`;
  };

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
      <h2 className="text-4xl font-bold text-center mb-8">
        Processing Your Data
      </h2>
      
      <div className="w-full p-4 bg-gray-50 rounded-lg mb-8">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Overall Progress</h3>
          <span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div 
            className="bg-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
      
      <div className="w-full mb-8">
        {engineData.steps.map((step, index) => (
          <div 
            key={index}
            className={`mb-4 p-4 rounded-lg ${
              index < currentStep 
                ? 'bg-green-100 border border-green-400' 
                : index === currentStep 
                  ? 'bg-blue-100 border border-blue-400' 
                  : 'bg-gray-100 border border-gray-300'
            }`}
          >
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium">{getStepName(index)}</h4>
              <span>
                {index < currentStep 
                  ? '✓ Complete' 
                  : index === currentStep 
                    ? `${stepProgress}%` 
                    : 'Pending'}
              </span>
            </div>
            
            {index === currentStep && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${stepProgress}%` }}
                ></div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      {error && (
        <div className="w-full p-4 bg-red-50 text-red-700 rounded-lg mb-8">
          <h3 className="font-bold mb-1">Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      <div className="w-full flex justify-center space-x-4">
        {isProcessing ? (
          <button
            onClick={handleCancel}
            className="px-8 py-3 text-lg border-2 border-red-400 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleViewResults}
            className="px-12 py-3 text-lg bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            View Results
          </button>
        )}
      </div>
    </div>
  );
};

export default PipelineExecution;