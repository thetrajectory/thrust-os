// services/enrichment-services/publicCompanyService.js
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
 * Generate prompt for company type classification
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company website URL
 * @param {string} companyLinkedinUrl - Company LinkedIn URL
 * @returns {string} - Formatted prompt
 */
function getCompanyTypePrompt(companyName, companyUrl, companyLinkedinUrl) {
    return `You will receive the following information about a company:
- Company Name: ${companyName}
- Company Website URL: ${companyUrl}
- Company LinkedIn URL: ${companyLinkedinUrl}

Your task:
1. Determine if the company is **Public** (publicly traded) or **Private** (privately held).
2. To decide:
   - If the LinkedIn page indicates "Public Company" as the company type → classify as **Public**.
   - If the LinkedIn page indicates "Privately Held" → classify as **Private**.
   - If company website shows clear evidence of being publicly listed (e.g., Investor Relations, Stock Ticker, SEC filings) → classify as **Public**.
   - If company website shows no investor information, no stock ticker, or indicates venture capital/private ownership → classify as **Private**.
   - If LinkedIn and website are inconclusive, base the decision on the nature and size of the company name (well-known brands like Apple, Google are **Public**; unknown startups and agencies are **Private**).
3. Do not guess beyond these rules.

Final Output:
- Only return either **"Public"** or **"Private"**.
- Do not add any explanation, text, or comments.`;
}

