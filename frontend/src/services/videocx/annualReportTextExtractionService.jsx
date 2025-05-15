// services/videocx/annualReportTextExtractionService.jsx
import apiClient from '../../utils/apiClient';
import supabase from '../supabaseClient';

/**
 * Check if data is stale based on updated_at timestamp
 * @param {string} updatedAt - ISO date string of when data was last updated
 * @param {string} createdAt - ISO date string of when data was created
 * @returns {boolean} - True if data is stale
 */
function isDataStale(updatedAt, createdAt) {
    // First try to use updated_at
    if (updatedAt) {
        const lastUpdate = new Date(updatedAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
        staleDate.setDate(staleDate.getDate() - thresholdDays);

        return lastUpdate < staleDate;
    }

    // Fall back to created_at if updated_at is missing
    if (createdAt) {
        const createDate = new Date(createdAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
        staleDate.setDate(staleDate.getDate() - thresholdDays);

        return createDate < staleDate;
    }

    // If both are missing, consider it stale
    return true;
}

/**
 * Extract raw text from annual reports and store it in the database
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function extractAnnualReportText(data, logCallback, progressCallback) {
    logCallback("Starting Annual Report Text Extraction...");

    // Only process untagged rows that have annual report URLs
    const untaggedData = data.filter(row =>
        !row.relevanceTag &&
        row.annualReportUrl &&
        row.annualReportUrl !== "NO_SUITABLE_REPORT_FOUND"
    );

    logCallback(`Processing ${untaggedData.length} reports out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_REPORT_TEXT_BATCH_SIZE || "3");
    const maxRetries = parseInt(import.meta.env.VITE_REACT_APP_MAX_RETRIES || "3");
    const retryDelay = parseInt(import.meta.env.VITE_REACT_APP_RETRY_DELAY || "5");

    // Initialize result array with original data
    const processedData = [...untaggedData];

    // Track analytics
    let supabaseHits = 0;
    let extractionSuccesses = 0;
    let extractionFailures = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Check if Supabase is available by making a test query
    let supabaseAvailable = true;
    try {
        const { error } = await supabase.from('orgs_db').select('count').limit(1);
        if (error) {
            logCallback(`⚠️ Supabase connection issue: ${error.message}`);
            supabaseAvailable = false;
        }
    } catch (e) {
        logCallback(`⚠️ Supabase test query failed: ${e.message}`);
        supabaseAvailable = false;
    }

    // Process in batches
    for (let i = 0; i < untaggedData.length; i += batchSize) {
        const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
        logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

        // Process each item in the batch
        for (let j = 0; j < currentBatchSize; j++) {
            const index = i + j;
            const row = untaggedData[index];

            try {
                // Get organization data
                const orgId = row.organization?.id || row['organization.id'];
                const companyName = row.organization?.name || row['organization.name'] || row.company;
                const reportUrl = row.annualReportUrl;

                if (!orgId || !companyName || !reportUrl) {
                    logCallback(`Skipping row ${index + 1}: Missing required data`);
                    skippedCount++;
                    continue;
                }

                // First check if we already have the raw text in Supabase
                let companyData = null;
                if (supabaseAvailable) {
                    const { data: dbData, error } = await supabase
                        .from('orgs_db')
                        .select('annual_report_raw, updated_at, created_at')
                        .eq('apollo_org_id', orgId)
                        .maybeSingle();

                    if (!error && dbData) {
                        companyData = dbData;
                    }
                }

                // Check if the raw text is fresh
                if (companyData &&
                    !isDataStale(companyData.updated_at, companyData.created_at) &&
                    companyData.annual_report_raw) {

                    logCallback(`Using existing raw text from database for ${companyName}`);

                    // Update the row with a success message (not the actual raw text)
                    processedData[index] = {
                        ...processedData[index],
                        annualReportTextStatus: 'Text extraction completed successfully',
                        annualReportTextSource: 'supabase'
                    };

                    supabaseHits++;
                } else {
                    // Need to extract the text from the PDF
                    logCallback(`Extracting text from annual report for ${companyName}: ${reportUrl}`);

                    // Extract text from the PDF using the appropriate method based on URL
                    const rawText = await extractTextFromPdf(reportUrl, maxRetries, retryDelay, logCallback);

                    if (!rawText || rawText.startsWith("Error")) {
                        logCallback(`Failed to extract text from ${reportUrl}: ${rawText || "Unknown error"}`);

                        // Update the row with the error message (not the actual error)
                        processedData[index] = {
                            ...processedData[index],
                            annualReportTextStatus: 'Failed to extract text from annual report',
                            annualReportTextSource: 'error',
                            annualReportTextError: rawText || "Failed to extract text"
                        };

                        extractionFailures++;
                    } else {
                        logCallback(`Successfully extracted ${rawText.length} characters from ${reportUrl}`);

                        // Update the row with a success message (not the actual raw text)
                        processedData[index] = {
                            ...processedData[index],
                            annualReportTextStatus: 'Text extraction completed successfully',
                            annualReportTextSource: 'extraction'
                        };

                        extractionSuccesses++;

                        // Save to Supabase - store the full raw text in the database only
                        if (supabaseAvailable) {
                            await updateSupabaseWithRawText(
                                orgId,
                                companyName,
                                rawText,
                                logCallback
                            );
                        }
                    }
                }

                // Update progress
                progressCallback((index + 1) / untaggedData.length * 100);
            } catch (error) {
                logCallback(`Error processing item ${index + 1}: ${error.message}`);
                errorCount++;

                // Update the row with the error message (not the actual error)
                processedData[index] = {
                    ...processedData[index],
                    annualReportTextStatus: 'Error processing annual report',
                    annualReportTextSource: 'error',
                    annualReportTextError: error.message
                };

                // Update progress even on error
                progressCallback((index + 1) / data.length * 100);
            }

            // Add a small delay between items to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Add a small delay between batches
        if (i + currentBatchSize < untaggedData.length) {
            logCallback("Pausing briefly before next batch...");
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    // Merge processed data back into original data array
    const finalData = data.map(originalRow => {
        const key = originalRow.linkedin_url || (originalRow.organization && originalRow.organization.id) || originalRow.id;
        if (key) {
            const processedRow = processedData.find(row =>
                (row.linkedin_url === key) ||
                (row.organization && row.organization.id === key) ||
                (row.id === key));
            if (processedRow) {
                return { ...originalRow, ...processedRow };
            }
        }
        return originalRow;
    });

    const endTimestamp = Date.now();
    const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

    // Log analysis summary
    logCallback(`Annual Report Text Extraction Complete:`);
    logCallback(`- Successful Extractions: ${extractionSuccesses}`);
    logCallback(`- Failed Extractions: ${extractionFailures}`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Skipped: ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);

    return {
        data: finalData,
        analytics: {
            extractionSuccesses,
            extractionFailures,
            supabaseHits,
            skippedCount,
            errorCount,
            totalProcessed: untaggedData.length - skippedCount,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

/**
 * Extract text from a PDF URL using the proxy server
 * @param {string} pdfUrl - URL of the PDF
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries in seconds
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPdf(pdfUrl, maxRetries, retryDelay, logCallback) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            logCallback(`Extracting text from PDF (attempt ${attempt + 1}): ${pdfUrl}`);

            // Add a random delay before the request
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            // Call the API endpoint that will extract text from the PDF
            const response = await apiClient.extractText.fromPdf({
                url: pdfUrl
            });

            if (!response || !response.text) {
                if (attempt < maxRetries - 1) {
                    logCallback(`No text returned, retrying in ${retryDelay} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
                    continue;
                }
                return "Error: No text could be extracted from the PDF";
            }

            // Clean up the text
            const text = response.text.trim();

            if (text.length === 0) {
                if (attempt < maxRetries - 1) {
                    logCallback(`Empty text returned, retrying in ${retryDelay} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
                    continue;
                }
                return "Error: Extracted text is empty";
            }

            return text;
        } catch (error) {
            if (attempt < maxRetries - 1) {
                logCallback(`Error extracting text, retrying in ${retryDelay} seconds: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay * 1000));
            } else {
                return `Error extracting text from PDF: ${error.message}`;
            }
        }
    }

    return "Error: Maximum retries exceeded for text extraction";
}

/**
 * Update Supabase record with raw annual report text
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} rawText - Raw text from the annual report
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function updateSupabaseWithRawText(orgId, companyName, rawText, logCallback) {
    try {
        logCallback(`Updating Supabase record for ${companyName} with raw annual report text`);

        // First check if the record exists
        const { data: existingRecord, error: checkError } = await supabase
            .from('orgs_db')
            .select('apollo_org_id')
            .eq('apollo_org_id', orgId)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
            logCallback(`Warning: Error checking record existence: ${checkError.message}`);
        }

        // Current date for updated_at
        const now = new Date().toISOString();

        if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
                .from('orgs_db')
                .update({
                    annual_report_raw: rawText,
                    updated_at: now
                })
                .eq('apollo_org_id', orgId);

            if (updateError) {
                logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
                return false;
            }

            logCallback(`Successfully updated annual report raw text for ${companyName}`);
        } else {
            // Insert new record
            const { error: insertError } = await supabase
                .from('orgs_db')
                .insert({
                    apollo_org_id: orgId,
                    company_name: companyName,
                    annual_report_raw: rawText,
                    created_at: now,
                    updated_at: now
                });

            if (insertError) {
                logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
                return false;
            }

            logCallback(`Successfully inserted new record with annual report raw text for ${companyName}`);
        }

        return true;
    } catch (error) {
        logCallback(`Error updating Supabase record: ${error.message}`);
        return false;
    }
}

export default {
    extractAnnualReportText
};