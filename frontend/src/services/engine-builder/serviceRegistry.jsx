// services/engine-builder/serviceRegistry.js
import apolloEnrichmentService from '../enrichment-services/apolloEnrichmentService';
import financialInsightService from '../enrichment-services/financialInsightService';
import jobOpeningsService from '../enrichment-services/jobOpeningsService';
import promptAnalysisService from '../enrichment-services/promptAnalysisService';
import serperEnrichmentService from '../enrichment-services/serperEnrichmentService';

// Service registry with streamlined services for engine builder
export const serviceRegistry = {
  promptAnalysis: {
    displayName: 'Prompt Analysis',
    description: 'Analyze leads with custom prompts using AI',
    process: promptAnalysisService.processData,
    promptTemplate: 'Analyze <first_name> <last_name> who works as <position> at <company>',
    outputFields: [
      { name: 'promptAnalysis', displayName: 'Analysis Result', type: 'string' },
      { name: 'analysisTimestamp', displayName: 'Analysis Timestamp', type: 'string' }
    ]
  },
  apolloEnrichment: {
    displayName: 'Apollo Enrichment',
    description: 'Enriches leads with comprehensive Apollo data using LinkedIn URLs',
    process: apolloEnrichmentService.processData,
    outputFields: [
      { name: 'apollo_person_id', displayName: 'Apollo Person ID', type: 'string' },
      { name: 'person.id', displayName: 'Person ID', type: 'string' },
      { name: 'person.first_name', displayName: 'First Name', type: 'string' },
      { name: 'person.last_name', displayName: 'Last Name', type: 'string' },
      { name: 'person.title', displayName: 'Job Title', type: 'string' },
      { name: 'person.headline', displayName: 'LinkedIn Headline', type: 'string' },
      { name: 'person.email', displayName: 'Email', type: 'string' },
      { name: 'person.city', displayName: 'City', type: 'string' },
      { name: 'person.state', displayName: 'State', type: 'string' },
      { name: 'person.country', displayName: 'Country', type: 'string' },
      { name: 'person.seniority', displayName: 'Job Seniority', type: 'string' },
      { name: 'person.departments', displayName: 'Departments', type: 'string' },
      { name: 'person.functions', displayName: 'Job Functions', type: 'string' },
      { name: 'employment_history_summary', displayName: 'Employment History', type: 'string' },
      { name: 'organization.id', displayName: 'Company ID', type: 'string' },
      { name: 'organization.name', displayName: 'Company Name', type: 'string' },
      { name: 'organization.website_url', displayName: 'Company Website', type: 'string' },
      { name: 'organization.industry', displayName: 'Industry', type: 'string' },
      { name: 'organization.estimated_num_employees', displayName: 'Employee Count', type: 'number' },
      { name: 'organization.founded_year', displayName: 'Founded Year', type: 'number' },
      { name: 'education', displayName: 'Education History', type: 'string' },
      { name: 'employment_history_summary', displayName: 'Employment History', type: 'string' }
    ]
  },
  serperEnrichment: {
    displayName: 'Serper Based Enrichment',
    description: 'Enriches data from web search results',
    process: serperEnrichmentService.processData,
    promptTemplate: 'Analyze the company website for <company> and identify their main products, target customers, and competitive advantages.',
    outputFields: [
      { name: 'serper_insights', displayName: 'Company Insights', type: 'string' },
      { name: 'serper_news', displayName: 'Recent News', type: 'string' },
      { name: 'search_timestamp', displayName: 'Search Timestamp', type: 'string' }
    ]
  },
  financialInsight: {
    displayName: 'Financial Insight Analysis',
    description: 'Analyzes public companies by extracting insights from annual reports',
    process: financialInsightService.processData,
    promptTemplate: 'Analyze the annual report for <company> and provide insights on financial health, growth strategy, and market position.',
    outputFields: [
      { name: 'companyType', displayName: 'Company Type', type: 'string' },
      { name: 'isPublicCompany', displayName: 'Is Public Company', type: 'boolean' },
      { name: 'annualReportUrl', displayName: 'Annual Report URL', type: 'string' },
      { name: 'annualReportTextStatus', displayName: 'Text Extraction Status', type: 'string' },
      { name: 'financialInsights', displayName: 'Financial Insights', type: 'string' }
    ]
  },
  // Update in services/engine-builder/serviceRegistry.js - just the jobOpenings entry
  jobOpenings: {
    displayName: 'Job Openings + Insights',
    description: 'Analyzes open job positions and provides hiring insights using Coresignal API',
    process: jobOpeningsService.processData,
    promptTemplate: 'Analyze the hiring patterns for <company> based on their <open_jobs_count> open positions. Job titles include: <active_job_postings_titles>. Provide insights on their hiring strategy and growth indicators.',
    outputFields: [
      { name: 'open_jobs_count', displayName: 'Open Jobs Count', type: 'number' },
      { name: 'job_insights', displayName: 'Job Market Insights', type: 'string' },
      { name: 'job_analysis_timestamp', displayName: 'Analysis Timestamp', type: 'string' },
      { name: 'job_openings_source', displayName: 'Data Source', type: 'string' },
      { name: 'coresignal_json', displayName: 'Raw Coresignal Data', type: 'string' }
    ],
    availablePlaceholders: [
      { name: '<company>', description: 'Company name' },
      { name: '<company_name>', description: 'Company name (alternative)' },
      { name: '<open_jobs_count>', description: 'Total number of open job positions' },
      { name: '<active_job_postings_titles>', description: 'List of active job posting titles' },
      { name: '<hiring_trends>', description: 'Historical hiring trend data' },
      { name: '<jobs_data>', description: 'Complete raw jobs data from Coresignal' }
    ]
  }
};

export default serviceRegistry;