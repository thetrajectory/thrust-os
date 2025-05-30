// services/custom-engine/customEngineFileStorageService.js
import Papa from 'papaparse';

class CustomEngineFileStorageService {
  constructor() {
    this.processedData = null;
    this.chunkSize = 1000; // Process in chunks of 1000 rows
    this.tempResults = [];
  }

  // Store processed data in memory
  storeProcessedData(data) {
    this.processedData = data;
    return true;
  }

  // Get the processed data
  getProcessedData() {
    return this.processedData || [];
  }

  // Process large datasets in chunks
  async processLargeDataset(data, processingFunction, progressCallback) {
    const totalRows = data.length;
    const chunks = Math.ceil(totalRows / this.chunkSize);
    let processedResults = [];

    for (let i = 0; i < chunks; i++) {
      const startIndex = i * this.chunkSize;
      const endIndex = Math.min(startIndex + this.chunkSize, totalRows);
      const chunk = data.slice(startIndex, endIndex);

      console.log(`Processing chunk ${i + 1}/${chunks} (${chunk.length} rows)`);

      try {
        const chunkResults = await processingFunction(chunk);
        processedResults = [...processedResults, ...chunkResults];

        // Report progress
        const progress = Math.floor(((i + 1) / chunks) * 100);
        if (progressCallback) {
          progressCallback(progress, `Processed ${endIndex}/${totalRows} rows`);
        }

        // Small delay to prevent overwhelming the APIs
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing chunk ${i + 1}:`, error);
        // Add error markers to failed chunk
        const errorChunk = chunk.map(row => ({
          ...row,
          processingError: error.message,
          chunkIndex: i + 1
        }));
        processedResults = [...processedResults, ...errorChunk];
      }
    }

    this.processedData = processedResults;
    return processedResults;
  }

  // Download processed data as CSV
  downloadProcessedDataCsv(data, filename = null) {
    if (!data || data.length === 0) {
      console.error('No processed data to download');
      return { success: false, error: 'No data to download' };
    }

    try {
      // Prepare flattened data
      const flattenedData = this._prepareFlattenedData(data);

      // Convert data to CSV
      const csv = Papa.unparse(flattenedData);

      // Set default filename if not provided
      const defaultFilename = `custom_engine_results_${new Date().toISOString().slice(0, 10)}.csv`;
      const finalFilename = filename || defaultFilename;

      // Create and download file
      this._downloadCsv(csv, finalFilename);

      return { success: true, message: `Downloaded ${data.length} records` };
    } catch (error) {
      console.error('Error downloading processed data CSV:', error);
      return { success: false, error: error.message };
    }
  }

  // Prepare flattened data structure for CSV export
  // Updated _prepareFlattenedData function with all fields
_prepareFlattenedData(data) {
  return data.map(row => {
    const flatRow = {
      // Basic information
      first_name: row.first_name || row.fname || '',
      last_name: row.last_name || row.lname || '',
      email: row.email || row.email_id || '',
      company: row.company || row.company_name || row['organization.name'] || '',
      position: row.position || row.title || row['person.title'] || '',
      linkedin_url: row.linkedin_url || row['person.linkedin_url'] || '',
      connected_on: row.connected_on || '',

      // Relevance tag
      relevance_tag: row.relevanceTag || '',

      // Prompt analysis
      prompt_analysis: row.promptAnalysis || '',

      // Apollo enrichment - Person data
      apollo_person_id: row.apollo_person_id || row['person.id'] || '',
      'entire json response':row.entire_json_response || row.apollo_json || '',
      'person.id': row['person.id'] || '',
      'person.first_name': row['person.first_name'] || row.person?.first_name || '',
      'person.last_name': row['person.last_name'] || row.person?.last_name || '',
      'person.name': row['person.name'] || row.person?.name || '',
      'person.linkedin_url': row['person.linkedin_url'] || row.person?.linkedin_url || '',
      'person.title': row['person.title'] || row.person?.title || '',
      'person.headline': row['person.headline'] || row.person?.headline || '',
      'person.email': row['person.email'] || row.person?.email || '',
      'person.email_status': row['person.email_status'] || row.person?.email_status || '',
      'person.photo_url': row['person.photo_url'] || row.person?.photo_url || '',
      'person.twitter_url': row['person.twitter_url'] || row.person?.twitter_url || '',
      'person.github_url': row['person.github_url'] || row.person?.github_url || '',
      'person.facebook_url': row['person.facebook_url'] || row.person?.facebook_url || '',
      'person.extrapolated_email_confidence': row['person.extrapolated_email_confidence'] || row.person?.extrapolated_email_confidence || '',
      'person.organization_id': row['person.organization_id'] || row.person?.organization_id || '',
      'person.state': row['person.state'] || row.person?.state || '',
      'person.city': row['person.city'] || row.person?.city || '',
      'person.country': row['person.country'] || row.person?.country || '',
      'person.departments': row['person.departments'] || (Array.isArray(row.person?.departments) ? row.person.departments.join(', ') : row.person?.departments || ''),
      'person.subdepartments': row['person.subdepartments'] || (Array.isArray(row.person?.subdepartments) ? row.person.subdepartments.join(', ') : row.person?.subdepartments || ''),
      'person.functions': row['person.functions'] || (Array.isArray(row.person?.functions) ? row.person.functions.join(', ') : row.person?.functions || ''),
      'person.seniority': row['person.seniority'] || row.person?.seniority || '',

      // Education and employment
      education: row.education || '',
      employment_history_summary: row.employment_history_summary || '',

      // Apollo enrichment - Organization data
      'organization.id': row['organization.id'] || row.organization?.id || '',
      'organization.name': row['organization.name'] || row.organization?.name || '',
      'organization.website_url': row['organization.website_url'] || row.organization?.website_url || '',
      'organization.linkedin_url': row['organization.linkedin_url'] || row.organization?.linkedin_url || '',
      'organization.founded_year': row['organization.founded_year'] || row.organization?.founded_year || '',
      'organization.logo_url': row['organization.logo_url'] || row.organization?.logo_url || '',
      'organization.primary_domain': row['organization.primary_domain'] || row.organization?.primary_domain || '',
      'organization.industry': row['organization.industry'] || row.organization?.industry || '',
      'organization.estimated_num_employees': row['organization.estimated_num_employees'] || row.organization?.estimated_num_employees || '',
      'organization.retail_location_count': row['organization.retail_location_count'] || row.organization?.retail_location_count || '',
      'organization.raw_address': row['organization.raw_address'] || row.organization?.raw_address || '',
      'organization.street_address': row['organization.street_address'] || row.organization?.street_address || '',
      'organization.city': row['organization.city'] || row.organization?.city || '',
      'organization.state': row['organization.state'] || row.organization?.state || '',
      'organization.postal_code': row['organization.postal_code'] || row.organization?.postal_code || '',
      'organization.country': row['organization.country'] || row.organization?.country || '',
      'organization.seo_description': row['organization.seo_description'] || row.organization?.seo_description || '',
      'organization.short_description': row['organization.short_description'] || row.organization?.short_description || '',
      'organization.total_funding': row['organization.total_funding'] || row.organization?.total_funding || '',
      'organization.latest_funding_round_date': row['organization.latest_funding_round_date'] || row.organization?.latest_funding_round_date || '',
      'organization.technology_names': row['organization.technology_names'] ||
          (Array.isArray(row.organization?.technology_names) ? row.organization.technology_names.join(', ') : row.organization?.technology_names || ''),
      'organization.current_technologies': row['organization.current_technologies'] || '',
      'organization.current_technology_categories': row['organization.current_technology_categories'] || '',

      // Serper enrichment
      serper_insights: row.serper_insights || '',

      // Financial data - Include both camelCase and snake_case versions
      financial_insights: row.financialInsights || row.financial_insights || '',
      
      // Company type and annual report data
      company_type: row.companyType || '',
      annual_report_url: row.annualReportUrl || '',
      annual_report_text_status: row.annualReportTextStatus || '',
      annual_report_raw_text_length: row.annualReportRawText ? String(row.annualReportRawText.length) : '',

      // Job openings data
      open_jobs_count: row.open_jobs_count || 0,
      job_insights: row.job_insights || '',

      // Apollo additional analyses
      website_analysis: row.website_analysis || '',
      experience_analysis: row.experience_analysis || '',
      sitemap_analysis: row.sitemap_analysis || '',
      website_sitemaps: row.website_sitemap || ''
    };

    return flatRow;
  });
}

  // Helper function to download CSV
  _downloadCsv(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Generate processing report
generateProcessingReport(data, analytics) {
  if (!data || data.length === 0) {
      return { success: false, error: 'No data to report' };
  }

  try {
      const reportData = [
          {
              'Metric': 'Total Rows Processed',
              'Value': data.length
          },
          {
              'Metric': 'Successfully Processed', 
              'Value': data.filter(row => !row.processingError).length
          },
          {
              'Metric': 'Processing Errors',
              'Value': data.filter(row => row.processingError).length
          },
          {
              'Metric': 'Qualified Leads',
              'Value': data.filter(row => !row.relevanceTag && !row.processingError).length
          },
          {
              'Metric': 'Tagged/Filtered Leads',
              'Value': data.filter(row => row.relevanceTag).length
          }
      ];

      // ENHANCED: Get metrics from MetricsStorageService instead of analytics
      let stepMetricsToProcess = [];
      
      // Try to get metrics from MetricsStorageService first
      try {
          const MetricsStorageService = require('../analytics/MetricsStorageService').default;
          MetricsStorageService.loadMetrics();
          const storedMetrics = MetricsStorageService.getAllMetrics();
          
          if (storedMetrics && storedMetrics.stepMetrics && storedMetrics.stepMetrics.length > 0) {
              stepMetricsToProcess = storedMetrics.stepMetrics;
              console.log('📊 Using stored metrics for report:', stepMetricsToProcess.length, 'steps');
          }
      } catch (error) {
          console.log('⚠️ Could not load from MetricsStorageService, using analytics fallback');
      }
      
      // Fallback to analytics if no stored metrics
      if (stepMetricsToProcess.length === 0 && analytics && analytics.stepMetrics) {
          stepMetricsToProcess = analytics.stepMetrics;
          console.log('📊 Using analytics fallback for report:', stepMetricsToProcess.length, 'steps');
      }

      // ENHANCED: Process all step metrics INCLUDING Apollo substeps
      if (stepMetricsToProcess && Array.isArray(stepMetricsToProcess)) {
          // Sort to ensure main steps come before substeps
          const sortedMetrics = stepMetricsToProcess.sort((a, b) => {
              // Main steps first, then substeps
              const aIsSubstep = a.specificMetrics?.isSubstep || false;
              const bIsSubstep = b.specificMetrics?.isSubstep || false;
              
              if (aIsSubstep === bIsSubstep) {
                  return a.stepName.localeCompare(b.stepName);
              }
              return aIsSubstep ? 1 : -1;
          });

          sortedMetrics.forEach((metric, index) => {
              const stepName = metric.stepName || `Step ${index + 1}`;
              
              // ENHANCED: Better display names for steps and substeps
              let displayName;
              const isSubstep = metric.specificMetrics?.isSubstep;
              
              if (isSubstep) {
                  const substepDisplayNames = {
                      'apolloEnrichment_website': '  └─ Website Analysis',
                      'apolloEnrichment_experience': '  └─ Employee History Analysis',
                      'apolloEnrichment_sitemap': '  └─ Sitemaps Scraping'
                  };
                  displayName = substepDisplayNames[stepName] || `  └─ ${stepName.replace('apolloEnrichment_', '').toUpperCase()} Analysis`;
              } else {
                  const mainStepDisplayNames = {
                      'apolloEnrichment': 'Apollo Enrichment',
                      'promptAnalysis': 'Prompt Analysis',
                      'financialInsight': 'Financial Insight',
                      'jobOpenings': 'Job Openings',
                      'serperEnrichment': 'Serper Enrichment'
                  };
                  displayName = mainStepDisplayNames[stepName] || stepName;
              }
              
              // Add all metrics for this step/substep
              reportData.push({
                  'Metric': `${displayName} - Input Count`,
                  'Value': metric.inputCount || 0
              });
              reportData.push({
                  'Metric': `${displayName} - Output Count`, 
                  'Value': metric.outputCount || 0
              });
              reportData.push({
                  'Metric': `${displayName} - Filtered Count`,
                  'Value': metric.filteredCount || 0
              });
              reportData.push({
                  'Metric': `${displayName} - Processing Time (ms)`,
                  'Value': metric.processingTime || 0
              });
              
              // ENHANCED: Get actual token/credit values from stored metrics
              const tokensUsed = metric.tokensUsed || 0;
              const creditsUsed = metric.creditsUsed || 0;
              const supabaseHits = metric.supabaseHits || 0;
              
              reportData.push({
                  'Metric': `${displayName} - Tokens Used`,
                  'Value': tokensUsed
              });
              reportData.push({
                  'Metric': `${displayName} - Credits Used`,
                  'Value': creditsUsed
              });
              reportData.push({
                  'Metric': `${displayName} - API Calls`,
                  'Value': metric.apiCalls || 0
              });
              reportData.push({
                  'Metric': `${displayName} - Supabase Hits`,
                  'Value': supabaseHits
              });
              reportData.push({
                  'Metric': `${displayName} - Errors`,
                  'Value': metric.errors || 0
              });
              reportData.push({
                  'Metric': `${displayName} - API/Tool`,
                  'Value': metric.apiTool || 'Internal'
              });
              reportData.push({
                  'Metric': `${displayName} - Avg Tokens/Row`,
                  'Value': metric.avgTokensPerRow ? metric.avgTokensPerRow.toFixed(3) : 
                           (metric.inputCount > 0 && tokensUsed > 0 ? (tokensUsed / metric.inputCount).toFixed(3) : '0')
              });
              reportData.push({
                  'Metric': `${displayName} - Avg Time/Row (sec)`,
                  'Value': metric.avgTimePerRow ? metric.avgTimePerRow.toFixed(4) : 
                           (metric.inputCount > 0 && metric.processingTime > 0 ? ((metric.processingTime / 1000) / metric.inputCount).toFixed(4) : '0')
              });

              // Add specific metrics if available
              if (metric.specificMetrics && Object.keys(metric.specificMetrics).length > 0) {
                  const specificMetrics = metric.specificMetrics;
                  
                  Object.keys(specificMetrics).forEach(key => {
                      if (!['isSubstep', 'parentStep', 'substepType', 'isMainStep', 'hasSubsteps', 'description'].includes(key)) {
                          reportData.push({
                              'Metric': `${displayName} - ${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}`,
                              'Value': specificMetrics[key]
                          });
                      }
                  });
              }
              
              console.log(`📊 Added report data for: ${displayName} (Tokens: ${tokensUsed}, Credits: ${creditsUsed}, Supabase: ${supabaseHits})`);
          });
      }

      // ENHANCED: Calculate accurate totals from processed metrics
      const totalTokens = stepMetricsToProcess?.reduce((sum, metric) => sum + (metric.tokensUsed || 0), 0) || 0;
      const totalCredits = stepMetricsToProcess?.reduce((sum, metric) => sum + (metric.creditsUsed || 0), 0) || 0;
      const totalTime = stepMetricsToProcess?.reduce((sum, metric) => sum + (metric.processingTime || 0), 0) || 0;
      const totalApiCalls = stepMetricsToProcess?.reduce((sum, metric) => sum + (metric.apiCalls || 0), 0) || 0;
      const totalSupabaseHits = stepMetricsToProcess?.reduce((sum, metric) => sum + (metric.supabaseHits || 0), 0) || 0;

      reportData.push({
          'Metric': 'TOTAL - All Steps Combined',
          'Value': ''
      });
      reportData.push({
          'Metric': 'TOTAL - Tokens Used',
          'Value': totalTokens
      });
      reportData.push({
          'Metric': 'TOTAL - Credits Used',
          'Value': totalCredits
      });
      reportData.push({
          'Metric': 'TOTAL - API Calls',
          'Value': totalApiCalls
      });
      reportData.push({
          'Metric': 'TOTAL - Supabase Hits',
          'Value': totalSupabaseHits
      });
      reportData.push({
          'Metric': 'TOTAL - Processing Time (minutes)',
          'Value': totalTime > 0 ? (totalTime / 60000).toFixed(2) : '0'
      });

      console.log(`📊 Final report totals - Steps: ${stepMetricsToProcess.length}, Tokens: ${totalTokens}, Credits: ${totalCredits}, Supabase: ${totalSupabaseHits}`);

      // Convert to CSV and download
      const csv = Papa.unparse(reportData);
      const filename = `custom_engine_report_${new Date().toISOString().slice(0, 10)}.csv`;
      this._downloadCsv(csv, filename);

      return { success: true, message: `Processing report downloaded with ${stepMetricsToProcess.length} steps including Apollo substeps` };
  } catch (error) {
      console.error('Error generating processing report:', error);
      return { success: false, error: error.message };
  }
}
  

  // Clear stored data
  clearData() {
    this.processedData = null;
    this.tempResults = [];
  }

  // Get processing statistics
  getProcessingStats(data) {
    if (!data || data.length === 0) {
      return {
        totalRows: 0,
        processedRows: 0,
        errorRows: 0,
        qualifiedLeads: 0,
        taggedLeads: 0
      };
    }

    return {
      totalRows: data.length,
      processedRows: data.filter(row => !row.processingError).length,
      errorRows: data.filter(row => row.processingError).length,
      qualifiedLeads: data.filter(row => !row.relevanceTag && !row.processingError).length,
      taggedLeads: data.filter(row => row.relevanceTag).length
    };
  }
}

// Create and export a singleton instance
const customEngineFileStorageService = new CustomEngineFileStorageService();
export default customEngineFileStorageService;