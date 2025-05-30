// services/domainScraperService.js
import apiClient from '../utils/apiClient';
import supabase from './supabaseClient';

/**
 * Check if data is stale based on updated_at timestamp
 * @param {string} updatedAt - ISO date string of when data was last updated
 * @returns {boolean} - True if data is stale
 */
function isDataStale(updatedAt, createdAt) {
  // First try to use updated_at
  if (updatedAt) {
    const lastUpdate = new Date(updatedAt);
    const staleDate = new Date();
    const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
    staleDate.setDate(staleDate.getDate() - thresholdDays);

    return lastUpdate < staleDate;
  }

  // Fall back to created_at if updated_at is missing
  if (createdAt) {
    const createDate = new Date(createdAt);
    const staleDate = new Date();
    const thresholdDays = parseInt(import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90");
    staleDate.setDate(staleDate.getDate() - thresholdDays);

    return createDate < staleDate;
  }

  // If both are missing, consider it stale
  return true;
}

/**
 * Process domain scraping for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function scrapeDomain(data, logCallback, progressCallback) {
  logCallback("Starting Domain Scraping...");

  // Only process untagged rows
  const untaggedData = data.filter(row => !row.relevanceTag);
  logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

  logCallback(`Received ${untaggedData.length} untagged data rows to process`);

  const startTimestamp = Date.now()

  // Get configuration from environment variables
  const serperApiKey = import.meta.env.VITE_REACT_APP_SERPER_API_KEY;
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_SCRAPER_BATCH_SIZE || "5");
  const maxWebsiteLength = parseInt(import.meta.env.VITE_REACT_APP_MAX_WEBSITE_CONTENT_LENGTH || "10000");

  if (!serperApiKey) {
    throw new Error('Serper API key is not set. Please check your environment configuration.');
  }

  // Initialize result array with original data
  const processedData = [...untaggedData];

  // Create a map for quick lookup when merging back
  const dataMap = new Map();
  data.forEach(row => {
    const key = row.linkedin_url || (row.organization && row.organization.id) || row.id;
    if (key) dataMap.set(key, row);
  });

  // Track analytics
  let supabaseHits = 0;
  let scrapeSuccesses = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let totalCreditsUsed = 0;

  // Process in batches
  for (let i = 0; i < untaggedData.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = untaggedData[index];

      // Directly use organization.website_url if available
      let domainUrl = null;
      if (row.organization?.website_url) {
        domainUrl = row.organization.website_url;
        logCallback(`Using organization.website_url: ${domainUrl}`);
      } else if (row.organization?.primary_domain) {
        domainUrl = row.organization.primary_domain;
        logCallback(`Fallback to organization.primary_domain: ${domainUrl}`);
      } else if (row.website) {
        domainUrl = row.website;
        logCallback(`Fallback to website field: ${domainUrl}`);
      } else if (row.company) {
        // Create a simple domain as last resort
        const simplifiedName = row.company.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
        if (simplifiedName) {
          domainUrl = `https://${simplifiedName}.com`;
          logCallback(`Created domain from company name: ${domainUrl}`);
        }
      }

      // Extract clean domain from the URL
      const domain = domainUrl ? extractDomain(domainUrl) : null;


      // Log where the domain was found
      if (row.organization?.website_url) {
        logCallback(`Using domain from organization.website_url: ${row.organization.website_url}`);
      } else if (row.organization?.primary_domain) {
        logCallback(`Using domain from organization.primary_domain: ${row.organization.primary_domain}`);
      } else if (row.website) {
        logCallback(`Using domain from website field: ${row.website}`);
      }

      // Skip if no valid domain
      if (!domain) {
        logCallback(`Skipping item ${index + 1}: No valid domain available`);
        skippedCount++;
        progressCallback((index + 1) / untaggedData.length * 100);
        continue;
      }

      // Create a promise for each item in the batch
      const processPromise = scrapeSingleDomain(
        row,
        domain,
        index,
        serperApiKey,
        maxWebsiteLength,
        logCallback
      )
        .then(result => {
          // Update the result in the processedData array
          processedData[result.index] = {
            ...processedData[result.index],
            ...result.data
          };

          // Update analytics
          if (result.source === 'supabase') {
            supabaseHits++;
          } else if (result.source === 'scraped') {
            scrapeSuccesses++;
            totalCreditsUsed += result.credits || 1; // Default 2 credits (search + collect)
          }

          // Log individual item completion
          logCallback(`Processed domain ${domain}: ${result.source === 'supabase' ? 'Retrieved from Supabase' : 'Freshly scraped'}`);

          // Update progress
          progressCallback((index + 1) / untaggedData.length * 100);
        })
        .catch(error => {
          logCallback(`Error processing domain ${domain}: ${error.message}`);
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            domainSource: 'error',
            domainError: error.message,
            raw_website: ''
          };

          // Update progress even on error
          progressCallback((index + 1) / data.length * 100);
        });

      batchPromises.push(processPromise);
    }

    // Wait for all items in the batch to complete
    await Promise.all(batchPromises);

    // Add a small delay between batches
    if (i + currentBatchSize < untaggedData.length) {
      logCallback("Pausing briefly before next batch...");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Merge processed data back into original data array
  const finalData = data.map(originalRow => {
    const key = originalRow.linkedin_url || (originalRow.organization && originalRow.organization.id) || originalRow.id;
    if (key && processedData.find(row =>
      (row.linkedin_url === key) ||
      (row.organization && row.organization.id === key) ||
      (row.id === key))) {
      const processedRow = processedData.find(row =>
        (row.linkedin_url === key) ||
        (row.organization && row.organization.id === key) ||
        (row.id === key));
      return { ...originalRow, ...processedRow };
    }
    return originalRow;
  });

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Domain Scraping Complete:`);
  logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
  logCallback(`- Successfully scraped: ${scrapeSuccesses}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- Total Serper credits used: ${totalCreditsUsed}`);

  return {
    data: finalData,
    analytics: {
      supabaseHits,
      scrapeSuccesses,
      skippedCount,
      errorCount,
      totalCreditsUsed,
      totalProcessed: untaggedData.length - skippedCount,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

/**
 * Helper function to extract clean domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} - Clean domain with protocol
 */
function extractDomain(url) {
  if (!url) return "";

  // Normalize and clean up URL
  url = url.trim();

  // Log the original URL for debugging
  console.log(`Attempting to extract domain from: ${url}`);

  // Ensure URL has protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  try {
    // Create URL object to parse parts
    const urlObj = new URL(url);
    const domain = `${urlObj.protocol}//${urlObj.hostname}`;
    console.log(`Successfully extracted domain: ${domain}`);
    return domain;
  } catch (e) {
    // Fallback to regex if URL parsing fails
    console.log(`URL parsing failed, trying regex approach. Error: ${e.message}`);
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)/i);
    if (domainMatch && domainMatch[0]) {
      // Make sure we have a protocol
      const extractedDomain = domainMatch[0].startsWith('http') ? domainMatch[0] : 'https://' + domainMatch[0];
      console.log(`Extracted domain using regex: ${extractedDomain}`);
      return extractedDomain;
    }
    console.log(`Failed to extract domain from: ${url}`);
    return url;
  }
}

