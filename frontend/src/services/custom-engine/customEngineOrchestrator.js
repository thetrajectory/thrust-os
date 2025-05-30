// services/custom-engine/customEngineOrchestrator.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';

// Import the actual service implementations
import storageUtils from '../../utils/storageUtils';
import apolloEnrichmentService from '../enrichment-services/apolloEnrichmentService';
import financialInsightService from '../enrichment-services/financialInsightService';
import jobOpeningsService from '../enrichment-services/jobOpeningsService';
import promptAnalysisService from '../enrichment-services/promptAnalysisService';
import serperEnrichmentService from '../enrichment-services/serperEnrichmentService';
import customEngineFileStorageService from './customEngineFileStorageService';

class CustomEngineOrchestrator {
    constructor() {
        this.reset();
        this.stepsMetrics = {}
    }

    reset() {
        this.initialData = [];
        this.processedData = [];
        this.pipeline = [];
        this.currentStepIndex = 0;
        this.isProcessing = false;
        this.isCancelling = false;
        this.processingComplete = false;
        this.error = null;
        this.stepStatus = {};
        this.logs = [];
        this.analytics = {};
        this.stepsMetrics = {}
        this.callbacks = {
            logCallback: () => {},
            progressCallback: () => {},
            statusCallback: () => {}
        };
        this.engineConfig = null;
    }

    getApiToolForStep(stepId) {
        switch (stepId) {
            case 'promptAnalysis': return 'OpenAI GPT';
            case 'apolloEnrichment': return 'Apollo + Supabase';
            case 'serperEnrichment': return 'Serper API';
            case 'financialInsight': return 'Serper + OpenAI + PDF';
            case 'jobOpenings': return 'Coresignal + OpenAI';
            default: return 'Internal';
        }
    }

    updateStepMetrics(stepId, metrics) {
        if (!this.stepsMetrics[stepId]) {
            this.stepsMetrics[stepId] = {
                totalRows: 0,
                processedRows: 0,
                tokensUsed: 0,
                supabaseHits: 0,
                errors: 0,
                processingTime: 0,
                apiTool: 'Internal',
                avgTokensPerRow: 0,
                avgTimePerRow: 0,
                specificMetrics: {}
            };
        }

        // Update metrics
        Object.assign(this.stepsMetrics[stepId], metrics);

        // Calculate averages
        if (this.stepsMetrics[stepId].totalRows > 0) {
            this.stepsMetrics[stepId].avgTokensPerRow = 
                this.stepsMetrics[stepId].tokensUsed / this.stepsMetrics[stepId].totalRows;
            this.stepsMetrics[stepId].avgTimePerRow = 
                (this.stepsMetrics[stepId].processingTime / 1000) / this.stepsMetrics[stepId].totalRows;
        }

        // Store metrics in session storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_METRICS, this.stepsMetrics);
    }

    setEngine(engineData) {
        if (!engineData || !engineData.pipeline || !engineData.pipeline.steps) {
            console.error('Invalid engine data');
            return false;
        }

        this.engineConfig = engineData;
        this.pipeline = engineData.pipeline.steps.map(step => step.service);
        
        // Initialize status for each step
        this.stepStatus = {};
        this.pipeline.forEach(stepId => {
            this.stepStatus[stepId] = { status: 'pending', message: '' };
        });

        return true;
    }

    setInitialData(data) {
        this.initialData = Array.isArray(data) ? [...data] : [];
        this.processedData = Array.isArray(data) ? [...data] : [];
    }

    setCallbacks(callbacks) {
        this.callbacks = {
            ...this.callbacks,
            ...callbacks
        };
    }

    addLog(message) {
        const logEntry = {
            timestamp: new Date().toLocaleTimeString(),
            message
        };
        this.logs.push(logEntry);
        if (this.callbacks.logCallback) {
            this.callbacks.logCallback(logEntry);
        }
        
        console.log(`[Custom Engine][${logEntry.timestamp}] ${message}`);
    }

