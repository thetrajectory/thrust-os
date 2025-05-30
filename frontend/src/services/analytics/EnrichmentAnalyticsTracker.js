// services/analytics/EnrichmentAnalyticsTracker.js
class EnrichmentAnalyticsTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.analytics = {
            // Overall pipeline metrics
            pipeline: {
                startTime: null,
                endTime: null,
                totalRuntime: 0,
                totalRows: 0,
                processedRows: 0,
                qualifiedRows: 0,
                filteredRows: 0,
                errorRows: 0,
                averageTimePerRow: 0,
                throughputPerMinute: 0
            },
            
            // Step-by-step metrics
            steps: {},
            
            // Resource usage metrics
            resources: {
                totalTokensUsed: 0,
                totalCreditsUsed: 0,
                totalApiCalls: 0,
                tokenCostEstimate: 0,
                creditCostEstimate: 0,
                averageTokensPerRow: 0,
                averageCreditsPerRow: 0
            },
            
            // Service-specific metrics
            services: {
                openai: {
                    totalTokens: 0,
                    promptTokens: 0,
                    completionTokens: 0,
                    apiCalls: 0,
                    averageTokensPerCall: 0,
                    errors: 0,
                    successRate: 0
                },
                apollo: {
                    apiCalls: 0,
                    cacheHits: 0,
                    cacheMisses: 0,
                    cacheEfficiency: 0,
                    errors: 0,
                    successRate: 0
                },
                serper: {
                    searchQueries: 0,
                    scrapingRequests: 0,
                    creditsUsed: 0,
                    errors: 0,
                    successRate: 0
                },
                coresignal: {
                    searchQueries: 0,
                    collectRequests: 0,
                    creditsUsed: 0,
                    errors: 0,
                    successRate: 0
                },
                supabase: {
                    reads: 0,
                    writes: 0,
                    cacheHits: 0,
                    errors: 0
                }
            },
            
            // Performance metrics
            performance: {
                averageLatencyMs: 0,
                peakMemoryUsage: 0,
                bottlenecks: [],
                slowestStep: null,
                fastestStep: null
            },
            