/**
 * Process public company filter for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processPublicCompanyFilter(data, logCallback, progressCallback) {
    logCallback("Starting Public Company Detection...");

    // Filter data to only process untagged rows
    const untaggedData = data.filter(row => !row.relevanceTag);
    logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment
    const apiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
    const model = import.meta.env.VITE_REACT_APP_COMPANY_RELEVANCE_MODEL || "gpt-4o-mini";
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_PUBLIC_COMPANY_BATCH_SIZE || "10");

    if (!apiKey) {
        throw new Error('OpenAI API key is not set. Please check your environment configuration.');
    }

    // Initialize result array with original data
    const processedData = [...data];

    // Track analytics
    let supabaseHits = 0;
    let publicCount = 0;
    let privateCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
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
                const companyUrl = row.organization?.website_url || row['organization.website_url'] || row.website;
                const companyLinkedinUrl = row.organization?.linkedin_url || row['organization.linkedin_url'] || '';

                if (!orgId) {
                    logCallback(`Skipping row ${index + 1}: No organization ID`);
                    skippedCount++;

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex].relevanceTag = 'Missing Organization ID';
                    }
                    continue;
                }

                // First check if we have company type in Supabase
                let companyData = null;
                if (supabaseAvailable) {
                    const { data: dbData, error } = await supabase
                        .from('orgs_db')
                        .select('company_type, updated_at, created_at')
                        .eq('apollo_org_id', orgId)
                        .maybeSingle();

                    if (!error && dbData) {
                        companyData = dbData;
                    }
                }

                // Check if company data is fresh
                if (companyData &&
                    !isDataStale(companyData.updated_at, companyData.created_at) &&
                    companyData.company_type) {

                    logCallback(`Using existing company type from database for ${companyName}: ${companyData.company_type}`);

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        const isPublic = companyData.company_type === 'Public';
                        processedData[originalIndex].companyType = companyData.company_type;
                        processedData[originalIndex].isPublicCompany = isPublic;

                        if (!isPublic) {
                            processedData[originalIndex].relevanceTag = 'Private Company';
                        }

                        if (isPublic) {
                            publicCount++;
                        } else {
                            privateCount++;
                        }
                    }

                    supabaseHits++;
                } else {
                    // Need to determine company type using GPT
                    logCallback(`Determining company type for ${companyName} using GPT`);

                    // Generate prompt with company details
                    const prompt = getCompanyTypePrompt(companyName, companyUrl, companyLinkedinUrl);

                    // Call GPT to determine company type
                    const response = await apiClient.openai.chatCompletion({
                        model: model,
                        messages: [
                            { role: "system", content: "You are a financial analyst who specializes in determining if companies are publicly traded or privately held." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.2,
                        max_tokens: 10
                    });

                    // Process response
                    let companyType = "Unknown";
                    if (response && response.choices && response.choices.length > 0) {
                        const gptResponse = response.choices[0].message.content.trim();

                        // Ensure we get a clean "Public" or "Private" response
                        if (gptResponse.toLowerCase() === "public") {
                            companyType = "Public";
                        } else if (gptResponse.toLowerCase() === "private") {
                            companyType = "Private";
                        } else {
                            // If we got an unexpected response, try to extract "Public" or "Private"
                            if (gptResponse.toLowerCase().includes("public")) {
                                companyType = "Public";
                            } else if (gptResponse.toLowerCase().includes("private")) {
                                companyType = "Private";
                            }
                        }

                        // Log the received response and the interpreted type
                        logCallback(`GPT response for ${companyName}: "${gptResponse}" → Interpreted as: ${companyType}`);

                        // Track token usage
                        if (response.usage) {
                            tokensUsed += response.usage.total_tokens || 0;
                        }
                    } else {
                        logCallback(`No valid response from GPT for ${companyName}`);
                    }

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        const isPublic = companyType === "Public";
                        processedData[originalIndex].companyType = companyType;
                        processedData[originalIndex].isPublicCompany = isPublic;

                        if (!isPublic) {
                            processedData[originalIndex].relevanceTag = 'Private Company';
                        }

                        if (isPublic) {
                            publicCount++;
                        } else {
                            privateCount++;
                        }
                    }

                    // Update the database if available
                    if (supabaseAvailable) {
                        try {
                            if (companyData) {
                                // Update existing record
                                const { error } = await supabase
                                    .from('orgs_db')
                                    .update({
                                        company_type: companyType,
                                        updated_at: new Date().toISOString()
                                    })
                                    .eq('apollo_org_id', orgId);

                                if (error) {
                                    logCallback(`Error updating company type in database: ${error.message}`);
                                }
                            } else {
                                // Insert new record
                                const { error } = await supabase
                                    .from('orgs_db')
                                    .insert({
                                        apollo_org_id: orgId,
                                        company_name: companyName,
                                        company_url: companyUrl,
                                        company_type: companyType,
                                        created_at: new Date().toISOString(),
                                        updated_at: new Date().toISOString()
                                    });

                                if (error) {
                                    logCallback(`Error inserting company type in database: ${error.message}`);
                                }
                            }
                        } catch (dbError) {
                            logCallback(`Database error: ${dbError.message}`);
                        }
                    }
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
                    processedData[originalIndex].companyType = 'Error';
                    processedData[originalIndex].isPublicCompany = false;
                    processedData[originalIndex].companyTypeError = error.message;
                }

                // Update progress even on error
                progressCallback((index + 1) / untaggedData.length * 100);
            }

            // Add a small delay between items to avoid API rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Add a small delay between batches
        if (i + currentBatchSize < untaggedData.length) {
            logCallback("Pausing briefly before next batch...");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const endTimestamp = Date.now();
    const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

    // Log analysis summary
    logCallback(`Public Company Detection Complete:`);
    logCallback(`- Public Companies: ${publicCount}`);
    logCallback(`- Private Companies: ${privateCount}`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Skipped: ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);
    logCallback(`- Tokens Used: ${tokensUsed}`);

    return {
        data: processedData,
        analytics: {
            publicCount,
            privateCount,
            supabaseHits,
            skippedCount,
            errorCount,
            tokensUsed,
            averageTokensPerRow: (publicCount + privateCount) > 0 ?
                tokensUsed / (publicCount + privateCount) : 0,
            averageTimePerRow: (untaggedData.length > 0) ?
                processingTimeSeconds / untaggedData.length : 0,
            totalProcessed: untaggedData.length - skippedCount,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

export default {
    processPublicCompanyFilter
};