    updateStepStatus(stepId, status, message = '') {
        if (!this.stepStatus[stepId]) {
            this.stepStatus[stepId] = { status, message };
        } else {
            this.stepStatus[stepId].status = status;
            if (message) {
                this.stepStatus[stepId].message = message;
            }
        }
        
        if (this.callbacks.statusCallback) {
            this.callbacks.statusCallback(this.stepStatus);
        }
    }

    getState() {
        return {
            currentStepIndex: this.currentStepIndex,
            isProcessing: this.isProcessing,
            isCancelling: this.isCancelling,
            processingComplete: this.processingComplete,
            stepStatus: this.stepStatus,
            analytics: this.analytics,
            error: this.error
        };
    }

    getStepConfig(stepIndex) {
        if (!this.engineConfig || !this.engineConfig.pipeline || !this.engineConfig.pipeline.steps) {
            return null;
        }
        
        const step = this.engineConfig.pipeline.steps[stepIndex];
        return step ? step : null;
    }

    getCurrentStepConfig() {
        return this.getStepConfig(this.currentStepIndex);
    }

    async processCurrentStep() {
        if (this.isProcessing || this.processingComplete || this.isCancelling) {
          return false;
        }
        
        if (this.currentStepIndex >= this.pipeline.length) {
          this.processingComplete = true;
          return false;
        }
        
        const currentStepId = this.pipeline[this.currentStepIndex];
        const stepConfig = this.getCurrentStepConfig();
        
        if (!stepConfig) {
          this.error = new Error(`No configuration found for step ${currentStepId}`);
          this.updateStepStatus(currentStepId, 'error', this.error.message);
          return false;
        }
        
        try {
          this.isProcessing = true;
          this.updateStepStatus(currentStepId, 'processing', 'Processing in progress...');
          this.addLog(`Starting processing step: ${currentStepId}`);
 
          const startTime = Date.now();
          
          // Get valid data - those without relevance tags
          const validRows = this.processedData.filter(row => !row.relevanceTag);
          const inputCount = validRows.length;
          
          // Initialize analytics for this step
          this.analytics[currentStepId] = {
            inputCount,
            outputCount: 0,
            filteredCount: 0,
            processingTime: 0,
            tokensUsed: 0,
            creditsUsed: 0,
            apiCalls: 0,
            supabaseHits: 0
          };
          
          // Process the step with the appropriate service
          const processorResult = await this.processServiceStep(currentStepId, validRows, stepConfig);
          
          if (!processorResult || !processorResult.data) {
            throw new Error(`Invalid result from ${currentStepId} service`);
          }
          
          // Apply filters if configured
          let processedRows = processorResult.data;
          if (stepConfig.filter && stepConfig.filter.rules && stepConfig.filter.rules.length > 0) {
            this.addLog(`Applying filters for step ${currentStepId}`);
            processedRows = this.applyFilters(processedRows, stepConfig.filter);
          }
          
          // Merge processed rows with unprocessed ones
          const mergedData = this.mergeProcessedData(this.processedData, processedRows);
          this.processedData = mergedData;
          
          // Update analytics with ACTUAL values from service
          const endTime = Date.now();
          const filteredCount = processedRows.filter(row => row.relevanceTag).length;
          const outputCount = processedRows.length - filteredCount;
          
          this.analytics[currentStepId] = {
            ...this.analytics[currentStepId],
            outputCount,
            filteredCount,
            processingTime: endTime - startTime,
            // Use ACTUAL metrics from service result
            tokensUsed: processorResult.analytics?.tokensUsed || 0,
            creditsUsed: processorResult.analytics?.creditsUsed || 0,
            apiCalls: processorResult.analytics?.apiCalls || 0,
            supabaseHits: processorResult.analytics?.supabaseHits || 0
          };
 
          // DIRECT TRACKING: Handle Apollo substeps with actual metrics
          if (currentStepId === 'apolloEnrichment' && stepConfig.config?.options) {
            this.addLog('Creating Apollo substep metrics with actual usage data...');
            
            // Get actual metrics from the service result
            const apolloAnalytics = processorResult.analytics || {};
            
            // Create substeps with actual metrics (these should already be tracked by the service)
            const options = stepConfig.config.options;
            
            // Log actual Apollo metrics
            this.addLog(`📊 Apollo Core - Tokens: ${apolloAnalytics.tokensUsed || 0}, Credits: ${apolloAnalytics.creditsUsed || 0}, Supabase: ${apolloAnalytics.supabaseHits || 0}`);
            
            // Update main Apollo step counts
            metricsStorageService.updateStepCounts(
                'apolloEnrichment',
                inputCount,
                outputCount,
                filteredCount,
                endTime - startTime
            );
            
            this.addLog(`✅ Apollo enrichment with substeps completed`);
          } else {
            // For non-Apollo steps, update counts normally
            metricsStorageService.updateStepCounts(
                currentStepId,
                inputCount,
                outputCount,
                filteredCount,
                endTime - startTime
            );
          }
          
          // Mark step as complete
          this.updateStepStatus(currentStepId, 'complete', 'Processing complete');
          this.addLog(`Completed step ${currentStepId} (${filteredCount} filtered, ${outputCount} valid results)`);
          
        // Move to next step
        this.currentStepIndex++;
 
          if (this.currentStepIndex >= this.pipeline.length) {
            this.processingComplete = true;
            this.addLog('All processing steps complete!');
            
            // Calculate total metrics across all steps
            this.calculateTotalMetrics();
            
            return false;
          }
          
          return true;
        } catch (error) {
          this.error = error;
          this.addLog(`Error in step ${currentStepId}: ${error.message}`);
          this.updateStepStatus(currentStepId, 'error', error.message);
          return false;
        } finally {
          this.isProcessing = false;
        }
      }
      
