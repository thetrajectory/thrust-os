/**
 * Process connection time analysis
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data with connection times
 */
export async function processConnectionTime(data, logCallback, progressCallback) {
    logCallback("Starting Connection Time Calculation...");
    logCallback(`Processing all ${data.length} rows.`);

    const startTimestamp = Date.now();

    // Initialize result array with original data
    const processedData = [...data];

    // Process data
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
            // Calculate the connection time
            const connectionTime = calculateConnectionTime(row);

            // Update the result in the processedData array with just the connection time
            processedData[i] = {
                ...processedData[i],
                connectionTime
            };

            // Update progress
            progressCallback((i + 1) / data.length * 100);

        } catch (error) {
            logCallback(`Error calculating connection time for item ${i + 1}: ${error.message}`);

            // Set error for this row
            processedData[i] = {
                ...processedData[i],
                connectionTime: 'ERROR'
            };

            // Update progress even on error
            progressCallback((i + 1) / data.length * 100);
        }
    }

    const endTimestamp = Date.now();
    const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

    // Log completion
    logCallback(`Connection Time Calculation Complete in ${processingTimeSeconds.toFixed(2)} seconds.`);

    return {
        data: processedData
    };
}

/**
 * Calculate connection time for a single lead
 * @param {Object} row - Data row
 * @returns {String} - Connection time as a formatted string
 */
function calculateConnectionTime(row) {
    // Get the connection date from the row
    const connectedOnString = row.connected_on;

    if (!connectedOnString) {
        return 'Unknown';
    }

    try {
        // Parse the connection date
        const connectedOn = new Date(connectedOnString);

        // Calculate the time since connection
        const now = new Date();
        const diffTime = Math.abs(now - connectedOn);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Calculate years, months, and remaining days
        const years = Math.floor(diffDays / 365);
        const months = Math.floor((diffDays % 365) / 30);
        const days = diffDays % 30;

        // Format the duration string
        let connectionTime = '';
        if (years > 0) {
            connectionTime += `${years} year${years > 1 ? 's' : ''}`;
        }
        if (months > 0) {
            connectionTime += `${connectionTime ? ', ' : ''}${months} month${months > 1 ? 's' : ''}`;
        }
        if (days > 0 || (!years && !months)) {
            connectionTime += `${connectionTime ? ', ' : ''}${days} day${days !== 1 ? 's' : ''}`;
        }

        return connectionTime;
    } catch (error) {
        console.error(`Error calculating connection time: ${error.message}`);
        return 'Error';
    }
}

export const connectionTimeService = processConnectionTime;

export default {
    processConnectionTime,
    connectionTimeService
};