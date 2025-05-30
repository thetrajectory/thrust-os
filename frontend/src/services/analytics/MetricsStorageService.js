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

    // DIRECT TRACKING METHODS - called from services
    addTokens(stepName, tokens) {
        const metrics = this.initializeStep(stepName);
        metrics.tokensUsed += tokens;
        this.totalMetrics.totalTokens += tokens;
        this.saveMetrics();
        console.log(`🔢 Added ${tokens} tokens to ${stepName} (Total: ${metrics.tokensUsed})`);
    }

    addCredits(stepName, credits) {
        const metrics = this.initializeStep(stepName);
        metrics.creditsUsed += credits;
        this.totalMetrics.totalCredits += credits;
        this.saveMetrics();
        console.log(`💳 Added ${credits} credits to ${stepName} (Total: ${metrics.creditsUsed})`);
    }

    addApiCall(stepName) {
        const metrics = this.initializeStep(stepName);
        metrics.apiCalls += 1;
        this.totalMetrics.totalApiCalls += 1;
        this.saveMetrics();
        console.log(`📞 Added API call to ${stepName} (Total: ${metrics.apiCalls})`);
    }

    addSupabaseHit(stepName) {
        const metrics = this.initializeStep(stepName);
        metrics.supabaseHits += 1;
        this.totalMetrics.totalSupabaseHits += 1;
        this.saveMetrics();
        console.log(`💾 Added Supabase hit to ${stepName} (Total: ${metrics.supabaseHits})`);
    }

    addError(stepName) {
        const metrics = this.initializeStep(stepName);
        metrics.errors += 1;
        this.saveMetrics();
        console.log(`❌ Added error to ${stepName} (Total: ${metrics.errors})`);
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

    // Create Apollo substeps with direct tracking
    // Create Apollo substeps with actual metrics from independent processes
createApolloSubsteps(options, baseStepName, actualMetrics) {
    console.log('🔧 Creating Apollo substeps with ACTUAL metrics...');
    
    // Create substeps only if they were actually processed
    if (options.analyzeWebsite && (actualMetrics.websiteTokens > 0 || actualMetrics.websiteCredits > 0)) {
        const websiteMetrics = this.initializeStep('apolloEnrichment_website');
        websiteMetrics.apiTool = 'Serper + OpenAI';
        websiteMetrics.tokensUsed = actualMetrics.websiteTokens || 0;
        websiteMetrics.creditsUsed = actualMetrics.websiteCredits || 0;
        websiteMetrics.specificMetrics = {
            isSubstep: true,
            parentStep: 'apolloEnrichment',
            substepType: 'website',
            description: 'Website Analysis',
            actualTokens: actualMetrics.websiteTokens || 0,
            actualCredits: actualMetrics.websiteCredits || 0
        };
        
        // Update totals
        this.totalMetrics.totalTokens += websiteMetrics.tokensUsed;
        this.totalMetrics.totalCredits += websiteMetrics.creditsUsed;
        
        console.log(`✅ Website substep created - ${websiteMetrics.tokensUsed} tokens, ${websiteMetrics.creditsUsed} credits`);
    }
    
    if (options.analyzeExperience && actualMetrics.experienceTokens > 0) {
        const experienceMetrics = this.initializeStep('apolloEnrichment_experience');
        experienceMetrics.apiTool = 'OpenAI GPT';
        experienceMetrics.tokensUsed = actualMetrics.experienceTokens || 0;
        experienceMetrics.creditsUsed = 0; // Experience analysis doesn't use credits
        experienceMetrics.specificMetrics = {
            isSubstep: true,
            parentStep: 'apolloEnrichment',
            substepType: 'experience',
            description: 'Employee History Analysis',
            actualTokens: actualMetrics.experienceTokens || 0
        };
        
        // Update totals
        this.totalMetrics.totalTokens += experienceMetrics.tokensUsed;
        
        console.log(`✅ Experience substep created - ${experienceMetrics.tokensUsed} tokens`);
    }
    
    if (options.analyzeSitemap && actualMetrics.sitemapTokens > 0) {
        const sitemapMetrics = this.initializeStep('apolloEnrichment_sitemap');
        sitemapMetrics.apiTool = 'Manual Fetch + OpenAI';
        sitemapMetrics.tokensUsed = actualMetrics.sitemapTokens || 0;
        sitemapMetrics.creditsUsed = 0; // Sitemap analysis doesn't use credits (manual fetch)
        sitemapMetrics.specificMetrics = {
            isSubstep: true,
            parentStep: 'apolloEnrichment',
            substepType: 'sitemap',
            description: 'Sitemaps Scraping',
            actualTokens: actualMetrics.sitemapTokens || 0
        };
        
        // Update totals
        this.totalMetrics.totalTokens += sitemapMetrics.tokensUsed;
        
        console.log(`✅ Sitemap substep created - ${sitemapMetrics.tokensUsed} tokens`);
    }
    
    // Update main Apollo step to reflect that substeps handle the heavy lifting
    const apolloMetrics = this.stepMetrics['apolloEnrichment'];
    if (apolloMetrics) {
        // Apollo main step primarily does data fetching and caching
        apolloMetrics.specificMetrics = {
            isMainStep: true,
            hasSubsteps: true,
            substepCount: Object.keys(options).filter(opt => options[opt]).length,
            description: 'Core Apollo Data Fetching',
            note: 'Tokens/credits for analysis are tracked in substeps'
        };
    }
    
    this.saveMetrics();
    console.log(`🎯 Apollo substeps created with ACTUAL metrics from independent processes`);
}
}

// Create singleton instance
const metricsStorageService = new MetricsStorageService();
export default metricsStorageService;