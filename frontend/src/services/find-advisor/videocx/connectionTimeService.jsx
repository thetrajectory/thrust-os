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
        console.warn(`No connected_on date found for row:`, row);
        return 'Unknown';
    }

    try {
        // For debugging
        console.log(`Calculating connection time from date: ${connectedOnString}`);

        let connectedOn;

        // Handle different date formats
        if (typeof connectedOnString === 'string') {
            // Check for DD-MM-YYYY format
            const ddmmyyyyMatch = connectedOnString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
            if (ddmmyyyyMatch) {
                // Convert from DD-MM-YYYY to YYYY-MM-DD for reliable parsing
                const day = ddmmyyyyMatch[1].padStart(2, '0');
                const month = ddmmyyyyMatch[2].padStart(2, '0');
                const year = ddmmyyyyMatch[3];
                // Create date from parts to avoid timezone issues
                connectedOn = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                console.log(`Parsed DD-MM-YYYY format: ${day}-${month}-${year} to:`, connectedOn);
            }
            // Check for MM-DD-YYYY format
            else if (connectedOnString.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)) {
                // This could be MM-DD-YYYY, Let's try to detect and fix
                const parts = connectedOnString.split(/[/-]/);
                if (parts.length === 3) {
                    const month = parseInt(parts[0]);
                    const day = parseInt(parts[1]);
                    const year = parseInt(parts[2]);

                    // Validate day and month ranges
                    if (month <= 12 && day <= 31) {
                        connectedOn = new Date(year, month - 1, day);
                        console.log(`Parsed MM-DD-YYYY format to:`, connectedOn);
                    }
                }
            }
            // Check for ISO format YYYY-MM-DD
            else if (connectedOnString.match(/^\d{4}-\d{2}-\d{2}(T.*)?$/)) {
                if (connectedOnString.includes('T')) {
                    // Full ISO format with time
                    connectedOn = new Date(connectedOnString);
                } else {
                    // YYYY-MM-DD format
                    const [year, month, day] = connectedOnString.split('-');
                    connectedOn = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                }
                console.log(`Parsed ISO format to:`, connectedOn);
            }
            // Fallback for other formats
            else {
                // Try standard Date parsing as fallback
                connectedOn = new Date(connectedOnString);
                console.log(`Attempted standard date parsing:`, connectedOn);

                // Check if date is valid
                if (isNaN(connectedOn.getTime())) {
                    // If parsing failed, try to detect and handle other formats
                    if (connectedOnString.includes('-') || connectedOnString.includes('/')) {
                        const parts = connectedOnString.split(/[/-]/);
                        if (parts.length === 3) {
                            // Try different combinations if standard parsing failed
                            // This is for when we don't know if it's DD-MM-YYYY or MM-DD-YYYY

                            // Try assuming DD-MM-YYYY first
                            const day = parseInt(parts[0]);
                            const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
                            const year = parseInt(parts[2]);

                            if (year > 1900 && month >= 0 && month < 12 && day > 0 && day <= 31) {
                                connectedOn = new Date(year, month, day);
                                console.log(`Parsed as DD-MM-YYYY:`, connectedOn);
                            }

                            // If still invalid, try MM-DD-YYYY
                            if (isNaN(connectedOn.getTime())) {
                                const month = parseInt(parts[0]) - 1;
                                const day = parseInt(parts[1]);
                                const year = parseInt(parts[2]);

                                if (year > 1900 && month >= 0 && month < 12 && day > 0 && day <= 31) {
                                    connectedOn = new Date(year, month, day);
                                    console.log(`Parsed as MM-DD-YYYY:`, connectedOn);
                                }
                            }
                        }
                    }
                }
            }
        } else if (connectedOnString instanceof Date) {
            connectedOn = connectedOnString;
        } else {
            console.warn(`Invalid connected_on format: ${typeof connectedOnString}`);
            return 'Invalid Date Format';
        }

        // Verify the date is valid
        if (isNaN(connectedOn.getTime())) {
            console.warn(`Invalid date from string: ${connectedOnString}`);
            return 'Date format: ' + connectedOnString; // Return the original format for debugging
        }

        // Calculate time since connection
        const now = new Date();

        // Check if the date is in the future
        if (connectedOn > now) {
            console.log(`Date is in the future: ${connectedOnString}`);
            return 'Future date';
        }

        const diffTime = Math.abs(now - connectedOn);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Calculate years, months, and days
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
        console.error(`Error calculating connection time from ${connectedOnString}:`, error);
        return 'Error: ' + error.message;
    }
}

export const connectionTimeService = processConnectionTime;

export default {
    processConnectionTime,
    connectionTimeService
};