/**
 * Scrape a single domain
 * @param {Object} row - Data row to process
 * @param {string} domain - Domain to scrape
 * @param {number} index - Index of the row
 * @param {string} apiKey - Serper API key
 * @param {number} maxWebsiteLength - Maximum content length to store
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Processing result
 */
async function scrapeSingleDomain(
  row,
  domain,
  index,
  apiKey,
  maxWebsiteLength,
  logCallback
) {
  try {
    // Log more details about the domain
    logCallback(`Processing domain: ${domain}`);

    const websiteUrl = row.organization?.website_url;

    if (websiteUrl) {
      logCallback(`Using organization.website_url: ${websiteUrl}`);
      domain = extractDomain(websiteUrl);
    }

    const orgId = row.organization?.id;
    let cleanDomain = domain;

    // STEP 1: Check Supabase
    if (orgId) {
      logCallback(`Checking Supabase cache: ${cleanDomain} (OrgID: ${orgId})`);
      const { data: cached, error } = await supabase
        .from('orgs_db')
        .select('raw_homepage, updated_at, created_at')
        .eq('apollo_org_id', orgId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is OK
        throw new Error(`Supabase fetch error: ${error.message}`);
      }

      if (cached && !isDataStale(cached.updated_at, cached.created_at) && cached.raw_homepage) {
        logCallback(`Using cached content for ${cleanDomain}`);
        return {
          index,
          source: 'supabase',
          data: {
            domainSource: 'supabase',
            raw_website: cached.raw_homepage || ''
          }
        };
      }
    }

    // Ensure domain is properly formatted
    let fullDomain = domain;
    if (!domain.startsWith('http')) {
      fullDomain = `https://${domain}`;
    }

    // STEP 2: Call Serper to scrape website content
    logCallback(`Scraping ${fullDomain} using Serper API...`);

    // Use the simplified approach
    const response = await apiClient.serper.scrapeWebsite(fullDomain);

    // Process the response
    let scrapedText = '';
    let creditsUsed = 1;

    if (typeof response === 'string') {
      // Handle text response
      scrapedText = response;
    } else if (response && response.text) {
      // Handle JSON response
      scrapedText = response.text;
      creditsUsed = response.credits || 1;
    } else if (response && response.fallbackText) {
      // Handle fallback text from error
      scrapedText = response.fallbackText;
      logCallback(`Using fallback text for ${domain} due to scraping error`);
    } else if (response && typeof response === 'object') {
      // Fallback for unknown response format
      scrapedText = JSON.stringify(response);
    }

    // Truncate only for the returned data, not for storage
    const truncatedText = scrapedText.slice(0, maxWebsiteLength);

    // STEP 3: Save to Supabase - store full text
    if (orgId) {
      const companyName = row.organization?.name;
      logCallback(`Checking if record exists in Supabase for org ID: ${orgId}`);

      // First check if the record exists
      const { data: existingRecord, error: checkError } = await supabase
        .from('orgs_db')
        .select('apollo_org_id')
        .eq('apollo_org_id', orgId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
        logCallback(`Warning: Error checking record existence: ${checkError.message}`);
      }

      let saveError;

      if (existingRecord) {
        // Case 1: Record exists, update it
        logCallback(`Updating existing record for org ID: ${orgId}`);
        const { error } = await supabase
          .from('orgs_db')
          .update({
            raw_homepage: scrapedText, // Store full text in Supabase
            company_name: companyName,
            company_url: fullDomain,
            updated_at: new Date().toISOString()
          })
          .eq('apollo_org_id', orgId);

        saveError = error;
      } else {
        // Case 2: Record doesn't exist, insert new row
        logCallback(`Creating new record for org ID: ${orgId}`);
        const { error } = await supabase
          .from('orgs_db')
          .insert({
            apollo_org_id: orgId,
            raw_homepage: scrapedText, // Store full text in Supabase
            company_name: companyName,
            company_url: fullDomain,
            updated_at: new Date().toISOString()
          });

        saveError = error;
      }

      if (saveError) {
        logCallback(`Warning: Failed to save to Supabase: ${saveError.message}`);
      }
    }

    return {
      index,
      source: 'scraped',
      credits: creditsUsed,
      data: {
        domainSource: 'scraped',
        raw_website: truncatedText // Return truncated text for CSV export
      }
    };

  } catch (error) {
    logCallback(`Error scraping domain ${domain}: ${error.message}`);
    throw new Error(`Failed to scrape domain ${domain}: ${error.message}`);
  }
}

export default {
  scrapeDomain
};