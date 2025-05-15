// services/videocx/headcountFilterService.jsx

/**
 * Process headcount filtering for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processHeadcountFilter(data, logCallback, progressCallback) {
    logCallback("Starting Headcount Filtering...");

    // Only process untagged rows
    const untaggedData = data.filter(row => !row.relevanceTag);
    logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment (optional - you can hardcode the minimum headcount)
    const minHeadcount = parseInt(import.meta.env.VITE_REACT_APP_MIN_HEADCOUNT_VCX);

    // Initialize result array with original data
    const processedData = [...untaggedData];

    // Track analytics
    let sufficientHeadcount = 0;
    let lowHeadcount = 0;
    let noHeadcountData = 0;
    let errorCount = 0;

    // Process each item
    for (let i = 0; i < untaggedData.length; i++) {
        try {
            const row = untaggedData[i];

            // Extract headcount from multiple possible sources
            const headcount = parseInt(
                row.organization?.estimated_num_employees ||
                row['organization.estimated_num_employees'] ||
                row.employees ||
                0
            );

            // Check if headcount data exists and meets minimum requirement
            if (isNaN(headcount) || headcount === 0) {
                logCallback(`Row ${i + 1}: No headcount data available`);
                processedData[i].relevanceTag = 'No Headcount Data';
                noHeadcountData++;
            } else if (headcount < minHeadcount) {
                logCallback(`Row ${i + 1}: Low headcount (${headcount} < ${minHeadcount})`);
                processedData[i].relevanceTag = 'Low Headcount';
                lowHeadcount++;
            } else {
                logCallback(`Row ${i + 1}: Sufficient headcount (${headcount} >= ${minHeadcount})`);
                sufficientHeadcount++;
            }

            // Update progress
            progressCallback((i + 1) / untaggedData.length * 100);
        } catch (error) {
            logCallback(`Error processing item ${i + 1}: ${error.message}`);
            errorCount++;
            processedData[i].relevanceTag = 'Headcount Processing Error';

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
    logCallback(`Headcount Filtering Complete:`);
    logCallback(`- Sufficient Headcount (>=${minHeadcount}): ${sufficientHeadcount}`);
    logCallback(`- Low Headcount (<${minHeadcount}): ${lowHeadcount}`);
    logCallback(`- No Headcount Data: ${noHeadcountData}`);
    logCallback(`- Errors: ${errorCount}`);

    return {
        data: finalData,
        analytics: {
            sufficientHeadcount,
            lowHeadcount,
            noHeadcountData,
            errorCount,
            totalProcessed: untaggedData.length,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

export default {
    processHeadcountFilter
};