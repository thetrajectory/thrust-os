// services/enrichment-services/insightAnalysisService.js
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
 * Default prompt template if user doesn't provide one
 * @param {string} companyName - Company name
 * @returns {string} - Formatted default prompt
 */
function getDefaultPrompt() {
    return `Analyze the annual report text and provide insights on:
1. Company's financial health and stability
2. Growth strategy and initiatives
3. Key risks and challenges
4. Main product/service offerings
5. Market position and competitive advantage

Provide a structured analysis with bullet points for each category.`;
}

/**
 * Process financial insights analysis
 * @param {Array} data - Array of lead data objects
 * @param {string} userPrompt - User-provided prompt for analysis
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processInsightsAnalysis(data, userPrompt, logCallback, progressCallback) {
    logCallback("Starting Financial Insight Analysis...");

    // Only process untagged rows that have annual report text
    const untaggedData = data.filter(row =>
        !row.relevanceTag &&
        row.isPublicCompany === true &&
        row.annualReportUrl &&
        row.annualReportUrl !== "NO_SUITABLE_REPORT_FOUND" &&
        row.annualReportTextStatus === 'Text extraction completed successfully'
    );

    logCallback(`Processing ${untaggedData.length} companies with annual report text out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment
    const openaiApiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
    const model = import.meta.env.VITE_REACT_APP_INSIGHT_EXTRACTION_MODEL || "gpt-4o-mini";
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_INSIGHTS_BATCH_SIZE || "5");

    if (!openaiApiKey) {
        throw new Error('OpenAI API key is not set. Please check your environment configuration.');
    }

    // Initialize result array with original data
    const processedData = [...data];

    // Prepare the final prompt - use user's prompt or default
    const finalPrompt = userPrompt || getDefaultPrompt();
    logCallback(`Using prompt: ${finalPrompt.substring(0, 100)}...`);

    // Track analytics
    let supabaseHits = 0;
    let insightsExtracted = 0;
    let insightsFailed = 0;
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

                if (!orgId || !companyName) {
                    logCallback(`Skipping row ${index + 1}: Missing required data`);
                    skippedCount++;
                    continue;
                }

                // Check if we already have insights in Supabase
                let companyData = null;
                let rawText = null;

                if (supabaseAvailable) {
                    const { data: dbData, error } = await supabase
                        .from('orgs_db')
                        .select('financial_insights, annual_report_raw, updated_at, created_at')
                        .eq('apollo_org_id', orgId)
                        .maybeSingle();

                    if (!error && dbData) {
                        companyData = dbData;
                        rawText = dbData.annual_report_raw;

                        // Check if we have insights with the same prompt
                        if (dbData.financial_insights && !isDataStale(dbData.updated_at, dbData.created_at)) {

                            logCallback(`Using existing insights from database for ${companyName}`);

                            // Find index in the original data array
                            const originalIndex = processedData.findIndex(originalRow => {
                                const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                                return rowOrgId === orgId;
                            });

                            if (originalIndex !== -1) {
                                processedData[originalIndex] = {
                                    ...processedData[originalIndex],
                                    financialInsights: dbData.financial_insights,
                                    financialInsightsSource: 'supabase'
                                };

                                supabaseHits++;
                                insightsExtracted++;

                                // Skip to next row
                                continue;
                            }
                        }
                    }
                }

                // If we don't have raw text from Supabase, check if it's in the row
                if (!rawText && row.annualReportRawText) {
                    rawText = row.annualReportRawText;
                }

                // If we still don't have raw text, skip this row
                if (!rawText || rawText.length < 100) {
                    logCallback(`Insufficient raw text for ${companyName}. Skipping.`);

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex] = {
                            ...processedData[originalIndex],
                            financialInsights: null,
                            financialInsightsSource: 'skipped_no_text',
                            financialInsightsError: 'Insufficient raw text'
                        };
                    }

                    insightsFailed++;
                    continue;
                }

                // Replace any placeholders in the prompt
                let processedPrompt = finalPrompt.replace('<extractedText>', rawText);

                // Add company name if not already in the prompt
                if (!processedPrompt.includes(companyName)) {
                    processedPrompt = `Analysis for ${companyName}:\n${processedPrompt}`;
                }

                // Call OpenAI to analyze the annual report
                logCallback(`Analyzing annual report for ${companyName} (${rawText.length} chars)`);

                const response = await apiClient.openai.chatCompletion({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: "You are a financial analyst specializing in extracting insights from annual reports. Provide clear, structured analysis."
                        },
                        {
                            role: "user",
                            content: processedPrompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 1000
                });

                // Process the response
                let insights = null;
                if (response && response.choices && response.choices.length > 0) {
                    insights = response.choices[0].message.content.trim();

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex] = {
                            ...processedData[originalIndex],
                            financialInsights: insights,
                            financialInsightsSource: 'openai'
                        };

                        insightsExtracted++;

                        // Track token usage
                        if (response.usage) {
                            tokensUsed += response.usage.total_tokens || 0;
                        }

                        // Save to Supabase if available
                        if (supabaseAvailable) {
                            try {
                                // First check if the record exists
                                const { data: existingRecord, error: checkError } = await supabase
                                    .from('orgs_db')
                                    .select('apollo_org_id')
                                    .eq('apollo_org_id', orgId)
                                    .maybeSingle();

                                const now = new Date().toISOString();

                                if (existingRecord) {
                                    // Update existing record
                                    const { error: updateError } = await supabase
                                        .from('orgs_db')
                                        .update({
                                            financial_insights: insights,
                                            updated_at: now
                                        })
                                        .eq('apollo_org_id', orgId);

                                    if (updateError) {
                                        logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
                                    }
                                } else if (rawText) {
                                    // Insert new record
                                    const { error: insertError } = await supabase
                                        .from('orgs_db')
                                        .insert({
                                            apollo_org_id: orgId,
                                            company_name: companyName,
                                            annual_report_raw: rawText,
                                            financial_insights: insights,
                                            created_at: now,
                                            updated_at: now
                                        });

                                    if (insertError) {
                                        logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
                                    }
                                }
                            } catch (dbError) {
                                logCallback(`Error updating Supabase: ${dbError.message}`);
                            }
                        }
                    }
                } else {
                    logCallback(`No valid response from OpenAI for ${companyName}`);

                    // Find index in the original data array
                    const originalIndex = processedData.findIndex(originalRow => {
                        const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                        return rowOrgId === orgId;
                    });

                    if (originalIndex !== -1) {
                        processedData[originalIndex] = {
                            ...processedData[originalIndex],
                            financialInsights: null,
                            financialInsightsSource: 'error',
                            financialInsightsError: 'No valid response from OpenAI'
                        };
                    }

                    insightsFailed++;
                }

                // Update progress
                progressCallback((index + 1) / untaggedData.length * 100);
            } catch (error) {
                logCallback(`Error processing item ${index + 1}: ${error.message}`);
                errorCount++;

                // Find the row in the original data array
                const orgId = row.organization?.id || row['organization.id'];
                const originalIndex = processedData.findIndex(originalRow => {
                    const rowOrgId = originalRow.organization?.id || originalRow['organization.id'];
                    return rowOrgId === orgId;
                });

                if (originalIndex !== -1) {
                    processedData[originalIndex] = {
                        ...processedData[originalIndex],
                        financialInsights: null,
                        financialInsightsSource: 'error',
                        financialInsightsError: error.message
                    };
                }

                insightsFailed++;

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
    logCallback(`Financial Insight Analysis Complete:`);
    logCallback(`- Insights Extracted: ${insightsExtracted}`);
    logCallback(`- Insights Failed: ${insightsFailed}`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Skipped: ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);
    logCallback(`- OpenAI Tokens Used: ${tokensUsed}`);
    logCallback(`- Processing Time: ${processingTimeSeconds.toFixed(2)} seconds`);

    return {
        data: processedData,
        analytics: {
            insightsExtracted,
            insightsFailed,
            supabaseHits,
            skippedCount,
            errorCount,
            tokensUsed,
            averageTokensPerRow: insightsExtracted > 0 ? tokensUsed / insightsExtracted : 0,
            averageTimePerRow: processingTimeSeconds / untaggedData.length,
            totalProcessed: untaggedData.length - skippedCount,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

export default {
    processInsightsAnalysis
};