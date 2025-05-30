// services/enrichment-services/apolloEnrichmentService.js
import apiClient from '../../utils/apiClient';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';
import supabase from '../supabaseClient';
import linkedinExperienceAnalysisService from './linkedinExperienceAnalysisService';
import sitemapAnalysisService from './sitemapAnalysisService';
import websiteAnalysisService from './websiteAnalysisService';
import websiteScrapingService from './websiteScrapingService';

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
 * Generalized Apollo Enrichment Service
 * Optimized for processing with Supabase caching and file storage
 */
const apolloEnrichmentService = {
    /**
     * Process data with Apollo enrichment
     * @param {Array} rows - Array of data rows to process
     * @param {Object} config - Configuration object
     * @param {Function} logCallback - Optional callback for logging
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<Array>} - Processed rows with enrichment data
     */
    async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Apollo Lead Enrichment...");

        const startTimestamp = Date.now();

        // Filter data to only process untagged rows from previous steps
        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        // Safety check - if no untagged rows, return original data
        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process in Apollo enrichment. Returning original data.");
            return rows;
        }

        // Get configuration from environment
        const apiKey = import.meta.env.VITE_REACT_APP_APOLLO_API_KEY;
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_APOLLO_BATCH_SIZE || "5");

        if (!apiKey) {
            logCallback("⚠️ Apollo API key is not set. Using fallback data only.");
            // Return original data with error markers
            return rows.map(row => ({
                ...row,
                apollo_error: !row.relevanceTag ? 'Apollo API key not configured' : undefined
            }));
        }

        // Check for linkedin_url field
        const hasLinkedInUrls = untaggedData.some(row => row.linkedin_url && row.linkedin_url.trim());
        if (!hasLinkedInUrls) {
            logCallback("⚠️ No LinkedIn URLs found in data. Apollo enrichment requires linkedin_url field.");
            return rows;
        }

        // Use file storage for large datasets
        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for optimal performance');
        }

        // Check Supabase availability
        const supabaseAvailable = await apolloEnrichmentService.checkSupabaseAvailability(logCallback);

        if (useFileStorage) {
            // Process using file storage service for large datasets
            const processFunction = async (chunk) => {
                return await apolloEnrichmentService.processChunk(
                    chunk,
                    apiKey,
                    config,
                    supabaseAvailable,
                    logCallback
                );
            };

            const progressFunction = (percent, message) => {
                progressCallback(percent);
                logCallback(message);
            };

            try {
                const results = await customEngineFileStorageService.processLargeDataset(
                    untaggedData,
                    processFunction,
                    progressFunction
                );

                // Merge results with original data
                const mergedResults = apolloEnrichmentService.mergeResults(rows, untaggedData, results);

                // Handle additional analyses if enabled
                let finalResults = mergedResults;
                if (config.options) {
                    finalResults = await apolloEnrichmentService.processApolloWithOptions(mergedResults, config, logCallback, progressCallback);
                }

                const endTimestamp = Date.now();
                const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

                logCallback(`Apollo Enrichment Complete:`);
                logCallback(`- Total processed: ${results.length}`);
                logCallback(`- Processing time: ${processingTimeSeconds.toFixed(2)} seconds`);

                return finalResults;

            } catch (error) {
                logCallback(`Error in large dataset processing: ${error.message}`);
                throw error;
            }
        } else {
            // Process smaller datasets normally
            const finalResults = await apolloEnrichmentService.processStandardDataset(
                rows,
                untaggedData,
                apiKey,
                config,
                supabaseAvailable,
                batchSize,
                logCallback,
                progressCallback
            );

            return finalResults;
        }
    },

    /**
     * Check if Supabase is available
     */
    async checkSupabaseAvailability(logCallback) {
        try {
            const { error } = await supabase.from('leads_db').select('count').limit(1);
            if (error) {
                logCallback(`⚠️ Supabase connection issue: ${error.message}`);
                return false;
            }
            return true;
        } catch (e) {
            logCallback(`⚠️ Supabase test query failed: ${e.message}`);
            return false;
        }
    },

    /**
     * Process chunk of data
     */
    async processChunk(chunk, apiKey, config, supabaseAvailable, logCallback) {
        const results = [];
        let supabaseHits = 0;
        let apolloFetches = 0;
        let errorCount = 0;

        for (const row of chunk) {
            try {
                // Skip if already processed or no LinkedIn URL
                if (row.relevanceTag || !row.linkedin_url || !row.linkedin_url.trim()) {
                    results.push({ ...row });
                    continue;
                }

                const result = await apolloEnrichmentService.processSingleLead(
                    row,
                    apiKey,
                    supabaseAvailable,
                    logCallback
                );

                // Track source
                if (result.source === 'supabase') {
                    supabaseHits++;
                } else if (result.source === 'apollo') {
                    apolloFetches++;
                }

                results.push(result.data);

            } catch (error) {
                errorCount++;
                logCallback(`Error processing lead: ${error.message}`);
                results.push({
                    ...row,
                    apolloLeadSource: 'error',
                    apollo_error: error.message
                });
            }
        }

        logCallback(`Chunk processed: ${supabaseHits} from cache, ${apolloFetches} from API, ${errorCount} errors`);
        return results;
    },

    /**
     * Process standard datasets (< 1000 rows)
     */
    async processStandardDataset(rows, untaggedData, apiKey, config, supabaseAvailable, batchSize, logCallback, progressCallback) {
        const results = [];
        let supabaseHits = 0;
        let apolloFetches = 0;
        let errorCount = 0;

        for (let i = 0; i < untaggedData.length; i += batchSize) {
            const batch = untaggedData.slice(i, Math.min(i + batchSize, untaggedData.length));
            logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + batch.length}`);

            for (const row of batch) {
                try {
                    if (row.relevanceTag || !row.linkedin_url || !row.linkedin_url.trim()) {
                        results.push({ ...row });
                        continue;
                    }

                    const result = await apolloEnrichmentService.processSingleLead(
                        row,
                        apiKey,
                        supabaseAvailable,
                        logCallback
                    );

                    if (result.source === 'supabase') {
                        supabaseHits++;
                    } else if (result.source === 'apollo') {
                        apolloFetches++;
                    }

                    results.push(result.data);

                } catch (error) {
                    errorCount++;
                    logCallback(`Error processing lead: ${error.message}`);
                    results.push({
                        ...row,
                        apolloLeadSource: 'error',
                        apollo_error: error.message
                    });
                }
            }

            // Update progress
            const progress = Math.floor(((i + batch.length) / untaggedData.length) * 50); // 50% for Apollo enrichment
            progressCallback(progress);

            // Add delay between batches to respect rate limits
            if (i + batch.length < untaggedData.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Merge results with original data
        let mergedResults = apolloEnrichmentService.mergeResults(rows, untaggedData, results);

        // Handle additional analyses if enabled
        if (config.options) {
            mergedResults = await apolloEnrichmentService.processApolloWithOptions(mergedResults, config, logCallback, progressCallback);
        }

        logCallback(`Apollo Enrichment Complete:`);
        logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
        logCallback(`- Fetched from Apollo API: ${apolloFetches}`);
        logCallback(`- Errors: ${errorCount}`);

        return mergedResults;
    },

    /**
     * Process a single lead
     */
    async processSingleLead(row, apiKey, supabaseAvailable, logCallback) {
        const linkedinUrl = row.linkedin_url.trim();

        try {
            // Step 1: Check Supabase cache if available
            if (supabaseAvailable) {
                const cachedResult = await apolloEnrichmentService.checkSupabaseCache(linkedinUrl, logCallback);
                if (cachedResult) {
                    return {
                        source: 'supabase',
                        data: {
                            ...row,
                            ...cachedResult
                        }
                    };
                }
            }

            // Step 2: Fetch from Apollo API
            logCallback(`Fetching from Apollo API for ${linkedinUrl}`);
            const apolloResult = await apolloEnrichmentService.fetchFromApollo(linkedinUrl, apiKey);

            // Step 3: Save to Supabase for future use
            if (supabaseAvailable && apolloResult.person?.id) {
                await apolloEnrichmentService.saveToSupabase(linkedinUrl, apolloResult, row);
            }

            return {
                source: 'apollo',
                data: {
                    ...row,
                    apolloLeadSource: 'apollo',
                    apollo_person_id: apolloResult.person?.id || '',
                    ...apolloEnrichmentService.extractApolloFields(apolloResult)
                }
            };

        } catch (error) {
            logCallback(`Error processing ${linkedinUrl}: ${error.message}`);
            return {
                source: 'error',
                data: {
                    ...row,
                    apolloLeadSource: 'error',
                    apollo_error: error.message
                }
            };
        }
    },

    /**
     * Check Supabase cache for existing data
     */
    async checkSupabaseCache(linkedinUrl, logCallback) {
        try {
            const { data: cachedRows, error: fetchError } = await supabase
                .from('leads_db')
                .select('*')
                .eq('linkedin_url', linkedinUrl)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                logCallback(`Supabase fetch warning: ${fetchError.message}`);
                return null;
            }

            if (!cachedRows) {
                return null;
            }

            // Check if data is stale
            if (isDataStale(cachedRows.updated_at, cachedRows.created_at)) {
                logCallback(`Data in Supabase is stale for ${linkedinUrl}. Will fetch fresh data.`);
                return null;
            }

            logCallback(`Using fresh data from Supabase for ${linkedinUrl}`);

            // Process apollo_json field
            let apolloData = {};
            if (typeof cachedRows.apollo_json === 'object' && cachedRows.apollo_json !== null) {
                apolloData = cachedRows.apollo_json;
            } else if (typeof cachedRows.apollo_json === 'string' && cachedRows.apollo_json) {
                try {
                    apolloData = JSON.parse(cachedRows.apollo_json);
                } catch (err) {
                    logCallback(`Warning: Could not parse Apollo JSON from Supabase: ${err.message}`);
                }
            }

            return {
                apolloLeadSource: 'supabase',
                apollo_person_id: cachedRows.apollo_person_id || '',
                ...apolloEnrichmentService.extractApolloFields(apolloData)
            };

        } catch (error) {
            logCallback(`Supabase cache check error: ${error.message}`);
            return null;
        }
    },

    /**
     * Fetch data from Apollo API with retry logic
     * FIXED: Using the correct apiClient.apollo.matchPerson method
     */
    async fetchFromApollo(linkedinUrl, apiKey) {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount <= maxRetries) {
            try {
                // Prepare the request data - this is the key fix!
                const requestData = {
                    api_key: apiKey,
                    linkedin_url: linkedinUrl,
                    reveal_personal_emails: false,
                    reveal_phone_number: false
                };

                console.log('Apollo API request data:', requestData);

                // Use the existing apiClient.apollo.matchPerson method
                const response = await apiClient.apollo.matchPerson(requestData);

                console.log('Apollo API response received:', response);

                if (!response || !response.person) {
                    throw new Error('No person data in Apollo response');
                }

                // Return the expected format
                return {
                    person: response.person,
                    organization: response.person.organization
                };

            } catch (apiError) {
                retryCount++;
                console.error(`Apollo API attempt ${retryCount} failed:`, apiError.message);

                if (retryCount <= maxRetries) {
                    const delay = retryCount * 3000; // 3s, 6s, 9s
                    console.log(`Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // Log the final error details
                    console.error('Final Apollo API error:', {
                        message: apiError.message,
                        linkedinUrl: linkedinUrl,
                        requestData: { linkedin_url: linkedinUrl, api_key: '***' }
                    });
                    throw apiError;
                }
            }
        }
    },

    /**
     * Save Apollo data to Supabase
     */
    async saveToSupabase(linkedinUrl, apolloData, originalRow) {
        try {
            const now = new Date().toISOString();
            const apolloJsonString = JSON.stringify(apolloData);
            const fullName = `${apolloData.person?.first_name || ''} ${apolloData.person?.last_name || ''}`.trim();
            const companyName = apolloData.organization?.name || originalRow.company || '';
            const position = apolloData.person?.title || originalRow.position || '';
            const connectedOn = originalRow.connected_on || now.split('T')[0];

            let isoConnectedOn = connectedOn;
            if (connectedOn && typeof connectedOn === 'string') {
                // Try to parse the date and convert to ISO format
                try {
                    // Handle format like "27-04-2025"
                    const match = connectedOn.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
                    if (match) {
                        const day = match[1].padStart(2, '0');
                        const month = match[2].padStart(2, '0');
                        const year = match[3];
                        isoConnectedOn = `${year}-${month}-${day}`;
                    } else if (!connectedOn.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // If not already in ISO format, use current date as fallback
                        isoConnectedOn = new Date().toISOString().split('T')[0];
                    }
                } catch (e) {
                    console.error(`Error parsing date: ${connectedOn}`, e);
                    isoConnectedOn = new Date().toISOString().split('T')[0];
                }
            }


            // Check if record exists
            const { data: existingRecord, error: fetchError } = await supabase
                .from('leads_db')
                .select('apollo_person_id')
                .eq('linkedin_url', linkedinUrl)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                throw new Error(`Supabase fetch error: ${fetchError.message}`);
            }

            if (existingRecord) {
                // Update existing record
                const { error: updateError } = await supabase
                    .from('leads_db')
                    .update({
                        apollo_person_id: apolloData.person?.id,
                        apollo_json: apolloJsonString,
                        connected_on: isoConnectedOn,
                        updated_at: now
                    })
                    .eq('apollo_person_id', existingRecord.id);

                if (updateError) throw new Error(`Supabase update error: ${updateError.message}`);
            } else {
                // Insert new record
                const { error: insertError } = await supabase
                    .from('leads_db')
                    .insert({
                        full_name: fullName,
                        linkedin_url: linkedinUrl,
                        company_name: companyName,
                        position: position,
                        apollo_person_id: apolloData.person?.id,
                        apollo_json: apolloJsonString,
                        connected_on: isoConnectedOn,
                        created_at: now
                    });

                if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);
            }

        } catch (error) {
            // Don't throw, just log the error
            console.error(`Failed to save to Supabase: ${error.message}`);
        }
    },

    /**
     * Extract relevant fields from Apollo data
     */
    extractApolloFields(apolloData) {
        try {
            const person = apolloData.person || {};
            const org = apolloData.organization || person.organization || {};
            const result = {};

            // Person fields
            if (person.id) result['person.id'] = person.id;
            if (person.first_name) result['person.first_name'] = person.first_name;
            if (person.last_name) result['person.last_name'] = person.last_name;
            if (person.name) result['person.name'] = person.name;
            if (person.linkedin_url) result['person.linkedin_url'] = person.linkedin_url;
            if (person.title) result['person.title'] = person.title;
            if (person.headline) result['person.headline'] = person.headline;
            if (person.email) result['person.email'] = person.email;
            if (person.email_status) result['person.email_status'] = person.email_status;
            if (person.photo_url) result['person.photo_url'] = person.photo_url;
            if (person.city) result['person.city'] = person.city;
            if (person.state) result['person.state'] = person.state;
            if (person.country) result['person.country'] = person.country;
            if (person.seniority) result['person.seniority'] = person.seniority;

            // Handle arrays
            if (person.departments) {
                result['person.departments'] = Array.isArray(person.departments)
                    ? person.departments.join(', ')
                    : String(person.departments);
            }
            if (person.functions) {
                result['person.functions'] = Array.isArray(person.functions)
                    ? person.functions.join(', ')
                    : String(person.functions);
            }

            // Organization fields
            if (org.id) result['organization.id'] = org.id;
            if (org.name) result['organization.name'] = org.name;
            if (org.website_url) result['organization.website_url'] = org.website_url;
            if (org.linkedin_url) result['organization.linkedin_url'] = org.linkedin_url;
            if (org.founded_year) result['organization.founded_year'] = org.founded_year;
            if (org.industry) result['organization.industry'] = org.industry;
            if (org.estimated_num_employees) result['organization.estimated_num_employees'] = org.estimated_num_employees;
            if (org.city) result['organization.city'] = org.city;
            if (org.state) result['organization.state'] = org.state;
            if (org.country) result['organization.country'] = org.country;
            if (org.short_description) result['organization.short_description'] = org.short_description;
            if (org.seo_description) result['organization.seo_description'] = org.seo_description;

            // Add convenience mappings
            if (org.estimated_num_employees) result['headcount'] = org.estimated_num_employees;
            if (org.industry) result['company_industry'] = org.industry;
            if (org.website_url) result['company_website'] = org.website_url;

            // Education and employment history
            if (person.education_history && Array.isArray(person.education_history)) {
                result['education'] = person.education_history.map(edu => {
                    let edStr = edu.school || '';
                    if (edu.degree) edStr += edStr ? `: ${edu.degree}` : edu.degree;
                    if (edu.field_of_study) edStr += edStr.includes(':') ? ` in ${edu.field_of_study}` : edu.field_of_study;
                    return edStr;
                }).filter(ed => ed.trim() !== "").join("; ");
            }

            if (person.employment_history && Array.isArray(person.employment_history)) {
                result['employment_history_summary'] = person.employment_history.map(e => {
                    const title = e.title || "";
                    const company = e.organization_name || "";
                    const start = e.start_date || "";
                    const end = e.end_date || "";
                    return `${title} @ ${company} (${start}–${end || "Present"})`;
                }).join(" | ");
            }

            // Store full JSON response
            result['entire_json_response'] = JSON.stringify(apolloData);

            return result;

        } catch (error) {
            console.error("Error extracting Apollo fields:", error);
            return { apollo_error: error.message };
        }
    },

    /**
     * Merge processed results with original data
     */
    mergeResults(originalRows, processedRows, results) {
        // Create a map of processed results
        const processedMap = new Map();
        results.forEach((result, index) => {
            const originalRow = processedRows[index];
            const key = originalRow.linkedin_url || originalRow.id || index;
            processedMap.set(key, result);
        });

        // Merge back into original data
        return originalRows.map(originalRow => {
            // If row was tagged, keep original
            if (originalRow.relevanceTag) {
                return originalRow;
            }

            // Find processed result
            const key = originalRow.linkedin_url || originalRow.id;
            if (key && processedMap.has(key)) {
                return processedMap.get(key);
            }

            return originalRow;
        });
    },

    /**
     * Process Apollo with additional options (website analysis, experience analysis, etc.)
     */
    async processApolloWithOptions(rows, config, logCallback, progressCallback) {
        if (!config.options) {
            return rows;
        }

        const { analyzeWebsite, analyzeExperience, analyzeSitemap } = config.options;
        const prompts = config.prompts || {};
        let result = rows;

        if (analyzeWebsite && prompts.websitePrompt) {
            logCallback('Starting website content analysis...');

            // Step 1: Scrape websites first
            result = await websiteScrapingService.scrapeWebsites(
                result,
                logCallback,
                (progress) => {
                    if (progressCallback) {
                        progressCallback(50 + (progress * 0.2)); // 20% for scraping (starting at 50%)
                    }
                }
            );

            // Step 2: Analyze website content
            result = await websiteAnalysisService.analyzeWebsites(
                result,
                prompts.websitePrompt,
                logCallback,
                (progress) => {
                    if (progressCallback) {
                        progressCallback(70 + (progress * 0.2)); // 20% for analysis (starting at 70%)
                    }
                }
            );
        }

        if (analyzeExperience && prompts.experiencePrompt) {
            result = await linkedinExperienceAnalysisService.processData(result, prompts.experiencePrompt, logCallback);

        }

        if (analyzeSitemap && prompts.sitemapPrompt) {
            result = await sitemapAnalysisService.processData(rows, prompts.sitemapPrompt, logCallback);
        }

        return result;
    },


    /**
     * Process with configuration (for compatibility with existing engine builder)
     */
    async processWithConfig(rows, config) {
        return apolloEnrichmentService.processData(rows, config);
    }
};

export default apolloEnrichmentService;