// services/videocx/insightsExtractionService.jsx
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
 * Prompt template for extracting insights from annual report raw text
 * @param {string} companyName - Company name
 * @param {string} annualReportRawText - Raw text extracted from annual report
 * @returns {string} - Formatted prompt
 */
const INSIGHTS_EXTRACTION_PROMPT = (annualReportRawText) => {
    return `
        # 10-K CX + Ops Signal Intelligence Prompt (4-Signal Deep Review)
Hi ChatGPT, your task is to **analyze the 10-K filing of a company** and extract insights for **4 specific customer-experience signals** using a **1–5 intensity ranking scale** per signal.
You must:
- **Read the full context block carefully**
- For **each of the 4 signals**, assign a score between **1 (none) and 5 (strong, clear signal)**
- Write a **3–6 line, highly information-dense rationale** per signal
- Cite the **section name in parentheses** where evidence was found (e.g. *“MD&A”*, *“Strategy”*)
- **Return only the final output** — no explanations, no summaries
---
## :white_check_mark: Signal 1: Digital Transformation / Capability Upgrade
**Goal**: Detect evidence of investment in digital modernization in customer-facing banking.
**Score Criteria:**
- **5**: Strong digital infra and CX tooling initiatives underway — cloud, AI, app revamp, embedded journeys
- **4**: Clear roadmap and partial initiatives around modernization
- **3**: Generic “digital-first” claims + limited action
- **2**: Aspirational only, vague or deferred
- **1**: No digital initiatives mentioned
**Search Sections**: MD&A, Strategy, Tech, CapEx, Risk Factors
**Key Phrases**:
“core banking upgrade”, “digital transformation”, “cloud migration”, “CX modernization”, “AI/automation in service”, “app revamp”, “embedded journeys”, “customer experience platform”
:x: Don’t count vague digital ambition without evidence
---
## :moneybag: Signal 2: Rising Retail Customer Acquisition / Ops Costs
**Goal**: Detect cost pressure in acquiring or servicing retail customers.
**Score Criteria:**
- **5**: Multiple clear mentions of CAC/op-ex/service delivery pressure in retail
- **4**: Retail segment shows operating cost or margin strain
- **3**: General OpEx increase, not retail-specific
- **2**: Implied pressure (e.g., inflation), no direct mention
- **1**: No cost pressure observed
**Search Sections**: MD&A, Segment Analysis (Retail), P&L commentary, Risk Factors
**Key Phrases**:
“rising OpEx”, “customer acquisition cost”, “cost-to-income ratio”, “margin compression”, “onboarding cost pressure”, “compliance burden”
:x: Don’t count wholesale or non-retail operations
---
## :department_store: Signal 3: Branch Closures / Consolidation / Phygital Strategy
**Goal**: Detect physical branch rationalization or shift to digital-hybrid models.
**Score Criteria:**
- **5**: Explicit closures + stated phygital strategy underway
- **4**: Branch optimization in progress; assisted-digital or hybrid models emerging
- **3**: Aspirational phygital vision without tactical actions
- **2**: Traditional branch focus; one-off closures
- **1**: No mention of branch strategy
**Search Sections**: MD&A, Strategy, Retail Ops, Distribution Strategy
**Key Phrases**:
“branch consolidation”, “branch rationalization”, “phygital strategy”, “self-service zones”, “network optimization”, “hub and spoke”, “assisted digital”, “physical footprint reduction”
:x: Don’t count ATM-only optimization or generic digital growth without branch impact
---
## :earth_africa: Signal 4: Tier 2/3 or Rural Market Expansion
**Goal**: Detect efforts to serve non-metro, rural, or underserved markets using digital means.
**Score Criteria:**
- **5**: Strong rural/Tier 2-3 push + digital or assisted model (e.g. video onboarding)
- **4**: Financial inclusion strategy tied to underserved segments via tech
- **3**: Mentions of semi-urban expansion, no delivery model
- **2**: Vague growth references with no geography
- **1**: No mention of non-metro or rural outreach
**Search Sections**: Strategy, Business Overview, Retail Expansion, ESG/Inclusion
**Key Phrases**:
“Tier 2/3 cities”, “semi-urban and rural expansion”, “Bharat”, “last-mile banking”, “financial inclusion”, “mobile-first onboarding”, “rural BC model”, “agent-led presence”
:x: Don’t count urban digital growth or commercial/rural lending without retail intent
---
## Step-by-Step
1. Read the full 10-K inside the context block
2. Search sections for signals using phrase and section guidance above
3. Assign a **score from 1–5** for each signal based on the criteria
4. Justify each score in **<6 lines**, using tight, non-generic, technically specific analysis
5. Cite section name(s) in parentheses in each rationale
6. Do **NOT** hallucinate or speculate — use only what’s directly stated
---
### '[10-K Filing]' starts ###
${annualReportRawText}
### '[10-K Filing]' ends ###
lua
Copy
Edit
## Ideal output format starts ##
### :bank: [Company Name]
**1. Digital Transformation / Capability Upgrade**
Score: [1–5]
Rationale: [Dense technical justification with citations, e.g., “Company has launched AI-led virtual RM and migrated 60% of core infra to AWS cloud (MD&A, Tech Strategy)”]
**2. Rising Retail Customer Acquisition / Ops Costs**
Score: [1–5]
Rationale: [E.g., “Retail banking OpEx increased 9% YoY due to KYC and compliance onboarding load (Retail Segment, P&L Commentary)”]
**3. Branch Closures / Consolidation / Phygital Strategy**
Score: [1–5]
Rationale: [E.g., “15% reduction in branches in FY24 and rollout of assisted digital kiosks in Tier 1 cities (MD&A, Distribution)”]
**4. Tier 2/3 or Rural Market Expansion**
Score: [1–5]
Rationale: [E.g., “Expanding into 500 rural districts using agent-led model and video onboarding via mobile app (Business Strategy, Inclusion Section)”]
## Ideal output format ends ##
**All rationales must be highly information-dense, technically specific, and cite direct sources (in parentheses). Hallucinations or vague summaries are not permitted.**
Return only the final output format, No introductions, no explanations—just the desired output
    `;
};

