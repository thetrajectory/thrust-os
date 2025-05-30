// services/enrichment-services/websiteAnalysisService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';

/**
 * Website Content Analysis Service
 */
const websiteAnalysisService = {
    async analyzeWebsites(rows, prompt, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting Website Content Analysis...");

        // DIRECT TRACKING: Initialize counters
        let totalTokensUsed = 0;
        let totalApiCalls = 0;
        let totalErrors = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process for website analysis.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, apiCalls: 0, errors: 0 }
            };
        }

        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_COMPANY_RELEVANCE_BATCH_SIZE || "5");

        const processedRows = [];
        let successCount = 0;
        let errorCount = 0;

        // Process in batches
        for (let i = 0; i < untaggedData.length; i += batchSize) {
            const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
            logCallback(`Processing analysis batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

            const batchPromises = [];

            for (let j = 0; j < currentBatchSize; j++) {
                const index = i + j;
                const row = untaggedData[index];

                const processPromise = websiteAnalysisService.analyzeSingleWebsite(row, prompt, model, logCallback)
                    .then(result => {
                        processedRows.push({
                            ...row,
                            ...result.data
                        });

                        // DIRECT TRACKING: Count usage
                        totalTokensUsed += result.tokensUsed || 0;
                        totalApiCalls += result.apiCalls || 0;

                        successCount++;
                        logCallback(`Analyzed website for ${row['organization.name'] || row.company}`);
                        progressCallback(((i + j + 1) / untaggedData.length) * 100);
                    })
                    .catch(error => {
                        logCallback(`Error analyzing website for ${row['organization.name'] || row.company}: ${error.message}`);
                        errorCount++;
                        totalErrors++;

                        processedRows.push({
                            ...row,
                            website_analysis: 'Analysis failed',
                            website_analysis_error: error.message,
                            website_analysis_timestamp: new Date().toISOString()
                        });

                        progressCallback(((i + j + 1) / untaggedData.length) * 100);
                    });

                batchPromises.push(processPromise);
            }

            await Promise.all(batchPromises);

            if (i + currentBatchSize < untaggedData.length) {
                logCallback("Pausing briefly before next batch...");
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Merge with original data
        const finalData = websiteAnalysisService.mergeResults(rows, untaggedData, processedRows);

        logCallback(`Website Analysis Complete:`);
        logCallback(`- Successfully analyzed: ${successCount}`);
        logCallback(`- Total tokens used: ${totalTokensUsed}`);
        logCallback(`- Total API calls: ${totalApiCalls}`);
        logCallback(`- Errors: ${errorCount}`);

        return {
            data: finalData,
            analytics: {
                tokensUsed: totalTokensUsed,
                apiCalls: totalApiCalls,
                errors: totalErrors,
                processedCount: successCount
            }
        };
    },

    async analyzeSingleWebsite(row, prompt, model, logCallback) {
        try {
            const companyName = row['organization.name'] || row.company || '';
            const websiteContent = row.raw_website_content || '';
            const seoDescription = row['organization.seo_description'] || '';
            const shortDescription = row['organization.short_description'] || '';
            
            const companyDescription = [seoDescription, shortDescription].filter(Boolean).join(' ');
    
            if (!websiteContent && !companyDescription) {
                throw new Error('No website content or company description available for analysis');
            }
    
            let processedPrompt = prompt;
            const placeholders = {
                '{{company}}': companyName,
                '<company>': companyName,
                '{{company_name}}': companyName,
                '<company_name>': companyName,
                '{{website_content}}': websiteContent,
                '<website_content>': websiteContent,
                '{{company_description}}': companyDescription,
                '<company_description>': companyDescription
            };
    
            Object.entries(placeholders).forEach(([placeholder, value]) => {
                processedPrompt = processedPrompt.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
            });
    
            logCallback(`Analyzing website content for: ${companyName}`);
    
            // DIRECT TRACKING: Count API call for website analysis
            metricsStorageService.addApiCall('apolloEnrichment_website');
            
            const response = await apiClient.openai.chatCompletion({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a business analyst. Analyze website content and provide structured insights."
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
            } else if (response && response.data && response.data.choices) {
                analysis = response.data.choices[0].message.content?.trim();
            }
    
            if (response?.usage?.total_tokens) {
                tokensUsed = response.usage.total_tokens;
                // DIRECT TRACKING: Add tokens to substep
                metricsStorageService.addTokens('apolloEnrichment_website', tokensUsed);
            }
    
            if (!analysis) {
                throw new Error("OpenAI API returned empty content");
            }
    
            return {
                data: {
                    website_analysis: analysis,
                    website_analysis_timestamp: new Date().toISOString()
                },
                tokensUsed: tokensUsed,
                apiCalls: 1
            };
    
        } catch (error) {
            // DIRECT TRACKING: Count error
            metricsStorageService.addError('apolloEnrichment_website');
            throw new Error(`Failed to analyze website: ${error.message}`);
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

export default websiteAnalysisService;