// services/enrichment-services/jobOpeningsService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';
import supabase from '../supabaseClient';

/**
 * Check if data is stale based on updated_at timestamp
 */
function isDataStale(updatedAt, createdAt) {
    if (updatedAt) {
        const lastUpdate = new Date(updatedAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "180");
        staleDate.setDate(staleDate.getDate() - thresholdDays);
        return lastUpdate < staleDate;
    }

    if (createdAt) {
        const createDate = new Date(createdAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "180");
        staleDate.setDate(staleDate.getDate() - thresholdDays);
        return createDate < staleDate;
    }

    return true;
}

/**
 * Check if Supabase is available
 */
async function checkSupabaseAvailability(logCallback) {
    try {
        const { error } = await supabase.from('orgs_db').select('count').limit(1);
        if (error) {
            logCallback(`⚠️ Supabase connection issue: ${error.message}`);
            return false;
        }
        return true;
    } catch (e) {
        logCallback(`⚠️ Supabase test query failed: ${e.message}`);
        return false;
    }
}

/**
 * Check if row has required fields
 */
function hasRequiredFields(row) {
    const linkedinUrl = row['organization.linkedin_url'] || row.organization?.linkedin_url;
    const orgId = row['organization.id'] || row.organization?.id;
    return linkedinUrl && orgId;
}

/**
 * Safely parse JSON with error handling
 */
function safeJsonParse(jsonString, fallback = {}) {
    if (!jsonString || typeof jsonString !== 'string') {
        console.warn('Invalid JSON string provided to safeJsonParse:', typeof jsonString);
        return fallback;
    }

    try {
        const parsed = JSON.parse(jsonString);
        return parsed || fallback;
    } catch (error) {
        console.warn('Failed to parse JSON:', error.message);
        console.warn('JSON string length:', jsonString.length);
        console.warn('JSON string preview:', jsonString.substring(0, 100));
        return fallback;
    }
}

/**
 * Check Supabase cache for existing data
 */
async function checkSupabaseCache(orgId, logCallback) {
    try {
        const { data: cachedRows, error: fetchError } = await supabase
            .from('orgs_db')
            .select('open_jobs, coresignal_json, updated_at, created_at')
            .eq('apollo_org_id', orgId)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            logCallback(`Supabase fetch warning: ${fetchError.message}`);
            return null;
        }

        if (!cachedRows) {
            return null;
        }

        if (isDataStale(cachedRows.updated_at, cachedRows.created_at)) {
            logCallback(`Data in Supabase is stale for org ${orgId}. Will fetch fresh data.`);
            return null;
        }

        if (cachedRows.coresignal_json) {
            const testParse = safeJsonParse(cachedRows.coresignal_json);
            if (!testParse || Object.keys(testParse).length === 0) {
                logCallback(`Cached JSON data for org ${orgId} is corrupted. Will fetch fresh data.`);
                return null;
            }
        }

        logCallback(`Using fresh data from Supabase for org ${orgId}`);
        return {
            open_jobs: cachedRows.open_jobs,
            coresignal_json: cachedRows.coresignal_json
        };

    } catch (error) {
        logCallback(`Supabase cache check error: ${error.message}`);
        return null;
    }
}

/**
 * Extract jobs count from Coresignal data
 */
function extractJobsCount(companyData) {
    if (!companyData || typeof companyData !== 'object') {
        return 0;
    }

    let openJobs = 0;

    if (companyData.active_job_postings_count !== undefined) {
        openJobs = Number(companyData.active_job_postings_count) || 0;
    }
    else if (companyData.active_job_postings_count_change?.current !== undefined) {
        openJobs = Number(companyData.active_job_postings_count_change.current) || 0;
    }
    else if (Array.isArray(companyData.active_job_postings_titles)) {
        openJobs = companyData.active_job_postings_titles.length;
    }
    else if (companyData.active_job_posting_count !== undefined) {
        openJobs = Number(companyData.active_job_posting_count) || 0;
    }
    else if (companyData.job_posting_count !== undefined) {
        openJobs = Number(companyData.job_posting_count) || 0;
    }
    else {
        for (const key in companyData) {
            if (key.toLowerCase().includes('job') && key.toLowerCase().includes('count')) {
                openJobs = Number(companyData[key]) || 0;
                break;
            }
        }
    }

    return openJobs;
}

/**
 * Fetch data from Coresignal API - WITH DIRECT TRACKING
 */
