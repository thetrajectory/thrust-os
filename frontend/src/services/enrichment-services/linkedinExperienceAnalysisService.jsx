// services/enrichment-services/linkedinExperienceAnalysisService.js
import apiClient from '../../utils/apiClient';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';

/**
 * LinkedIn Experience Analysis Service
 * Analyzes employment history from Apollo data using custom AI prompts
 */
const linkedinExperienceAnalysisService = {
    /**
     * Process LinkedIn experience analysis
     * @param {Array} rows - Array of data rows to process
     * @param {string} prompt - Custom prompt with <employmentHistory> placeholder
     * @param {Function} logCallback - Optional callback for logging
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<Array>} - Processed rows with experience analysis
     */
    async processData(rows, prompt, logCallback = () => { }, progressCallback = () => { }) {
        logCallback("Starting LinkedIn Experience Analysis...");

        const untaggedData = rows.filter(row => !row.relevanceTag);
        logCallback(`Processing ${untaggedData.length} untagged rows out of ${rows.length} total rows.`);

        if (untaggedData.length === 0) {
            logCallback("No untagged rows to process for LinkedIn experience analysis.");
            return rows;
        }

        if (!prompt || !prompt.trim()) {
            logCallback("No custom prompt provided for LinkedIn experience analysis.");
            return rows;
        }

        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';
        const batchSize = parseInt(import.meta.env.VITE_REACT_APP_EXPERIENCE_ANALYSIS_BATCH_SIZE || "5");

        // Use file storage for large datasets
        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for LinkedIn experience analysis');
        }

        const processedRows = [];
        let successCount = 0;
        let errorCount = 0;

        if (useFileStorage) {
            // Process using file storage service for large datasets
            const processFunction = async (chunk) => {
                return await this.processChunk(
                    chunk,
                    prompt,
                    model,
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

                // Merge with original data
                const finalData = this.mergeResults(rows, untaggedData, results);

                logCallback(`LinkedIn Experience Analysis Complete (Large Dataset):`);
                logCallback(`- Total processed: ${results.length}`);

                return finalData;

            } catch (error) {
                logCallback(`Error in large dataset processing: ${error.message}`);
                throw error;
            }
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
                                ...result
                            });

                            successCount++;
                            const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
                            logCallback(`Analyzed experience for ${name || 'unnamed person'}`);
                            progressCallback(((i + j + 1) / untaggedData.length) * 100);
                        })
                        .catch(error => {
                            const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
                            logCallback(`Error analyzing experience for ${name || 'unnamed person'}: ${error.message}`);
                            errorCount++;

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

            // Merge with original data
            const finalData = this.mergeResults(rows, untaggedData, processedRows);

            logCallback(`LinkedIn Experience Analysis Complete:`);
            logCallback(`- Successfully analyzed: ${successCount}`);
            logCallback(`- Errors: ${errorCount}`);

            return finalData;
        }
    },

    /**
     * Process chunk of data for large datasets
     */
    async processChunk(chunk, prompt, model, logCallback) {
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const row of chunk) {
            try {
                // Skip if already processed or tagged
                if (row.relevanceTag) {
                    results.push({ ...row });
                    continue;
                }

                const result = await this.analyzeSingleExperience(row, prompt, model, logCallback);
                results.push({
                    ...row,
                    ...result
                });

                successCount++;

            } catch (error) {
                errorCount++;
                logCallback(`Error processing experience analysis: ${error.message}`);
                results.push({
                    ...row,
                    experience_analysis: 'Analysis failed',
                    experience_analysis_error: error.message,
                    experience_analysis_timestamp: new Date().toISOString()
                });
            }
        }

        logCallback(`Chunk processed: ${successCount} success, ${errorCount} errors`);
        return results;
    },

    /**
     * Analyze single person's LinkedIn experience
     */
    async analyzeSingleExperience(row, prompt, model, logCallback) {
        try {
            // Extract employment history from Apollo data
            const employmentHistory = row.employment_history_summary ||
                row['person.employment_history'] ||
                row.employment_history ||
                '';

            if (!employmentHistory.trim()) {
                logCallback(`No employment history available for analysis`);
                return {
                    experience_analysis: 'No employment history available',
                    experience_analysis_timestamp: new Date().toISOString()
                };
            }

            // Replace only the <employmentHistory> placeholder
            const processedPrompt = prompt.replace(
                /<employmentHistory>/g,
                employmentHistory
            );

            const name = `${row['person.first_name'] || row.first_name || ''} ${row['person.last_name'] || row.last_name || ''}`.trim();
            logCallback(`Analyzing LinkedIn experience for: ${name || 'unnamed person'}`);

            // Call OpenAI API
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
            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                analysis = response.choices[0].message.content?.trim();
            }

            if (!analysis) {
                throw new Error("OpenAI API returned empty content");
            }

            return {
                experience_analysis: analysis,
                experience_analysis_timestamp: new Date().toISOString()
            };

        } catch (error) {
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