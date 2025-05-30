// services/enrichment-services/promptAnalysisService.js
import apiClient from '../../utils/apiClient';
import customEngineFileStorageService from '../custom-engine/customEngineFileStorageService';

/**
 * High-Performance Prompt Analysis Service
 * Optimized for processing 10,000+ rows with file storage
 */
const promptAnalysisService = {
    /**
     * Process data with custom prompt analysis
     * @param {Array} rows - Array of data rows to process
     * @param {Object} config - Configuration object containing prompt and other settings
     * @param {Function} logCallback - Optional callback for logging
     * @param {Function} progressCallback - Optional callback for progress updates
     * @returns {Promise<Array>} - Processed rows with analysis results
     */
    async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
        logCallback('Starting High-Performance Prompt Analysis...');

        if (!config.prompt) {
            throw new Error('No prompt provided for analysis');
        }

        // Get model from environment
        const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || 'gpt-4o-mini';

        // Optimized settings for fast processing
        const batchSize = 100; // Larger batches for speed
        const concurrentRequests = 10; // Process multiple requests concurrently
        const maxTokens = 50; // Short responses for speed
        const temperature = 0.1; // Low temperature for consistency

        logCallback(`Using model: ${model}`);
        logCallback(`Processing ${rows.length} rows in batches of ${batchSize} with ${concurrentRequests} concurrent requests`);

        const startTimestamp = Date.now();

        // Analytics tracking
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        let tokensUsed = 0;

        // Get available fields for placeholder replacement
        const availableFields = promptAnalysisService.getAvailableFields(rows);
        logCallback(`Available fields: ${availableFields.join(', ')}`);

        // Validate prompt has valid placeholders
        const placeholders = promptAnalysisService.extractPlaceholders(config.prompt);
        const invalidPlaceholders = placeholders.filter(p => !availableFields.includes(p));

        if (invalidPlaceholders.length > 0) {
            logCallback(`Warning: Invalid placeholders found: ${invalidPlaceholders.join(', ')}`);
        }

        // Use file storage for large datasets
        const useFileStorage = rows.length > 1000;
        if (useFileStorage) {
            logCallback('Large dataset detected - using file storage for optimal performance');
        }

        // Process using custom engine file storage service for large datasets
        if (useFileStorage) {
            const processFunction = async (chunk) => {
                return await promptAnalysisService.processChunkConcurrently(
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
                logCallback(`- Processing time: ${processingTimeSeconds.toFixed(2)} seconds`);
                logCallback(`- Average time per row: ${(processingTimeSeconds / results.length * 1000).toFixed(2)}ms`);

                return results;

            } catch (error) {
                logCallback(`Error in large dataset processing: ${error.message}`);
                throw error;
            }
        } else {
            // Process smaller datasets normally
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
     * Process chunk with concurrent requests for maximum speed
     */
    async processChunkConcurrently(chunk, prompt, availableFields, model, concurrentRequests, maxTokens, temperature, filter, logCallback) {
        const results = [];

        // Process in smaller concurrent batches
        for (let i = 0; i < chunk.length; i += concurrentRequests) {
            const concurrentBatch = chunk.slice(i, Math.min(i + concurrentRequests, chunk.length));

            // Create promises for concurrent processing
            const promises = concurrentBatch.map(async (row, index) => {
                try {
                    // Skip if already processed
                    if (row.relevanceTag || row.promptAnalysis) {
                        return { ...row };
                    }

                    // Replace placeholders
                    const processedPrompt = promptAnalysisService.replacePlaceholders(prompt, row, availableFields);

                    // Call API
                    const result = await promptAnalysisService.callAnalysisAPI(processedPrompt, model, temperature, maxTokens);

                    // Process response
                    const analysis = result.completion?.trim() || 'No analysis available';

                    // Apply filters if configured
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

            // Wait for concurrent batch to complete
            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // Small delay to respect rate limits
            if (i + concurrentRequests < chunk.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        return results;
    },

    /**
     * Process standard datasets (< 1000 rows)
     */
    async processStandardDataset(rows, config, availableFields, model, batchSize, concurrentRequests, maxTokens, temperature, logCallback, progressCallback) {
        const processedRows = [];
        let successCount = 0;
        let errorCount = 0;

        // Process in batches
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, Math.min(i + batchSize, rows.length));
            logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + batch.length}`);

            const batchResults = await promptAnalysisService.processChunkConcurrently(
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

            processedRows.push(...batchResults);

            // Update progress
            const progress = Math.floor(((i + batch.length) / rows.length) * 100);
            progressCallback(progress);

            // Count results
            batchResults.forEach(row => {
                if (row.analysisError) {
                    errorCount++;
                } else {
                    successCount++;
                }
            });
        }

        logCallback(`Standard processing complete: ${successCount} success, ${errorCount} errors`);
        return processedRows;
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
     * Call OpenAI API for analysis (optimized for speed)
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

            // Case-insensitive comparison
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

            // Apply action based on match
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

        return ''; // No filter applied
    },

    /**
     * Process with configuration (for compatibility with existing engine builder)
     */
    async processWithConfig(rows, config) {
        return this.processData(rows, config);
    }
};

export default promptAnalysisService;