      // Add a method to calculate total metrics
      calculateTotalMetrics() {
        // Get actual metrics from MetricsStorageService
        const allMetrics = metricsStorageService.getAllMetrics();
        
        this.totalMetrics = {
          totalTokensUsed: allMetrics.totalMetrics.totalTokens,
          totalCreditsUsed: allMetrics.totalMetrics.totalCredits,
          totalApiCalls: allMetrics.totalMetrics.totalApiCalls,
          totalSupabaseHits: allMetrics.totalMetrics.totalSupabaseHits,
          totalProcessingTime: allMetrics.totalMetrics.totalProcessingTime,
        };
        
        this.addLog(`📊 FINAL TOTALS - Tokens: ${this.totalMetrics.totalTokensUsed}, Credits: ${this.totalMetrics.totalCreditsUsed}, API Calls: ${this.totalMetrics.totalApiCalls}, Supabase: ${this.totalMetrics.totalSupabaseHits}`);
      }
      
    // Update processServiceStep to capture metrics from each service
    async processServiceStep(stepId, dataToProcess, stepConfig) {
        const stepStartTime = Date.now();
        let processorFunction;
        let apiTool = 'Internal';
        
        try {
            // Get the appropriate processor function with CORRECT API tool names
            switch (stepId) {
                case 'promptAnalysis':
                    processorFunction = promptAnalysisService.processData;
                    apiTool = 'OpenAI GPT';
                    break;
                case 'apolloEnrichment':
                    processorFunction = apolloEnrichmentService.processData;
                    apiTool = 'Apollo + Supabase';
                    break;
                case 'serperEnrichment':
                    processorFunction = serperEnrichmentService.processData;
                    apiTool = 'Serper API';
                    break;
                case 'financialInsight':
                    processorFunction = financialInsightService.processData;
                    apiTool = 'Serper + OpenAI + PDF';
                    break;
                case 'jobOpenings':
                    processorFunction = jobOpeningsService.processData;
                    apiTool = 'Coresignal + OpenAI';
                    break;
                default:
                    throw new Error(`No processor function found for step: ${stepId}`);
            }
    
            if (!processorFunction) {
                throw new Error(`No processor function found for step: ${stepId}`);
            }
    
            if (!dataToProcess || dataToProcess.length === 0) {
                this.addLog(`Warning: No data available for ${stepId}. Skipping.`);
                return {
                    data: dataToProcess || [],
                    analytics: {
                        skipped: true,
                        reason: 'No data to process',
                        tokensUsed: 0,
                        creditsUsed: 0,
                        apiCalls: 0,
                        supabaseHits: 0
                    }
                };
            }
    
            // DIRECT TRACKING: Initialize metrics tracking
            metricsStorageService.initializeStep(stepId);
            metricsStorageService.setApiTool(stepId, apiTool);
    
            // Simple log callback - NO MORE LOG PARSING
            const logCallback = (message) => {
                this.addLog(message);
            };
    
            const progressCallback = (percent) => {
                if (this.callbacks.progressCallback) {
                    this.callbacks.progressCallback(percent);
                }
            };
    
            // Call processor with enhanced callbacks
            const result = await processorFunction(
                dataToProcess,
                stepConfig.config || {},
                logCallback,
                progressCallback
            );
    
            // DIRECT TRACKING: Extract actual metrics from service result
            const serviceAnalytics = result.analytics || {};
            
            // Update step metrics with ACTUAL values from service
            const actualMetrics = {
                totalRows: dataToProcess.length,
                processedRows: Array.isArray(result.data) ? result.data.length : (result?.data?.length || 0),
                tokensUsed: serviceAnalytics.tokensUsed || 0,
                creditsUsed: serviceAnalytics.creditsUsed || 0,
                apiCalls: serviceAnalytics.apiCalls || 0,
                supabaseHits: serviceAnalytics.supabaseHits || 0,
                errors: serviceAnalytics.errors || 0,
                processingTime: Date.now() - stepStartTime,
                apiTool: apiTool
            };
    
            // DIRECT TRACKING: Update metrics storage with actual values
            const metrics = metricsStorageService.stepMetrics[stepId];
            if (metrics) {
                // Override with actual values from service
                metrics.tokensUsed = actualMetrics.tokensUsed;
                metrics.creditsUsed = actualMetrics.creditsUsed;
                metrics.apiCalls = actualMetrics.apiCalls;
                metrics.supabaseHits = actualMetrics.supabaseHits;
                metrics.errors = actualMetrics.errors;
                metrics.inputCount = actualMetrics.totalRows;
                metrics.outputCount = actualMetrics.processedRows;
                metrics.processingTime = actualMetrics.processingTime;
                
                // Update totals
                metricsStorageService.totalMetrics.totalTokens += actualMetrics.tokensUsed;
                metricsStorageService.totalMetrics.totalCredits += actualMetrics.creditsUsed;
                metricsStorageService.totalMetrics.totalApiCalls += actualMetrics.apiCalls;
                metricsStorageService.totalMetrics.totalSupabaseHits += actualMetrics.supabaseHits;
                metricsStorageService.totalMetrics.totalProcessingTime += actualMetrics.processingTime;
                
                metricsStorageService.saveMetrics();
            }
    
            this.addLog(`📊 Step ${stepId} metrics - Tokens: ${actualMetrics.tokensUsed}, Credits: ${actualMetrics.creditsUsed}, API Calls: ${actualMetrics.apiCalls}, Supabase: ${actualMetrics.supabaseHits}`);
    
            return {
                data: Array.isArray(result.data) ? result.data : (result?.data || []),
                analytics: {
                    processedCount: actualMetrics.processedRows,
                    processingTime: actualMetrics.processingTime,
                    tokensUsed: actualMetrics.tokensUsed,
                    creditsUsed: actualMetrics.creditsUsed,
                    supabaseHits: actualMetrics.supabaseHits,
                    apiCalls: actualMetrics.apiCalls,
                    errors: actualMetrics.errors
                }
            };
    
        } catch (error) {
            this.addLog(`Error in service step ${stepId}: ${error.message}`);
            
            // DIRECT TRACKING: Count error
            metricsStorageService.addError(stepId);
            metricsStorageService.updateStepCounts(
                stepId,
                dataToProcess?.length || 0,
                0,
                1,
                Date.now() - stepStartTime
            );
            
            throw error;
        }
    }
    
