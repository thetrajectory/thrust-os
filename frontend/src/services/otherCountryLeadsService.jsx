// services/otherCountryLeadsService.js
import apiClient from "../utils/apiClient";
import supabase from "./supabaseClient";

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
    const thresholdDays = parseInt(
      import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90"
    );
    staleDate.setDate(staleDate.getDate() - thresholdDays);

    return lastUpdate < staleDate;
  }

  // Fall back to created_at if updated_at is missing
  if (createdAt) {
    const createDate = new Date(createdAt);
    const staleDate = new Date();
    const thresholdDays = parseInt(
      import.meta.env.VITE_REACT_APP_DATA_STALENESS_DAYS || "90"
    );
    staleDate.setDate(staleDate.getDate() - thresholdDays);

    return createDate < staleDate;
  }

  // If both are missing, consider it stale
  return true;
}

/**
 * Process Other Country leads for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processOtherCountryLeads(
  data,
  logCallback,
  progressCallback
) {
  logCallback("Starting Other Country Presence Analysis...");

  const startTimestamp = Date.now();

  // Get configuration from environment variables
  const apiKey = import.meta.env.VITE_REACT_APP_APOLLO_API_KEY;
  const batchSize = parseInt(
    import.meta.env.VITE_REACT_APP_OTHER_COUNTRY_LEADS_BATCH_SIZE || "5"
  );

  if (!apiKey) {
    throw new Error(
      "Apollo API key is not set. Please check your environment configuration."
    );
  }

  // Initialize result array with original data
  const processedData = [...data];

  // Track analytics
  let supabaseHits = 0;
  let apolloFetches = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let creditsUsed = 0;

  // Check if Supabase is available by making a test query
  let supabaseAvailable = true;
  try {
    const { error } = await supabase.from("orgs_db").select("count").limit(1);
    if (error) {
      logCallback(`⚠️ Supabase connection issue: ${error.message}`);
      supabaseAvailable = false;
    }
  } catch (e) {
    logCallback(`⚠️ Supabase test query failed: ${e.message}`);
    supabaseAvailable = false;
  }

  // Process in batches
  for (let i = 0; i < data.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, data.length - i);
    logCallback(
      `Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize
      }`
    );

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = data[index];

      // Skip rows that already have "Too many Indians" tag, since we don't need to check other countries
      if (row.relevanceTag === "Too many Indians") {
        logCallback(
          `Skipping item ${index + 1}: Already tagged as 'Too many Indians'`
        );
        skippedCount++;
        progressCallback(((index + 1) / data.length) * 100);
        continue;
      }

      // Skip rows that don't meet criteria (must have organization ID and relevance score >= 3)
      const orgId = row.organization?.id || row["organization.id"];
      const companyName =
        row.organization?.name || row["organization.name"] || row.company;
      const companyUrl =
        row.organization?.website_url ||
        row["organization.website_url"] ||
        row.website;

      if (!orgId || (row.companyRelevanceScore || 0) < 3) {
        logCallback(
          `Skipping item ${index + 1}: ${!orgId ? "No organization ID" : "Low relevance score"
          }`
        );
        skippedCount++;
        progressCallback(((index + 1) / data.length) * 100);
        continue;
      }

      // Create a promise for each item in the batch
      const processPromise = processOtherCountryPresence(
        row,
        orgId,
        companyName,
        companyUrl,
        index,
        apiKey,
        supabaseAvailable,
        logCallback
      )
        .then((result) => {
          // Update the result in the processedData array
          processedData[result.index] = {
            ...processedData[result.index],
            ...result.data,
          };

          // Update analytics
          if (result.source === "supabase") {
            supabaseHits++;
          } else if (result.source === "apollo") {
            apolloFetches++;
            creditsUsed++;
          }

          // Log individual item completion
          logCallback(
            `Processed Other Country presence for ${companyName}: ${result.data.other_country_headcount} employees`
          );

          // Update progress
          progressCallback(((index + 1) / data.length) * 100);
        })
        .catch((error) => {
          logCallback(
            `Error processing Other Country presence for org ID ${orgId}: ${error.message}`
          );
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            otherCountrySource: "error",
            otherCountryError: error.message,
            other_country_headcount: 0,
          };

          // Update progress even on error
          progressCallback(((index + 1) / data.length) * 100);
        });

      batchPromises.push(processPromise);
    }

    // Wait for all items in the batch to complete
    await Promise.all(batchPromises);

    // Add a small delay between batches
    if (i + currentBatchSize < data.length) {
      logCallback("Pausing briefly before next batch...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Calculate distribution
  const distribution = countOtherCountryHeadcountDistribution(processedData);

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Other Country Presence Analysis Complete:`);
  logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
  logCallback(`- Fetched from Apollo API: ${apolloFetches}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- High Presence (>50): ${distribution.high}`);
  logCallback(`- Medium Presence (11-50): ${distribution.medium}`);
  logCallback(`- Low Presence (1-10): ${distribution.low}`);
  logCallback(`- No Presence (0): ${distribution.none}`);

  return {
    data: processedData,
    analytics: {
      supabaseHits,
      apolloFetches,
      skippedCount,
      errorCount,
      creditsUsed,
      distribution,
      totalProcessed: data.length - skippedCount,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    },
  };
}

/**
 * Process Other Country presence for a single company
 * @param {Object} row - Data row to process
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company URL
 * @param {number} index - Index of the row
 * @param {string} apiKey - Apollo API key
 * @param {boolean} supabaseAvailable - Whether Supabase is available
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Processing result
 */