async function fetchFromCoresignal(linkedinUrl, apiKey) {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
        try {
            // DIRECT TRACKING: Count API calls
            metricsStorageService.addApiCall('jobOpenings');

            const searchQuery = {
                query: {
                    bool: {
                        must: [
                            {
                                query_string: {
                                    default_field: "linkedin_url",
                                    query: `"${linkedinUrl.trim()}"`
                                }
                            }
                        ]
                    }
                }
            };

            const searchRes = await apiClient.coresignal.searchCompany(searchQuery);

            if (!searchRes || searchRes.error || !Array.isArray(searchRes) || searchRes.length === 0) {
                throw new Error(searchRes?.error || 'No valid search results');
            }

            const responseCode = searchRes[0];

            // DIRECT TRACKING: Count second API call
            metricsStorageService.addApiCall('jobOpenings');

            const collectRes = await apiClient.coresignal.collectCompanyData(responseCode);

            if (!collectRes || collectRes.error) {
                throw new Error(collectRes?.error || 'No company data in collect response');
            }

            const openJobs = extractJobsCount(collectRes);

            const maxJsonLength = parseInt(import.meta.env.VITE_REACT_APP_MAX_JSON_LENGTH || "49999");
            let coresignalJson;

            try {
                const fullJsonString = JSON.stringify(collectRes);
                if (fullJsonString.length > maxJsonLength) {
                    const truncatedString = fullJsonString.substring(0, maxJsonLength - 1);
                    const lastCommaIndex = truncatedString.lastIndexOf(',');
                    const lastBraceIndex = truncatedString.lastIndexOf('}');

                    if (lastCommaIndex > lastBraceIndex) {
                        coresignalJson = truncatedString.substring(0, lastCommaIndex) + '}';
                    } else {
                        coresignalJson = truncatedString + '}';
                    }

                    const testParse = safeJsonParse(coresignalJson);
                    if (!testParse || Object.keys(testParse).length === 0) {
                        coresignalJson = JSON.stringify({
                            active_job_postings_count: openJobs,
                            data_truncated: true,
                            original_size: fullJsonString.length
                        });
                    }
                } else {
                    coresignalJson = fullJsonString;
                }
            } catch (stringifyError) {
                console.error('Error stringifying Coresignal data:', stringifyError);
                coresignalJson = JSON.stringify({
                    active_job_postings_count: openJobs,
                    error: 'Failed to serialize data',
                    timestamp: new Date().toISOString()
                });
            }

            return {
                open_jobs: openJobs,
                coresignal_json: coresignalJson
            };

        } catch (apiError) {
            retryCount++;
            console.error(`Coresignal API attempt ${retryCount} failed:`, apiError.message);

            if (retryCount <= maxRetries) {
                const delay = retryCount * 3000;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // DIRECT TRACKING: Count error
                metricsStorageService.addError('jobOpenings');
                throw apiError;
            }
        }
    }
}

/**
 * Analyze jobs data with AI - Enhanced with DIRECT TRACKING
 */
