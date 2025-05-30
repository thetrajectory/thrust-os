// services/analytics/EnhancedReportGenerator.js
import Papa from 'papaparse';

class EnhancedReportGenerator {
    
    /**
     * Generate comprehensive processing report
     */
    generateProcessingReport(analyticsData, engineName = 'Custom Engine') {
        const reportData = [];
        
        // Executive Summary
        reportData.push({ 'Category': 'EXECUTIVE SUMMARY', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Engine Name', 
            'Value': engineName, 
            'Unit': '', 
            'Notes': 'Name of the processing engine used' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Total Runtime', 
            'Value': this.formatDuration(analyticsData.pipeline.totalRuntime), 
            'Unit': 'HH:MM:SS', 
            'Notes': 'Total time from start to completion' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Total Rows Processed', 
            'Value': analyticsData.pipeline.totalRows, 
            'Unit': 'rows', 
            'Notes': 'Original input dataset size' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Qualified Leads', 
            'Value': analyticsData.pipeline.qualifiedRows, 
            'Unit': 'rows', 
            'Notes': 'Rows that passed all filters' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Filtered/Tagged Leads', 
            'Value': analyticsData.pipeline.filteredRows, 
            'Unit': 'rows', 
            'Notes': 'Rows filtered out during processing' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Error Rate', 
            'Value': ((analyticsData.pipeline.errorRows / analyticsData.pipeline.totalRows) * 100).toFixed(2), 
            'Unit': '%', 
            'Notes': 'Percentage of rows with processing errors' 
        });
        reportData.push({ 
            'Category': 'Pipeline Overview', 
            'Metric': 'Pass Rate', 
            'Value': ((analyticsData.pipeline.qualifiedRows / analyticsData.pipeline.totalRows) * 100).toFixed(2), 
            'Unit': '%', 
            'Notes': 'Percentage of qualified leads from original dataset' 
        });

        // Performance Metrics
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'PERFORMANCE METRICS', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 
            'Category': 'Performance', 
            'Metric': 'Average Time Per Row', 
            'Value': (analyticsData.pipeline.averageTimePerRow / 1000).toFixed(3), 
            'Unit': 'seconds', 
            'Notes': 'Average processing time per individual row' 
        });
        reportData.push({ 
            'Category': 'Performance', 
            'Metric': 'Throughput', 
            'Value': Math.round(analyticsData.pipeline.throughputPerMinute), 
            'Unit': 'rows/min', 
            'Notes': 'Processing speed in rows per minute' 
        });
        reportData.push({ 
            'Category': 'Performance', 
            'Metric': 'Average Step Latency', 
            'Value': (analyticsData.performance.averageLatencyMs / 1000).toFixed(3), 
            'Unit': 'seconds', 
            'Notes': 'Average time per processing step' 
        });

        if (analyticsData.performance.bottlenecks.length > 0) {
            reportData.push({ 
                'Category': 'Performance', 
                'Metric': 'Primary Bottleneck', 
                'Value': analyticsData.performance.bottlenecks[0].step, 
                'Unit': `${analyticsData.performance.bottlenecks[0].percentage.toFixed(1)}% of total time`, 
                'Notes': 'Step consuming the most processing time' 
            });
        }

        if (analyticsData.performance.slowestStep) {
            reportData.push({ 
                'Category': 'Performance', 
                'Metric': 'Slowest Step', 
                'Value': analyticsData.performance.slowestStep.name, 
                'Unit': this.formatDuration(analyticsData.performance.slowestStep.runtime), 
                'Notes': 'Step with longest execution time' 
            });
        }

        if (analyticsData.performance.fastestStep) {
            reportData.push({ 
                'Category': 'Performance', 
                'Metric': 'Fastest Step', 
                'Value': analyticsData.performance.fastestStep.name, 
                'Unit': this.formatDuration(analyticsData.performance.fastestStep.runtime), 
                'Notes': 'Step with shortest execution time' 
            });
        }

        // Resource Usage
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'RESOURCE USAGE', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Total Tokens Used', 
            'Value': analyticsData.resources.totalTokensUsed.toLocaleString(), 
            'Unit': 'tokens', 
            'Notes': 'Total AI tokens consumed (OpenAI)' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Total Credits Used', 
            'Value': analyticsData.resources.totalCreditsUsed.toLocaleString(), 
            'Unit': 'credits', 
            'Notes': 'Total API credits consumed (Serper, Coresignal)' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Total API Calls', 
            'Value': analyticsData.resources.totalApiCalls.toLocaleString(), 
            'Unit': 'calls', 
            'Notes': 'Total external API requests made' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Average Tokens Per Row', 
            'Value': analyticsData.resources.averageTokensPerRow.toFixed(2), 
            'Unit': 'tokens/row', 
            'Notes': 'Token efficiency per processed row' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Average Credits Per Row', 
            'Value': analyticsData.resources.averageCreditsPerRow.toFixed(3), 
            'Unit': 'credits/row', 
            'Notes': 'Credit efficiency per processed row' 
        });

        // Cost Estimates
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Estimated Token Cost', 
            'Value': `$${analyticsData.resources.tokenCostEstimate.toFixed(4)}`, 
            'Unit': 'USD', 
            'Notes': 'Estimated cost for AI token usage' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Estimated Credit Cost', 
            'Value': `$${analyticsData.resources.creditCostEstimate.toFixed(4)}`, 
            'Unit': 'USD', 
            'Notes': 'Estimated cost for API credits' 
        });
        reportData.push({ 
            'Category': 'Resources', 
            'Metric': 'Total Estimated Cost', 
            'Value': `$${(analyticsData.resources.tokenCostEstimate + analyticsData.resources.creditCostEstimate).toFixed(4)}`, 
            'Unit': 'USD', 
            'Notes': 'Combined estimated processing cost' 
        });

        // Service-Specific Metrics
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'SERVICE BREAKDOWN', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });

        // OpenAI Metrics
        if (analyticsData.services.openai.totalTokens > 0) {
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'API Calls', 
                'Value': analyticsData.services.openai.apiCalls, 
                'Unit': 'calls', 
                'Notes': 'Total OpenAI API requests' 
            });
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'Total Tokens', 
                'Value': analyticsData.services.openai.totalTokens.toLocaleString(), 
                'Unit': 'tokens', 
                'Notes': 'Combined prompt + completion tokens' 
            });
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'Prompt Tokens', 
                'Value': analyticsData.services.openai.promptTokens.toLocaleString(), 
                'Unit': 'tokens', 
                'Notes': 'Tokens used for input prompts' 
            });
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'Completion Tokens', 
                'Value': analyticsData.services.openai.completionTokens.toLocaleString(), 
                'Unit': 'tokens', 
                'Notes': 'Tokens generated in responses' 
            });
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'Average Tokens Per Call', 
                'Value': Math.round(analyticsData.services.openai.averageTokensPerCall), 
                'Unit': 'tokens/call', 
                'Notes': 'Token efficiency per API call' 
            });
            reportData.push({ 
                'Category': 'OpenAI', 
                'Metric': 'Success Rate', 
                'Value': analyticsData.services.openai.successRate.toFixed(1), 
                'Unit': '%', 
                'Notes': 'Percentage of successful API calls' 
            });
        }

        // Apollo Metrics
        if (analyticsData.services.apollo.apiCalls > 0 || analyticsData.services.apollo.cacheHits > 0) {
            reportData.push({ 
                'Category': 'Apollo', 
                'Metric': 'API Calls', 
                'Value': analyticsData.services.apollo.apiCalls, 
                'Unit': 'calls', 
                'Notes': 'Direct Apollo API requests' 
            });
            reportData.push({ 
                'Category': 'Apollo', 
                'Metric': 'Cache Hits', 
                'Value': analyticsData.services.apollo.cacheHits, 
                'Unit': 'hits', 
                'Notes': 'Requests served from Supabase cache' 
            });
            reportData.push({ 
                'Category': 'Apollo', 
                'Metric': 'Cache Efficiency', 
                'Value': analyticsData.services.apollo.cacheEfficiency.toFixed(1), 
                'Unit': '%', 
                'Notes': 'Percentage of requests served from cache' 
            });
            reportData.push({ 
                'Category': 'Apollo', 
                'Metric': 'Success Rate', 
                'Value': analyticsData.services.apollo.successRate.toFixed(1), 
                'Unit': '%', 
                'Notes': 'Percentage of successful enrichments' 
            });
        }

        // Serper Metrics
        if (analyticsData.services.serper.creditsUsed > 0) {
            reportData.push({ 
                'Category': 'Serper', 
                'Metric': 'Search Queries', 
                'Value': analyticsData.services.serper.searchQueries, 
                'Unit': 'queries', 
                'Notes': 'Google search API calls' 
            });
            reportData.push({ 
                'Category': 'Serper', 
                'Metric': 'Scraping Requests', 
                'Value': analyticsData.services.serper.scrapingRequests, 
                'Unit': 'requests', 
                'Notes': 'Website scraping API calls' 
            });
            reportData.push({ 
                'Category': 'Serper', 
                'Metric': 'Credits Used', 
                'Value': analyticsData.services.serper.creditsUsed, 
                'Unit': 'credits', 
                'Notes': 'Total Serper credits consumed' 
            });
            reportData.push({ 
                'Category': 'Serper', 
                'Metric': 'Success Rate', 
                'Value': analyticsData.services.serper.successRate.toFixed(1), 
                'Unit': '%', 
                'Notes': 'Percentage of successful requests' 
            });
        }

        // Coresignal Metrics
        if (analyticsData.services.coresignal.creditsUsed > 0) {
            reportData.push({ 
                'Category': 'Coresignal', 
                'Metric': 'Search Queries', 
                'Value': analyticsData.services.coresignal.searchQueries, 
                'Unit': 'queries', 
                'Notes': 'Company search requests' 
            });
            reportData.push({ 
                'Category': 'Coresignal', 
                'Metric': 'Collect Requests', 
                'Value': analyticsData.services.coresignal.collectRequests, 
                'Unit': 'requests', 
                'Notes': 'Data collection requests' 
            });
            reportData.push({ 
                'Category': 'Coresignal', 
                'Metric': 'Credits Used', 
                'Value': analyticsData.services.coresignal.creditsUsed, 
                'Unit': 'credits', 
                'Notes': 'Total Coresignal credits consumed' 
            });
            reportData.push({ 
                'Category': 'Coresignal', 
                'Metric': 'Success Rate', 
                'Value': analyticsData.services.coresignal.successRate.toFixed(1), 
                'Unit': '%', 
                'Notes': 'Percentage of successful requests' 
            });
        }

        // Step-by-Step Analysis
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'STEP-BY-STEP ANALYSIS', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });

        Object.keys(analyticsData.steps).forEach((stepName, index) => {
            const step = analyticsData.steps[stepName];
            
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Input Rows', 
                'Value': step.inputRows, 
                'Unit': 'rows', 
                'Notes': 'Rows processed in this step' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Output Rows', 
                'Value': step.outputRows, 
                'Unit': 'rows', 
                'Notes': 'Rows successfully processed' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Filtered Rows', 
                'Value': step.filteredRows, 
                'Unit': 'rows', 
                'Notes': 'Rows filtered out by this step' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Error Rows', 
                'Value': step.errorRows, 
                'Unit': 'rows', 
                'Notes': 'Rows with processing errors' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Runtime', 
                'Value': this.formatDuration(step.runtime), 
                'Unit': 'HH:MM:SS', 
                'Notes': 'Time taken for this step' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Tokens Used', 
                'Value': step.tokensUsed.toLocaleString(), 
                'Unit': 'tokens', 
                'Notes': 'AI tokens consumed in this step' 
            });
            reportData.push({ 
                'Category': `Step ${index + 1}: ${stepName}`, 
                'Metric': 'Credits Used', 
                'Value': step.creditsUsed, 
                'Unit': 'credits', 
                'Notes': 'API credits consumed in this step'
            });
            reportData.push({
                'Category': `Step ${index + 1}: ${stepName}`,
                'Metric': 'API Calls',
                'Value': step.apiCalls,
                'Unit': 'calls',
                'Notes': 'External API requests made'
            });
            reportData.push({
                'Category': `Step ${index + 1}: ${stepName}`,
                'Metric': 'Success Rate',
                'Value': step.successRate.toFixed(1),
                'Unit': '%',
                'Notes': 'Percentage of successful processing'
            });
            reportData.push({
                'Category': `Step ${index + 1}: ${stepName}`,
                'Metric': 'Avg Time Per Row',
                'Value': (step.averageTimePerRow / 1000).toFixed(3),
                'Unit': 'seconds',
                'Notes': 'Average processing time per row'
            });
            reportData.push({
                'Category': `Step ${index + 1}: ${stepName}`,
                'Metric': 'Throughput',
                'Value': Math.round(step.throughputPerMinute),
                'Unit': 'rows/min',
                'Notes': 'Processing speed for this step'
            });
        });
       // Quality Metrics
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'QUALITY METRICS', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 
            'Category': 'Quality', 
            'Metric': 'Data Completeness', 
            'Value': analyticsData.quality.dataCompleteness.toFixed(1), 
            'Unit': '%', 
            'Notes': 'Percentage of rows successfully processed' 
        });
        reportData.push({ 
            'Category': 'Quality', 
            'Metric': 'Data Accuracy', 
            'Value': analyticsData.quality.dataAccuracy.toFixed(1), 
            'Unit': '%', 
            'Notes': 'Percentage of error-free processing' 
        });
      
        // Recommendations
        reportData.push({ 'Category': '', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        reportData.push({ 'Category': 'RECOMMENDATIONS', 'Metric': '', 'Value': '', 'Unit': '', 'Notes': '' });
        
        const recommendations = this.generateRecommendations(analyticsData);
        recommendations.forEach((rec, index) => {
            reportData.push({ 
                'Category': 'Recommendations', 
                'Metric': `Recommendation ${index + 1}`, 
                'Value': rec.title, 
                'Unit': '', 
                'Notes': rec.description 
            });
        });
      
    return reportData;
}

/**
* Generate actionable recommendations based on analytics
*/
generateRecommendations(analyticsData) {
  const recommendations = [];

  // Performance recommendations
  if (analyticsData.performance.bottlenecks.length > 0) {
      const primaryBottleneck = analyticsData.performance.bottlenecks[0];
      recommendations.push({
          title: 'Optimize Primary Bottleneck',
          description: `The ${primaryBottleneck.step} step consumes ${primaryBottleneck.percentage.toFixed(1)}% of total processing time. Consider optimizing this step or increasing batch sizes.`
      });
  }

  // Resource efficiency recommendations
  if (analyticsData.resources.averageTokensPerRow > 1000) {
      recommendations.push({
          title: 'Optimize Token Usage',
          description: `High token usage detected (${analyticsData.resources.averageTokensPerRow.toFixed(0)} tokens/row). Consider shortening prompts or using more efficient models.`
      });
  }

  // Cache efficiency recommendations
  if (analyticsData.services.apollo.cacheEfficiency < 50 && analyticsData.services.apollo.cacheHits > 0) {
      recommendations.push({
          title: 'Improve Cache Strategy',
          description: `Apollo cache efficiency is ${analyticsData.services.apollo.cacheEfficiency.toFixed(1)}%. Consider processing similar datasets together to improve cache hit rates.`
      });
  }

  // Error rate recommendations
  const errorRate = (analyticsData.pipeline.errorRows / analyticsData.pipeline.totalRows) * 100;
  if (errorRate > 5) {
      recommendations.push({
          title: 'Reduce Error Rate',
          description: `Error rate is ${errorRate.toFixed(1)}%. Review data quality and add validation steps to improve processing reliability.`
      });
  }

  // Cost optimization recommendations
  const totalCost = analyticsData.resources.tokenCostEstimate + analyticsData.resources.creditCostEstimate;
  if (totalCost > 10) {
      recommendations.push({
          title: 'Consider Cost Optimization',
          description: `Total estimated cost is $${totalCost.toFixed(2)}. For regular processing, consider implementing more aggressive caching or using cheaper API alternatives where possible.`
      });
  }

  // Throughput recommendations
  if (analyticsData.pipeline.throughputPerMinute < 10) {
      recommendations.push({
          title: 'Improve Processing Speed',
          description: `Current throughput is ${Math.round(analyticsData.pipeline.throughputPerMinute)} rows/min. Consider increasing batch sizes or parallel processing to improve speed.`
      });
  }

  return recommendations;
}

/**
* Format duration in milliseconds to HH:MM:SS
*/
formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
* Generate CSV report
*/
generateCSVReport(analyticsData, engineName = 'Custom Engine', filename = null) {
  const reportData = this.generateProcessingReport(analyticsData, engineName);
  const csv = Papa.unparse(reportData);
  
  // Set default filename if not provided
  const defaultFilename = `processing_report_${engineName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  const finalFilename = filename || defaultFilename;

  // Create and download file
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', finalFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
      URL.revokeObjectURL(url);
  }, 100);

  return { success: true, filename: finalFilename, rows: reportData.length };
}

/**
* Generate executive summary
*/
generateExecutiveSummary(analyticsData, engineName = 'Custom Engine') {
  const pipeline = analyticsData.pipeline;
  const resources = analyticsData.resources;
  const performance = analyticsData.performance;

  return {
      engineName,
      processingDate: new Date().toISOString().split('T')[0],
      summary: {
          totalRuntime: this.formatDuration(pipeline.totalRuntime),
          totalRows: pipeline.totalRows,
          qualifiedLeads: pipeline.qualifiedRows,
          passRate: ((pipeline.qualifiedRows / pipeline.totalRows) * 100).toFixed(1) + '%',
          errorRate: ((pipeline.errorRows / pipeline.totalRows) * 100).toFixed(1) + '%',
          avgTimePerRow: (pipeline.averageTimePerRow / 1000).toFixed(3) + ' seconds',
          throughput: Math.round(pipeline.throughputPerMinute) + ' rows/min'
      },
      resources: {
          totalTokens: resources.totalTokensUsed.toLocaleString(),
          totalCredits: resources.totalCreditsUsed.toLocaleString(),
          totalApiCalls: resources.totalApiCalls.toLocaleString(),
          estimatedCost: '$' + (resources.tokenCostEstimate + resources.creditCostEstimate).toFixed(4),
          tokenEfficiency: resources.averageTokensPerRow.toFixed(2) + ' tokens/row',
          creditEfficiency: resources.averageCreditsPerRow.toFixed(3) + ' credits/row'
      },
      performance: {
          bottleneck: performance.bottlenecks.length > 0 ? performance.bottlenecks[0].step : 'None detected',
          slowestStep: performance.slowestStep ? performance.slowestStep.name : 'N/A',
          fastestStep: performance.fastestStep ? performance.fastestStep.name : 'N/A',
          avgLatency: (performance.averageLatencyMs / 1000).toFixed(3) + ' seconds'
      }
  };
}
}
const enhancedReportGenerator = new EnhancedReportGenerator();
export default enhancedReportGenerator;