    // NEW METHOD: Extract service-specific metrics from log messages
    extractServiceSpecificMetrics(stepId, message, metrics) {
        if (stepId === 'financialInsight') {
            const patterns = {
                publicCount: /Public Companies:\s*(\d+)/i,
                privateCount: /Private Companies:\s*(\d+)/i,
                reportsFetched: /Reports Found:\s*(\d+)/i,
                reportsNotFound: /Reports Not Found:\s*(\d+)/i,
                extractionSuccesses: /Successful Extractions:\s*(\d+)/i,
                extractionFailures: /Failed Extractions:\s*(\d+)/i,
                insightsExtracted: /Insights Extracted:\s*(\d+)/i,
                insightsFailed: /Insights Failed:\s*(\d+)/i
            };
            
            Object.entries(patterns).forEach(([key, pattern]) => {
                const match = message.match(pattern);
                if (match) {
                    metrics.specificMetrics[key] = parseInt(match[1]);
                }
            });
        }
        
        if (stepId === 'apolloEnrichment') {
            const apolloFetchMatch = message.match(/Fetched from Apollo API:\s*(\d+)/i);
            if (apolloFetchMatch) {
                metrics.specificMetrics.apolloFetches = parseInt(apolloFetchMatch[1]);
            }
        }
        
        if (stepId === 'jobOpenings') {
            const coresignalMatch = message.match(/Fetched from Coresignal API:\s*(\d+)/i);
            if (coresignalMatch) {
                metrics.specificMetrics.coresignalFetches = parseInt(coresignalMatch[1]);
            }
        }
    }
    