async function processOtherCountryPresence(
  row,
  orgId,
  companyName,
  companyUrl,
  index,
  apiKey,
  supabaseAvailable,
  logCallback
) {
  try {
    if (!orgId) throw new Error("Missing orgId");

    // STEP 1: Check Supabase for stored Other Country headcount if available
    if (supabaseAvailable) {
      logCallback(`Checking Supabase for Other Country headcount: ${orgId}`);
      const { data: cached, error: fetchError } = await supabase
        .from('orgs_db')
        .select('other_country_headcount, other_country_json, updated_at, created_at')
        .eq('apollo_org_id', orgId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') { // Not found is OK
        throw new Error(`Supabase fetch error: ${fetchError.message}`);
      }

      if (cached && !isDataStale(cached.updated_at, cached.created_at) && cached.other_country_headcount !== null && cached.other_country_headcount !== undefined) {
        logCallback(`Found headcount in Supabase: ${cached.other_country_headcount} employees`);

        return {
          index,
          source: 'supabase',
          data: {
            otherCountrySource: 'supabase',
            other_country_headcount: cached.other_country_headcount
            // Don't include JSON in the returned data to avoid storing in CSV
          }
        };
      } else {
        logCallback(`No fresh data found in Supabase for org ${orgId}. Will fetch from Apollo.`);
      }
    }

    // STEP 2: Call Apollo API to get Other Country contacts count using the apiClient
    logCallback(`Calling Apollo API for Other Country headcount: ${orgId}`);

    try {
      // Use the getOtherCountryContacts method from the apiClient
      const response = await apiClient.apollo.getOtherCountryContacts({
        api_key: apiKey,
        organization_id: orgId,
        // page: 1,
        // per_page: 10,
      });

      if (!response || !response.pagination) {
        throw new Error(`Invalid Apollo response for ${orgId}`);
      }

      const otherCountryHeadcount = response.pagination.total_entries || 0;
      const totalEmployees = parseInt(row.organization?.estimated_num_employees || row['organization.estimated_num_employees'] || 0);

      // Add validation to prevent unreasonable values
      const validatedHeadcount = totalEmployees > 0 && otherCountryHeadcount > totalEmployees * 3
        ? Math.min(otherCountryHeadcount, totalEmployees)
        : otherCountryHeadcount;

      // Only store the essential pagination data to avoid excessive JSON size
      const otherCountryJson = JSON.stringify({
        pagination: response.pagination,
        breadcrumbs: response.breadcrumbs
      });

      logCallback(`Apollo returned ${validatedHeadcount} Other Country contacts`);

      // STEP 3: Store data in Supabase if available
      if (supabaseAvailable) {
        await saveOtherCountryHeadcountToSupabase(
          orgId,
          companyName,
          companyUrl,
          validatedHeadcount,
          otherCountryJson,
          logCallback
        );
      }

      return {
        index,
        source: 'apollo',
        data: {
          otherCountrySource: 'apollo',
          other_country_headcount: validatedHeadcount
          // Don't include JSON in the returned data to avoid storing in CSV
        }
      };
    } catch (apiError) {
      logCallback(`Apollo API error: ${apiError.message}. Retrying...`);

      // Try one more time with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 3000));

      const response = await apiClient.apollo.getOtherCountryContacts({
        api_key: apiKey,
        organization_id: orgId,
        // page: 1,
        // per_page: 10,
      });

      if (!response || !response.pagination) {
        throw new Error(`Invalid Apollo response for ${orgId} after retry`);
      }

      const otherCountryHeadcount = response.pagination.total_entries || 0;
      const totalEmployees = parseInt(row.organization?.estimated_num_employees || row['organization.estimated_num_employees'] || 0);

      // Add validation to prevent unreasonable values
      const validatedHeadcount = totalEmployees > 0 && otherCountryHeadcount > totalEmployees * 3
        ? Math.min(otherCountryHeadcount, totalEmployees)
        : otherCountryHeadcount;

      // Only store the essential pagination data
      const otherCountryJson = JSON.stringify({
        pagination: response.pagination,
        breadcrumbs: response.breadcrumbs
      });

      logCallback(`Apollo returned ${validatedHeadcount} Other Country contacts after retry`);

      // Store data in Supabase if available
      if (supabaseAvailable) {
        await saveOtherCountryHeadcountToSupabase(
          orgId,
          companyName,
          companyUrl,
          validatedHeadcount,
          otherCountryJson,
          logCallback
        );
      }

      return {
        index,
        source: 'apollo',
        data: {
          otherCountrySource: 'apollo',
          other_country_headcount: validatedHeadcount
          // Don't include JSON in the returned data to avoid storing in CSV
        }
      };
    }
  } catch (error) {
    throw new Error(`Failed to process Other Country presence: ${error.message}`);
  }
}


