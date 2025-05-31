// services/enrichment-services/apolloEnrichmentService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';
import supabase from '../supabaseClient';
import linkedinExperienceAnalysisService from './linkedinExperienceAnalysisService';
import sitemapAnalysisService from './sitemapAnalysisService';
import websiteAnalysisService from './websiteAnalysisService';
import websiteScrapingService from './websiteScrapingService';

/**
 * Check if data is stale based on updated_at timestamp
 */
function isDataStale(updatedAt, createdAt) {
    if (updatedAt) {
        const lastUpdate = new Date(updatedAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
        staleDate.setDate(staleDate.getDate() - thresholdDays);
        return lastUpdate < staleDate;
    }

    if (createdAt) {
        const createDate = new Date(createdAt);
        const staleDate = new Date();
        const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
        staleDate.setDate(staleDate.getDate() - thresholdDays);
        return createDate < staleDate;
    }

    return true;
}

/**
 * Generalized Apollo Enrichment Service with DIRECT TRACKING
 */
const apolloEnrichmentService = {
    /**
     * Process data with Apollo enrichment
     */
    async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Apollo Lead Enrichment...");

        const startTimestamp = Date.now();

        // DIRECT TRACKING: Initialize metrics - FIXED SCOPE
        let totalTokensUsed = 0;
        let totalCreditsUsed = 0;
        let totalApiCalls = 0;
        let totalSupabaseHits = 0;

        // Apollo substep tracking
        let websiteTokens = 0;
        let websiteCredits = 0;
        let experienceTokens = 0;
        let sitemapTokens = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process in Apollo enrichment. Returning original data.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const apiKey = import.meta.env.VITE_REACT_APP_APOLLO_API_KEY;
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_APOLLO_BATCH_SIZE || "5");

        if (!apiKey) {
            logCallback("⚠️ Apollo API key is not set. Using fallback data only.");
            return {
                data: rows.map(row => ({
                    ...row,
                    apollo_error: !row.relevanceTag ? 'Apollo API key not configured' : undefined
                })),
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const hasLinkedInUrls = untaggedData.some(row => row.linkedin_url && row.linkedin_url.trim());
        if (!hasLinkedInUrls) {
            logCallback("⚠️ No LinkedIn URLs found in data. Apollo enrichment requires linkedin_url field.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, creditsUsed: 0, supabaseHits: 0, apiCalls: 0 }
            };
        }

        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for optimal performance');
        }

        const supabaseAvailable = await apolloEnrichmentService.checkSupabaseAvailability(logCallback);

        try {
            let results = [];
            let supabaseHits = 0;
            let apolloFetches = 0;
            let errorCount = 0;

            // Process data
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
                            totalSupabaseHits++;

                            metricsStorageService.addSupabaseHit('apolloEnrichment');
                        } else if (result.source === 'apollo') {
                            apolloFetches++;
                            totalApiCalls++;
                            // Track credits used for Apollo fetches
                            const creditsForThisFetch = result.creditsUsed || 1;
                            totalCreditsUsed += creditsForThisFetch;
                            logCallback(`Apollo credit consumed: ${creditsForThisFetch} credit used for API call`);

                            metricsStorageService.addCredits('apolloEnrichment', creditsForThisFetch);
                            metricsStorageService.addApiCall('apolloEnrichment');
                        }

                        results.push(result.data);

                    } catch (error) {
                        errorCount++;
                        metricsStorageService.addError('apolloEnrichment');
                        logCallback(`Error processing lead: ${error.message}`);
                        results.push({
                            ...row,
                            apolloLeadSource: 'error',
                            apollo_error: error.message
                        });
                    }
                }


                const progress = Math.floor(((i + batch.length) / untaggedData.length) * 50);
                progressCallback(progress);

                if (i + batch.length < untaggedData.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Merge results with original data
            let mergedResults = apolloEnrichmentService.mergeResults(rows, untaggedData, results);

            // Handle additional analyses if enabled - WITH DIRECT TRACKING
            if (config.options) {
                logCallback('Processing Apollo additional analyses...');

                const analysisResult = await apolloEnrichmentService.processApolloWithOptions(
                    mergedResults,
                    config,
                    logCallback,
                    progressCallback
                );

                mergedResults = analysisResult.data;

                // DIRECT TRACKING: Add analysis metrics
                totalTokensUsed += analysisResult.tokensUsed || 0;
                totalCreditsUsed += analysisResult.creditsUsed || 0;
                websiteTokens = analysisResult.websiteTokens || 0;
                websiteCredits = analysisResult.websiteCredits || 0;
                experienceTokens = analysisResult.experienceTokens || 0;
                sitemapTokens = analysisResult.sitemapTokens || 0;
            }

            // DIRECT TRACKING: Update main Apollo metrics
            metricsStorageService.updateStepCounts(
                'apolloEnrichment',
                untaggedData.length,
                results.length - errorCount,
                errorCount,
                Date.now() - startTimestamp
            );

            // DIRECT TRACKING: Create Apollo substeps with actual metrics
            if (config.options) {
                // Use ACTUAL metrics collected from independent processes
                metricsStorageService.createApolloSubsteps(config.options, 'apolloEnrichment', {
                    websiteTokens,      // ACTUAL tokens from website analysis
                    websiteCredits,     // ACTUAL credits from website scraping  
                    experienceTokens,   // ACTUAL tokens from experience analysis
                    sitemapTokens       // ACTUAL tokens from sitemap analysis
                });
            }

            logCallback(`Apollo Enrichment Complete:`);
            logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
            logCallback(`- Fetched from Apollo API: ${apolloFetches}`);
            logCallback(`- Apollo Credits Used: ${totalCreditsUsed}`); // New log for credits
            logCallback(`- Errors: ${errorCount}`);

            return {
                data: mergedResults,
                analytics: {
                    apolloFetches,
                    tokensUsed: totalTokensUsed,
                    creditsUsed: totalCreditsUsed,
                    supabaseHits: totalSupabaseHits, 
                    apiCalls: apolloFetches,
                    processedCount: results.length,
                    errorCount,
                    processingTime: Date.now() - startTimestamp
                }
            };

        } catch (error) {
            metricsStorageService.addError('apolloEnrichment');
            logCallback(`Error in Apollo enrichment: ${error.message}`);
            throw error;
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
                        creditsUsed: 0, // No credits used for cached data
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

            // Log credits used for this Apollo fetch
            const creditsUsed = apolloResult.creditsUsed || 1;
            logCallback(`Apollo API fetch completed - 1 credit used for ${linkedinUrl}`);

            // Step 3: Save to Supabase for future use
            if (supabaseAvailable && apolloResult.person?.id) {
                await apolloEnrichmentService.saveToSupabase(linkedinUrl, apolloResult, row);
            }

            return {
                source: 'apollo',
                creditsUsed: creditsUsed,
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
                creditsUsed: 0, // No credits used on error
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

            if (isDataStale(cachedRows.updated_at, cachedRows.created_at)) {
                logCallback(`Data in Supabase is stale for ${linkedinUrl}. Will fetch fresh data.`);
                return null;
            }

            logCallback(`Using fresh data from Supabase for ${linkedinUrl}`);

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
     */
    async fetchFromApollo(linkedinUrl, apiKey) {
        const maxRetries = 3;
        let retryCount = 0;
        let creditsUsed = 0; // Track credits used for this fetch

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

                // IMPORTANT: Apollo API typically charges 1 credit per successful person match
                creditsUsed = 1; // Standard credit cost for people match API

                if (!response || !response.person) {
                    throw new Error('No person data in Apollo response');
                }

                // Return the expected format with credits tracking
                return {
                    person: response.person,
                    organization: response.person.organization,
                    creditsUsed: creditsUsed // Include credits used in the response
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
            const connectedTo = originalRow.connected_to || 'Unknown Advisor'; // ✅ Add this line

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
                        connected_to: connectedTo, // ✅ Add this line
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
                        connected_to: connectedTo, // ✅ Add this line
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
        const processedMap = new Map();
        results.forEach((result, index) => {
            const originalRow = processedRows[index];
            const key = originalRow.linkedin_url || originalRow.id || index;
            processedMap.set(key, result);
        });

        return originalRows.map(originalRow => {
            if (originalRow.relevanceTag) {
                return originalRow;
            }

            const key = originalRow.linkedin_url || originalRow.id;
            if (key && processedMap.has(key)) {
                return processedMap.get(key);
            }

            return originalRow;
        });
    },

    /**
 * Process Apollo with additional options - WITH PROPER TRACKING
 */
    async processApolloWithOptions(rows, config, logCallback, progressCallback) {
        if (!config.options) {
            return {
                data: rows,
                tokensUsed: 0,
                creditsUsed: 0,
                websiteTokens: 0,
                websiteCredits: 0,
                experienceTokens: 0,
                sitemapTokens: 0
            };
        }

        const { analyzeWebsite, analyzeExperience, analyzeSitemap } = config.options;
        const prompts = config.prompts || {};
        let result = rows;

        // DIRECT TRACKING: Track actual usage from each independent process
        let totalTokensUsed = 0;
        let totalCreditsUsed = 0;
        let websiteTokens = 0;
        let websiteCredits = 0;
        let experienceTokens = 0;
        let sitemapTokens = 0;

        if (analyzeWebsite && prompts.websitePrompt) {
            logCallback('🌐 Starting Website Analysis substep...');

            // Step 1: Scrape websites first - INDEPENDENT PROCESS
            const scrapingResult = await websiteScrapingService.scrapeWebsites(
                result,
                (message) => {
                    logCallback(`🌐 Website Scraping: ${message}`);
                },
                (progress) => {
                    if (progressCallback) {
                        progressCallback(50 + (progress * 0.15));
                    }
                }
            );

            result = scrapingResult.data || result;

            // COLLECT ACTUAL METRICS from scraping
            const scrapingAnalytics = scrapingResult.analytics || {};
            websiteCredits += scrapingAnalytics.creditsUsed || 0;
            totalCreditsUsed += scrapingAnalytics.creditsUsed || 0;

            logCallback(`🌐 Website Scraping completed - ${scrapingAnalytics.creditsUsed || 0} credits used`);

            // Step 2: Analyze website content - INDEPENDENT PROCESS
            const analysisResult = await websiteAnalysisService.analyzeWebsites(
                result,
                prompts.websitePrompt,
                (message) => {
                    logCallback(`🌐 Website Analysis: ${message}`);
                },
                (progress) => {
                    if (progressCallback) {
                        progressCallback(65 + (progress * 0.15));
                    }
                }
            );

            result = analysisResult.data || result;

            // COLLECT ACTUAL METRICS from analysis
            const analysisAnalytics = analysisResult.analytics || {};
            websiteTokens += analysisAnalytics.tokensUsed || 0;
            totalTokensUsed += analysisAnalytics.tokensUsed || 0;

            logCallback(`🌐 Website Analysis completed - ${analysisAnalytics.tokensUsed || 0} tokens used`);
            logCallback('✅ Website Analysis substep completed');
        }

        if (analyzeExperience && prompts.experiencePrompt) {
            logCallback('👔 Starting Employee History Analysis substep...');

            // INDEPENDENT PROCESS - LinkedIn Experience Analysis
            const experienceResult = await linkedinExperienceAnalysisService.processData(
                result,
                prompts.experiencePrompt,
                (message) => {
                    logCallback(`👔 Employee History Analysis: ${message}`);
                }
            );

            result = experienceResult.data || result;

            // COLLECT ACTUAL METRICS from experience analysis
            const experienceAnalytics = experienceResult.analytics || {};
            experienceTokens += experienceAnalytics.tokensUsed || 0;
            totalTokensUsed += experienceAnalytics.tokensUsed || 0;

            logCallback(`👔 Employee History Analysis completed - ${experienceAnalytics.tokensUsed || 0} tokens used`);
            logCallback('✅ Employee History Analysis substep completed');
        }

        if (analyzeSitemap && prompts.sitemapPrompt) {
            logCallback('🗺️ Starting Sitemaps Scraping substep...');

            // INDEPENDENT PROCESS - Sitemap Analysis
            const sitemapResult = await sitemapAnalysisService.processData(
                result,
                prompts.sitemapPrompt,
                (message) => {
                    logCallback(`🗺️ Sitemaps Scraping: ${message}`);
                }
            );

            result = sitemapResult.data || result;

            // COLLECT ACTUAL METRICS from sitemap analysis
            const sitemapAnalytics = sitemapResult.analytics || {};
            sitemapTokens += sitemapAnalytics.tokensUsed || 0;
            totalTokensUsed += sitemapAnalytics.tokensUsed || 0;

            logCallback(`🗺️ Sitemaps Scraping completed - ${sitemapAnalytics.tokensUsed || 0} tokens used`);
            logCallback('✅ Sitemaps Scraping substep completed');
        }

        // Log final metrics collection
        logCallback(`📊 Apollo substeps completed - Total tokens: ${totalTokensUsed}, Total credits: ${totalCreditsUsed}`);
        logCallback(`📊 Breakdown - Website: ${websiteTokens}T/${websiteCredits}C, Experience: ${experienceTokens}T, Sitemap: ${sitemapTokens}T`);

        return {
            data: result,
            tokensUsed: totalTokensUsed,
            creditsUsed: totalCreditsUsed,
            websiteTokens,
            websiteCredits,
            experienceTokens,
            sitemapTokens
        };
    },

    /**
     * Process with configuration (for compatibility with existing engine builder)
     */
    async processWithConfig(rows, config) {
        return apolloEnrichmentService.processData(rows, config);
    }
};

export default apolloEnrichmentService;