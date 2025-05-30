// services/enrichment-services/annualReportFetchService.js
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
 * Prompt template for selecting the best annual report URL
 * @param {string} companyName - Company name
 * @param {Array} searchResults - Array of search results
 * @returns {string} - Formatted prompt
 */
const ANNUAL_REPORT_PROMPT = (companyName, searchResults) => {
    return `You will receive the top 10 Serper search results related to a company's annual report. Each result includes:
- A title (usually starting with "[PDF]")
- A second line which contains the URL of the PDF or source document.
- A third line usually having a brief description

Your task is to:
1. Go through **all 10 results carefully**.
2. From the titles, identify the **single most appropriate result** for the company's **2024 Annual Report** or **10-K filing**.
   - Prefer results that include:  
     • "[PDF] ${companyName} annual report 2024"  
     • "Form 10-K annual report 2024"  
     • "Annual report filed in 2024"  
     • "Annual form 10-k filed [date in 2024]"
   - Use soft matching if needed (e.g., lowercase or spacing variation), but the year **must be 2024**.
   - If multiple titles are relevant, **prefer the one with "10-K"** or **exact mention of 2024** and **exact mention of ${companyName}**
3. Once you identify the best match, **extract the URL from the second line of that result** (it will be a direct PDF or official source link).
4. Return only this **URL as the final answer**.
5. If no relevant result is found, return "NO_SUITABLE_REPORT_FOUND"

Input:
${searchResults}

Output:
Only return the PDF URL from the most relevant result. If nothing is relevant, return "NO_SUITABLE_REPORT_FOUND".`;
};

/**
 * Format search results for the prompt
 * @param {Object} searchResults - The raw search results from Serper
 * @returns {string} - Formatted list of search results
 */
function formatSearchResults(searchResults) {
    try {
        if (!searchResults || !searchResults.organic || !Array.isArray(searchResults.organic)) {
            return "No valid search results found";
        }

        // Format each result into a numbered list with title, link and snippet
        return searchResults.organic.map((result, index) => {
            return `${index + 1}. Title: ${result.title || 'No title'}\n   Link: ${result.link || 'No link'}\n   Snippet: ${result.snippet || 'No snippet'}\n   Date: ${result.date || 'No date'}\n`;
        }).join("\n");
    } catch (error) {
        console.error(`Error formatting search results: ${error.message}`);
        return `Error formatting results: ${error.message}`;
    }
}

