// services/enrichment-services/websiteScrapingService.js
import apiClient from '../../utils/apiClient';
import supabase from '../supabaseClient';
import metricsStorageService from '../analytics/MetricsStorageService';

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
 * Extract clean domain from URL
 */
function extractDomain(url) {
    if (!url) return "";

    url = url.trim();
    console.log(`Attempting to extract domain from: ${url}`);

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    try {
        const urlObj = new URL(url);
        const domain = `${urlObj.protocol}//${urlObj.hostname}`;
        console.log(`Successfully extracted domain: ${domain}`);
        return domain;
    } catch (e) {
        console.log(`URL parsing failed, trying regex approach. Error: ${e.message}`);
        const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)/i);
        if (domainMatch && domainMatch[0]) {
            const extractedDomain = domainMatch[0].startsWith('http') ? domainMatch[0] : 'https://' + domainMatch[0];
            console.log(`Extracted domain using regex: ${extractedDomain}`);
            return extractedDomain;
        }
        console.log(`Failed to extract domain from: ${url}`);
        return url;
    }
}

/**
 * Scrape website content for company analysis with DIRECT TRACKING
 */
const websiteScrapingService = {
    async scrapeWebsites(rows, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Website Scraping for Analysis...");

        // DIRECT TRACKING: Initialize counters
        let totalCreditsUsed = 0;
        let totalApiCalls = 0;
        let totalErrors = 0;
        let totalSupabaseHits = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process for website scraping.");
            return {
                data: rows,
                analytics: { creditsUsed: 0, apiCalls: 0, errors: 0, supabaseHits: 0 }
            };
        }

        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_SCRAPER_BATCH_SIZE || "5");
        const maxWebsiteLength = parseInt(import.meta.env.VITE_REACT_APP_MAX_WEBSITE_CONTENT_LENGTH || "10000");

        const processedRows = [];
        let supabaseHits = 0;
        let scrapeSuccesses = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // Process in batches
        for (let i = 0; i < untaggedData.length; i += batchSize) {
            const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
            logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

            const batchPromises = [];

            for (let j = 0; j < currentBatchSize; j++) {
                const index = i + j;
                const row = untaggedData[index];

                const processPromise = websiteScrapingService.scrapeSingleWebsite(row, maxWebsiteLength, logCallback)
                    .then(result => {
                        processedRows.push({
                            ...row,
                            ...result.data
                        });

                        if (result.source === 'supabase') {
                            supabaseHits++;
                            totalSupabaseHits++;
                        } else if (result.source === 'scraped') {
                            scrapeSuccesses++;
                            // DIRECT TRACKING: Count credit for scraping
                            totalCreditsUsed += 1;
                            totalApiCalls += 1;
                        }

                        logCallback(`Processed website for ${row['organization.name'] || row.company}: ${result.source}`);
                        progressCallback(((i + j + 1) / untaggedData.length) * 100);
                    })
                    .catch(error => {
                        logCallback(`Error scraping website for ${row['organization.name'] || row.company}: ${error.message}`);
                        errorCount++;
                        totalErrors++;

                        processedRows.push({
                            ...row,
                            website_scraping_source: 'error',
                            website_scraping_error: error.message,
                            raw_website_content: ''
                        });

                        progressCallback(((i + j + 1) / untaggedData.length) * 100);
                    });

                batchPromises.push(processPromise);
            }

            await Promise.all(batchPromises);

            if (i + currentBatchSize < untaggedData.length) {
                logCallback("Pausing briefly before next batch...");
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Merge with original data
        const finalData = websiteScrapingService.mergeResults(rows, untaggedData, processedRows);

        logCallback(`Website Scraping Complete:`);
        logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
        logCallback(`- Successfully scraped: ${scrapeSuccesses}`);
        logCallback(`- Total credits used: ${totalCreditsUsed}`);
        logCallback(`- Total API calls: ${totalApiCalls}`);
        logCallback(`- Errors: ${errorCount}`);

        return {
            data: finalData,
            analytics: {
                creditsUsed: totalCreditsUsed,
                apiCalls: totalApiCalls,
                errors: totalErrors,
                supabaseHits: totalSupabaseHits,
                processedCount: scrapeSuccesses
            }
        };
    },

    async scrapeSingleWebsite(row, maxWebsiteLength, logCallback) {
        try {
            // Get domain URL
            let domainUrl = null;
            if (row['organization.website_url']) {
                domainUrl = row['organization.website_url'];
            } else if (row['organization.primary_domain']) {
                domainUrl = row['organization.primary_domain'];
            } else if (row.website) {
                domainUrl = row.website;
            } else if (row.company || row['organization.name']) {
                const companyName = (row.company || row['organization.name']).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                if (companyName) {
                    domainUrl = `https://${companyName}.com`;
                }
            }

            if (!domainUrl) {
                throw new Error('No valid domain available');
            }

            const domain = extractDomain(domainUrl);
            const orgId = row['organization.id'];

            // Check Supabase cache first
            if (orgId) {
                logCallback(`Checking Supabase cache for org ID: ${orgId}`);
                const { data: cached, error } = await supabase
                    .from('orgs_db')
                    .select('raw_homepage, updated_at, created_at')
                    .eq('apollo_org_id', orgId)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    logCallback(`Supabase fetch warning: ${error.message}`);
                }

                if (cached && !isDataStale(cached.updated_at, cached.created_at) && cached.raw_homepage) {
                    logCallback(`Using cached content for ${domain}`);
                    // DIRECT TRACKING: Count Supabase hit for website
                    metricsStorageService.addSupabaseHit('apolloEnrichment_website');
                    
                    return {
                        source: 'supabase',
                        data: {
                            website_scraping_source: 'supabase',
                            raw_website_content: cached.raw_homepage.slice(0, maxWebsiteLength)
                        }
                    };
                }
            }

            // Scrape using Serper API
            logCallback(`Scraping ${domain} using Serper API...`);
            
            // DIRECT TRACKING: Count credit and API call for website scraping
            metricsStorageService.addCredits('apolloEnrichment_website', 1);
            metricsStorageService.addApiCall('apolloEnrichment_website');
            
            const response = await apiClient.serper.scrapeWebsite(domain);

            let scrapedText = '';
            if (typeof response === 'string') {
                scrapedText = response;
            } else if (response && response.text) {
                scrapedText = response.text;
            } else if (response && response.fallbackText) {
                scrapedText = response.fallbackText;
                logCallback(`Using fallback text for ${domain} due to scraping error`);
            } else if (response && typeof response === 'object') {
                scrapedText = JSON.stringify(response);
            }

            // Save to Supabase if we have orgId
            if (orgId && scrapedText) {
                const companyName = row['organization.name'] || row.company;

                try {
                    const { data: existingRecord } = await supabase
                        .from('orgs_db')
                        .select('apollo_org_id')
                        .eq('apollo_org_id', orgId)
                        .single();

                    if (existingRecord) {
                        await supabase
                            .from('orgs_db')
                            .update({
                                raw_homepage: scrapedText,
                                company_name: companyName,
                                company_url: domain,
                                updated_at: new Date().toISOString()
                            })
                            .eq('apollo_org_id', orgId);
                    } else {
                        await supabase
                            .from('orgs_db')
                            .insert({
                                apollo_org_id: orgId,
                                raw_homepage: scrapedText,
                                company_name: companyName,
                                company_url: domain,
                                updated_at: new Date().toISOString()
                            });
                    }
                } catch (saveError) {
                    logCallback(`Warning: Failed to save to Supabase: ${saveError.message}`);
                }
            }

            return {
                source: 'scraped',
                data: {
                    website_scraping_source: 'scraped',
                    raw_website_content: scrapedText.slice(0, maxWebsiteLength)
                }
            };

        } catch (error) {
            // DIRECT TRACKING: Count error
            metricsStorageService.addError('apolloEnrichment_website');
            throw new Error(`Failed to scrape website: ${error.message}`);
        }
    },

    mergeResults(originalRows, processedRows, results) {
        const processedMap = new Map();
        results.forEach((result, index) => {
            const originalRow = processedRows[index];
            const key = originalRow['organization.id'] || originalRow.linkedin_url || index;
            processedMap.set(key, result);
        });

        return originalRows.map(originalRow => {
            if (originalRow.relevanceTag) {
                return originalRow;
            }

            const key = originalRow['organization.id'] || originalRow.linkedin_url;
            if (key && processedMap.has(key)) {
                return processedMap.get(key);
            }

            return originalRow;
        });
    }
};

export default websiteScrapingService;