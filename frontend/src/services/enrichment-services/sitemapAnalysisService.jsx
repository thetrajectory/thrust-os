// services/enrichment-services/sitemapAnalysisService.jsx
import apiClient from '../../utils/apiClient';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';
import metricsStorageService from '../analytics/MetricsStorageService';

/**
 * Sitemap Analysis Service
 * Scrapes and analyzes sitemap data for company websites
 */
const sitemapAnalysisService = {
    /**
     * Process data with sitemap analysis
     * @param {Array} rows - Array of data rows to process
     * @param {string} prompt - Custom prompt with <website_sitemaps> placeholder
     * @param {Function} logCallback - Optional callback for logging
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<Array>} - Processed rows with sitemap analysis
     */
    async processData(rows, prompt, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Sitemap Analysis...");

        // DIRECT TRACKING: Initialize counters
        let totalTokensUsed = 0;
        let totalApiCalls = 0;
        let totalErrors = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process for sitemap analysis.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, apiCalls: 0, errors: 0 }
            };
        }

        if (!prompt || !prompt.trim()) {
            logCallback("No custom prompt provided for sitemap analysis.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, apiCalls: 0, errors: 0 }
            };
        }

        if (!prompt.includes('<website_sitemaps>')) {
            logCallback("Warning: Prompt should contain <website_sitemaps> placeholder");
        }

        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_SITEMAP_ANALYSIS_BATCH_SIZE || "5");
        const maxExecutionTime = 60;
        const maxSitemapUrls = 100;
        const fetchTimeout = 5000;
        const maxCellChars = 49999;

        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for sitemap analysis');

            const processFunction = async (chunk) => {
                const result = await this.processChunk(
                    chunk,
                    prompt,
                    model,
                    logCallback,
                    maxExecutionTime,
                    maxSitemapUrls,
                    fetchTimeout,
                    maxCellChars
                );
                
                // DIRECT TRACKING: Accumulate usage
                totalTokensUsed += result.tokensUsed || 0;
                totalApiCalls += result.apiCalls || 0;
                totalErrors += result.errors || 0;
                
                return result.data;
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

                const finalData = this.mergeResults(rows, untaggedData, results);

                logCallback(`Sitemap Analysis Complete (Large Dataset):`);
                logCallback(`- Total processed: ${results.length}`);
                logCallback(`- Total tokens used: ${totalTokensUsed}`);
                logCallback(`- Total API calls: ${totalApiCalls}`);

                return {
                    data: finalData,
                    analytics: {
                        tokensUsed: totalTokensUsed,
                        apiCalls: totalApiCalls,
                        errors: totalErrors,
                        processedCount: results.length
                    }
                };
            } catch (error) {
                logCallback(`Error in large dataset processing: ${error.message}`);
                throw error;
            }
        } else {
            return await this.processBatches(
                rows,
                untaggedData,
                prompt,
                model,
                batchSize,
                logCallback,
                progressCallback,
                maxExecutionTime,
                maxSitemapUrls,
                fetchTimeout,
                maxCellChars
            );
        }
    },

    /**
     * Process data in batches
     */
    async processBatches(rows, untaggedData, prompt, model, batchSize, logCallback, progressCallback,
        maxExecutionTime, maxSitemapUrls, fetchTimeout, maxCellChars) {
        const processedRows = [];
        let successCount = 0;
        let errorCount = 0;
        let totalTokensUsed = 0;
        let totalApiCalls = 0;

        for (let i = 0; i < untaggedData.length; i += batchSize) {
            const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
            logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

            const batchPromises = [];

            for (let j = 0; j < currentBatchSize; j++) {
                const index = i + j;
                const row = untaggedData[index];

                const processPromise = this.processSingleCompany(
                    row,
                    prompt,
                    model,
                    logCallback,
                    maxExecutionTime,
                    maxSitemapUrls,
                    fetchTimeout,
                    maxCellChars
                )
                    .then(result => {
                        processedRows.push({
                            ...row,
                            ...result.data
                        });

                        // DIRECT TRACKING: Count usage
                        totalTokensUsed += result.tokensUsed || 0;
                        totalApiCalls += result.apiCalls || 0;

                        successCount++;
                        const companyName = row['organization.name'] || row.company || 'unnamed company';
                        logCallback(`Analyzed sitemap for ${companyName}`);
                        progressCallback(((i + j + 1) / untaggedData.length) * 100);
                    })
                    .catch(error => {
                        const companyName = row['organization.name'] || row.company || 'unnamed company';
                        logCallback(`Error analyzing sitemap for ${companyName}: ${error.message}`);
                        errorCount++;

                       processedRows.push({
                           ...row,
                           sitemap_analysis: 'Analysis failed',
                           sitemap_analysis_error: error.message,
                           sitemap_analysis_timestamp: new Date().toISOString()
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

       const finalData = this.mergeResults(rows, untaggedData, processedRows);

       logCallback(`Sitemap Analysis Complete:`);
       logCallback(`- Successfully analyzed: ${successCount}`);
       logCallback(`- Total tokens used: ${totalTokensUsed}`);
       logCallback(`- Total API calls: ${totalApiCalls}`);
       logCallback(`- Errors: ${errorCount}`);

       return {
           data: finalData,
           analytics: {
               tokensUsed: totalTokensUsed,
               apiCalls: totalApiCalls,
               errors: errorCount,
               processedCount: successCount
           }
       };
   },

    /**
     * Process a chunk of data for file storage mechanism
     */
    async processChunk(chunk, prompt, model, logCallback, maxExecutionTime, maxSitemapUrls, fetchTimeout, maxCellChars) {
        const results = [];
        let successCount = 0;
        let errorCount = 0;
        let chunkTokensUsed = 0;
        let chunkApiCalls = 0;
 
        for (const row of chunk) {
            try {
                if (row.relevanceTag) {
                    results.push({ ...row });
                    continue;
                }
 
                const result = await this.processSingleCompany(
                    row,
                    prompt,
                    model,
                    logCallback,
                    maxExecutionTime,
                    maxSitemapUrls,
                    fetchTimeout,
                    maxCellChars
                );
 
                results.push({
                    ...row,
                    ...result.data
                });
 
                // DIRECT TRACKING: Count usage
                chunkTokensUsed += result.tokensUsed || 0;
                chunkApiCalls += result.apiCalls || 0;
 
                successCount++;
            } catch (error) {
                errorCount++;
                logCallback(`Error processing sitemap analysis: ${error.message}`);
                results.push({
                    ...row,
                    sitemap_analysis: 'Analysis failed',
                    sitemap_analysis_error: error.message,
                    sitemap_analysis_timestamp: new Date().toISOString()
                });
            }
        }
 
        logCallback(`Chunk processed: ${successCount} success, ${errorCount} errors, ${chunkTokensUsed} tokens used`);
        return {
            data: results,
            tokensUsed: chunkTokensUsed,
            apiCalls: chunkApiCalls,
            errors: errorCount
        };
    },

    /**
     * Process a single company's sitemap
     */
    async processSingleCompany(row, prompt, model, logCallback, maxExecutionTime, maxSitemapUrls, fetchTimeout, maxCellChars) {
        try {
            const companyName = row['organization.name'] || row.company || 'Unknown company';
            const websiteUrl = row['organization.website_url'] || row['organization.primary_domain'] || '';
    
            if (!websiteUrl) {
                logCallback(`No website URL found for ${companyName}`);
                return {
                    data: {
                        sitemap_analysis: 'No website URL available',
                        website_sitemap: '',
                        sitemap_analysis_timestamp: new Date().toISOString()
                    },
                    tokensUsed: 0,
                    apiCalls: 0
                };
            }
    
            logCallback(`Extracting sitemaps for ${companyName} (${websiteUrl})`);
            const startTime = new Date().getTime();
            const sitemaps = await this.extractSitemaps(
                websiteUrl,
                maxExecutionTime,
                maxSitemapUrls,
                fetchTimeout,
                logCallback
            );
    
            if (!sitemaps || sitemaps.length === 0) {
                logCallback(`No sitemaps found for ${companyName}`);
                return {
                    data: {
                        sitemap_analysis: 'No sitemaps found',
                        website_sitemap: '',
                        sitemap_analysis_timestamp: new Date().toISOString()
                    },
                    tokensUsed: 0,
                    apiCalls: 0
                };
            }
    
            const sitemapString = this.truncateUrlList(sitemaps, ", ", maxCellChars);
            logCallback(`Found ${sitemaps.length} sitemap URLs for ${companyName}`);
    
            const processedPrompt = prompt.replace('<website_sitemaps>', sitemapString);
    
            logCallback(`Analyzing sitemap data for ${companyName}`);
            
            // DIRECT TRACKING: Count API call for sitemap analysis
            metricsStorageService.addApiCall('apolloEnrichment_sitemap');
            
            const response = await apiClient.openai.chatCompletion({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a sitemap analysis expert. Analyze the provided sitemap URLs to extract insights about the company's website structure."
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
            
            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                analysis = response.choices[0].message.content?.trim();
            }
    
            if (response?.usage?.total_tokens) {
                tokensUsed = response.usage.total_tokens;
                // DIRECT TRACKING: Add tokens to substep
                metricsStorageService.addTokens('apolloEnrichment_sitemap', tokensUsed);
            }
    
            if (!analysis) {
                throw new Error("AI analysis returned empty content");
            }
    
            const processingTime = (new Date().getTime() - startTime) / 1000;
            logCallback(`Completed sitemap analysis for ${companyName} in ${processingTime.toFixed(2)} seconds`);
    
            return {
                data: {
                    sitemap_analysis: analysis,
                    website_sitemap: sitemapString,
                    sitemap_analysis_timestamp: new Date().toISOString()
                },
                tokensUsed: tokensUsed,
                apiCalls: 1
            };
        } catch (error) {
            // DIRECT TRACKING: Count error
            metricsStorageService.addError('apolloEnrichment_sitemap');
            throw new Error(`Failed to analyze sitemap: ${error.message}`);
        }
    },

    /**
     * Extract sitemaps from a website
     */
    async extractSitemaps(websiteUrl, maxExecutionTime, maxSitemapUrls, fetchTimeout, logCallback) {
        try {
            // Use the API client to extract sitemaps
            const result = await apiClient.serper.extractSitemaps(websiteUrl, {
                maxExecutionTime,
                maxSitemapUrls,
                fetchTimeout
            });
    
            if (result && result.success && result.sitemaps) {
                logCallback(`Successfully extracted ${result.count} sitemap URLs from ${websiteUrl}`);
                return result.sitemaps;
            } else {
                logCallback(`No sitemaps found for ${websiteUrl}`);
                return [];
            }
        } catch (error) {
            logCallback(`Error extracting sitemaps for ${websiteUrl}: ${error.message}`);
            return [];
        }
    },

    /**
     * Truncate URL list to fit within maximum character limit
     */
    truncateUrlList(urls, separator, maxChars) {
        if (!urls || urls.length === 0) return "";

        // Join with separator
        let result = "";
        let urlCount = 0;

        for (const url of urls) {
            const nextPart = urlCount === 0 ? url : separator + url;

            // Check if adding the next URL would exceed the limit
            if ((result.length + nextPart.length) > maxChars) {
                console.log(`Truncated URL list at ${urlCount} URLs to fit ${maxChars} character limit`);
                break;
            }

            result += nextPart;
            urlCount++;
        }

        return result;
    },

    /**
     * Merge processed results with original data
     */
    mergeResults(originalRows, processedRows, results) {
        const processedMap = new Map();
        results.forEach((result, index) => {
            const originalRow = processedRows[index];
            const key = originalRow['organization.id'] ||
                originalRow.linkedin_url ||
                `${originalRow.first_name}_${originalRow.last_name}_${originalRow.company}` ||
                index;
            processedMap.set(key, result);
        });

        return originalRows.map(originalRow => {
            if (originalRow.relevanceTag) {
                return originalRow;
            }

            const key = originalRow['organization.id'] ||
                originalRow.linkedin_url ||
                `${originalRow.first_name}_${originalRow.last_name}_${originalRow.company}`;

            if (key && processedMap.has(key)) {
                return processedMap.get(key);
            }

            return originalRow;
        });
    },

    /**
     * Process with configuration (for compatibility)
     */
    async processWithConfig(rows, config) {
        const prompt = config.prompt || config.sitemapPrompt || '';
        return this.processData(rows, prompt);
    }
};

export default sitemapAnalysisService;