// services/enrichment-services/promptAnalysisService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';

/**
 * High-Performance Prompt Analysis Service with DIRECT TRACKING
 */
const promptAnalysisService = {
    /**
     * Process data with custom prompt analysis
     */
    async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
        logCallback('Starting High-Performance Prompt Analysis...');

        if (!config.prompt) {
            throw new Error('No prompt provided for analysis');
        }

        // DIRECT TRACKING: Initialize counters
        let totalTokensUsed = 0;
        let totalApiCalls = 0;
        let totalErrors = 0;

        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';
        const batchSize = 100;
        const concurrentRequests = 10;
        const maxTokens = 50;
        const temperature = 0.1;

        logCallback(`Using model: ${model}`);
        logCallback(`Processing ${rows.length} rows in batches of ${batchSize} with ${concurrentRequests} concurrent requests`);

        const startTimestamp = Date.now();

        // Analytics tracking
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        const availableFields = promptAnalysisService.getAvailableFields(rows);
        logCallback(`Available fields: ${availableFields.join(', ')}`);

        const placeholders = promptAnalysisService.extractPlaceholders(config.prompt);
        const invalidPlaceholders = placeholders.filter(p => !availableFields.includes(p));

        if (invalidPlaceholders.length > 0) {
            logCallback(`Warning: Invalid placeholders found: ${invalidPlaceholders.join(', ')}`);
        }

        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for optimal performance');
        }

        if (useFileStorage) {
            const processFunction = async (chunk) => {
                const result = await promptAnalysisService.processChunkConcurrently(
                    chunk,
                    config.prompt,
                    availableFields,
                    model,
                    concurrentRequests,
                    maxTokens,
                    temperature,
                    config.filter,
                    logCallback
                );

                // DIRECT TRACKING: Count chunk usage
                const chunkTokens = result.tokensUsed || 0;
                const chunkApiCalls = result.apiCalls || 0;
                const chunkErrors = result.errors || 0;

                totalTokensUsed += chunkTokens;
                totalApiCalls += chunkApiCalls;
                totalErrors += chunkErrors;

                // Track in metrics service
                metricsStorageService.addTokens('promptAnalysis', chunkTokens);
                for (let i = 0; i < chunkApiCalls; i++) {
                    metricsStorageService.addApiCall('promptAnalysis');
                }
                for (let i = 0; i < chunkErrors; i++) {
                    metricsStorageService.addError('promptAnalysis');
                }

                return result.data;
            };

            const progressFunction = (percent, message) => {
                progressCallback(percent);
                logCallback(message);
            };

            try {
                const results = await customEngineFileStorageService.processLargeDataset(
                    rows,
                    processFunction,
                    progressFunction
                );

                const endTimestamp = Date.now();
                const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

                logCallback(`High-Performance Prompt Analysis Complete:`);
                logCallback(`- Total processed: ${results.length}`);
                logCallback(`- Total tokens used: ${totalTokensUsed}`);
                logCallback(`- Total API calls: ${totalApiCalls}`);
                logCallback(`- Processing time: ${processingTimeSeconds.toFixed(2)} seconds`);
                logCallback(`- Average time per row: ${(processingTimeSeconds / results.length * 1000).toFixed(2)}ms`);

                return {
                    data: results,
                    analytics: {
                        tokensUsed: totalTokensUsed,
                        apiCalls: totalApiCalls,
                        errors: totalErrors,
                        processedCount: results.length,
                        processingTime: endTimestamp - startTimestamp
                    }
                };

            } catch (error) {
                metricsStorageService.addError('promptAnalysis');
                logCallback(`Error in large dataset processing: ${error.message}`);
                throw error;
            }
        } else {
            return await promptAnalysisService.processStandardDataset(
                rows,
                config,
                availableFields,
                model,
                batchSize,
                concurrentRequests,
                maxTokens,
                temperature,
                logCallback,
                progressCallback
            );
        }
    },

    /**
     * Process chunk with concurrent requests for maximum speed - WITH DIRECT TRACKING
     */
    async processChunkConcurrently(chunk, prompt, availableFields, model, concurrentRequests, maxTokens, temperature, filter, logCallback) {
        const results = [];
        let chunkTokensUsed = 0;
        let chunkApiCalls = 0;
        let chunkErrors = 0;

        for (let i = 0; i < chunk.length; i += concurrentRequests) {
            const concurrentBatch = chunk.slice(i, Math.min(i + concurrentRequests, chunk.length));

            const promises = concurrentBatch.map(async (row, index) => {
                try {
                    if (row.relevanceTag || row.promptAnalysis) {
                        return { ...row };
                    }

                    const processedPrompt = promptAnalysisService.replacePlaceholders(prompt, row, availableFields);

                    // DIRECT TRACKING: Call API and track usage
                    const result = await promptAnalysisService.callAnalysisAPI(processedPrompt, model, temperature, maxTokens);

                    // Track actual token usage
                    chunkTokensUsed += result.totalTokens || 0;
                    chunkApiCalls += 1;

                    const analysis = result.completion?.trim() || 'No analysis available';

                    let relevanceTag = '';
                    if (filter && filter.rules) {
                        relevanceTag = promptAnalysisService.applyFilters(row, analysis, filter.rules);
                    }

                    return {
                        ...row,
                        promptAnalysis: analysis,
                        analysisTimestamp: new Date().toISOString(),
                        relevanceTag: relevanceTag || row.relevanceTag || ''
                    };

                } catch (error) {
                    chunkErrors += 1;
                    logCallback(`Error processing row: ${error.message}`);
                    return {
                        ...row,
                        promptAnalysis: 'Analysis failed',
                        analysisError: error.message,
                        analysisTimestamp: new Date().toISOString(),
                        relevanceTag: row.relevanceTag || ''
                    };
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            if (i + concurrentRequests < chunk.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        return {
            data: results,
            tokensUsed: chunkTokensUsed,
            apiCalls: chunkApiCalls,
            errors: chunkErrors
        };
    },

    /**
     * Process standard datasets (< 1000 rows) - WITH DIRECT TRACKING
     */
    async processStandardDataset(rows, config, availableFields, model, batchSize, concurrentRequests, maxTokens, temperature, logCallback, progressCallback) {
        const processedRows = [];
        let successCount = 0;
        let errorCount = 0;
        let totalTokensUsed = 0;
        let totalApiCalls = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, Math.min(i + batchSize, rows.length));
            logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + batch.length}`);

            const batchResult = await promptAnalysisService.processChunkConcurrently(
                batch,
                config.prompt,
                availableFields,
                model,
                concurrentRequests,
                maxTokens,
                temperature,
                config.filter,
                logCallback
            );

            processedRows.push(...batchResult.data);

            // DIRECT TRACKING: Accumulate usage
            totalTokensUsed += batchResult.tokensUsed || 0;
            totalApiCalls += batchResult.apiCalls || 0;
            errorCount += batchResult.errors || 0;

            // Track in metrics service
            metricsStorageService.addTokens('promptAnalysis', batchResult.tokensUsed || 0);
            for (let j = 0; j < (batchResult.apiCalls || 0); j++) {
                metricsStorageService.addApiCall('promptAnalysis');
            }
            for (let j = 0; j < (batchResult.errors || 0); j++) {
                metricsStorageService.addError('promptAnalysis');
            }

            const progress = Math.floor(((i + batch.length) / rows.length) * 100);
            progressCallback(progress);

            batchResult.data.forEach(row => {
                if (row.analysisError) {
                    errorCount++;
                } else {
                    successCount++;
                }
            });
        }

        logCallback(`Standard processing complete: ${successCount} success, ${errorCount} errors`);
        logCallback(`Total tokens used: ${totalTokensUsed}`);
        logCallback(`Total API calls: ${totalApiCalls}`);

        return {
            data: processedRows,
            analytics: {
                tokensUsed: totalTokensUsed,
                apiCalls: totalApiCalls,
                errors: errorCount,
                processedCount: successCount,
                processingTime: 0
            }
        };
    },

    /**
     * Get available fields from data rows
     */
    getAvailableFields(rows) {
        if (!rows || rows.length === 0) {
            return ['first_name', 'last_name', 'position', 'company', 'email_id', 'linkedin_url'];
        }

        const fields = new Set();
        const sampleSize = Math.min(3, rows.length);

        for (let i = 0; i < sampleSize; i++) {
            Object.keys(rows[i]).forEach(key => fields.add(key));
        }

        return Array.from(fields).sort();
    },

    /**
     * Extract placeholders from prompt text
     */
    extractPlaceholders(prompt) {
        const placeholderRegex = /<(\w+)>/g;
        const placeholders = [];
        let match;

        while ((match = placeholderRegex.exec(prompt)) !== null) {
            if (!placeholders.includes(match[1])) {
                placeholders.push(match[1]);
            }
        }

        return placeholders;
    },

    /**
     * Replace placeholders in prompt with actual values
     */
    replacePlaceholders(prompt, row, availableFields) {
        let processedPrompt = prompt;

        availableFields.forEach(field => {
            const placeholder = `<${field}>`;
            const value = row[field] || '';
            processedPrompt = processedPrompt.replace(new RegExp(placeholder, 'g'), value);
        });

        return processedPrompt;
    },

    /**
     * Call OpenAI API for analysis (optimized for speed) - WITH DIRECT TRACKING
     */
    async callAnalysisAPI(prompt, model, temperature, maxTokens) {
        try {
            const response = await apiClient.openai.chatCompletion({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a data analyst. Provide very concise analysis (1-3 words preferred for speed)."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: maxTokens,
                temperature: temperature
            });

            return {
                completion: response.choices?.[0]?.message?.content || '',
                totalTokens: response.usage?.total_tokens || 0
            };

        } catch (error) {
            console.error("OpenAI API request failed:", error);
            throw new Error(`OpenAI API request failed: ${error.message}`);
        }
    },

    /**
     * Apply filters with case-insensitive matching
     */
    applyFilters(row, analysis, filterRules) {
        for (const rule of filterRules) {
            if (!rule.field || !rule.operator || rule.value === undefined) continue;

            let fieldValue = '';

            if (rule.field === 'promptAnalysis' || rule.field === 'analysis') {
                fieldValue = analysis;
            } else {
                fieldValue = row[rule.field] || '';
            }

            const fieldValueLower = String(fieldValue).toLowerCase();
            const ruleValueLower = String(rule.value).toLowerCase();

            let matchesRule = false;

            switch (rule.operator.toLowerCase()) {
                case 'contains':
                    matchesRule = fieldValueLower.includes(ruleValueLower);
                    break;
                case 'equals':
                    matchesRule = fieldValueLower === ruleValueLower;
                    break;
                case 'startswith':
                case 'starts_with':
                    matchesRule = fieldValueLower.startsWith(ruleValueLower);
                    break;
                case 'endswith':
                case 'ends_with':
                    matchesRule = fieldValueLower.endsWith(ruleValueLower);
                    break;
                case 'greaterthan':
                case 'greater_than':
                    matchesRule = Number(fieldValue) > Number(rule.value);
                    break;
                case 'lessthan':
                case 'less_than':
                    matchesRule = Number(fieldValue) < Number(rule.value);
                    break;
                case 'between':
                    if (typeof rule.value === 'string' && rule.value.includes(',')) {
                        const [min, max] = rule.value.split(',').map(v => Number(v.trim()));
                        const numValue = Number(fieldValue);
                        matchesRule = numValue >= min && numValue <= max;
                    }
                    break;
                default:
                    matchesRule = false;
            }

            if (matchesRule) {
                if (rule.action === 'eliminate') {
                    return `filtered_${rule.field}_${rule.operator}_${rule.value}`;
                }
            } else {
                if (rule.action === 'pass') {
                    return `filtered_${rule.field}_${rule.operator}_${rule.value}`;
                }
            }
        }

        return '';
    },

    /**
     * Process with configuration (for compatibility with existing engine builder)
     */
    async processWithConfig(rows, config) {
        return promptAnalysisService.processData(rows, config);
    }
};

export default promptAnalysisService;