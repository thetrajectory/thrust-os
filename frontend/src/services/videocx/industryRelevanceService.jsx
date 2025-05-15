// services/videocx/industryRelevanceService.jsx
import supabase from '../supabaseClient';

/**
 * Process industry relevance filtering for financial services
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processIndustryRelevance(data, logCallback, progressCallback) {
  logCallback("Starting Industry Relevance Filtering...");

  // Only process untagged rows
  const untaggedData = data.filter(row => !row.relevanceTag);
  logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

  const startTimestamp = Date.now();

  // Define relevant financial services industries
  const relevantIndustries = [
    'financial services', 'capital markets', 'investment management', 
    'asset management', 'wealth management', 'private banking', 'fintech',
    'insurance', 'reinsurance', 'credit unions', 'consumer finance',
    'mortgage services', 'lending services', 'payment processing',
    'payment systems', 'commercial banking', 'retail banking',
    'investment banking', 'risk management', 'venture capital',
    'private equity', 'banking', 'finance', 'financial'
  ];

  // Initialize result array with original data
  const processedData = [...untaggedData];

  // Track analytics
  let relevantCount = 0;
  let irrelevantCount = 0;
  let noIndustryData = 0;
  let errorCount = 0;

  // Process each item
  for (let i = 0; i < untaggedData.length; i++) {
    try {
      const row = untaggedData[i];
      
      // Extract industry from multiple possible sources
      const industry = (
        row.organization?.industry || 
        row['organization.industry'] || 
        row.industry || 
        ''
      ).toLowerCase();

      // Check if industry data exists and is relevant
      if (!industry) {
        logCallback(`Row ${i + 1}: No industry data available`);
        processedData[i].relevanceTag = 'No Industry Data';
        noIndustryData++;
      } else {
        // Check if industry matches any relevant industry
        const isRelevant = relevantIndustries.some(relevantIndustry => 
          industry.includes(relevantIndustry)
        );

        if (isRelevant) {
          logCallback(`Row ${i + 1}: Relevant industry (${industry})`);
          relevantCount++;
        } else {
          logCallback(`Row ${i + 1}: Irrelevant industry (${industry})`);
          processedData[i].relevanceTag = 'Irrelevant Industry';
          irrelevantCount++;
        }
      }

      // Update progress
      progressCallback((i + 1) / untaggedData.length * 100);
    } catch (error) {
      logCallback(`Error processing item ${i + 1}: ${error.message}`);
      errorCount++;
      processedData[i].relevanceTag = 'Industry Processing Error';
      
      // Update progress even on error
      progressCallback((i + 1) / data.length * 100);
    }
  }

  // Merge processed data back into original data array
  const finalData = data.map(originalRow => {
    const matchedRow = processedData.find(row => 
      row.linkedin_url === originalRow.linkedin_url ||
      (row.organization?.id === originalRow.organization?.id && row.organization?.id) ||
      row.id === originalRow.id
    );
    
    return matchedRow || originalRow;
  });

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Industry Relevance Filtering Complete:`);
  logCallback(`- Relevant Financial Services Industries: ${relevantCount}`);
  logCallback(`- Irrelevant Industries: ${irrelevantCount}`);
  logCallback(`- No Industry Data: ${noIndustryData}`);
  logCallback(`- Errors: ${errorCount}`);

  return {
    data: finalData,
    analytics: {
      relevantCount,
      irrelevantCount,
      noIndustryData,
      errorCount,
      totalProcessed: untaggedData.length,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

export default {
  processIndustryRelevance
};