// services/videocx/videoCXReportsService.js
import Papa from 'papaparse';

/**
 * Service for generating and downloading VideoCX reports
 */
class VideoCXReportsService {
  /**
   * Generate and download a CSV of processed VideoCX data
   * @param {Array} processedData - The processed lead data
   * @param {string} [filename] - Optional custom filename
   */
  downloadProcessedDataCsv(processedData, filename = null) {
    if (!processedData || processedData.length === 0) {
      console.error('No processed data to download');
      return { success: false, error: 'No data to download' };
    }

    try {
      // Prepare flattened data to ensure all columns are included
      const flattenedData = processedData.map(row => {
        // Start with basic data structure
        const flatRow = {
          // Default columns
          first_name: row.first_name || row.person?.first_name || row['person.first_name'] || '',
          last_name: row.last_name || row.person?.last_name || row['person.last_name'] || '',
          linkedin_url: row.linkedin_url || row.person?.linkedin_url || row['person.linkedin_url'] || '',
          email_address: row.email || row.person?.email || row['person.email'] || '',
          company: row.company || row.organization?.name || row['organization.name'] || '',
          position: row.position || row.person?.title || row['person.title'] || '',
          connected_on: row.connected_on || '',
          custom_prompt: row.customPrompt || '',

          // Add the tag column
          tag: row.relevanceTag || '',

          // Include entire JSON response 
          entire_json_response: row.entire_json_response || row.apollo_json || '',

          // Title relevance data
          titleRelevance: row.titleRelevance || '',

          // Apollo enrichment fields - person
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

          // Organization fields
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

          // Additional fields
          linkedin_profile_photo_url: row.linkedin_profile_photo_url || row.person?.photo_url || row['person.photo_url'] || '',
          
          // VideoCX-specific fields
          company_type: row.companyType || '',
          annual_report_pdf: row.annualReportUrl || '',
          financial_insights: Array.isArray(row.insights) ? row.insights.join('\n') : (row.insights || ''),
          
          // Include any other VideoCX-specific fields
          isPublicCompany: row.isPublicCompany !== undefined ? row.isPublicCompany.toString() : '',
          annualReportStatus: row.annualReportStatus || '',
          insightsSource: row.insightsSource || ''
        };

        return flatRow;
      });

      // Convert data to CSV
      const csv = Papa.unparse(flattenedData);

      // Set default filename if not provided
      const defaultFilename = `videocx_enriched_data_${new Date().toISOString().slice(0, 10)}.csv`;
      const finalFilename = filename || defaultFilename;

      // Create and download file
      this._downloadCsv(csv, finalFilename);

      return { success: true, message: `Downloaded ${processedData.length} records` };
    } catch (error) {
      console.error('Error downloading processed data CSV:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate and download a summary report of the VideoCX enrichment process
   * @param {Object} enrichmentState - State from the VideoCX orchestrator
   * @param {string} [filename] - Optional custom filename
   */
  downloadReportsCsv(enrichmentState, filename = null) {
    if (!enrichmentState) {
      console.error('No enrichment state to download');
      return { success: false, error: 'No enrichment state to download' };
    }

    try {
      // Log the enrichment state for debugging
      console.log("Downloading VideoCX report with enrichment state:", enrichmentState);

      // Ensure we have complete analytics by merging analytics from stepStatus where needed
      if (enrichmentState.stepStatus) {
        // Initialize analytics if not present
        if (!enrichmentState.analytics) {
          enrichmentState.analytics = {};
        }

        // For each step in the process status, ensure we have analytics
        Object.keys(enrichmentState.stepStatus).forEach(stepId => {
          if (enrichmentState.stepStatus[stepId].analytics) {
            // Initialize step analytics if not present
            if (!enrichmentState.analytics[stepId]) {
              enrichmentState.analytics[stepId] = {};
            }

            // Merge analytics from step status into main analytics
            enrichmentState.analytics[stepId] = {
              ...enrichmentState.analytics[stepId],
              ...enrichmentState.stepStatus[stepId].analytics
            };
          }
        });
      }

      // Create report rows
      const reportRows = this._generateReportRows(enrichmentState);

      // Convert to CSV
      const csv = Papa.unparse(reportRows);

      // Set default filename if not provided
      const defaultFilename = `videocx_enrichment_report_${new Date().toISOString().slice(0, 10)}.csv`;
      const finalFilename = filename || defaultFilename;

      // Create and download file
      this._downloadCsv(csv, finalFilename);

      return { success: true, message: `Downloaded report with ${reportRows.length} rows` };
    } catch (error) {
      console.error('Error downloading VideoCX reports CSV:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper function to create and download a CSV file
   * @param {string} csvContent - CSV content as string
   * @param {string} filename - Filename for download
   * @private
   */
  _downloadCsv(csvContent, filename) {
    // Create blob with CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create URL for the blob
    const url = URL.createObjectURL(blob);

    // Create link element
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    // Add to document, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up URL object
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Generate report rows from enrichment state for VideoCX
   * @param {Object} enrichmentState - State from the VideoCX orchestrator
   * @returns {Array} - Array of report rows
   * @private
   */
  _generateReportRows(enrichmentState) {
    const reportRows = [];
    const now = new Date().toISOString();
    const dateFormatted = now.slice(0, 10);
    const timeFormatted = now.slice(11, 19);
    const totalRows = enrichmentState.processedData?.length || 0;
    const originalRows = enrichmentState.originalCount || totalRows;

    // Define the VideoCX pipeline steps
    const pipeline = [
      'titleRelevance',
      'apolloEnrichment',
      'publicCompanyFilter',
      'fetchAnnualReports',
      'insightsExtraction'
    ];

    // Get step name mappings for display
    const stepNameMap = {
      'titleRelevance': 'Title Relevance Analysis',
      'apolloEnrichment': 'Apollo Lead Enrichment',
      'publicCompanyFilter': 'Public Company Detection',
      'fetchAnnualReports': 'Fetch Annual Reports',
      'insightsExtraction': 'Insights Extraction'
    };

    // Map API sources
    const apiSourceMap = {
      'titleRelevance': 'GPT',
      'apolloEnrichment': 'Apollo',
      'publicCompanyFilter': 'GPT',
      'fetchAnnualReports': 'Serper/GPT',
      'insightsExtraction': 'GPT'
    };

    console.log('Processing VideoCX pipeline steps:', pipeline);
    console.log('Available analytics:', enrichmentState.analytics);
    console.log('Available stepStatus:', enrichmentState.stepStatus);

    // Process each step in the pipeline
    pipeline.forEach(stepId => {
      // Get analytics for this step - check both analytics and stepStatus.analytics
      const stepAnalytics = enrichmentState.analytics?.[stepId] || {};
      const stepStatusAnalytics = enrichmentState.stepStatus?.[stepId]?.analytics || {};

      // Combine analytics from both sources
      const analytics = { ...stepAnalytics, ...stepStatusAnalytics };

      console.log(`Step ${stepId} analytics:`, analytics);

      // ------------- TIME CALCULATION -------------
      // Calculate time to run using multiple possible sources
      let timeToRun = 0;

      if (analytics.processingTimeSeconds !== undefined) {
        // Use direct processing time if available
        timeToRun = analytics.processingTimeSeconds;
      } else if (analytics.startTime && analytics.endTime) {
        // Calculate from timestamps
        timeToRun = (analytics.endTime - analytics.startTime) / 1000;
      } else if (analytics.startTimes && analytics.endTime) {
        // Handle typo in some services (startTimes instead of startTime)
        timeToRun = (analytics.endTime - analytics.startTimes) / 1000;
      }

      // ------------- CREDITS/TOKENS CALCULATION -------------
      // Get the credits or tokens used based on step type
      let creditsOrTokens = 0;

      if (stepId === 'titleRelevance') {
        creditsOrTokens = analytics.tokensUsed || 0;
      } else if (stepId === 'publicCompanyFilter') {
        creditsOrTokens = analytics.tokensUsed || 0;
      } else if (stepId === 'apolloEnrichment') {
        creditsOrTokens = analytics.creditsUsed || analytics.apolloFetches || 0;
      } else if (stepId === 'fetchAnnualReports') {
        creditsOrTokens = analytics.creditsUsed || 0;
      } else if (stepId === 'insightsExtraction') {
        creditsOrTokens = analytics.tokensUsed || 0;
      }

      // ------------- PROCESSED ROWS CALCULATION -------------
      // Calculate processed rows for this step
      const processedRowsForStep = analytics.totalProcessed || originalRows;

      // ------------- SUPABASE METRICS CALCULATION -------------
      // Calculate Supabase metrics
      const fetchedFromSupabase = analytics.supabaseHits || 0;
      let uploadsToSupabase = 0;

      // Determine uploads to Supabase based on step type
      if (stepId === 'apolloEnrichment') {
        uploadsToSupabase = analytics.apolloFetches || 0;
      } else if (stepId === 'fetchAnnualReports') {
        uploadsToSupabase = analytics.reportsFetched || 0;
      } else if (stepId === 'insightsExtraction') {
        uploadsToSupabase = analytics.insightsExtracted || 0;
      }

      // Get step-specific metrics
      let specificMetrics = "";
      
      if (stepId === 'titleRelevance') {
        specificMetrics = `Decision Makers: ${analytics.decisionMakerCount || 0}, Relevant: ${analytics.relevantCount || 0}, Irrelevant: ${analytics.irrelevantCount || 0}`;
      } else if (stepId === 'publicCompanyFilter') {
        specificMetrics = `Public: ${analytics.publicCount || 0}, Private: ${analytics.privateCount || 0}`;
      } else if (stepId === 'fetchAnnualReports') {
        specificMetrics = `Reports Found: ${analytics.reportsFetched || 0}, Not Found: ${analytics.reportsNotFound || 0}`;
      } else if (stepId === 'insightsExtraction') {
        specificMetrics = `With Insights: ${analytics.insightsExtracted || 0}, No Insights: ${analytics.insightsFailed || 0}`;
      }

      // ------------- CREATE ROW WITH ALL METRICS -------------
      // Create report row with all metrics
      const reportRow = {
        'Date': dateFormatted,
        'Time': timeFormatted,
        'Engine': 'VideoCX',
        'Step': stepNameMap[stepId] || stepId,
        'Total Rows': processedRowsForStep || 0,
        'Total Credits/Tokens': creditsOrTokens || 0,
        'Time to Run (seconds)': timeToRun.toFixed(2),
        'Average Credit/Row': processedRowsForStep > 0 ? (creditsOrTokens / processedRowsForStep).toFixed(6) : 0,
        'Average Time/Row (seconds)': processedRowsForStep > 0 && timeToRun > 0 ? (timeToRun / processedRowsForStep).toFixed(2) : 0,
        'API/Tool': apiSourceMap[stepId] || 'Unknown',
        'Supabase Hits': fetchedFromSupabase || 0,
        'Supabase Uploads': uploadsToSupabase || 0,
        'Specific Metrics': specificMetrics
      };

      // Add the row to our report
      reportRows.push(reportRow);
    });

    // Add a final summary row with totals
    const totalTime = pipeline.reduce((sum, stepId) => {
      const analytics = enrichmentState.analytics?.[stepId] || {};
      if (analytics.processingTimeSeconds) {
        return sum + analytics.processingTimeSeconds;
      } else if (analytics.startTime && analytics.endTime) {
        return sum + ((analytics.endTime - analytics.startTime) / 1000);
      }
      return sum;
    }, 0);

    const totalCredits = pipeline.reduce((sum, stepId) => {
      const analytics = enrichmentState.analytics?.[stepId] || {};
      if (stepId === 'titleRelevance' || stepId === 'publicCompanyFilter' || stepId === 'insightsExtraction') {
        return sum + (analytics.tokensUsed || 0);
      } else if (stepId === 'apolloEnrichment' || stepId === 'fetchAnnualReports') {
        return sum + (analytics.creditsUsed || 0);
      }
      return sum;
    }, 0);

    const summaryRow = {
      'Date': dateFormatted,
      'Time': timeFormatted,
      'Engine': 'VideoCX',
      'Step': 'TOTAL',
      'Total Rows': originalRows,
      'Total Credits/Tokens': totalCredits,
      'Time to Run (seconds)': totalTime.toFixed(2),
      'Average Credit/Row': originalRows > 0 ? (totalCredits / originalRows).toFixed(6) : 0,
      'Average Time/Row (seconds)': originalRows > 0 && totalTime > 0 ? (totalTime / originalRows).toFixed(2) : 0,
      'API/Tool': 'All',
      'Supabase Hits': '-',
      'Supabase Uploads': '-',
      'Specific Metrics': `Final Qualified Leads: ${enrichmentState.finalCount || 0}`
    };

    reportRows.push(summaryRow);

    return reportRows;
  }
}

// Create and export a singleton instance
const videoCXReportsService = new VideoCXReportsService();
export default videoCXReportsService;