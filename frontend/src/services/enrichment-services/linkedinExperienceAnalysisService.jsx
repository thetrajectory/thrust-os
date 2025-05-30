// services/enrichment-services/linkedinExperienceAnalysisService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';

/**
 * LinkedIn Experience Analysis Service with DIRECT TRACKING
 */
const linkedinExperienceAnalysisService = {
    /**
     * Process LinkedIn experience analysis
     */
    async processData(rows, prompt, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting LinkedIn Experience Analysis...");

        // DIRECT TRACKING: Initialize counters
        let totalTokensUsed = 0;
        let totalApiCalls = 0;
        let totalErrors = 0;

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process for LinkedIn experience analysis.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, apiCalls: 0, errors: 0 }
            };
        }

        if (!prompt || !prompt.trim()) {
            logCallback("No custom prompt provided for LinkedIn experience analysis.");
            return {
                data: rows,
                analytics: { tokensUsed: 0, apiCalls: 0, errors: 0 }
            };
        }

        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_EXPERIENCE_ANALYSIS_BATCH_SIZE || "5");

        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for LinkedIn experience analysis');
        }

        try {
            const processedRows = [];
            let successCount = 0;
            let errorCount = 0;

            if (useFileStorage) {
                const processFunction = async (chunk) => {
                    const result = await this.processChunk(
                        chunk,
                        prompt,
                        model,
                        logCallback
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

                const results = await customEngineFileStorageService.processLargeDataset(
                    untaggedData,
                    processFunction,
                    progressFunction
                );

                const finalData = this.mergeResults(rows, untaggedData, results);

                logCallback(`LinkedIn Experience Analysis Complete (Large Dataset):`);
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

            } else {
                // Process smaller datasets normally
                for (let i = 0; i < untaggedData.length; i += batchSize) {
                    const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
                    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

                    const batchPromises = [];

                    for (let j = 0; j < currentBatchSize; j++) {
                        const index = i + j;
                        const row = untaggedData[index];

                        const processPromise = this.analyzeSingleExperience(row, prompt, model, logCallback)
                            .then(result => {
                                processedRows.push({
                                    ...row,
                                    ...result.data
                                });

                                // DIRECT TRACKING: Count usage
                                totalTokensUsed += result.tokensUsed || 0;
                                totalApiCalls += result.apiCalls || 0;
                                if (result.tokensUsed > 0) {
                                    metricsStorageService.addTokens('apolloEnrichment_experience', result.tokensUsed);
                                }
                                if (result.apiCalls > 0) {
                                    metricsStorageService.addApiCall('apolloEnrichment_experience');
                                }

                                successCount++;
                                const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
                                logCallback(`Analyzed experience for ${name || 'unnamed person'}`);
                                progressCallback(((i + j + 1) / untaggedData.length) * 100);
                            })
                            .catch(error => {
                                const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
                                logCallback(`Error analyzing experience for ${name || 'unnamed person'}: ${error.message}`);
                                errorCount++;
                                totalErrors++;
                                metricsStorageService.addError('apolloEnrichment_experience');

                                processedRows.push({
                                    ...row,
                                    experience_analysis: 'Analysis failed',
                                    experience_analysis_error: error.message,
                                    experience_analysis_timestamp: new Date().toISOString()
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

                const finalData = this.mergeResults(rows, untaggedData, processedRows);

                logCallback(`LinkedIn Experience Analysis Complete:`);
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
            }
        } catch (error) {
            metricsStorageService.addError('apolloEnrichment_experience');
            logCallback(`Error in LinkedIn experience analysis: ${error.message}`);
            throw error;
        }
    },

    /**
     * Process chunk of data for large datasets - WITH DIRECT TRACKING
     */
    async processChunk(chunk, prompt, model, logCallback) {
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

                const result = await this.analyzeSingleExperience(row, prompt, model, logCallback);
                results.push({
                    ...row,
                    ...result.data
                });

                // DIRECT TRACKING: Count usage
                chunkTokensUsed += result.tokensUsed || 0;
                chunkApiCalls += result.apiCalls || 0;
                if (result.tokensUsed > 0) {
                    metricsStorageService.addTokens('apolloEnrichment_experience', result.tokensUsed);
                }
                if (result.apiCalls > 0) {
                    metricsStorageService.addApiCall('apolloEnrichment_experience');
                }

                successCount++;

            } catch (error) {
                errorCount++;
                metricsStorageService.addError('apolloEnrichment_experience');
                logCallback(`Error processing experience analysis: ${error.message}`);
                results.push({
                    ...row,
                    experience_analysis: 'Analysis failed',
                    experience_analysis_error: error.message,
                    experience_analysis_timestamp: new Date().toISOString()
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
     * Analyze single person's LinkedIn experience - WITH DIRECT TRACKING
     */
    async analyzeSingleExperience(row, prompt, model, logCallback) {
        try {
            const employmentHistory = row.employment_history_summary ||
                row['person.employment_history'] ||
                row.employment_history ||
                '';
    
            if (!employmentHistory.trim()) {
                logCallback(`No employment history available for analysis`);
                return {
                    data: {
                        experience_analysis: 'No employment history available',
                        experience_analysis_timestamp: new Date().toISOString()
                    },
                    tokensUsed: 0,
                    apiCalls: 0
                };
            }
    
            const processedPrompt = prompt.replace(
                /<employmentHistory>/g,
                employmentHistory
            );
    
            const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
            logCallback(`Analyzing LinkedIn experience for: ${name || 'unnamed person'}`);
    
            // DIRECT TRACKING: Count API call and track tokens
            metricsStorageService.addApiCall('apolloEnrichment_experience');
            
            const response = await apiClient.openai.chatCompletion({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are an expert career analyst. Analyze the provided employment history and provide structured insights based on the given prompt."
                    },
                    {
                        role: "user",
                        content: processedPrompt
                    }
                ],
                max_tokens: 10000,
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
                metricsStorageService.addTokens('apolloEnrichment_experience', tokensUsed);
            }
    
            if (!analysis) {
                throw new Error("OpenAI API returned empty content");
            }
    
            return {
                data: {
                    experience_analysis: analysis,
                    experience_analysis_timestamp: new Date().toISOString()
                },
                tokensUsed: tokensUsed,
                apiCalls: 1
            };
    
        } catch (error) {
            // DIRECT TRACKING: Count error
            metricsStorageService.addError('apolloEnrichment_experience');
            throw new Error(`Failed to analyze LinkedIn experience: ${error.message}`);
        }
    },

    /**
     * Merge processed results with original data
     */
    mergeResults(originalRows, processedRows, results) {
        const processedMap = new Map();
        results.forEach((result, index) => {
            const originalRow = processedRows[index];
            const key = originalRow['person.id'] ||
                originalRow.apollo_person_id ||
                originalRow.linkedin_url ||
                index;
            processedMap.set(key, result);
        });

        return originalRows.map(originalRow => {
            if (originalRow.relevanceTag) {
                return originalRow;
            }

            const key = originalRow['person.id'] ||
                originalRow.apollo_person_id ||
                originalRow.linkedin_url;
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
        const prompt = config.prompt || config.experiencePrompt || '';
        return this.processData(rows, prompt);
    }
};

export default linkedinExperienceAnalysisService;