async function analyzeJobsData(coresignalJson, prompt, companyName) {
    try {
        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';

        let jobsData = {};
        let parseSuccess = false;

        if (coresignalJson) {
            jobsData = safeJsonParse(coresignalJson, {});
            parseSuccess = Object.keys(jobsData).length > 0;

            if (!parseSuccess) {
                console.warn(`Failed to parse Coresignal JSON for ${companyName}`);
                return {
                    job_insights: 'Unable to analyze jobs data due to corrupted JSON',
                    job_analysis_error: 'JSON parsing failed',
                    job_analysis_timestamp: new Date().toISOString(),
                    tokensUsed: 0
                };
            }
        } else {
            console.warn(`No Coresignal JSON data available for ${companyName}`);
            return {
                job_insights: 'No jobs data available for analysis',
                job_analysis_timestamp: new Date().toISOString(),
                tokensUsed: 0
            };
        }

        const jobCount = extractJobsCount(jobsData);

        let processedPrompt = prompt;
        const placeholders = {
            '<company>': companyName || 'Unknown Company',
            '<company_name>': companyName || 'Unknown Company',
            '<jobs_data>': JSON.stringify(jobsData, null, 2),
            '<open_jobs_count>': String(jobCount),
            '<active_job_postings_titles>': Array.isArray(jobsData.active_job_postings_titles)
                ? jobsData.active_job_postings_titles.join(', ')
                : 'No job titles available',
            '<hiring_trends>': jobsData.active_job_postings_count_change
                ? JSON.stringify(jobsData.active_job_postings_count_change)
                : 'No hiring trend data available'
        };

        Object.entries(placeholders).forEach(([placeholder, value]) => {
            processedPrompt = processedPrompt.replace(
                new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                String(value)
            );
        });

        // DIRECT TRACKING: Count API call and track tokens
        metricsStorageService.addApiCall('jobOpenings');

        const response = await apiClient.openai.chatCompletion({
            model: model,
            messages: [
                {
                    role: "system",
                    content: "You are a hiring and business analyst. Analyze job posting data to provide insights about company hiring patterns and growth."
                },
                {
                    role: "user",
                    content: processedPrompt
                }
            ],
            max_tokens: 300,
            temperature: 0.3
        });

        let analysis = '';
        let tokensUsed = 0;

        if (response?.choices?.[0]?.message?.content) {
            analysis = response.choices[0].message.content.trim();
        }

        if (response?.usage?.total_tokens) {
            tokensUsed = response.usage.total_tokens;
            // DIRECT TRACKING: Add tokens
            metricsStorageService.addTokens('jobOpenings', tokensUsed);
        }

        return {
            job_insights: analysis || 'No analysis available',
            job_analysis_timestamp: new Date().toISOString(),
            jobs_data_quality: parseSuccess ? 'good' : 'poor',
            tokensUsed: tokensUsed
        };

    } catch (error) {
        console.error('Error analyzing jobs data:', error);
        // DIRECT TRACKING: Count error
        metricsStorageService.addError('jobOpenings');
        return {
            job_insights: 'Analysis failed due to technical error',
            job_analysis_error: error.message,
            job_analysis_timestamp: new Date().toISOString(),
            tokensUsed: 0
        };
    }
}

/**
* Save data to Supabase with enhanced error handling
*/
async function saveToSupabase(orgId, companyName, coresignalResult, originalRow) {
    try {
        const now = new Date().toISOString();
        const companyUrl = originalRow['organization.website_url'] || originalRow.organization?.website_url || '';

        const testParse = safeJsonParse(coresignalResult.coresignal_json);
        if (!testParse || Object.keys(testParse).length === 0) {
            console.warn(`Attempting to save invalid JSON for org ${orgId}. Creating fallback data.`);
            coresignalResult.coresignal_json = JSON.stringify({
                open_jobs: coresignalResult.open_jobs || 0,
                error: 'Original data was invalid',
                timestamp: now
            });
        }

        const { data: existingRecord, error: fetchError } = await supabase
            .from('orgs_db')
            .select('apollo_org_id')
            .eq('apollo_org_id', orgId)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw new Error(`Supabase fetch error: ${fetchError.message}`);
        }

        if (existingRecord) {
            const { error: updateError } = await supabase
                .from('orgs_db')
                .update({
                    open_jobs: coresignalResult.open_jobs,
                    coresignal_json: coresignalResult.coresignal_json,
                    updated_at: now
                })
                .eq('apollo_org_id', orgId);

            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase
                .from('orgs_db')
                .insert({
                    apollo_org_id: orgId,
                    company_name: companyName,
                    company_url: companyUrl,
                    open_jobs: coresignalResult.open_jobs,
                    coresignal_json: coresignalResult.coresignal_json,
                    created_at: now,
                    updated_at: now
                });

            if (insertError) throw insertError;
        }

    } catch (error) {
        console.error(`Failed to save to Supabase: ${error.message}`);
    }
}

