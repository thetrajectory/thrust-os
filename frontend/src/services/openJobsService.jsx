// services/openJobsService.js
import apiClient from '../utils/apiClient';
import supabase from './supabaseClient';

/**
 * Check if data is stale based on updated_at timestamp
 * @param {string} updatedAt - ISO date string of when data was last updated
 * @param {string} createdAt - ISO date string of when data was created
 * @returns {boolean} - True if data is stale
 */
function isDataStale(updatedAt, createdAt) {
  // First try to use updated_at
  if (updatedAt) {
    const lastUpdate = new Date(updatedAt);
    const staleDate = new Date();
    // 6 months = 180 days
    staleDate.setDate(staleDate.getDate() - 180);
    return lastUpdate < staleDate;
  }

  // Fall back to created_at if updated_at is missing
  if (createdAt) {
    const createDate = new Date(createdAt);
    const staleDate = new Date();
    // 6 months = 180 days
    staleDate.setDate(staleDate.getDate() - 180);
    return createDate < staleDate;
  }

  // If both are missing, consider it stale
  return true;
}

/**
 * Process open jobs for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function scrapeOpenJobs(data, logCallback, progressCallback) {
  logCallback("Starting Open Jobs Scraping...");

  if (!data || !Array.isArray(data)) {
    logCallback("Error: Invalid data input for Open Jobs Scraping.");
    return {
      data: data || [],
      analytics: {
        supabaseHits: 0,
        coresignalFetches: 0,
        skippedCount: 0,
        errorCount: 0,
        creditsUsed: 0,
        jobCounts: { high: 0, medium: 0, low: 0, none: 0 },
        totalProcessed: 0,
        startTime: Date.now(),
        endTime: Date.now(),
        processingTimeSeconds: 0
      }
    };
  }

  // Only process untagged rows
  const untaggedData = data.filter(row => !row.relevanceTag);
  logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

  // Return early if no untagged data
  if (untaggedData.length === 0) {
    logCallback("No untagged rows to process. Skipping Open Jobs Scraping.");
    return {
      data: data,
      analytics: {
        supabaseHits: 0,
        coresignalFetches: 0,
        skippedCount: 0,
        errorCount: 0,
        creditsUsed: 0,
        jobCounts: { high: 0, medium: 0, low: 0, none: 0 },
        totalProcessed: 0,
        startTime: Date.now(),
        endTime: Date.now(),
        processingTimeSeconds: 0
      }
    };
  }

  const startTimestamp = Date.now();

  // Get configuration from environment variables
  const apiKey = import.meta.env.VITE_REACT_APP_CORESIGNAL_API_KEY;
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_OPEN_JOBS_BATCH_SIZE || "5");
  const maxJsonLength = parseInt(import.meta.env.VITE_REACT_APP_MAX_JSON_LENGTH || "49999");

  if (!apiKey) {
    throw new Error('Coresignal API key is not set. Please check your environment configuration.');
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
  let coresignalFetches = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let creditsUsed = 0;

  // Count jobs distribution
  let jobCounts = {
    high: 0,  // >20 jobs
    medium: 0, // 11-20 jobs
    low: 0,   // 1-10 jobs
    none: 0    // 0 jobs
  };

  // Process in batches
  for (let i = 0; i < untaggedData.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = untaggedData[index];

      // Skip rows with tags or low relevance
      if ((row.companyRelevanceScore || 0) < 3) {
        logCallback(`Skipping item ${index + 1}: ${row.relevanceTag ? `Tagged as "${row.relevanceTag}"` : 'Low relevance score'}`);
        skippedCount++;
        progressCallback((index + 1) / untaggedData.length * 100);
        continue;
      }

      const linkedinUrl = row.organization?.linkedin_url;
      const orgId = row.organization?.id;

      // Skip if no LinkedIn URL or org ID
      if (!linkedinUrl || !orgId) {
        logCallback(`Skipping item ${index + 1}: ${!linkedinUrl ? 'No LinkedIn URL' : 'No organization ID'}`);
        skippedCount++;
        progressCallback((index + 1) / data.length * 100);
        continue;
      }

      // Create a promise for each item in the batch
      const processPromise = processOpenJobs(row, linkedinUrl, orgId, index, apiKey, maxJsonLength, logCallback)
        .then(result => {
          // Update the result in the processedData array
          processedData[result.index] = {
            ...processedData[result.index],
            ...result.data
          };

          // Update analytics
          if (result.source === 'supabase') {
            supabaseHits++;
          } else if (result.source === 'coresignal') {
            coresignalFetches++;
            creditsUsed += result.credits || 2; // Default 2 credits (search + collect)
          }

          // Update job counts
          const jobCount = result.data.total_available_jobs || 0;
          if (jobCount > 20) {
            jobCounts.high++;
          } else if (jobCount > 10) {
            jobCounts.medium++;
          } else if (jobCount > 0) {
            jobCounts.low++;
          } else {
            jobCounts.none++;
          }

          // Log individual item completion
          const companyName = row.organization?.name || row.company;
          logCallback(`Processed open jobs for ${companyName}: ${result.data.total_available_jobs} jobs (${result.source})`);

          // Update progress
          progressCallback((index + 1) / untaggedData.length * 100);
        })
        .catch(error => {
          logCallback(`Error processing open jobs for ${linkedinUrl}: ${error.message}`);
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            jobsSource: 'error',
            jobsError: error.message,
            total_available_jobs: 0
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
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Merge processed data back into original data array
  const finalData = data.map(originalRow => {
    const key = originalRow.linkedin_url || (originalRow.organization && originalRow.organization.id) || originalRow.id;
    if (key) {
      const processedRow = processedData.find(row =>
        (row.linkedin_url === key) ||
        (row.organization && row.organization.id === key) ||
        (row.id === key));
      if (processedRow) {
        return { ...originalRow, ...processedRow };
      }
    }
    return originalRow;
  });

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Open Jobs Scraping Complete:`);
  logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
  logCallback(`- Fetched from Coresignal API: ${coresignalFetches}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- Total Coresignal credits used: ${creditsUsed}`);
  logCallback(`- High hiring (>20 jobs): ${jobCounts.high}`);
  logCallback(`- Medium hiring (11-20 jobs): ${jobCounts.medium}`);
  logCallback(`- Low hiring (1-10 jobs): ${jobCounts.low}`);
  logCallback(`- Not hiring (0 jobs): ${jobCounts.none}`);

  return {
    data: finalData,
    analytics: {
      supabaseHits,
      coresignalFetches,
      skippedCount,
      errorCount,
      creditsUsed,
      jobCounts,
      totalProcessed: untaggedData.length - skippedCount,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

// Process open jobs for a single company - UPDATED for V2 API
async function processOpenJobs(row, linkedinUrl, orgId, index, apiKey, maxJsonLength, logCallback) {
  try {
    const companyName = row.organization?.name || row.company;
    const companyUrl = row.organization?.website_url || row.organization?.primary_domain || row.website;

    // STEP 1: Check Supabase for existing data
    logCallback(`Checking Supabase for open jobs data: ${orgId}`);
    const { data: cached, error: fetchError } = await supabase
      .from('orgs_db')
      .select('open_jobs, coresignal_json, updated_at, created_at')
      .eq('apollo_org_id', orgId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') { // Not found is OK
      throw new Error(`Supabase fetch failed: ${fetchError.message}`);
    }

    // If we have cached data that isn't stale and has the required fields
    if (cached &&
      !isDataStale(cached.updated_at, cached.created_at) &&
      cached.coresignal_json &&
      cached.open_jobs !== undefined) {

      logCallback(`Using cached open jobs for ${companyName}: ${cached.open_jobs} jobs`);
      return {
        index,
        source: 'supabase',
        data: {
          jobsSource: 'supabase',
          total_available_jobs: cached.open_jobs,
          coresignal_raw_json: cached.coresignal_json
        }
      };
    } else if (cached) {
      // We have a record but data is stale or incomplete
      if (isDataStale(cached.updated_at, cached.created_at)) {
        logCallback(`Cached data for ${companyName} is stale (older than 6 months), fetching fresh data`);
      } else {
        logCallback(`Cached data for ${companyName} is incomplete, fetching fresh data`);
      }
    } else {
      logCallback(`No cached data found for ${companyName} with orgId ${orgId}, will fetch fresh data`);
    }

    // Extract company name from LinkedIn URL for Coresignal
    if (!linkedinUrl) {
      throw new Error(`Missing LinkedIn URL for company: ${companyName}`);
    }

    // STEP 2: Call Coresignal API since we need fresh data
    try {
      // First: Search API call
      logCallback(`Calling Coresignal (search) for ${companyName}`);

      // Create search query in the correct format for V2 API
      const searchQuery = {
        query: {
          bool: {
            must: [
              {
                query_string: {
                  default_field: "linkedin_url",
                  query: `"${linkedinUrl.trim()}"`
                }
              }
            ]
          }
        }
      };

      // Make the search API call
      const searchRes = await apiClient.coresignal.searchCompany(searchQuery);

      // Check if we have a valid response
      if (!searchRes || searchRes.error || !Array.isArray(searchRes) || searchRes.length === 0) {
        const errorMsg = searchRes?.error || 'No valid search results';
        logCallback(`Search failed: ${errorMsg} for ${linkedinUrl}`);

        // Save error result to Supabase
        const errorJson = JSON.stringify({ error: errorMsg, timestamp: new Date().toISOString() });
        await saveOpenJobsToSupabase(
          orgId,
          companyName,
          companyUrl,
          0,
          errorJson,
          logCallback
        );

        return {
          index,
          source: 'coresignal_empty',
          credits: 1,
          data: {
            jobsSource: 'coresignal_empty',
            total_available_jobs: 0,
            coresignal_raw_json: errorJson
          }
        };
      }

      // Get the response code from the array
      const responseCode = searchRes[0];
      logCallback(`Response code received: ${responseCode}`);

      // Second: Collect API call
      logCallback(`Calling Coresignal (collect) for code: ${responseCode}`);

      // Make the collect API call
      const collectRes = await apiClient.coresignal.collectCompanyData(responseCode);

      // Check if we have valid company data
      const companyData = collectRes;
      if (!companyData || collectRes.error) {
        const errorMsg = collectRes?.error || 'No company data in collect response';
        logCallback(`${errorMsg} for ${linkedinUrl}`);

        // Save empty result to Supabase
        const errorJson = JSON.stringify({ error: errorMsg, timestamp: new Date().toISOString() });
        await saveOpenJobsToSupabase(
          orgId,
          companyName,
          companyUrl,
          0,
          errorJson,
          logCallback
        );

        return {
          index,
          source: 'coresignal_incomplete',
          credits: 2,
          data: {
            jobsSource: 'coresignal_incomplete',
            total_available_jobs: 0,
            coresignal_raw_json: errorJson
          }
        };
      }

      // Extract jobs information by checking multiple fields - IMPROVED DETECTION LOGIC
      let openJobs = 0;
      logCallback(`Checking for job count in company data...`);

      if (companyData.active_job_postings_count !== undefined) {
        logCallback(`Found active_job_postings_count: ${companyData.active_job_postings_count}`);
        openJobs = Number(companyData.active_job_postings_count) || 0;
      }
      else if (companyData.active_job_postings_count_change &&
        companyData.active_job_postings_count_change.current !== undefined) {
        logCallback(`Found in active_job_postings_count_change.current: ${companyData.active_job_postings_count_change.current}`);
        openJobs = Number(companyData.active_job_postings_count_change.current) || 0;
      }
      else if (companyData.active_job_postings_titles &&
        Array.isArray(companyData.active_job_postings_titles)) {
        logCallback(`Found active_job_postings_titles array with length: ${companyData.active_job_postings_titles.length}`);
        openJobs = companyData.active_job_postings_titles.length;
      }
      else if (companyData.active_job_posting_count !== undefined) {
        logCallback(`Found active_job_posting_count: ${companyData.active_job_posting_count}`);
        openJobs = Number(companyData.active_job_posting_count) || 0;
      }
      // Additional check for job_posting_count field
      else if (companyData.job_posting_count !== undefined) {
        logCallback(`Found job_posting_count: ${companyData.job_posting_count}`);
        openJobs = Number(companyData.job_posting_count) || 0;
      }
      // Try to find any field that might contain job counts
      else {
        for (const key in companyData) {
          if (key.toLowerCase().includes('job') && key.toLowerCase().includes('count')) {
            logCallback(`Found alternative job count field ${key}: ${companyData[key]}`);
            openJobs = Number(companyData[key]) || 0;
            break;
          }
        }
      }

      logCallback(`Final open jobs count for ${companyName}: ${openJobs}`);

      // Create JSON string for storage, limit size
      const rawJson = JSON.stringify(companyData).substring(0, maxJsonLength);

      // Save to Supabase and get result
      const saveResult = await saveOpenJobsToSupabase(
        orgId,
        companyName,
        companyUrl,
        openJobs,
        rawJson,
        logCallback
      );

      if (saveResult) {
        logCallback(`Successfully saved open jobs data to Supabase for ${companyName}`);
      } else {
        logCallback(`Warning: Failed to save open jobs data to Supabase for ${companyName}`);
      }

      return {
        index,
        source: 'coresignal',
        credits: 2,
        data: {
          jobsSource: 'coresignal',
          total_available_jobs: openJobs,
          coresignal_raw_json: rawJson
        }
      };

    } catch (coresignalError) {
      // Handle specific CoreSignal errors
      const errorMessage = coresignalError.message || 'Unknown error';

      if (errorMessage.includes('Payment required') || coresignalError.statusCode === 402) {
        logCallback(`Coresignal API payment limit reached for ${companyName}.`);

        // Generate fallback data
        const openJobs = 0;
        const fallbackJson = JSON.stringify({
          error: 'Payment limit reached',
          timestamp: new Date().toISOString()
        });

        // Save fallback to Supabase
        await saveOpenJobsToSupabase(
          orgId,
          companyName,
          companyUrl,
          openJobs,
          fallbackJson,
          logCallback
        );

        return {
          index,
          source: 'coresignal_payment_limit',
          credits: 0,
          data: {
            jobsSource: 'coresignal_payment_limit',
            total_available_jobs: openJobs,
            coresignal_raw_json: fallbackJson
          }
        };
      }

      // For other errors, create an error record and save to Supabase
      logCallback(`Coresignal API error for ${companyName}: ${errorMessage}`);

      const errorJson = JSON.stringify({
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      await saveOpenJobsToSupabase(
        orgId,
        companyName,
        companyUrl,
        0,
        errorJson,
        logCallback
      );

      throw coresignalError; // Re-throw to be caught by outer catch
    }

  } catch (error) {
    // Generate fallback data for any generic errors
    logCallback(`Error in processOpenJobs: ${error.message}`);

    const errorJson = JSON.stringify({
      error: error.message,
      timestamp: new Date().toISOString()
    });

    try {
      // Try to save error info to Supabase
      await saveOpenJobsToSupabase(
        orgId,
        row.organization?.name || row.company || 'Unknown Company',
        row.organization?.website_url || row.website || '',
        0,
        errorJson,
        logCallback
      );
    } catch (saveError) {
      logCallback(`Failed to save error data to Supabase: ${saveError.message}`);
    }

    // Throw the error to be caught by the caller
    throw error;
  }
}


/**
 * Save open jobs data to Supabase using the actual schema
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company URL
 * @param {number} openJobs - Total open jobs count
 * @param {string} coresignalJson - Coresignal JSON data
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function saveOpenJobsToSupabase(orgId, companyName, companyUrl, openJobs, coresignalJson, logCallback) {
  try {
    if (!orgId) {
      logCallback(`Warning: Cannot save to Supabase without an organization ID`);
      return false;
    }

    logCallback(`Saving open jobs data to Supabase for org ${orgId}`);

    // First check if the record exists
    const { data: existingRecord, error: checkError } = await supabase
      .from('orgs_db')
      .select('apollo_org_id')
      .eq('apollo_org_id', orgId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
      logCallback(`Warning: Error checking record existence: ${checkError.message}`);
    }

    // Current date for updated_at
    const now = new Date().toISOString();

    let saveError;

    // Case 1: Record exists, update ONLY the specified columns
    if (existingRecord) {
      logCallback(`Updating existing record for org ID: ${orgId}`);

      // Only update these specific columns, leave others untouched
      const updateFields = {
        open_jobs: openJobs,
        coresignal_json: coresignalJson,
        updated_at: now
      };

      const { error } = await supabase
        .from('orgs_db')
        .update(updateFields)
        .eq('apollo_org_id', orgId);

      saveError = error;

      if (error) {
        logCallback(`Update error: ${error.message}`);
      } else {
        logCallback(`Successfully updated open jobs data for org ${orgId}`);
      }
    }
    // Case 2: Record doesn't exist, insert new one with required fields
    else {
      logCallback(`Creating new record for org ID: ${orgId}`);

      const insertFields = {
        apollo_org_id: orgId,
        company_name: companyName || 'Unknown Company',
        company_url: companyUrl || '',
        open_jobs: openJobs,
        coresignal_json: coresignalJson,
        created_at: now,
        updated_at: now
      };

      const { error } = await supabase
        .from('orgs_db')
        .insert(insertFields);

      saveError = error;

      if (error) {
        logCallback(`Insert error: ${error.message}`);
      } else {
        logCallback(`Successfully inserted new record with open jobs data for org ${orgId}`);
      }
    }

    if (saveError) {
      logCallback(`Failed to save to Supabase: ${saveError.message}`);
      return false;
    }

    return true;
  } catch (err) {
    logCallback(`Exception saving open jobs data: ${err.message}`);
    return false;
  }
}

/**
 * Check for cached jobs data
 * @param {string} companyName - Company name
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Cached data or null
 */
async function checkCachedJobsData(companyName, logCallback) {
  try {
    // CHANGED: Updated to match orgs_db table structure
    const { data, error } = await supabase
      .from('orgs_db')
      .select('coresignal_json, open_jobs, updated_at')
      .eq('company_name', companyName)
      .maybeSingle();

    if (error) {
      logCallback(`Error checking cached data: ${error.message}`);
      return null;
    }

    if (data && data.coresignal_json && !isDataStale(data.updated_at)) {
      const jobsData = JSON.parse(data.coresignal_json);
      // ADDED: Ensure total jobs is included
      jobsData.totalJobs = data.open_jobs || 0;
      return jobsData;
    }

    return null;
  } catch (err) {
    logCallback(`Failed to check cached data: ${err.message}`);
    return null;
  }
}

export default {
  scrapeOpenJobs
};