            // Quality metrics
            quality: {
                dataCompleteness: 0,
                dataAccuracy: 0,
                duplicateRecords: 0,
                missingFields: 0
            }
        };
    }

    // Start pipeline tracking
    startPipeline(totalRows) {
        this.analytics.pipeline.startTime = Date.now();
        this.analytics.pipeline.totalRows = totalRows;
    }

    // End pipeline tracking
    endPipeline(processedRows) {
        this.analytics.pipeline.endTime = Date.now();
        this.analytics.pipeline.totalRuntime = this.analytics.pipeline.endTime - this.analytics.pipeline.startTime;
        this.analytics.pipeline.processedRows = processedRows;
        
        // Calculate derived metrics
        this.calculateDerivedMetrics();
    }

    // Start step tracking
    startStep(stepName, inputRows) {
        if (!this.analytics.steps[stepName]) {
            this.analytics.steps[stepName] = {
                startTime: null,
                endTime: null,
                runtime: 0,
                inputRows: 0,
                outputRows: 0,
                filteredRows: 0,
                errorRows: 0,
                tokensUsed: 0,
                creditsUsed: 0,
                apiCalls: 0,
                averageTimePerRow: 0,
                throughputPerMinute: 0,
                successRate: 0,
                errors: []
            };
        }
        
        this.analytics.steps[stepName].startTime = Date.now();
        this.analytics.steps[stepName].inputRows = inputRows;
    }

    // End step tracking
    endStep(stepName, outputRows, filteredRows = 0, errorRows = 0) {
        if (!this.analytics.steps[stepName]) return;
        
        const step = this.analytics.steps[stepName];
        step.endTime = Date.now();
        step.runtime = step.endTime - step.startTime;
        step.outputRows = outputRows;
        step.filteredRows = filteredRows;
        step.errorRows = errorRows;
        
        // Calculate step-specific metrics
        if (step.inputRows > 0) {
            step.averageTimePerRow = step.runtime / step.inputRows;
            step.throughputPerMinute = (step.inputRows / step.runtime) * 60000;
            step.successRate = ((step.inputRows - step.errorRows) / step.inputRows) * 100;
        }
    }

    // Track OpenAI usage
    trackOpenAI(tokens, apiCall = true, error = false) {
        const openai = this.analytics.services.openai;
        
        if (apiCall) openai.apiCalls++;
        if (error) openai.errors++;
        
        if (tokens) {
            openai.totalTokens += tokens.total || 0;
            openai.promptTokens += tokens.prompt || 0;
            openai.completionTokens += tokens.completion || 0;
            
            // Update global counters
            this.analytics.resources.totalTokensUsed += tokens.total || 0;
            this.analytics.resources.totalApiCalls++;
        }
        
        // Calculate average tokens per call
        if (openai.apiCalls > 0) {
            openai.averageTokensPerCall = openai.totalTokens / openai.apiCalls;
            openai.successRate = ((openai.apiCalls - openai.errors) / openai.apiCalls) * 100;
        }
    }

    // Track Apollo usage
    trackApollo(apiCall = false, cacheHit = false, error = false) {
        const apollo = this.analytics.services.apollo;
        
        if (apiCall) {
            apollo.apiCalls++;
            apollo.cacheMisses++;
            this.analytics.resources.totalApiCalls++;
        }
        
        if (cacheHit) {
            apollo.cacheHits++;
        }
        
        if (error) apollo.errors++;
        
        // Calculate cache efficiency
        const totalRequests = apollo.apiCalls + apollo.cacheHits;
        if (totalRequests > 0) {
            apollo.cacheEfficiency = (apollo.cacheHits / totalRequests) * 100;
            apollo.successRate = ((apollo.apiCalls - apollo.errors) / apollo.apiCalls) * 100;
        }
    }

    // Track Serper usage
    trackSerper(type = 'search', credits = 1, error = false) {
        const serper = this.analytics.services.serper;
        
        if (type === 'search') serper.searchQueries++;
        if (type === 'scrape') serper.scrapingRequests++;
        
        serper.creditsUsed += credits;
        this.analytics.resources.totalCreditsUsed += credits;
        this.analytics.resources.totalApiCalls++;
        
        if (error) serper.errors++;
        
        // Calculate success rate
        const totalRequests = serper.searchQueries + serper.scrapingRequests;
        if (totalRequests > 0) {
            serper.successRate = ((totalRequests - serper.errors) / totalRequests) * 100;
        }
    }

    // Track Coresignal usage
    trackCoresignal(type = 'search', credits = 1, error = false) {
        const coresignal = this.analytics.services.coresignal;
        
        if (type === 'search') coresignal.searchQueries++;
        if (type === 'collect') coresignal.collectRequests++;
        
        coresignal.creditsUsed += credits;
        this.analytics.resources.totalCreditsUsed += credits;
        this.analytics.resources.totalApiCalls++;
        
        if (error) coresignal.errors++;
        
        // Calculate success rate
        const totalRequests = coresignal.searchQueries + coresignal.collectRequests;
        if (totalRequests > 0) {
            coresignal.successRate = ((totalRequests - coresignal.errors) / totalRequests) * 100;
        }
    }

    // Track Supabase usage
    trackSupabase(operation = 'read', error = false) {
        const supabase = this.analytics.services.supabase;
        
        if (operation === 'read') supabase.reads++;
        if (operation === 'write') supabase.writes++;
        if (operation === 'cache_hit') supabase.cacheHits++;
        
        if (error) supabase.errors++;
    }

    // Track step-specific resource usage
    trackStepResource(stepName, tokens = 0, credits = 0, apiCalls = 0) {
        if (!this.analytics.steps[stepName]) return;
        
        const step = this.analytics.steps[stepName];
        step.tokensUsed += tokens;
        step.creditsUsed += credits;
        step.apiCalls += apiCalls;
    }

    // Calculate derived metrics
    calculateDerivedMetrics() {
        const pipeline = this.analytics.pipeline;
        const resources = this.analytics.resources;
        
        // Pipeline metrics
        if (pipeline.totalRows > 0) {
            pipeline.averageTimePerRow = pipeline.totalRuntime / pipeline.totalRows;
            pipeline.throughputPerMinute = (pipeline.totalRows / pipeline.totalRuntime) * 60000;
            
            // Resource efficiency metrics
            resources.averageTokensPerRow = resources.totalTokensUsed / pipeline.totalRows;
            resources.averageCreditsPerRow = resources.totalCreditsUsed / pipeline.totalRows;
        }
        
        // Cost estimates (adjust rates as needed)
        const tokenCostPer1000 = 0.002; // $0.002 per 1000 tokens for GPT-4
        const creditCost = 0.001; // $0.001 per credit for search APIs
        
        resources.tokenCostEstimate = (resources.totalTokensUsed / 1000) * tokenCostPer1000;
        resources.creditCostEstimate = resources.totalCreditsUsed * creditCost;
        
        // Performance analysis
        this.analyzePerformance();
        
        // Quality analysis
        this.analyzeQuality();
    }

    // Analyze performance bottlenecks
    analyzePerformance() {
        const performance = this.analytics.performance;
        const steps = this.analytics.steps;
        
        let slowestStep = null;
        let fastestStep = null;
        let maxTime = 0;
        let minTime = Infinity;
        
        Object.keys(steps).forEach(stepName => {
            const step = steps[stepName];
            
            if (step.runtime > maxTime) {
                maxTime = step.runtime;
                slowestStep = { name: stepName, runtime: step.runtime };
            }
            
            if (step.runtime < minTime) {
                minTime = step.runtime;
                fastestStep = { name: stepName, runtime: step.runtime };
            }
            
            // Identify bottlenecks (steps taking >30% of total time)
            const timePercentage = (step.runtime / this.analytics.pipeline.totalRuntime) * 100;
            if (timePercentage > 30) {
                performance.bottlenecks.push({
                    step: stepName,
                    runtime: step.runtime,
                    percentage: timePercentage
                });
            }
        });
        
        performance.slowestStep = slowestStep;
        performance.fastestStep = fastestStep;
        
        // Calculate average latency
        const totalSteps = Object.keys(steps).length;
        if (totalSteps > 0) {
            const totalStepTime = Object.values(steps).reduce((sum, step) => sum + step.runtime, 0);
            performance.averageLatencyMs = totalStepTime / totalSteps;
        }
    }

    // Analyze data quality
    analyzeQuality() {
        const quality = this.analytics.quality;
        const pipeline = this.analytics.pipeline;
        
        // Calculate data completeness
        if (pipeline.totalRows > 0) {
            quality.dataCompleteness = (pipeline.processedRows / pipeline.totalRows) * 100;
            
            // Data accuracy (successful processing rate)
            quality.dataAccuracy = ((pipeline.processedRows - pipeline.errorRows) / pipeline.processedRows) * 100;
        }
    }

    // Get comprehensive report data
    getReportData() {
        this.calculateDerivedMetrics();
        return this.analytics;
    }

    // Get current analytics state
    getAnalytics() {
        return this.analytics;
    }
}

// Create and export a singleton instance
const enrichmentAnalyticsTracker = new EnrichmentAnalyticsTracker();
export default enrichmentAnalyticsTracker;