    // NEW METHOD: Create Apollo substep metrics
    createApolloSubstepMetrics(options, baseMetrics) {
        const substeps = [];
        
        if (options.analyzeWebsite) {
            substeps.push({
                stepName: 'apolloEnrichment_website',
                apiTool: 'Serper + OpenAI',
                description: 'Website Content Analysis'
            });
        }
        
        if (options.analyzeExperience) {
            substeps.push({
                stepName: 'apolloEnrichment_experience', 
                apiTool: 'OpenAI GPT',
                description: 'LinkedIn Experience Analysis'
            });
        }
        
        if (options.analyzeSitemap) {
            substeps.push({
                stepName: 'apolloEnrichment_sitemap',
                apiTool: 'Serper + OpenAI', 
                description: 'Website Sitemap Analysis'
            });
        }
        
        // ENHANCED: More realistic token/credit distribution
        const totalSubsteps = substeps.length;
        if (totalSubsteps === 0) return;
        
        // Main Apollo enrichment typically uses 60% of tokens, substeps use 40%
        const mainApolloTokens = Math.floor(baseMetrics.tokensUsed * 0.6);
        const substepTokens = baseMetrics.tokensUsed - mainApolloTokens;
        const tokensPerSubstep = Math.floor(substepTokens / totalSubsteps);
        
        // Credits are mainly for website/sitemap analysis (Serper)
        const websiteCredits = Math.floor(baseMetrics.creditsUsed * 0.6);
        const sitemapCredits = Math.floor(baseMetrics.creditsUsed * 0.4);
        
        const timePerSubstep = Math.floor(baseMetrics.processingTime / (totalSubsteps + 1));
        const apiCallsPerSubstep = Math.floor(baseMetrics.apiCalls / (totalSubsteps + 1));
        
        substeps.forEach((substep, index) => {
            let substepTokens = tokensPerSubstep;
            let substepCredits = 0;
            
            // Distribute credits more realistically
            if (substep.stepName.includes('website')) {
                substepCredits = websiteCredits;
            } else if (substep.stepName.includes('sitemap')) {
                substepCredits = sitemapCredits;
            }
            // Experience analysis uses only OpenAI tokens, no credits
            
            const substepMetrics = {
                totalRows: baseMetrics.totalRows,
                processedRows: baseMetrics.processedRows,
                tokensUsed: substepTokens,
                creditsUsed: substepCredits,
                apiCalls: apiCallsPerSubstep,
                supabaseHits: 0, // Only main Apollo step uses cache
                errors: 0,
                processingTime: timePerSubstep,
                apiTool: substep.apiTool,
                avgTokensPerRow: baseMetrics.totalRows > 0 ? (substepTokens / baseMetrics.totalRows) : 0,
                avgTimePerRow: baseMetrics.totalRows > 0 ? ((timePerSubstep / 1000) / baseMetrics.totalRows) : 0,
                specificMetrics: {
                    isSubstep: true,
                    parentStep: 'apolloEnrichment',
                    substepType: substep.stepName.split('_')[1],
                    description: substep.description
                }
            };
            
            this.updateStepMetrics(substep.stepName, substepMetrics);
            this.addLog(`📊 Created substep metrics for ${substep.description} - Tokens: ${substepTokens}, Credits: ${substepCredits}`);
        });
        
        // ENHANCED: Update main Apollo metrics to reflect only core enrichment
        const mainApolloMetrics = {
            totalRows: baseMetrics.totalRows,
            processedRows: baseMetrics.processedRows,
            tokensUsed: mainApolloTokens,
            creditsUsed: 0, // Main Apollo doesn't use credits
            apiCalls: Math.floor(baseMetrics.apiCalls / (totalSubsteps + 1)),
            supabaseHits: baseMetrics.supabaseHits,
            errors: baseMetrics.errors,
            processingTime: timePerSubstep,
            apiTool: 'Apollo + Supabase',
            avgTokensPerRow: baseMetrics.totalRows > 0 ? (mainApolloTokens / baseMetrics.totalRows) : 0,
            avgTimePerRow: baseMetrics.totalRows > 0 ? ((timePerSubstep / 1000) / baseMetrics.totalRows) : 0,
            specificMetrics: {
                mainStep: true,
                hasSubsteps: true,
                substepCount: totalSubsteps
            }
        };
        
        this.updateStepMetrics('apolloEnrichment', mainApolloMetrics);
    }

