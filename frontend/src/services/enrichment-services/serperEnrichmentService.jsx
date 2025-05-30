// services/enrichment-services/serperEnrichmentService.js
import apiClient from '../../utils/apiClient';
import metricsStorageService from '../analytics/MetricsStorageService';

const serperEnrichmentService = {
  async processData(rows, config = {}, logCallback = () => { }, progressCallback = () => { }) {
    console.log('Starting Serper enrichment for', rows.length, 'rows');
    logCallback('Starting Serper enrichment...');

    // DIRECT TRACKING: Initialize counters
    let totalTokensUsed = 0;
    let totalCreditsUsed = 0;
    let totalApiCalls = 0;
    let totalErrors = 0;

    const processedRows = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const company = row.company || row.company_name || '';

        if (!company) {
          processedRows.push({
            ...row,
            serper_insights: 'No company name available for search'
          });
          continue;
        }

        // DIRECT TRACKING: Count API call for search
        totalApiCalls++;
        totalCreditsUsed++; // Serper uses credits
        metricsStorageService.addApiCall('serperEnrichment');
        metricsStorageService.addCredits('serperEnrichment', 1);

        // Search for company information using Serper
        const searchQuery = `${company} company business information`;
        const searchResults = await apiClient.serper.searchGoogle(searchQuery, { num: 5 });

        // Extract relevant information from search results
        const insights = await serperEnrichmentService.extractCompanyInsights(searchResults, company, config.prompt);

        // DIRECT TRACKING: Count tokens from insights analysis
        if (insights.tokensUsed) {
          totalTokensUsed += insights.tokensUsed;
          totalApiCalls++;
          metricsStorageService.addTokens('serperEnrichment', insights.tokensUsed);
          metricsStorageService.addApiCall('serperEnrichment');
        }

        processedRows.push({
          ...row,
          serper_insights: insights.summary,
          serper_news: insights.news,
          serper_competitor_info: insights.competitors,
          search_timestamp: new Date().toISOString()
        });

        // Update progress
        progressCallback((i + 1) / rows.length * 100);

        // Add delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 250));

      } catch (error) {
        console.error('Error in Serper enrichment for row:', error);
        totalErrors++;
        metricsStorageService.addError('serperEnrichment');

        processedRows.push({
          ...row,
          serper_insights: 'Search enrichment failed',
          serper_error: error.message
        });
      }
    }

    console.log('Serper enrichment completed for', processedRows.length, 'rows');
    logCallback(`Serper enrichment complete - Tokens: ${totalTokensUsed}, Credits: ${totalCreditsUsed}`);

    return {
      data: processedRows,
      analytics: {
        tokensUsed: totalTokensUsed,
        creditsUsed: totalCreditsUsed,
        apiCalls: totalApiCalls,
        errors: totalErrors,
        processedCount: processedRows.length
      }
    };
  },

  async processWithConfig(rows, config) {
    return serperEnrichmentService.processData(rows, config);
  },

  async extractCompanyInsights(searchResults, company, customPrompt) {
    try {
      // Combine search results into a text summary
      const searchContent = searchResults.organic?.map(result =>
        `${result.title}: ${result.snippet}`
      ).join('\n') || '';

      const newsContent = searchResults.news?.map(news =>
        `${news.title}: ${news.snippet}`
      ).join('\n') || '';

      // If no custom prompt, return basic analysis without AI
      if (!customPrompt) {
        return {
          summary: `Search results found for ${company}`,
          news: newsContent.substring(0, 500),
          competitors: serperEnrichmentService.extractCompetitors(searchContent),
          tokensUsed: 0
        };
      }

      // Create analysis prompt
      const analysisPrompt = customPrompt ||
        `Analyze the following search results about ${company} and provide:
                1. Brief company overview
                2. Recent news or developments
                3. Key business focus areas
                4. Market position insights
                Keep the response concise and structured.`;

      // Use OpenAI to analyze search results
      const response = await apiClient.openai.chatCompletion({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: "system",
            content: "You are a business research analyst. Analyze search results and provide structured business insights."
          },
          {
            role: "user",
            content: `${analysisPrompt}\n\nSearch Results:\n${searchContent}\n\nRecent News:\n${newsContent}`
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      });

      const analysis = response.choices?.[0]?.message?.content || 'No analysis available';
      const tokensUsed = response.usage?.total_tokens || 0;

      return {
        summary: analysis,
        news: newsContent.substring(0, 500),
        competitors: serperEnrichmentService.extractCompetitors(searchContent),
        tokensUsed: tokensUsed
      };

    } catch (error) {
      console.error('Error extracting insights:', error);
      return {
        summary: 'Analysis failed',
        news: 'No news available',
        competitors: 'No competitor info available',
        tokensUsed: 0
      };
    }
  },

  extractCompetitors(searchContent) {
    // Simple competitor extraction based on common patterns
    const competitorKeywords = ['competitor', 'alternative', 'vs', 'compared to', 'rival'];
    const lines = searchContent.split('\n');

    const competitorMentions = lines.filter(line =>
      competitorKeywords.some(keyword => line.toLowerCase().includes(keyword))
    );

    return competitorMentions.slice(0, 3).join('; ') || 'No competitor information found';
  }
};

export default serperEnrichmentService;