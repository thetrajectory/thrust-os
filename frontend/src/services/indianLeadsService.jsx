// services/indianLeadsService.js
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
 * Process Indian leads for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processIndianLeads(data, logCallback, progressCallback) {
  logCallback("Starting Indian Presence Analysis...");

  const untaggedData = data.filter(row => !row.relevanceTag);
  logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

  const startTimestamp = Date.now();

  // Get configuration from environment variables
  const apiKey = import.meta.env.VITE_REACT_APP_APOLLO_API_KEY;
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_INDIAN_LEADS_BATCH_SIZE);
  const tooManyIndiansThreshold = parseInt(import.meta.env.VITE_REACT_APP_TOO_MANY_INDIANS_THRESHOLD || "20");

  if (!apiKey) {
    throw new Error('Apollo API key is not set. Please check your environment configuration.');
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
  let apolloFetches = 0;
  let tooManyIndiansCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let creditsUsed = 0;

  // Check if Supabase is available by making a test query
  let supabaseAvailable = true;
  try {
    const { error } = await supabase.from('orgs_db').select('count').limit(1);
    if (error) {
      logCallback(`⚠️ Supabase connection issue: ${error.message}`);
      supabaseAvailable = false;
    }
  } catch (e) {
    logCallback(`⚠️ Supabase test query failed: ${e.message}`);
    supabaseAvailable = false;
  }

  // Process in batches
  for (let i = 0; i < untaggedData.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = untaggedData[index];

      // Skip rows that don't meet criteria (must have organization ID and relevance score >= 3)
      const orgId = row.organization?.id || row['organization.id'];
      const companyName = row.organization?.name || row['organization.name'] || row.company;
      const companyUrl = row.organization?.website_url || row['organization.website_url'] || row.website;

      if (!orgId || (row.companyRelevanceScore || 0) < 3) {
        logCallback(`Skipping item ${index + 1}: ${!orgId ? 'No organization ID' : 'Low relevance score'}`);
        skippedCount++;
        progressCallback((index + 1) / untaggedData.length * 100);
        continue;
      }

      // Create a promise for each item in the batch
      const processPromise = processIndianPresence(
        row,
        orgId,
        companyName,
        companyUrl,
        index,
        apiKey,
        tooManyIndiansThreshold,
        supabaseAvailable,
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
          } else if (result.source === 'apollo') {
            apolloFetches++;
            creditsUsed++;
          }

          // Check if too many Indians
          if (result.data.percentage_headcount_for_india > tooManyIndiansThreshold) {
            tooManyIndiansCount++;
          }

          // Log individual item completion
          logCallback(`Processed Indian presence for ${companyName}: ${result.data.headcount_for_india} employees (${result.data.percentage_headcount_for_india.toFixed(1)}%)`);

          // Update progress
          progressCallback((index + 1) / untaggedData.length * 100);
        })
        .catch(error => {
          logCallback(`Error processing Indian presence for org ID ${orgId}: ${error.message}`);
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            indianSource: 'error',
            indianError: error.message,
            headcount_for_india: 0,
            percentage_headcount_for_india: 0
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


  // Calculate presence distribution
  const indianPresenceDistribution = countIndianPresenceDistribution(finalData, tooManyIndiansThreshold);

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Indian Presence Analysis Complete:`);
  logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
  logCallback(`- Fetched from Apollo API: ${apolloFetches}`);
  logCallback(`- Too Many Indians (>${tooManyIndiansThreshold}%): ${tooManyIndiansCount}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- High Indian Presence (>20%): ${indianPresenceDistribution.high}`);
  logCallback(`- Medium Indian Presence (10-20%): ${indianPresenceDistribution.medium}`);
  logCallback(`- Low Indian Presence (<10%): ${indianPresenceDistribution.low}`);
  logCallback(`- No Indian Presence (0%): ${indianPresenceDistribution.none}`);

  return {
    data: finalData,
    analytics: {
      supabaseHits,
      apolloFetches,
      tooManyIndiansCount,
      skippedCount,
      errorCount,
      creditsUsed,
      indianPresenceDistribution,
      totalProcessed: untaggedData.length - skippedCount,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

/**
 * Process Indian presence for a single company
 * @param {Object} row - Data row to process
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company URL
 * @param {number} index - Index of the row
 * @param {string} apiKey - Apollo API key
 * @param {number} tooManyIndiansThreshold - Threshold percentage for "Too many Indians" tag
 * @param {boolean} supabaseAvailable - Whether Supabase is available
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Processing result
 */
async function processIndianPresence(
  row,
  orgId,
  companyName,
  companyUrl,
  index,
  apiKey,
  tooManyIndiansThreshold,
  supabaseAvailable,
  logCallback
) {
  try {
    if (!orgId) throw new Error("Missing orgId");

    // STEP 1: Check Supabase for stored Indian headcount if available
    if (supabaseAvailable) {
      logCallback(`Checking Supabase for Indian headcount: ${orgId}`);
      const { data: cached, error: fetchError } = await supabase
        .from('orgs_db')
        .select('indian_headcount, updated_at, created_at')
        .eq('apollo_org_id', orgId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') { // Not found is OK
        throw new Error(`Supabase fetch error: ${fetchError.message}`);
      }

      if (cached && !isDataStale(cached.updated_at, cached.created_at) && cached.indian_headcount !== null && cached.indian_headcount !== undefined) {
        const totalEmployees = parseInt(row.organization?.estimated_num_employees || row['organization.estimated_num_employees'] || 0);
        if (!totalEmployees) throw new Error(`Missing organization employee count for org ${orgId}`);

        const indianPercentage = (cached.indian_headcount / totalEmployees) * 100;
        const tooManyIndians = indianPercentage > tooManyIndiansThreshold;

        logCallback(`Found headcount in Supabase: ${cached.indian_headcount} employees (${indianPercentage.toFixed(2)}%)`);

        return {
          index,
          source: 'supabase',
          data: {
            indianSource: 'supabase',
            headcount_for_india: cached.indian_headcount,
            percentage_headcount_for_india: indianPercentage,
            relevanceTag: tooManyIndians ? 'Too many Indians' : row.relevanceTag
          }
        };
      } else {
        logCallback(`No fresh data found in Supabase for org ${orgId}. Will fetch from Apollo.`);
      }
    }

    // STEP 2: Call Apollo API to get Indian contacts count using the apiClient
    logCallback(`Calling Apollo API for Indian headcount: ${orgId}`);

    try {
      // Use the getIndianContacts method from the apiClient
      const response = await apiClient.apollo.getIndianContacts({
        api_key: apiKey,
        organization_id: orgId,
        // page: 1,
        // per_page: 10,
      });

      if (!response || !response.pagination) {
        throw new Error(`Invalid Apollo response for ${orgId}`);
      }


      const indianHeadcount = response.pagination.total_entries || 0;
      const totalEmployees = parseInt(row.organization?.estimated_num_employees || row['organization.estimated_num_employees'] || 0);

      if (!totalEmployees) {
        throw new Error(`Missing organization employee count for org ${orgId}`);
      }

      // Add validation to prevent unreasonable percentages
      // If indianHeadcount is more than 3x totalEmployees, something is wrong
      const validatedIndianHeadcount = indianHeadcount > totalEmployees * 3
        ? Math.min(indianHeadcount, totalEmployees) // Cap at total employees
        : indianHeadcount;

      logCallback(`Apollo returned raw count: ${indianHeadcount}, using validated count: ${validatedIndianHeadcount} out of ${totalEmployees} total employees`);

      const indianPercentage = (validatedIndianHeadcount / totalEmployees) * 100;
      const tooManyIndians = indianPercentage > tooManyIndiansThreshold;

      logCallback(`Indian presence: ${indianPercentage.toFixed(2)}%`);

      const apolloOrgJson = response ? JSON.stringify(response) : null;

      // STEP 3: Store data in Supabase if available
      if (supabaseAvailable) {
        await saveIndianHeadcountToSupabase(
          orgId,
          companyName,
          companyUrl,
          indianHeadcount,
          row, // Original data for possible organization JSON
          apolloOrgJson,
          logCallback
        );
      }

      return {
        index,
        source: 'apollo',
        data: {
          indianSource: 'apollo',
          headcount_for_india: indianHeadcount,
          percentage_headcount_for_india: indianPercentage,
          relevanceTag: tooManyIndians ? 'Too many Indians' : row.relevanceTag
        }
      };
    } catch (apiError) {
      logCallback(`Apollo API error: ${apiError.message}. Retrying...`);

      // Try one more time with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 3000));

      const response = await apiClient.apollo.getIndianContacts({
        api_key: apiKey,
        organization_id: orgId,
        // page: 1,
        // per_page: 10,
      });

      if (!response || !response.pagination) {
        throw new Error(`Invalid Apollo response for ${orgId} after retry`);
      }

      const indianHeadcount = response.pagination.total_entries;
      const totalEmployees = parseInt(row.organization?.estimated_num_employees || row['organization.estimated_num_employees']);

      if (!totalEmployees) {
        throw new Error(`Missing organization employee count for org ${orgId}`);
      }

      const indianPercentage = (indianHeadcount / totalEmployees) * 100;
      const tooManyIndians = indianPercentage > tooManyIndiansThreshold;

      logCallback(`Apollo returned ${indianHeadcount} Indian contacts out of ${totalEmployees} total employees (${indianPercentage.toFixed(2)}%) after retry`);

      const apolloOrgJson = response ? JSON.stringify(response) : null;

      // Store data in Supabase if available
      if (supabaseAvailable) {
        await saveIndianHeadcountToSupabase(
          orgId,
          companyName,
          companyUrl,
          indianHeadcount,
          row,
          apolloOrgJson,
          logCallback
        );
      }

      return {
        index,
        source: 'apollo',
        data: {
          indianSource: 'apollo',
          headcount_for_india: indianHeadcount,
          percentage_headcount_for_india: indianPercentage,
          relevanceTag: tooManyIndians ? 'Too many Indians' : row.relevanceTag
        }
      };
    }
  } catch (error) {
    throw new Error(`Failed to process Indian presence: ${error.message}`);
  }
}

/**
 * Save Indian headcount data to Supabase
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company URL
 * @param {number} headcount - Indian headcount
 * @param {Object} row - Original data row
 * @param {string} apolloOrgJson - Organization JSON from Apollo API response
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function saveIndianHeadcountToSupabase(orgId, companyName, companyUrl, headcount, row, apolloOrgJson, logCallback) {
  try {
    logCallback(`Saving Indian headcount to Supabase for org ${orgId}`);

    // First check if the record exists
    const { data: existingRecord, error: checkError } = await supabase
      .from('orgs_db')
      .select('apollo_org_id')
      .eq('apollo_org_id', orgId)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found" error
      logCallback(`Warning: Error checking record existence: ${checkError.message}`);
    }

    // Use Apollo organization JSON if available, otherwise fallback to original data
    let orgJsonData = apolloOrgJson;

    // Fallback if Apollo didn't provide organization data
    if (!orgJsonData) {
      logCallback('No organization data in Apollo response, using fallback data');

      if (row.person?.organization || row.organization) {
        orgJsonData = JSON.stringify(row.person?.organization || row.organization);
      } else if (row.entire_json_response) {
        try {
          // Try to extract organization data from the entire JSON response
          const parsedJson = typeof row.entire_json_response === 'string'
            ? JSON.parse(row.entire_json_response)
            : row.entire_json_response;

          if (parsedJson.organization || (parsedJson.person && parsedJson.person.organization)) {
            orgJsonData = JSON.stringify(parsedJson.organization || parsedJson.person.organization);
          }
        } catch (e) {
          logCallback(`Warning: Could not parse organization JSON: ${e.message}`);
        }
      }
    } else {
      logCallback('Using organization data from Apollo response');
    }

    // Current date for updated_at
    const now = new Date().toISOString();

    // Case 1: Record exists, update it
    if (existingRecord) {
      logCallback(`Updating existing record for org ID: ${orgId}`);

      const updateFields = {
        indian_headcount: headcount,
        updated_at: now
      };

      // Add optional fields only if they don't already exist in the record
      if (companyName) updateFields.company_name = companyName;
      if (companyUrl) updateFields.company_url = companyUrl;
      if (orgJsonData) updateFields.apollo_org_json = orgJsonData;

      const { error: updateError } = await supabase
        .from('orgs_db')
        .update(updateFields)
        .eq('apollo_org_id', orgId);

      if (updateError) {
        logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
        return false;
      }

      logCallback(`Successfully updated Indian headcount for org ${orgId}`);
    }
    // Case 2: Record doesn't exist, insert new one
    else {
      logCallback(`Creating new record for org ID: ${orgId}`);

      const insertFields = {
        apollo_org_id: orgId,
        indian_headcount: headcount,
        created_at: now,
        updated_at: now
      };

      // Add optional fields
      if (companyName) insertFields.company_name = companyName;
      if (companyUrl) insertFields.company_url = companyUrl;
      if (orgJsonData) insertFields.apollo_org_json = orgJsonData;

      const { error: insertError } = await supabase
        .from('orgs_db')
        .insert(insertFields);

      if (insertError) {
        logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
        return false;
      }

      logCallback(`Successfully inserted Indian headcount for org ${orgId}`);
    }

    return true;
  } catch (err) {
    logCallback(`Failed to save Indian headcount data: ${err.message}`);
    return false;
  }
}

/**
 * Count Indian presence distribution
 * @param {Array} data - Processed data
 * @param {number} tooManyIndiansThreshold - Threshold for high presence
 * @returns {Object} - Counts for different presence levels
 */
function countIndianPresenceDistribution(data, tooManyIndiansThreshold) {
  return data.reduce((acc, item) => {
    const percentage = item.percentage_headcount_for_india || 0;

    if (percentage > tooManyIndiansThreshold) {
      acc.high++;
    } else if (percentage > 10) {
      acc.medium++;
    } else if (percentage > 0) {
      acc.low++;
    } else {
      acc.none++;
    }

    return acc;
  }, { high: 0, medium: 0, low: 0, none: 0 });
}

export default {
  processIndianLeads
};