/**
* Process a single company - WITH DIRECT TRACKING
*/
async function processSingleCompany(row, apiKey, config, supabaseAvailable, logCallback) {
    const linkedinUrl = row['organization.linkedin_url'] || row.organization?.linkedin_url;
    const orgId = row['organization.id'] || row.organization?.id;
    const companyName = row['organization.name'] || row.organization?.name || row.company;

    try {
        // Step 1: Check Supabase cache if available
        if (supabaseAvailable) {
            const cachedResult = await checkSupabaseCache(orgId, logCallback);
            if (cachedResult) {
                // DIRECT TRACKING: Count Supabase hit
                metricsStorageService.addSupabaseHit('jobOpenings');

                let analysisResult = { tokensUsed: 0 };
                if (config.prompt && cachedResult.coresignal_json) {
                    analysisResult = await analyzeJobsData(cachedResult.coresignal_json, config.prompt, companyName);
                }

                return {
                    source: 'supabase',
                    data: {
                        ...row,
                        job_openings_source: 'supabase',
                        open_jobs_count: cachedResult.open_jobs || 0,
                        coresignal_json: cachedResult.coresignal_json,
                        ...analysisResult
                    }
                };
            }
        }

        // Step 2: Fetch from Coresignal API
        logCallback(`Fetching job openings from Coresignal API for ${companyName}`);
        const coresignalResult = await fetchFromCoresignal(linkedinUrl, apiKey);

        // Step 3: Save to Supabase for future use
        if (supabaseAvailable && orgId) {
            await saveToSupabase(orgId, companyName, coresignalResult, row);
        }

        // Step 4: Analyze data if prompt provided
        let analysisResult = { tokensUsed: 0 };
        if (config.prompt && coresignalResult.coresignal_json) {
            analysisResult = await analyzeJobsData(coresignalResult.coresignal_json, config.prompt, companyName);
        }

        return {
            source: 'coresignal',
            data: {
                ...row,
                job_openings_source: 'coresignal',
                open_jobs_count: coresignalResult.open_jobs || 0,
                coresignal_json: coresignalResult.coresignal_json,
                ...analysisResult
            }
        };

    } catch (error) {
        logCallback(`Error processing ${companyName}: ${error.message}`);
        // DIRECT TRACKING: Count error
        metricsStorageService.addError('jobOpenings');
        return {
            source: 'error',
            data: {
                ...row,
                job_openings_source: 'error',
                job_openings_error: error.message,
                open_jobs_count: 0
            }
        };
    }
}

/**
* Process chunk of data - WITH DIRECT TRACKING
*/
async function processChunk(chunk, apiKey, config, supabaseAvailable, logCallback) {
    const results = [];
    let supabaseHits = 0;
    let coresignalFetches = 0;
    let errorCount = 0;
    let totalTokensUsed = 0;

    for (const row of chunk) {
        try {
            if (row.relevanceTag || !hasRequiredFields(row)) {
                results.push({ ...row });
                continue;
            }

            const result = await processSingleCompany(
                row,
                apiKey,
                config,
                supabaseAvailable,
                logCallback
            );

            if (result.source === 'supabase') {
                supabaseHits++;
            } else if (result.source === 'coresignal') {
                coresignalFetches++;
            }

            // DIRECT TRACKING: Count tokens from analysis
            if (result.data.tokensUsed) {
                totalTokensUsed += result.data.tokensUsed;
            }

            results.push(result.data);

        } catch (error) {
            errorCount++;
            logCallback(`Error processing company: ${error.message}`);
            results.push({
                ...row,
                job_openings_source: 'error',
                job_openings_error: error.message
            });
        }
    }

    logCallback(`Chunk processed: ${supabaseHits} from cache, ${coresignalFetches} from API, ${errorCount} errors, ${totalTokensUsed} tokens used`);
    return {
        data: results,
        tokensUsed: totalTokensUsed
    };
}

/**
* Merge processed results with original data
*/
function mergeResults(originalRows, processedRows, results) {
    const processedMap = new Map();
    results.forEach((result, index) => {
        const originalRow = processedRows[index];
        const key = originalRow['organization.id'] || originalRow.organization?.id || originalRow.linkedin_url || index;
        processedMap.set(key, result);
    });

    return originalRows.map(originalRow => {
        if (originalRow.relevanceTag) {
            return originalRow;
        }

        const key = originalRow['organization.id'] || originalRow.organization?.id || originalRow.linkedin_url;
        if (key && processedMap.has(key)) {
            return processedMap.get(key);
        }

        return originalRow;
    });
}