/**
 * Process insights extraction for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processInsightsExtraction(data, logCallback, progressCallback) {
    logCallback("Starting Insights Extraction...");

    // Only process untagged rows that have annual reports
    const untaggedData = data.filter(row =>
        !row.relevanceTag &&
        row.annualReportUrl &&
        row.annualReportUrl !== "NO_SUITABLE_REPORT_FOUND"
    );

    logCallback(`Processing ${untaggedData.length} companies with annual reports out of ${data.length} total rows.`);

    const startTimestamp = Date.now();

    // Get configuration from environment
    const openaiApiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
    const model = import.meta.env.VITE_REACT_APP_GPT4_MODEL || "gpt-4o";
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_INSIGHTS_BATCH_SIZE || "3");

    if (!openaiApiKey) {
        throw new Error('OpenAI API key is not set. Please check your environment configuration.');
    }

    // Initialize result array with original data
    const processedData = [...untaggedData];

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

                // First check if we have insights in Supabase
                let companyData = null;
                if (supabaseAvailable) {
                    const { data: dbData, error } = await supabase
                        .from('orgs_db')
                        .select('financial_insights, annual_report_raw, updated_at, created_at')
                        .eq('apollo_org_id', orgId)
                        .maybeSingle();

                    if (!error && dbData) {
                        companyData = dbData;
                    }
                }

                // Check if insights are fresh
                if (companyData &&
                    !isDataStale(companyData.updated_at, companyData.created_at) &&
                    companyData.financial_insights) {

                    logCallback(`Using existing insights from database for ${companyName}`);

                    try {
                        // Parse the insights JSON string to array
                        let insights;
                        if (typeof companyData.financial_insights === 'string') {
                            insights = JSON.parse(companyData.financial_insights);
                        } else {
                            insights = companyData.financial_insights;
                        }

                        // Update the row with the insights
                        processedData[index] = {
                            ...processedData[index],
                            insights: insights,
                            insightsSource: 'supabase'
                        };

                        supabaseHits++;
                        insightsExtracted++;
                    } catch (parseError) {
                        logCallback(`Error parsing insights JSON for ${companyName}: ${parseError.message}`);
                        // Fall through to extract insights again
                    }
                } else {
                    // Need to extract insights using the annual_report_raw from Supabase

                    // Check if we have the raw report text in Supabase
                    if (!companyData || !companyData.annual_report_raw) {
                        logCallback(`No annual report raw text found for ${companyName} in Supabase. Skipping.`);

                        // Update the row with error status
                        processedData[index] = {
                            ...processedData[index],
                            insights: [],
                            insightsSource: 'error',
                            insightsError: 'No annual report raw text available'
                        };

                        insightsFailed++;
                        continue;
                    }

                    logCallback(`Extracting insights from annual report for ${companyName} using raw text`);

                    // Generate prompt using the raw text from annual report
                    const annualReportRawText = companyData.annual_report_raw;
                    const prompt = INSIGHTS_EXTRACTION_PROMPT(annualReportRawText);

                    try {
                        // Call OpenAI to extract insights
                        const response = await apiClient.openai.chatCompletion({
                            model: model,
                            messages: [
                                { role: "system", content: "You are a financial analyst specializing in extracting key insights from annual reports." },
                                { role: "user", content: prompt }
                            ],
                            temperature: 0.2,
                            max_tokens: 800
                        });

                        // Process the response
                        let insights = [];
                        if (response && response.choices && response.choices.length > 0) {
                            const responseText = response.choices[0].message.content.trim();

                            if (responseText.startsWith("UNABLE_TO_EXTRACT_INSIGHTS")) {
                                logCallback(`Unable to extract insights from report for ${companyName}`);
                                insightsFailed++;
                            } else {
                                // Parse bullet points into array
                                insights = responseText
                                    .split('\n')
                                    .filter(line => line.trim().startsWith('•'))
                                    .map(line => line.trim().substring(1).trim());

                                logCallback(`Extracted ${insights.length} insights for ${companyName}`);

                                if (insights.length > 0) {
                                    insightsExtracted++;
                                } else {
                                    insightsFailed++;
                                }
                            }

                            // Track token usage
                            if (response.usage) {
                                tokensUsed += response.usage.total_tokens || 0;
                            }
                        } else {
                            logCallback(`Error extracting insights for ${companyName}`);
                            insightsFailed++;
                        }

                        // Update the row with the insights
                        processedData[index] = {
                            ...processedData[index],
                            insights: insights,
                            insightsSource: 'openai'
                        };

                        // Save to Supabase if insights were found
                        if (supabaseAvailable && insights.length > 0) {
                            await updateSupabaseInsights(
                                orgId,
                                companyName,
                                insights,
                                logCallback
                            );
                        }
                    } catch (openaiError) {
                        logCallback(`OpenAI API error for ${companyName}: ${openaiError.message}`);

                        // Update the row with the error
                        processedData[index] = {
                            ...processedData[index],
                            insights: [],
                            insightsSource: 'error',
                            insightsError: openaiError.message
                        };

                        errorCount++;
                        insightsFailed++;
                    }
                }

                // Update progress
                progressCallback((index + 1) / untaggedData.length * 100);
            } catch (error) {
                logCallback(`Error processing item ${index + 1}: ${error.message}`);
                errorCount++;

                // Update the row with the error
                processedData[index] = {
                    ...processedData[index],
                    insights: [],
                    insightsSource: 'error',
                    insightsError: error.message
                };

                insightsFailed++;

                // Update progress even on error
                progressCallback((index + 1) / data.length * 100);
            }

            // Add a small delay between items to avoid API rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
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
    logCallback(`Insights Extraction Complete:`);
    logCallback(`- Insights Extracted: ${insightsExtracted}`);
    logCallback(`- Insights Failed: ${insightsFailed}`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Skipped: ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);
    logCallback(`- OpenAI Tokens Used: ${tokensUsed}`);

    return {
        data: finalData,
        analytics: {
            insightsExtracted,
            insightsFailed,
            supabaseHits,
            skippedCount,
            errorCount,
            tokensUsed,
            totalProcessed: untaggedData.length - skippedCount,
            startTime: startTimestamp,
            endTime: endTimestamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

/**
 * Update Supabase record with financial insights
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {Array} insights - Array of financial insights
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function updateSupabaseInsights(orgId, companyName, insights, logCallback) {
    try {
        logCallback(`Updating Supabase record for ${companyName} with financial insights`);

        // First check if the record exists
        const { data: existingRecord, error: checkError } = await supabase
            .from('orgs_db')
            .select('apollo_org_id')
            .eq('apollo_org_id', orgId)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
            logCallback(`Warning: Error checking record existence: ${checkError.message}`);
        }

        // Convert insights array to JSON string if needed
        const insightsJSON = JSON.stringify(insights);

        // Current date for updated_at
        const now = new Date().toISOString();

        if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
                .from('orgs_db')
                .update({
                    financial_insights: insightsJSON,
                    updated_at: now
                })
                .eq('apollo_org_id', orgId);

            if (updateError) {
                logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
                return false;
            }

            logCallback(`Successfully updated financial insights for ${companyName}`);
        } else {
            // Insert new record
            const { error: insertError } = await supabase
                .from('orgs_db')
                .insert({
                    apollo_org_id: orgId,
                    company_name: companyName,
                    financial_insights: insightsJSON,
                    created_at: now,
                    updated_at: now
                });

            if (insertError) {
                logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
                return false;
            }

            logCallback(`Successfully inserted new record with financial insights for ${companyName}`);
        }

        return true;
    } catch (error) {
        logCallback(`Error updating Supabase record: ${error.message}`);
        return false;
    }
}

export default {
    processInsightsExtraction
};