    // Add method to get complete analytics
    getCompleteAnalytics() {
        const totalOriginalCount = this.initialData?.length || 0;
        const totalFinalCount = this.processedData ? 
            this.processedData.filter(row => !row.relevanceTag).length : 0;
 
        // Get actual metrics from MetricsStorageService
        const storedMetrics = metricsStorageService.getAllMetrics();
        let stepMetrics = [];
        
        if (storedMetrics && storedMetrics.stepMetrics) {
            stepMetrics = storedMetrics.stepMetrics.map(metric => ({
                stepName: metric.stepName,
                inputCount: metric.inputCount,
                outputCount: metric.outputCount,
                filteredCount: metric.filteredCount,
                processingTime: metric.processingTime,
                tokensUsed: metric.tokensUsed, // ACTUAL values
                creditsUsed: metric.creditsUsed, // ACTUAL values
                apiCalls: metric.apiCalls, // ACTUAL values
                supabaseHits: metric.supabaseHits, // ACTUAL values
                errors: metric.errors,
                apiTool: metric.apiTool,
                avgTokensPerRow: metric.inputCount > 0 ? (metric.tokensUsed / metric.inputCount) : 0,
                avgTimePerRow: metric.inputCount > 0 ? ((metric.processingTime / 1000) / metric.inputCount) : 0,
                specificMetrics: metric.specificMetrics || {}
            }));
        }
 
        return {
            originalCount: totalOriginalCount,
            finalCount: totalFinalCount,
            stepMetrics: stepMetrics, // Now includes ACTUAL tracked metrics including substeps
            processingStats: {
                totalRows: totalOriginalCount,
                processedRows: totalFinalCount,
                errorRows: this.processedData ? 
                    this.processedData.filter(row => row.processingError).length : 0,
                qualifiedLeads: totalFinalCount,
                taggedLeads: totalOriginalCount - totalFinalCount
            }
        };
    }