/**
 * Process annual report fetching for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function fetchAnnualReports(data, logCallback, progressCallback) {
    logCallback("Starting Annual Report Fetching...");

    // Only process untagged rows and that are public companies
    const untaggedData = data.filter(row => !row.relevanceTag && row.isPublicCompany === true);
    logCallback(`Processing ${untaggedData.length} untagged public companies out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment
    const serperApiKey = import.meta.env.VITE_REACT_APP_SERPER_API_KEY;
    const openaiApiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
    const model = import.meta.env.VITE_REACT_APP_COMPANY_RELEVANCE_MODEL || "gpt-4o-mini";
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_ANNUAL_REPORT_BATCH_SIZE || "5");

    if (!serperApiKey) {
        throw new Error('Serper API key is not set. Please check your environment configuration.');
    }

    if (!openaiApiKey) {
        throw new Error('OpenAI API key is not set. Please check your environment configuration.');
    }

    // Initialize result array with original data
    const processedData = [...data];

    // Track analytics
    let supabaseHits = 0;
    let reportsFetched = 0;
    let reportsNotFound = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let creditsUsed = 0;
    let tokensUsed = 0;

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

                if (!orgId || !companyName) {
                    logCallback(`Skipping row ${index + 1}: Missing organization ID or company name`);
                    skippedCount++;
                    continue;
                }

                // First check if we have annual report URL in Supabase
                let companyData = null;
                if (supabaseAvailable) {
                    const { data: dbData, error } = await supabase
                        .from('orgs_db')
                        .select('annual_report_pdf, updated_at, created_at')
                        .eq('apollo_org_id', orgId)
                        .maybeSingle();

                    if (!error && dbData) {
                        companyData = dbData;
                    }
                }

                // Check if annual report URL is fresh
                if (companyData &&
                    !isDataStale(companyData.updated_at, companyData.created_at) &&
                    companyData.annual_report_pdf) {

                    logCallback(`Using existing annual report URL from database for ${companyName}: ${companyData.annual_report_pdf}`);

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex] = {
                            ...processedData[originalIndex],
                            annualReportUrl: companyData.annual_report_pdf,
                            annualReportSource: 'supabase',
                            annualReportStatus: companyData.annual_report_pdf === "NO_SUITABLE_REPORT_FOUND" ? 'not_found' : 'found'
                        };
                    }

                    supabaseHits++;

                    if (companyData.annual_report_pdf === "NO_SUITABLE_REPORT_FOUND") {
                        reportsNotFound++;
                    } else {
                        reportsFetched++;
                    }

                    continue; // Skip to the next row
                }

                // Need to fetch and process annual report
                logCallback(`Searching for annual report for ${companyName}`);

                // Step 1: Search using Serper
                const searchQuery = `${companyName} Annual Financial Reports 2024 filetype:pdf`;
                logCallback(`Executing Serper search: ${searchQuery}`);

                // Make the Serper API call
                const searchResponse = await apiClient.serper.searchGoogle(searchQuery, {
                    gl: "us",   // Geography - United States
                    hl: "en",   // Language - English
                    num: 10     // Number of results
                });

                creditsUsed++;

                if (!searchResponse || !searchResponse.organic || searchResponse.organic.length === 0) {
                    logCallback(`No search results found for ${companyName}`);

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex] = {
                            ...processedData[originalIndex],
                            annualReportUrl: "NO_SUITABLE_REPORT_FOUND",
                            annualReportSource: 'serper',
                            annualReportStatus: 'no_results'
                        };
                    }

                    // Save to Supabase
                    if (supabaseAvailable) {
                        await updateSupabaseRecord(
                            orgId,
                            companyName,
                            "NO_SUITABLE_REPORT_FOUND",
                            logCallback
                        );
                    }

                    reportsNotFound++;
                    continue; // Skip to the next row
                }

                // Format the search results for the prompt
                const formattedResults = formatSearchResults(searchResponse);

                // Step 2: Use LLM to analyze results and find best URL
                const prompt = ANNUAL_REPORT_PROMPT(companyName, formattedResults);
                logCallback(`Analyzing ${searchResponse.organic.length} search results using LLM`);

                // Call OpenAI to analyze search results
                const llmResponse = await apiClient.openai.chatCompletion({
                    model: model,
                    messages: [
                        { role: "system", content: "You are a financial research assistant specialized in finding annual reports." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 100
                });

                // Track token usage
                if (llmResponse.usage) {
                    tokensUsed += llmResponse.usage.total_tokens || 0;
                }

                // Process the response
                let reportUrl = "NO_SUITABLE_REPORT_FOUND";
                let reportStatus = 'not_found';

                if (llmResponse && llmResponse.choices && llmResponse.choices.length > 0) {
                    const responseText = llmResponse.choices[0].message.content.trim();

                    if (responseText !== "NO_SUITABLE_REPORT_FOUND" && responseText.startsWith("http")) {
                        reportUrl = responseText;
                        reportStatus = 'found';
                        logCallback(`Found annual report URL for ${companyName}: ${reportUrl}`);
                        reportsFetched++;
                    } else {
                        logCallback(`No suitable annual report found for ${companyName}`);
                        reportsNotFound++;
                    }
                } else {
                    logCallback(`Error analyzing search results for ${companyName}`);
                    reportsNotFound++;
                }

                // Find index in the original data array
                const originalIndex = processedData.findIndex(originalRow => {
                    const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                    return rowOrgId === orgId;
                });

                if (originalIndex !== -1) {
                    processedData[originalIndex] = {
                        ...processedData[originalIndex],
                        annualReportUrl: reportUrl,
                        annualReportSource: 'serper+llm',
                        annualReportStatus: reportStatus
                    };
                }

                // Save to Supabase
                if (supabaseAvailable) {
                    await updateSupabaseRecord(
                        orgId,
                        companyName,
                        reportUrl,
                        logCallback
                    );
                }

                // Update progress
                progressCallback((index + 1) / untaggedData.length * 100);
            } catch (error) {
                logCallback(`Error processing item ${index + 1}: ${error.message}`);
                errorCount++;

                // Find the row in the original data
                const orgId = row.organization?.id || row['organization.id'];
                const originalIndex = processedData.findIndex(originalRow => {
                    const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                    return rowOrgId === orgId;
                });

                if (originalIndex !== -1) {
                    processedData[originalIndex] = {
                        ...processedData[originalIndex],
                        annualReportUrl: "NO_SUITABLE_REPORT_FOUND",
                        annualReportSource: 'error',
                        annualReportStatus: 'error',
                        annualReportError: error.message
                    };
                }

                // Update progress even on error
                progressCallback((index + 1) / untaggedData.length * 100);
            }

            // Add a small delay between items to avoid API rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Add a small delay between batches
        if (i + currentBatchSize < untaggedData.length) {
            logCallback("Pausing briefly before next batch...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    const endTimestamp = Date.now();
    const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

    // Log analysis summary
    logCallback(`Annual Report Fetching Complete:`);
    logCallback(`- Reports Found: ${reportsFetched}`);
    logCallback(`- Reports Not Found: ${reportsNotFound}`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Skipped: ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);
    logCallback(`- Serper Credits Used: ${creditsUsed}`);
    logCallback(`- OpenAI Tokens Used: ${tokensUsed}`);

    return {
        data: processedData,
        analytics: {
            reportsFetched,
            reportsNotFound,
            supabaseHits,
            skippedCount,
            errorCount,
            creditsUsed,
            tokensUsed,
            totalProcessed: untaggedData.length - skippedCount,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

/**
 * Update Supabase record with annual report URL
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} reportUrl - Annual report URL or "NO_SUITABLE_REPORT_FOUND"
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function updateSupabaseRecord(orgId, companyName, reportUrl, logCallback) {
    try {
        logCallback(`Updating Supabase record for ${companyName} with annual report URL`);

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
                    annual_report_pdf: reportUrl,
                    updated_at: now
                })
                .eq('apollo_org_id', orgId);

            if (updateError) {
                logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
                return false;
            }

            logCallback(`Successfully updated annual report URL for ${companyName}`);
        } else {
            // Insert new record
            const { error: insertError } = await supabase
                .from('orgs_db')
                .insert({
                    apollo_org_id: orgId,
                    company_name: companyName,
                    annual_report_pdf: reportUrl,
                    created_at: now,
                    updated_at: now
                });

            if (insertError) {
                logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
                return false;
            }

            logCallback(`Successfully inserted new record with annual report URL for ${companyName}`);
        }

        return true;
    } catch (error) {
        logCallback(`Error updating Supabase record: ${error.message}`);
        return false;
    }
}

export default {
    fetchAnnualReports
};