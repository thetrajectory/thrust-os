// services/find-advisor/reportsService.jsx
import Papa from 'papaparse';
import fileStorageService from './fileStorageService';

/**
 * Service for generating and downloading Advisor Finder reports
 */
class AdvisorFinderReportsService {
  /**
   * Generate and download a CSV of processed data
   * @param {Array} processedData - The processed lead data
   * @param {string} [filename] - Optional custom filename
   */
  downloadProcessedDataCsv(processedData, filename = null) {
    if (!processedData || processedData.length === 0) {
      console.error('No processed data to download');
      return { success: false, error: 'No data to download' };
    }

    try {
      // For large datasets, delegate to the file service
      if (processedData.length > 50) {
        return fileStorageService.downloadProcessedDataCsv(processedData, filename);
      }

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
          connection_time: row.connectionTime || '', // Added connection time

          // Tag column
          tag: row.relevanceTag || '',

          // Title relevance data
          titleRelevance: row.titleRelevance || '',

          // Connection Time Analysis
          connectionTime: row.connectionTime || '',

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
          employment_history_summary: row.employment_history_summary || '',

          // Organization fields
          'organization.id': row['organization.id'] || row.organization?.id || '',
          'organization.name': row['organization.name'] || row.organization?.name || '',
          'organization.website_url': row['organization.website_url'] || row.organization?.website_url || '',
          'organization.linkedin_url': row['organization.linkedin_url'] || row.organization?.linkedin_url || '',
          'organization.industry': row['organization.industry'] || row.organization?.industry || '',
          'organization.estimated_num_employees': row['organization.estimated_num_employees'] || row.organization?.estimated_num_employees || '',
          'organization.short_description': row['organization.short_description'] || row.organization?.short_description || '',

          // Raw OpenAI advisor analysis response
          advisorAnalysisResponse: row.advisorAnalysisResponse || '',
        };

        return flatRow;
      });

      // Convert data to CSV
      const csv = Papa.unparse(flattenedData);

      // Set default filename if not provided
      const defaultFilename = `advisor_finder_data_${new Date().toISOString().slice(0, 10)}.csv`;
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
   * Generate and download a summary report of the advisor finder process
   * @param {Object} enrichmentState - State from the enrichment orchestrator
   * @param {string} [filename] - Optional custom filename
   */
  downloadReportsCsv(enrichmentState, filename = null) {
    if (!enrichmentState) {
      console.error('No enrichment state to download');
      return { success: false, error: 'No enrichment state to download' };
    }

    try {
      // Create report rows
      const reportRows = this._generateReportRows(enrichmentState);

      // Convert to CSV
      const csv = Papa.unparse(reportRows);

      // Set default filename if not provided
      const defaultFilename = `advisor_finder_report_${new Date().toISOString().slice(0, 10)}.csv`;
      const finalFilename = filename || defaultFilename;

      // Create and download file
      this._downloadCsv(csv, finalFilename);

      return { success: true, message: `Downloaded report with ${reportRows.length} rows` };
    } catch (error) {
      console.error('Error downloading advisor finder reports CSV:', error);
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
   * Generate report rows from enrichment state
   * @param {Object} enrichmentState - State from the enrichment orchestrator
   * @returns {Array} - Array of report rows
   * @private
   */
  _generateReportRows(enrichmentState) {
    const reportRows = [];
    const now = new Date().toISOString();
    const dateFormatted = now.slice(0, 10);
    const timeFormatted = now.slice(11, 19);

    // Safely access data with fallbacks
    const totalRows = enrichmentState.processedData?.length || 0;
    const originalRows = enrichmentState.originalCount || totalRows ||
      enrichmentState.csvData?.length || 100; // Fallback to reasonable default

    console.log(`Total rows: ${totalRows}, Original rows: ${originalRows}`);

    // Define the advisor finder pipeline steps
    const pipeline = [
      'titleRelevance',
      'apolloEnrichment',
      'employmentHistoryAnalysis',
      'connectionTimeAnalysis'
    ];

    // Get step name mappings for display
    const stepNameMap = {
      'titleRelevance': 'Title Relevance Analysis',
      'apolloEnrichment': 'Apollo Lead Enrichment',
      'employmentHistoryAnalysis': 'Employment History Analysis',
      'connectionTimeAnalysis': 'Connection Time Analysis'
    };

    // Map API sources
    const apiSourceMap = {
      'titleRelevance': 'GPT',
      'apolloEnrichment': 'Apollo',
      'employmentHistoryAnalysis': 'GPT',
      'connectionTimeAnalysis': 'Internal'
    };

    // Process each step in the pipeline
    pipeline.forEach(stepId => {
      // Get analytics for this step with fallbacks to prevent errors
      const analytics = enrichmentState.analytics?.[stepId] || {};

      console.log(`Processing analytics for step ${stepId}:`, analytics);

      // Calculate time to run with multiple fallbacks
      let timeToRun = 0;
      if (typeof analytics.processingTimeSeconds === 'number') {
        timeToRun = analytics.processingTimeSeconds;
      } else if (analytics.startTime && analytics.endTime) {
        timeToRun = (analytics.endTime - analytics.startTime) / 1000;
      } else if (analytics.startTimestamp && analytics.endTimestamp) {
        // Alternative key names
        timeToRun = (analytics.endTimestamp - analytics.startTimestamp) / 1000;
      }

      console.log(`Time to run for ${stepId}: ${timeToRun.toFixed(2)} seconds`);

      // Get tokens or credits used
      let tokensOrCredits = 0;
      if (stepId === 'titleRelevance' || stepId === 'employmentHistoryAnalysis') {
        tokensOrCredits = analytics.tokensUsed || 0;
      } else if (stepId === 'apolloEnrichment') {
        tokensOrCredits = analytics.apolloFetches || analytics.creditsUsed || 0;
      }

      console.log(`Tokens/Credits for ${stepId}: ${tokensOrCredits}`);

      // Calculate processed rows - try multiple approaches
      let processedRowsForStep = 0;

      if (typeof analytics.totalProcessed === 'number') {
        processedRowsForStep = analytics.totalProcessed;
      } else if (typeof analytics.processedCount === 'number') {
        processedRowsForStep = analytics.processedCount;
      } else {
        // If no specific count, use total rows as default
        processedRowsForStep = originalRows;
      }

      console.log(`Processed rows for ${stepId}: ${processedRowsForStep}`);

      // Get step-specific metrics with safe access
      let specificMetrics = "";

      if (stepId === 'titleRelevance') {
        specificMetrics = `Founder: ${analytics.founderCount || 0}, Relevant: ${analytics.relevantCount || 0}, Irrelevant: ${analytics.irrelevantCount || 0}`;
      } else if (stepId === 'apolloEnrichment') {
        specificMetrics = `From Supabase: ${analytics.supabaseHits || 0}, From Apollo: ${analytics.apolloFetches || 0}`;
      } else if (stepId === 'employmentHistoryAnalysis') {
        const rowsWithResponse = analytics.rowsWithResponses ||
          (enrichmentState.processedData?.filter(row => row.advisorAnalysisResponse)?.length || 0);

        specificMetrics = `Processed: ${analytics.processedCount || 0}, Rows with response: ${rowsWithResponse}`;
      } else if (stepId === 'connectionTimeAnalysis') {
        specificMetrics = `Connections analyzed: ${processedRowsForStep || 0}`;
      }

      // Create row for the report
      const reportRow = {
        'Date': dateFormatted,
        'Time': timeFormatted,
        'Engine': 'Advisor Finder',
        'Step': stepNameMap[stepId] || stepId,
        'Total Rows': processedRowsForStep || 0,
        'Total Tokens/Credits': tokensOrCredits || 0,
        'Time to Run (seconds)': timeToRun.toFixed(2),
        'Average Token/Row': processedRowsForStep > 0 ? (tokensOrCredits / processedRowsForStep).toFixed(2) : 0,
        'Average Time/Row (seconds)': processedRowsForStep > 0 && timeToRun > 0 ? (timeToRun / processedRowsForStep).toFixed(4) : 0,
        'API/Tool': apiSourceMap[stepId] || 'Unknown',
        'Supabase Hits': analytics.supabaseHits || 0,
        'Errors': analytics.errorCount || 0,
        'Specific Metrics': specificMetrics
      };

      // Add the row to our report
      reportRows.push(reportRow);
    });

    // Add a final summary row with totals
    const totalTime = pipeline.reduce((sum, stepId) => {
      const analytics = enrichmentState.analytics?.[stepId] || {};
      if (typeof analytics.processingTimeSeconds === 'number') {
        return sum + analytics.processingTimeSeconds;
      } else if (analytics.startTime && analytics.endTime) {
        return sum + ((analytics.endTime - analytics.startTime) / 1000);
      }
      return sum;
    }, 0);

    const totalTokens = pipeline.reduce((sum, stepId) => {
      const analytics = enrichmentState.analytics?.[stepId] || {};
      if (stepId === 'titleRelevance' || stepId === 'employmentHistoryAnalysis') {
        return sum + (analytics.tokensUsed || 0);
      } else if (stepId === 'apolloEnrichment') {
        return sum + (analytics.apolloFetches || analytics.creditsUsed || 0);
      }
      return sum;
    }, 0);

    // Calculate qualified leads count
    let qualifiedLeadsCount = 0;
    if (enrichmentState.finalCount) {
      qualifiedLeadsCount = enrichmentState.finalCount;
    } else if (enrichmentState.processedData) {
      qualifiedLeadsCount = enrichmentState.processedData.filter(row => !row.relevanceTag).length;
    }

    const summaryRow = {
      'Date': dateFormatted,
      'Time': timeFormatted,
      'Engine': 'Advisor Finder',
      'Step': 'TOTAL',
      'Total Rows': originalRows,
      'Total Tokens/Credits': totalTokens,
      'Time to Run (seconds)': totalTime.toFixed(2),
      'Average Token/Row': originalRows > 0 ? (totalTokens / originalRows).toFixed(2) : 0,
      'Average Time/Row (seconds)': originalRows > 0 && totalTime > 0 ? (totalTime / originalRows).toFixed(4) : 0,
      'API/Tool': 'All',
      'Supabase Hits': '-',
      'Errors': '-',
      'Specific Metrics': `Final Qualified Leads: ${qualifiedLeadsCount}`
    };

    reportRows.push(summaryRow);

    return reportRows;
  }
}

// Create and export a singleton instance
const advisorFinderReportsService = new AdvisorFinderReportsService();
export default advisorFinderReportsService;