/**
 * Save Other Country headcount data to Supabase
 * @param {string} orgId - Organization ID
 * @param {string} companyName - Company name
 * @param {string} companyUrl - Company URL
 * @param {number} headcount - Other Country headcount
 * @param {string} jsonData - Other Country JSON data
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<boolean>} - Success indicator
 */
async function saveOtherCountryHeadcountToSupabase(orgId, companyName, companyUrl, headcount, jsonData, logCallback) {
  try {
    logCallback(`Saving Other Country headcount to Supabase for org ${orgId}`);

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

    // Case 1: Record exists, update it
    if (existingRecord) {
      logCallback(`Updating existing record for org ID: ${orgId}`);

      const updateFields = {
        other_country_headcount: headcount,
        other_country_json: jsonData,
        updated_at: now
      };

      const { error: updateError } = await supabase
        .from('orgs_db')
        .update(updateFields)
        .eq('apollo_org_id', orgId);

      if (updateError) {
        logCallback(`Warning: Failed to update Supabase record: ${updateError.message}`);
        return false;
      }

      logCallback(`Successfully updated Other Country headcount for org ${orgId}`);
    }
    // Case 2: Record doesn't exist, insert new one
    else {
      logCallback(`Creating new record for org ID: ${orgId}`);

      const insertFields = {
        apollo_org_id: orgId,
        company_name: companyName,
        company_url: companyUrl,
        other_country_headcount: headcount,
        other_country_json: jsonData,
        created_at: now,
        updated_at: now
      };

      const { error: insertError } = await supabase
        .from('orgs_db')
        .insert(insertFields);

      if (insertError) {
        logCallback(`Warning: Failed to insert Supabase record: ${insertError.message}`);
        return false;
      }

      logCallback(`Successfully inserted Other Country headcount for org ${orgId}`);
    }

    return true;
  } catch (err) {
    logCallback(`Failed to save Other Country headcount data: ${err.message}`);
    return false;
  }
}

/**
 * Count Other Country presence distribution
 * @param {Array} data - Processed data
 * @returns {Object} - Counts for different presence levels
 */
function countOtherCountryHeadcountDistribution(data) {
  return data.reduce(
    (acc, item) => {
      const headcount = item.other_country_headcount || 0;

      if (headcount > 50) {
        acc.high++;
      } else if (headcount > 10) {
        acc.medium++;
      } else if (headcount > 0) {
        acc.low++;
      } else {
        acc.none++;
      }

      return acc;
    },
    { high: 0, medium: 0, low: 0, none: 0 }
  );
}

export default {
  processOtherCountryLeads,
};
