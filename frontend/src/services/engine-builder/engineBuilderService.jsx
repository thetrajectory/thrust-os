// services/engine-builder/engineBuilderService.js
import { serviceRegistry } from './serviceRegistry';

const engineBuilderService = {
  // Process a batch of rows for a specific step
  processStepBatch: async (step, rows) => {
    try {
      if (!step || !step.service) {
        throw new Error('Invalid step configuration');
      }
      
      // Get service handler from registry
      const serviceHandler = serviceRegistry[step.service]?.handler;
      if (!serviceHandler) {
        throw new Error(`Service handler not found for ${step.service}`);
      }
      
      // Process rows with service
      const processedRows = await serviceHandler(rows, step.config);
      
      // Apply filtering if configured
      if (step.filter && step.filter.rules) {
        return applyFilters(processedRows, step.filter);
      }
      
      return processedRows;
    } catch (error) {
      console.error(`Error processing step ${step.service}:`, error);
      throw error;
    }
  },
  
  // Execute complete pipeline on data
  executePipeline: async (engineState, data, progressCallback) => {
    if (!engineState || !engineState.steps || !data) {
      throw new Error('Invalid engine configuration or data');
    }
    
    let currentData = [...data];
    const analytics = {
      originalCount: data.length,
      filteredCounts: {},
      stepMetrics: []
    };
    
    // Process each step
    for (let i = 0; i < engineState.steps.length; i++) {
      const step = engineState.steps[i];
      
      // Update progress
      if (progressCallback) {
        progressCallback({
          step: i,
          totalSteps: engineState.steps.length,
          progress: Math.floor((i / engineState.steps.length) * 100)
        });
      }
      
      const startTime = Date.now();
      
      // Get valid rows for this step (no relevanceTag)
      const validRows = currentData.filter(row => !row.relevanceTag);
      
      // Process in batches
      const batchSize = 20;
      const batches = Math.ceil(validRows.length / batchSize);
      let processedRows = [];
      
      for (let j = 0; j < batches; j++) {
        const start = j * batchSize;
        const end = Math.min((j + 1) * batchSize, validRows.length);
        const batch = validRows.slice(start, end);
        
        // Process batch
        const batchResult = await this.processStepBatch(step, batch);
        processedRows = [...processedRows, ...batchResult];
        
        // Update batch progress
        if (progressCallback) {
          progressCallback({
            step: i,
            totalSteps: engineState.steps.length,
            progress: Math.floor((i / engineState.steps.length) * 100),
            batchProgress: Math.floor(((j + 1) / batches) * 100)
          });
        }
      }
      
      // Merge processed rows back into the dataset
      const processedRowMap = new Map();
      processedRows.forEach(row => {
        // Create a unique key for each row
        const key = row.id || `${row.fname || row.first_name}_${row.lname || row.last_name}_${row.position || row.title}`;
        processedRowMap.set(key, row);
      });
      
      currentData = currentData.map(row => {
        // If the row has a relevanceTag, it was filtered in a previous step
        if (row.relevanceTag) return row;
        
        // Create a unique key for this row
        const key = row.id || `${row.fname || row.first_name}_${row.lname || row.last_name}_${row.position || row.title}`;
        
        // Replace with processed row if found
        if (processedRowMap.has(key)) {
          return processedRowMap.get(key);
        }
        
        return row;
      });
      
      // Update analytics
      const filteredCount = processedRows.filter(row => row.relevanceTag).length;
      if (filteredCount > 0) {
        analytics.filteredCounts[step.service] = filteredCount;
      }
      
      analytics.stepMetrics.push({
        stepName: step.service,
        inputCount: validRows.length,
        outputCount: processedRows.filter(row => !row.relevanceTag).length,
        filteredCount,
        processingTime: Date.now() - startTime
      });
    }
    
    // Calculate final counts
    analytics.finalCount = currentData.filter(row => !row.relevanceTag).length;
    
    return {
      data: currentData,
      analytics
    };
  }
};

// Helper function to apply filters to rows
const applyFilters = (rows, filter) => {
  if (!filter || !filter.rules || filter.rules.length === 0) {
    return rows;
  }
  
  return rows.map(row => {
    // Skip already filtered rows
    if (row.relevanceTag) return row;
    
    // Apply each rule
    for (const rule of filter.rules) {
      const { field, operator, value, action } = rule;
      
      // Skip if field is not present
      if (!row.hasOwnProperty(field)) continue;
      
      const fieldValue = row[field];
      let matches = false;
      
      // Apply operator
      switch (operator) {
        case 'contains':
          matches = String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
          break;
        case 'equals':
          matches = String(fieldValue).toLowerCase() === String(value).toLowerCase();
          break;
        case 'startsWith':
          matches = String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
          break;
        case 'endsWith':
          matches = String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
          break;
        case 'greaterThan':
          matches = Number(fieldValue) > Number(value);
          break;
        case 'lessThan':
          matches = Number(fieldValue) < Number(value);
          break;
        case 'between':
          const [min, max] = value.split(',').map(v => Number(v));
          matches = Number(fieldValue) >= min && Number(fieldValue) <= max;
          break;
        default:
          matches = false;
      }
      
      // Apply action based on match
      if ((action === 'pass' && !matches) || (action === 'eliminate' && matches)) {
        // Tag the row
        const tagPrefix = filter.tagPrefix || 'filtered';
        row.relevanceTag = `${tagPrefix}_${field}_${operator}_${value}`;
        break;
      }
    }
    
    return row;
  });
};

export default engineBuilderService;