/**
* Job Openings Service with DIRECT TRACKING
*/
const jobOpeningsService = {
    /**
     * Process data with job openings analysis
     */
    async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Job Openings Analysis...");

        const startTimestamp = Date.now();

        // DIRECT TRACKING: Initialize counters
        let totalTokensUsed = 0;
        let totalApiCalls = 0;
        let totalSupabaseHits = 0;
        let totalErrors = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process in job openings analysis. Returning original data.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const apiKey = import.meta.env.VITE_REACT_APP_CORESIGNAL_API_KEY;
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_OPEN_JOBS_BATCH_SIZE || "5");

        if (!apiKey) {
            logCallback("⚠️ Coresignal API key is not set. Using fallback data only.");
            return {
                data: rows.map(row => ({
                    ...row,
                    job_openings_error: !row.relevanceTag ? 'Coresignal API key not configured' : undefined
                })),
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const hasOrganizationData = untaggedData.some(row => hasRequiredFields(row));

        if (!hasOrganizationData) {
            logCallback("⚠️ No organization LinkedIn URLs found. Job openings analysis requires organization data from Apollo enrichment.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for optimal performance');
        }

        const supabaseAvailable = await checkSupabaseAvailability(logCallback);

        try {
            if (useFileStorage) {
                const processFunction = async (chunk) => {
                    const result = await processChunk(chunk, apiKey, config, supabaseAvailable, logCallback);

                    // DIRECT TRACKING: Accumulate tokens
                    totalTokensUsed += result.tokensUsed || 0;

                    return result.data;
                };

                const progressFunction = (percent, message) => {
                    progressCallback(percent);
                    logCallback(message);
                };

                const results = await customEngineFileStorageService.processLargeDataset(
                    untaggedData,
                    processFunction,
                    progressFunction
                );

                const mergedResults = mergeResults(rows, untaggedData, results);
                const endTimestamp = Date.now();
                const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

                logCallback(`Job Openings Analysis Complete:`);
                logCallback(`- Total processed: ${results.length}`);
                logCallback(`- Total tokens used: ${totalTokensUsed}`);
                logCallback(`- Processing time: ${processingTimeSeconds.toFixed(2)} seconds`);

                return {
                    data: mergedResults,
                    analytics: {
                        tokensUsed: totalTokensUsed,
                        creditsUsed: 0, // Coresignal doesn't use credits
                        supabaseHits: totalSupabaseHits,
                        apiCalls: totalApiCalls,
                        processedCount: results.length,
                        processingTime: endTimestamp - startTimestamp
                    }
                };
            } else {
                // Process standard datasets (< 1000 rows)
                const results = [];
                let supabaseHits = 0;
                let coresignalFetches = 0;
                let errorCount = 0;

                for (let i = 0; i < untaggedData.length; i += batchSize) {
                    const batch = untaggedData.slice(i, Math.min(i + batchSize, untaggedData.length));
                    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + batch.length}`);

                    for (const row of batch) {
                        try {
                            if (row.relevanceTag || !hasRequiredFields(row)) {
                                results.push({ ...row });
                                continue;
                            }

                            const result = await processSingleCompany(
                                row,
                                apiKey,
                                config,
                                supabaseAvailable,
                                logCallback
                            );

                            if (result.source === 'supabase') {
                                supabaseHits++;
                                totalSupabaseHits++;
                            } else if (result.source === 'coresignal') {
                                coresignalFetches++;
                            }

                            // DIRECT TRACKING: Count tokens from analysis
                            if (result.data.tokensUsed) {
                                totalTokensUsed += result.data.tokensUsed;
                            }

                            results.push(result.data);

                        } catch (error) {
                            errorCount++;
                            totalErrors++;
                            logCallback(`Error processing company: ${error.message}`);
                            results.push({
                                ...row,
                                job_openings_source: 'error',
                                job_openings_error: error.message
                            });
                        }
                    }

                    const progress = Math.floor(((i + batch.length) / untaggedData.length) * 100);
                    progressCallback(progress);

                    if (i + batch.length < untaggedData.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const mergedResults = mergeResults(rows, untaggedData, results);

                // DIRECT TRACKING: Update final metrics
                metricsStorageService.updateStepCounts(
                    'jobOpenings',
                    untaggedData.length,
                    results.length - errorCount,
                    errorCount,
                    Date.now() - startTimestamp
                );

                logCallback(`Job Openings Analysis Complete:`);
                logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
                logCallback(`- Fetched from Coresignal API: ${coresignalFetches}`);
                logCallback(`- Total tokens used: ${totalTokensUsed}`);
                logCallback(`- Errors: ${errorCount}`);

                return {
                    data: mergedResults,
                    analytics: {
                        tokensUsed: totalTokensUsed,
                        creditsUsed: 0,
                        supabaseHits: totalSupabaseHits,
                        apiCalls: totalApiCalls,
                        processedCount: results.length,
                        processingTime: Date.now() - startTimestamp
                    }
                };
            }
        } catch (error) {
            metricsStorageService.addError('jobOpenings');
            logCallback(`Error in job openings analysis: ${error.message}`);
            throw error;
        }
    },

    /**
     * Process with configuration (for compatibility with existing engine builder)
     */
    async processWithConfig(rows, config) {
        return this.processData(rows, config);
    }
};

export default jobOpeningsService;