   applyFilters(rows, filter) {
       return rows.map(row => {
           // Skip already filtered rows
           if (row.relevanceTag) return row;
           
           // Check each rule
           for (const rule of filter.rules) {
               if (!rule.field || !rule.operator || !rule.value) continue;
               
               const fieldValue = row[rule.field];
               let matchesRule = false;
               
               switch (rule.operator) {
                   case 'equals':
                       matchesRule = String(fieldValue) === String(rule.value);
                       break;
                   case 'contains':
                       matchesRule = String(fieldValue || '').toLowerCase().includes(String(rule.value).toLowerCase());
                       break;
                   case 'startsWith':
                       matchesRule = String(fieldValue || '').toLowerCase().startsWith(String(rule.value).toLowerCase());
                       break;
                   case 'endsWith':
                       matchesRule = String(fieldValue || '').toLowerCase().endsWith(String(rule.value).toLowerCase());
                       break;
                   case 'greaterThan':
                       matchesRule = Number(fieldValue) > Number(rule.value);
                       break;
                   case 'lessThan':
                       matchesRule = Number(fieldValue) < Number(rule.value);
                       break;
                   case 'between':
                       if (rule.value.includes(',')) {
                           const [min, max] = rule.value.split(',').map(v => Number(v.trim()));
                           matchesRule = Number(fieldValue) >= min && Number(fieldValue) <= max;
                       }
                       break;
                   default:
                       matchesRule = false;
               }
               
               // If rule matches and action is eliminate, tag the row
               if ((rule.action === 'eliminate' && matchesRule) || (rule.action === 'pass' && !matchesRule)) {
                   row.relevanceTag = `${filter.tagPrefix || 'filtered'}: ${rule.field} ${rule.operator} ${rule.value}`;
                   break;
               }
           }
           
           return row;
       });
   }

   mergeProcessedData(originalData, processedRows) {
       return originalData.map(row => {
           if (row.relevanceTag) {
               return row; // Keep already tagged rows
           }
           
           // Find matching processed row
           const processed = processedRows.find(p => {
               if (p.email && row.email) return p.email === row.email;
               if (p['organization.id'] && row['organization.id']) return p['organization.id'] === row['organization.id'];
               if (p.organization?.id && row.organization?.id) return p.organization.id === row.organization.id;
               
               return (p.first_name || p.fname) === (row.first_name || row.fname) && 
                      (p.last_name || p.lname) === (row.last_name || row.lname);
           });
           
           return processed || row;
       });
   }

   cancelProcessing() {
       this.isCancelling = true;
       this.addLog('Cancelling processing...');
       
       const currentStepId = this.pipeline[this.currentStepIndex];
       this.updateStepStatus(currentStepId, 'cancelled', 'Cancelled by user');
       
       this.isProcessing = false;
       this.isCancelling = false;
       this.processingComplete = true;
       
       this.addLog('Processing cancelled');
   }

   /**
    * Test API client connection before starting the pipeline
    */
   async testApiConnection() {
       try {
           this.addLog('Testing API client connection...');
           const result = await apiClient.testConnection();

           if (result.success) {
               this.addLog('API client connection successful.');
               return true;
           } else {
               this.addLog(`API client connection failed: ${result.message}`);
               this.error = new Error(`API client connection failed: ${result.message}`);
               return false;
           }
       } catch (error) {
           this.addLog(`API client connection error: ${error.message}`);
           this.error = error;
           return false;
       }
   }

   /**
    * Run the entire pipeline
    */
   async runPipeline(initialData, callbacks = {}) {
       this.setInitialData(initialData);

       if (callbacks) {
           this.setCallbacks(callbacks);
       }

       // Test API connection first
       const connectionSuccess = await this.testApiConnection();
       if (!connectionSuccess) {
           throw new Error('API connection test failed. Please check your proxy server and API keys.');
       }

       let continueProcessing = true;

       while (continueProcessing && !this.processingComplete && !this.error) {
           continueProcessing = await this.processCurrentStep();
       }

       // Store final results
       customEngineFileStorageService.storeProcessedData(this.processedData);

       return {
           completed: this.processingComplete,
           error: this.error,
           data: this.processedData,
           analytics: this.analytics
       };
   }
}

const defaultOrchestrator = new CustomEngineOrchestrator();
export { CustomEngineOrchestrator };
export default defaultOrchestrator;