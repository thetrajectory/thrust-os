// services/analytics/MetricsStorageService.js
import storageUtils from '../../utils/storageUtils';

class MetricsStorageService {
    constructor() {
        this.reset();
    }

    reset() {
        this.stepMetrics = {};
        this.totalMetrics = {
            totalTokens: 0,
            totalCredits: 0,
            totalApiCalls: 0,
            totalSupabaseHits: 0,
            totalProcessingTime: 0
        };
    }

    // Initialize step metrics
    initializeStep(stepName) {
        if (!this.stepMetrics[stepName]) {
            this.stepMetrics[stepName] = {
                stepName: stepName,
                tokensUsed: 0,
                creditsUsed: 0,
                apiCalls: 0,
                supabaseHits: 0,
                processingTime: 0,
                inputCount: 0,
                outputCount: 0,
                filteredCount: 0,
                errors: 0,
                apiTool: 'Internal',
                specificMetrics: {}
            };
        }
        return this.stepMetrics[stepName];
    }

    // Parse and extract metrics from log messages
    extractMetricsFromLog(stepName, logMessage) {
        if (!stepName || !logMessage || typeof logMessage !== 'string') return;

        const metrics = this.initializeStep(stepName);
        let updated = false;

        // Enhanced token extraction patterns
        const tokenPatterns = [
            /(\d+)\s*tokens?\s*used/i,
            /tokens?[:\s]+(\d+)/i,
            /total[_\s]?tokens?[:\s]*(\d+)/i,
            /openai.*?(\d+).*?tokens?/i,
            /gpt.*?(\d+).*?tokens?/i,
            /token[_\s]?usage[:\s]*(\d+)/i
        ];

        for (const pattern of tokenPatterns) {
            const match = logMessage.match(pattern);
            if (match) {
                const tokens = parseInt(match[1]);
                if (!isNaN(tokens) && tokens > 0) {
                    metrics.tokensUsed += tokens;
                    this.totalMetrics.totalTokens += tokens;
                    updated = true;
                    console.log(`🔢 Captured ${tokens} tokens for ${stepName} (Total: ${metrics.tokensUsed})`);
                    break;
                }
            }
        }

        // Enhanced credit extraction patterns
        const creditPatterns = [
            /(\d+)\s*credits?\s*used/i,
            /credits?[:\s]+(\d+)/i,
            /serper.*?(\d+).*?credits?/i,
            /coresignal.*?(\d+).*?credits?/i,
            /credit[_\s]?usage[:\s]*(\d+)/i,
            /api.*?(\d+).*?credits?/i
        ];

        for (const pattern of creditPatterns) {
            const match = logMessage.match(pattern);
            if (match) {
                const credits = parseInt(match[1]);
                if (!isNaN(credits) && credits > 0) {
                    metrics.creditsUsed += credits;
                    this.totalMetrics.totalCredits += credits;
                    updated = true;
                    console.log(`💳 Captured ${credits} credits for ${stepName} (Total: ${metrics.creditsUsed})`);
                    break;
                }
            }
        }

        // API call patterns
        const apiCallPatterns = [
            /api call/i,
            /calling.*?api/i,
            /fetching from.*?api/i,
            /requesting.*?api/i,
            /apollo api/i,
            /openai api/i,
            /serper api/i,
            /coresignal api/i
        ];

        for (const pattern of apiCallPatterns) {
            if (pattern.test(logMessage)) {
                metrics.apiCalls += 1;
                this.totalMetrics.totalApiCalls += 1;
                updated = true;
                break;
            }
        }

        // Supabase hit patterns
        const supabasePatterns = [
            /using.*?supabase/i,
            /from.*?supabase/i,
            /cache.*?hit/i,
            /using.*?existing.*?data/i,
            /retrieved.*?from.*?database/i,
            /using.*?cached/i
        ];

        for (const pattern of supabasePatterns) {
            if (pattern.test(logMessage)) {
                metrics.supabaseHits += 1;
                updated = true;
                break;
            }
        }

        // Error patterns
        if (/error|failed|exception/i.test(logMessage)) {
            metrics.errors += 1;
            updated = true;
        }

        // Specific service patterns
        this.extractServiceSpecificMetrics(stepName, logMessage, metrics);

        if (updated) {
            this.saveMetrics();
        }
    }

    // Extract service-specific metrics
    extractServiceSpecificMetrics(stepName, logMessage, metrics) {
        if (stepName === 'apolloEnrichment') {
            if (/fetched.*?from.*?apollo/i.test(logMessage)) {
                const match = logMessage.match(/(\d+)/);
                if (match) {
                    metrics.specificMetrics.apolloFetches = (metrics.specificMetrics.apolloFetches || 0) + parseInt(match[1]);
                }
            }
        }

        if (stepName === 'jobOpenings') {
            if (/coresignal.*?api/i.test(logMessage)) {
                const match = logMessage.match(/(\d+)/);
                if (match) {
                    metrics.specificMetrics.coresignalFetches = (metrics.specificMetrics.coresignalFetches || 0) + parseInt(match[1]);
                }
            }
        }

        if (stepName === 'financialInsight') {
            if (/public companies/i.test(logMessage)) {
                const match = logMessage.match(/(\d+)/);
                if (match) {
                    metrics.specificMetrics.publicCompanies = parseInt(match[1]);
                }
            }
        }
    }

    // Update step metrics with counts
    updateStepCounts(stepName, inputCount, outputCount, filteredCount, processingTime) {
        const metrics = this.initializeStep(stepName);
        metrics.inputCount = inputCount || 0;
        metrics.outputCount = outputCount || 0;
        metrics.filteredCount = filteredCount || 0;
        metrics.processingTime = processingTime || 0;
        
        this.totalMetrics.totalProcessingTime += processingTime || 0;
        
        this.saveMetrics();
    }

    // Set API tool for step
    setApiTool(stepName, apiTool) {
        const metrics = this.initializeStep(stepName);
        metrics.apiTool = apiTool;
        this.saveMetrics();
    }

    // Get all metrics
    getAllMetrics() {
        return {
            stepMetrics: Object.values(this.stepMetrics),
            totalMetrics: this.totalMetrics
        };
    }

    // Save metrics to storage
    saveMetrics() {
        const allMetrics = this.getAllMetrics();
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_METRICS, allMetrics);
        console.log('📊 Metrics saved to storage:', allMetrics);
    }

    // Load metrics from storage
    loadMetrics() {
        const stored = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_METRICS);
        if (stored && stored.stepMetrics) {
            this.stepMetrics = {};
            stored.stepMetrics.forEach(step => {
                this.stepMetrics[step.stepName] = step;
            });
            this.totalMetrics = stored.totalMetrics || this.totalMetrics;
            console.log('📊 Metrics loaded from storage:', stored);
        }
    }

    // Create Apollo substeps with proper metrics distribution
    createApolloSubsteps(options, baseStepName) {
        // Don't create artificial substeps with ratios
        // Substeps should already exist from real-time tracking during processing
        console.log('🔧 Apollo substeps should already exist from real-time tracking');
        
        // Just ensure the main Apollo step is marked properly
        const baseMetrics = this.stepMetrics[baseStepName];
        if (baseMetrics) {
            baseMetrics.specificMetrics = {
                isMainStep: true,
                hasSubsteps: true,
                substepCount: Object.keys(this.stepMetrics).filter(key => key.startsWith('apolloEnrichment_')).length,
                description: 'Core Apollo Enrichment'
            };
            this.saveMetrics();
        }
    }
}

// Create singleton instance
const metricsStorageService = new MetricsStorageService();
export default metricsStorageService;