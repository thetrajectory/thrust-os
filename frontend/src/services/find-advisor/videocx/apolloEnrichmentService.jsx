// services/find-advisor/apolloEnrichmentService.jsx
import apiClient from '../../../utils/apiClient';
import supabase from '../../supabaseClient';

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
 * Process Apollo enrichment for a batch of data for Advisor Finder
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processApolloEnrichment(data, logCallback, progressCallback) {
    logCallback("Starting Advisor Finder Apollo Lead Enrichment...");

    const startTimestamp = Date.now();

    // Filter data to only process untagged rows
    const untaggedData = data.filter(row => !row.relevanceTag);
    logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

    // Safety check - if no untagged rows, return original data
    if (untaggedData.length === 0) {
        logCallback("No untagged rows to process in Apollo enrichment. Returning original data.");
        return {
            data: data,
            analytics: {
                supabaseHits: 0,
                apolloFetches: 0,
                skippedCount: 0,
                errorCount: 0,
                totalProcessed: 0,
                startTime: startTimestamp,
                endTime: Date.now(),
                processingTimeSeconds: 0
            }
        };
    }

    // Get API key and batch size from environment variables
    const apiKey = import.meta.env.VITE_REACT_APP_APOLLO_API_KEY;
    const batchSize = parseInt(import.meta.env.VITE_REACT_APP_APOLLO_BATCH_SIZE || "5");

    // Validate API key to avoid unnecessary API calls
    if (!apiKey) {
        logCallback("⚠️ Apollo API key is not set. Using fallback data only.");
    }

    // Store original data and create a map for easy lookup
    const originalData = [...data];
    const dataMap = new Map();
    data.forEach(row => {
        const key = row.linkedin_url || (row.person && row.person.linkedin_url) || row.id;
        if (key) dataMap.set(key, row);
    });

    // Initialize result array with original data
    const processedData = untaggedData.map(row => ({
        ...row,
        apolloLeadSource: 'unprocessed'
    }));

    // Track analytics
    let supabaseHits = 0;
    let apolloFetches = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let creditsUsed = 0;
    let fetchSourceMap = {}; // Track source of data for each row

    // Check if Supabase is available by making a test query
    let supabaseAvailable = true;
    try {
        const { error } = await supabase.from('leads_db').select('count').limit(1);
        if (error) {
            logCallback(`⚠️ Supabase connection issue: ${error.message}`);
            supabaseAvailable = false;
        }
    } catch (e) {
        logCallback(`⚠️ Supabase test query failed: ${e.message}`);
        supabaseAvailable = false;
    }

    // Process in batches with smaller batch size if errors are occurring
    const effectiveBatchSize = errorCount > 0 ? Math.max(1, Math.floor(batchSize / 2)) : batchSize;

    for (let i = 0; i < untaggedData.length; i += effectiveBatchSize) {
        const currentBatchSize = Math.min(effectiveBatchSize, untaggedData.length - i);
        logCallback(`Processing batch ${Math.floor(i / effectiveBatchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

        // Process each item in the batch sequentially to avoid rate limits
        for (let j = 0; j < currentBatchSize; j++) {
            const index = i + j;
            const row = untaggedData[index];

            // For irrelevant titles, we still process but we mark them as skipped
            const isIrrelevant = row.titleRelevance === 'Irrelevant';
            if (isIrrelevant) {
                logCallback(`Item ${index + 1}: Irrelevant title - including in results but marking as skipped`);
            }

            try {
                // Process the lead
                const result = await processApolloLead(
                    row,
                    index,
                    apiKey,
                    logCallback,
                    isIrrelevant,
                    supabaseAvailable
                );

                // Record data source
                fetchSourceMap[index] = result.source;

                // Update the result in the processedData array
                processedData[index] = {
                    ...processedData[index],
                    ...result.data
                };

                // Update analytics
                if (result.source === 'supabase') {
                    supabaseHits++;
                } else if (result.source === 'apollo') {
                    apolloFetches++;
                    creditsUsed++;
                }

                if (result.skipped) {
                    skippedCount++;
                }

                // Log individual item completion
                logCallback(`Processed item ${index + 1}: ${result.source} ${result.skipped ? '(Skipped)' : ''}`);
            } catch (error) {
                logCallback(`Error processing item ${index + 1}: ${error.message}`);
                errorCount++;

                // Add error info to the processed data, but preserve the original data
                processedData[index] = {
                    ...processedData[index],
                    apolloLeadSource: 'error',
                    apolloError: error.message
                };

                // Add basic fields to ensure the CSV has all columns
                addBasicFieldsForError(processedData[index]);
            }

            // Update progress
            progressCallback((index + 1) / untaggedData.length * 100);

            // Short delay between individual item processing to avoid rate limits
            if (j < currentBatchSize - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // Add a longer delay between batches
        if (i + currentBatchSize < untaggedData.length) {
            logCallback("Pausing between batches to avoid rate limits...");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Upload any newly fetched Apollo data to Supabase
    if (supabaseAvailable && apolloFetches > 0) {
        logCallback(`Uploading ${apolloFetches} newly fetched records to Supabase...`);
        let uploadCount = 0;

        for (let index = 0; index < processedData.length; index++) {
            const row = processedData[index];

            // Only upload data that was freshly fetched from Apollo
            if (fetchSourceMap[index] === 'apollo') {
                try {
                    const linkedinUrl = row.linkedin_url || row.person?.linkedin_url;
                    const fullName = `${row.first_name || row.person?.first_name || ''} ${row.last_name || row.person?.last_name || ''}`.trim();
                    const personId = row.apollo_person_id || row.person?.id;

                    if (linkedinUrl && personId) {
                        await upsertToSupabase(linkedinUrl, personId, row, fullName);
                        uploadCount++;
                    }
                } catch (error) {
                    logCallback(`Error uploading to Supabase: ${error.message}`);
                }
            }
        }

        logCallback(`Successfully uploaded ${uploadCount} records to Supabase`);
    }

    // Update original data with processed results
    // Create a map of processed data for quick lookup
    const processedMap = new Map();
    processedData.forEach(item => {
        const key = item.linkedin_url || (item.person && item.person.linkedin_url) || item.id;
        if (key) {
            processedMap.set(key, item);
        }
    });

    // Merge processed data back into original data
    const finalData = originalData.map(originalRow => {
        const key = originalRow.linkedin_url || (originalRow.person && originalRow.person.linkedin_url) || originalRow.id;
        if (key && processedMap.has(key)) {
            return processedMap.get(key);
        } else {
            // For items without processed data, keep the original
            return originalRow;
        }
    });

    // Log analysis summary
    logCallback(`Advisor Finder Apollo Lead Enrichment Complete:`);
    logCallback(`- Retrieved from Supabase: ${supabaseHits}`);
    logCallback(`- Fetched from Apollo API: ${apolloFetches}`);
    logCallback(`- Skipped (Irrelevant): ${skippedCount}`);
    logCallback(`- Errors: ${errorCount}`);

    const endTimeStamp = Date.now();
    const processingTimeSeconds = (endTimeStamp - startTimestamp) / 1000;

    return {
        data: finalData,
        analytics: {
            supabaseHits,
            apolloFetches,
            skippedCount,
            errorCount,
            totalProcessed: data.length,
            startTime: startTimestamp,
            endTime: endTimeStamp,
            processingTimeSeconds: processingTimeSeconds
        }
    };
}

/**
 * Upsert data to Supabase for Advisor Finder
 * @param {string} linkedinUrl - LinkedIn URL
 * @param {string} personId - Apollo person ID
 * @param {Object} data - Data to upsert
 * @param {string} fullName - Person's full name
 */
async function upsertToSupabase(linkedinUrl, personId, data, fullName) {
    try {
        // Check if record exists
        const { data: existingRecord, error: fetchError } = await supabase
            .from('leads_db') // Use Advisor Finder specific table
            .select('apollo_person_id')
            .eq('linkedin_url', linkedinUrl)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw new Error(`Supabase fetch error: ${fetchError.message}`);
        }

        const now = new Date().toISOString();
        const apolloJsonString = typeof data.entire_json_response === 'string'
            ? data.entire_json_response
            : JSON.stringify(data.person?.organization ? {
                person: data.person,
                organization: data.person.organization
            } : data);

        const companyName = data.company || data.organization?.name || data.person?.organization?.name;
        const position = data.position || data.person?.title;
        
        // Extract connected_on from data and ensure it's properly formatted
        let connectedOn = data.connected_on || '';
        
        // Ensure it's in YYYY-MM-DD format if it exists
        if (connectedOn && !connectedOn.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.warn(`connected_on not in YYYY-MM-DD format: "${connectedOn}". Attempting to format.`);
            try {
                // Try to parse and format the date
                const dateObj = new Date(connectedOn);
                if (!isNaN(dateObj.getTime())) {
                    connectedOn = dateObj.toISOString().split('T')[0];
                }
            } catch (e) {
                console.error(`Failed to format connected_on date: ${e.message}`);
            }
        }

        if (existingRecord) {
            // Update existing record
            const { error: updateError } = await supabase
                .from('leads_db')
                .update({
                    apollo_person_id: personId,
                    apollo_json: apolloJsonString,
                    connected_on: connectedOn, // Save connected_on field
                    updated_at: now
                })
                .eq('apollo_person_id', existingRecord.id);

            if (updateError) throw new Error(`Supabase update error: ${updateError.message}`);
        } else {
            // Insert new record
            const { error: insertError } = await supabase
                .from('leads_db')
                .insert({
                    connected_to: data.advisorName || null,
                    full_name: fullName,
                    linkedin_url: linkedinUrl,
                    company_name: companyName,
                    position: position,
                    apollo_person_id: personId,
                    apollo_json: apolloJsonString,
                    connected_on: connectedOn, // Save connected_on field
                    created_at: now
                });

            if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);
        }

        return true;
    } catch (error) {
        throw new Error(`Failed to upsert to Supabase: ${error.message}`);
    }
}

/**
 * Process a single lead through Apollo for Advisor Finder
 * @param {Object} row - Data row to process
 * @param {number} index - Index of the row
 * @param {string} apiKey - Apollo API key
 * @param {Function} logCallback - Callback function for logging
 * @param {boolean} isIrrelevant - Whether the title is irrelevant
 * @param {boolean} supabaseAvailable - Whether Supabase is available
 * @returns {Promise<Object>} - Processing result
 */
async function processApolloLead(row, index, apiKey, logCallback, isIrrelevant = false, supabaseAvailable = true) {
    const linkedinUrl = row.linkedin_url;

    // For irrelevant titles or no LinkedIn URL, create placeholder data
    if (isIrrelevant || !linkedinUrl || linkedinUrl.trim() === '') {
        logCallback(`${isIrrelevant ? 'Irrelevant title' : 'No LinkedIn URL'} for item ${index + 1}. Using available data.`);

        // Create organization data structure from available data
        const organization = {
            name: row.company || 'Unknown Company',
            website_url: row.website || '',
            industry: row.industry || 'Unknown Industry',
            estimated_num_employees: row.employees || 0,
            short_description: row.description || ''
        };

        // Create person data
        const person = {
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            name: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : '',
            title: row.position || '',
            linkedin_url: row.linkedin_url || ''
        };

        // Create full Apollo-like data structure
        const apolloData = {
            person: person,
            organization: organization
        };

        // Store the full raw JSON data
        const apolloJsonString = JSON.stringify(apolloData);

        // Extract fields for individual columns
        const extractedFields = extractApolloFields(apolloData);

        return {
            index,
            source: 'csv_data',
            skipped: isIrrelevant,
            data: {
                apolloLeadSource: isIrrelevant ? 'skipped_irrelevant' : 'csv_data',
                apolloSkipReason: isIrrelevant ? 'Irrelevant title' : null,
                organization: organization,
                person: person,
                entire_json_response: apolloJsonString,
                ...extractedFields
            }
        };
    }

    try {
        // === STEP 1: Check Supabase if available ===
        if (supabaseAvailable) {
            logCallback(`Checking Supabase for: ${linkedinUrl}`);

            try {
                const { data: cachedRows, error: fetchError } = await supabase
                    .from('leads_db') // Use Advisor Finder specific table
                    .select('*')
                    .eq('linkedin_url', linkedinUrl)
                    .maybeSingle();

                if (fetchError && fetchError.code !== 'PGRST116') {
                    logCallback(`Supabase fetch warning: ${fetchError.message}`);
                    // Continue to Apollo instead of throwing
                } else if (cachedRows) {
                    logCallback(`Found data in Supabase for ${linkedinUrl}`);

                    // Process apollo_json field
                    let apolloData;

                    if (typeof cachedRows.apollo_json === 'object' && cachedRows.apollo_json !== null) {
                        apolloData = cachedRows.apollo_json;
                    } else if (typeof cachedRows.apollo_json === 'string' && cachedRows.apollo_json) {
                        try {
                            apolloData = JSON.parse(cachedRows.apollo_json);
                        } catch (err) {
                            logCallback(`Warning: Could not parse Apollo JSON from Supabase: ${err.message}`);
                            apolloData = {};
                        }
                    } else {
                        apolloData = {};
                    }

                    // Check if data is stale
                    if (!isDataStale(cachedRows.updated_at, cachedRows.created_at) && cachedRows.apollo_json) {
                        // Data is fresh, use it
                        logCallback(`Using fresh data from Supabase for ${linkedinUrl}`);

                        // Create JSON string for storage
                        const apolloJsonStr = typeof cachedRows.apollo_json === 'string'
                            ? cachedRows.apollo_json
                            : JSON.stringify(apolloData);

                        // Extract fields for individual columns
                        const extractedFields = extractApolloFields(apolloData);

                        // IMPORTANT: Return here to prevent fetching from Apollo API
                        return {
                            index,
                            source: 'supabase',
                            skipped: false,
                            data: {
                                apolloLeadSource: 'supabase',
                                apollo_person_id: cachedRows.apollo_person_id || '',
                                organization: apolloData.organization || {},
                                person: apolloData.person || {},
                                entire_json_response: apolloJsonStr,
                                ...extractedFields
                            }
                        };
                    } else {
                        // Data is stale, log it
                        logCallback(`Data in Supabase is stale for ${linkedinUrl}. Will fetch fresh data.`);
                    }
                } else {
                    logCallback(`No data found in Supabase for ${linkedinUrl}. Will fetch from Apollo.`);
                }
            } catch (supabaseErr) {
                logCallback(`Supabase error: ${supabaseErr.message}`);
                // Continue to Apollo instead of throwing
            }
        } else {
            logCallback(`Skipping Supabase check for ${linkedinUrl} - connection not available`);
        }

        // === STEP 2: Try Apollo API ===
        if (!apiKey) {
            throw new Error('Apollo API key is not set');
        }

        logCallback(`Fetching from Apollo API for ${linkedinUrl}`);

        try {
            // Construct the request with retry logic
            const maxRetries = 3;
            let retryCount = 0;
            let apolloResponse = null;

            while (retryCount <= maxRetries) {
                try {
                    logCallback(`Attempting Apollo API call (attempt ${retryCount + 1})`);

                    // Use proxy server endpoint instead of direct API call
                    const data = await apiClient.apollo.matchPerson({
                        api_key: apiKey,
                        linkedin_url: linkedinUrl,
                        reveal_personal_emails: false,
                        reveal_phone_number: false,
                        fetch_education_history: true,
                        fetch_employment_history: true,
                        fetch_social_profiles: true,
                        fetch_headline: true,
                        fetch_technology_data: true
                    });

                    apolloResponse = { data: data };

                    // Log successful response
                    logCallback(`Apollo API call successful for ${linkedinUrl}`);

                    // Successfully got a response, break out of retry loop
                    break;
                } catch (apiError) {
                    retryCount++;

                    if (retryCount <= maxRetries) {
                        const delay = retryCount * 3000; // 3s, 6s, 9s
                        logCallback(`Apollo API call failed (attempt ${retryCount}): ${apiError.message}. Retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        // Max retries exceeded, re-throw the error
                        logCallback(`All ${maxRetries} Apollo API call attempts failed. Last error: ${apiError.message}`);
                        throw apiError;
                    }
                }
            }

            // Additional error check if no response after all retries
            if (!apolloResponse || !apolloResponse.data) {
                throw new Error(`Failed to get valid response from Apollo API for ${linkedinUrl} after ${maxRetries} attempts`);
            }

            // Save the full raw response for debugging
            const fullResponseText = JSON.stringify(apolloResponse?.data || {});

            if (!apolloResponse?.data || !apolloResponse.data.person) {
                logCallback(`Warning: Apollo response missing person data for ${linkedinUrl}`);

                // Create basic structure with available data
                const organization = {
                    name: row.company || 'Unknown Company',
                    website_url: row.website || '',
                    industry: row.industry || 'Unknown Industry',
                    estimated_num_employees: row.employees || 0,
                    short_description: row.description || ''
                };

                const person = {
                    first_name: row.first_name || '',
                    last_name: row.last_name || '',
                    name: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : '',
                    title: row.position || '',
                    linkedin_url: linkedinUrl
                };

                const apolloData = {
                    person: person,
                    organization: organization
                };

                const apolloJsonString = JSON.stringify(apolloData);

                // Extract fields for individual columns
                const extractedFields = extractApolloFields(apolloData);

                return {
                    index,
                    source: 'apollo_empty',
                    skipped: false,
                    data: {
                        apolloLeadSource: 'apollo_empty',
                        organization: organization,
                        person: person,
                        entire_json_response: fullResponseText,
                        apolloError: 'No person data in Apollo response',
                        ...extractedFields
                    }
                };
            }

            const apolloData = {
                person: apolloResponse.data.person,
                organization: apolloResponse.data.person.organization
            };

            // Create JSON string of Apollo data for storage
            const apolloJsonString = JSON.stringify(apolloData);

            // Extract fields for individual columns
            const extractedFields = extractApolloFields(apolloData);

            return {
                index,
                source: 'apollo',
                skipped: false,
                data: {
                    apolloLeadSource: 'apollo',
                    apollo_person_id: apolloResponse.data.person?.id || '',
                    organization: apolloData.organization || {},
                    person: apolloData.person || {},
                    entire_json_response: fullResponseText,
                    ...extractedFields
                }
            };
        } catch (apolloErr) {
            logCallback(`Apollo API error: ${apolloErr.message}`);

            // Create fallback data
            const organization = {
                name: row.company || 'Unknown Company',
                website_url: row.website || '',
                industry: row.industry || 'Unknown Industry',
                estimated_num_employees: row.employees || 0,
                short_description: row.description || ''
            };

            const person = {
                first_name: row.first_name || '',
                last_name: row.last_name || '',
                name: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : '',
                title: row.position || '',
                linkedin_url: linkedinUrl || ''
            };

            const apolloData = {
                person: person,
                organization: organization
            };

            const apolloJsonString = JSON.stringify(apolloData);

            // Extract fields for individual columns
            const extractedFields = extractApolloFields(apolloData);

            return {
                index,
                source: 'apollo_error',
                skipped: false,
                data: {
                    apolloLeadSource: 'apollo_error',
                    organization: organization,
                    person: person,
                    apollo_json: apolloJsonString,
                    entire_json_response: JSON.stringify({ error: apolloErr.message }),
                    apolloError: apolloErr.message,
                    ...extractedFields
                }
            };
        }
    } catch (error) {
        // Convert error to returned object instead of throwing
        logCallback(`General error processing lead ${linkedinUrl}: ${error.message}`);

        // Create fallback data
        const organization = {
            name: row.company || 'Unknown Company',
            website_url: row.website || '',
            industry: row.industry || 'Unknown Industry',
            estimated_num_employees: row.employees || 0,
            short_description: ''
        };

        const person = {
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            name: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : '',
            title: row.position || '',
            linkedin_url: linkedinUrl || ''
        };

        const apolloData = {
            person: person,
            organization: organization
        };

        const apolloJsonString = JSON.stringify(apolloData);

        // Extract fields for individual columns
        const extractedFields = extractApolloFields(apolloData);

        return {
            index,
            source: 'error',
            skipped: false,
            data: {
                apolloLeadSource: 'general_error',
                organization: organization,
                person: person,
                apollo_json: apolloJsonString,
                entire_json_response: JSON.stringify({ error: error.message }),
                apolloError: error.message,
                ...extractedFields
            }
        };
    }
}

/**
* Add basic fields to a row that had an error, to ensure CSV has all columns
* @param {Object} row - Data row to enhance
*/
function addBasicFieldsForError(row) {
    // Basic organization object if missing
    if (!row.organization) {
        row.organization = {
            name: row.company || 'Unknown Company',
            website_url: row.website || '',
            industry: row.industry || 'Unknown Industry',
            estimated_num_employees: row.employees || 0,
            short_description: ''
        };
    }

    // Basic person object if missing
    if (!row.person) {
        row.person = {
            first_name: row.first_name || '',
            last_name: row.last_name || '',
            name: row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : '',
            title: row.position || '',
            linkedin_url: row.linkedin_url || ''
        };
    }

    // Make sure all person fields exist
    row['person.id'] = '';
    row['person.first_name'] = row.first_name || row.person.first_name || '';
    row['person.last_name'] = row.last_name || row.person.last_name || '';
    row['person.name'] = row.person.name || '';
    row['person.linkedin_url'] = row.linkedin_url || row.person.linkedin_url || '';
    row['person.title'] = row.position || row.person.title || '';
    row['person.headline'] = '';
    row['person.email'] = '';
    row['person.email_status'] = '';
    row['person.photo_url'] = '';
    row['person.twitter_url'] = '';
    row['person.github_url'] = '';
    row['person.facebook_url'] = '';
    row['person.extrapolated_email_confidence'] = '';
    row['person.organization_id'] = '';
    row['person.state'] = '';
    row['person.city'] = '';
    row['person.country'] = '';
    row['person.departments'] = '';
    row['person.subdepartments'] = '';
    row['person.functions'] = '';
    row['person.seniority'] = '';

    // Education and employment
    row['education'] = '';
    row['employment_history_summary'] = '';

    // Make sure all organization fields exist
    row['organization.id'] = '';
    row['organization.name'] = row.company || row.organization.name || '';
    row['organization.website_url'] = row.website || row.organization.website_url || '';
    row['organization.linkedin_url'] = '';
    row['organization.founded_year'] = '';
    row['organization.logo_url'] = '';
    row['organization.primary_domain'] = '';
    row['organization.industry'] = row.industry || row.organization.industry || '';
    row['organization.estimated_num_employees'] = row.employees || row.organization.estimated_num_employees || '';
    row['organization.retail_location_count'] = '';
    row['organization.raw_address'] = '';
    row['organization.street_address'] = '';
    row['organization.city'] = '';
    row['organization.state'] = '';
    row['organization.postal_code'] = '';
    row['organization.country'] = '';
    row['organization.seo_description'] = '';
    row['organization.short_description'] = row.organization.short_description || '';
    row['organization.total_funding'] = '';
    row['organization.latest_funding_round_date'] = '';
    row['organization.technology_names'] = '';
    row['organization.current_technologies'] = '';
    row['organization.current_technology_categories'] = '';

    // Additional fields
    row['linkedin_profile_photo_url'] = '';

    // If no JSON data was set, create a placeholder
    if (!row.entire_json_response) {
        const apolloData = {
            person: row.person,
            organization: row.organization
        };
        row.entire_json_response = JSON.stringify(apolloData);
    }
}

/**
* Extract relevant fields from Apollo API response
* @param {Object} apolloData - Apollo API response data
* @returns {Object} - Extracted fields
*/
function extractApolloFields(apolloData) {
    try {
        const data = typeof apolloData === 'string' ? JSON.parse(apolloData) : apolloData;

        if (!data) {
            return {};
        }

        const person = data.person || {};
        const org = data.organization || person.organization || {};
        const result = {};

        // === PERSON FIELDS ===
        // Basic person fields
        if (person.id) result['person.id'] = person.id;
        if (person.first_name) result['person.first_name'] = person.first_name;
        if (person.last_name) result['person.last_name'] = person.last_name;
        if (person.name) result['person.name'] = person.name;
        if (person.linkedin_url) result['person.linkedin_url'] = person.linkedin_url;
        if (person.title) result['person.title'] = person.title;
        if (person.headline) result['person.headline'] = person.headline;
        if (person.email) result['person.email'] = person.email;
        if (person.email_status) result['person.email_status'] = person.email_status;
        if (person.photo_url) {
            result['person.photo_url'] = person.photo_url;
            result['linkedin_profile_photo_url'] = person.photo_url;
        }
        if (person.twitter_url) result['person.twitter_url'] = person.twitter_url;
        if (person.github_url) result['person.github_url'] = person.github_url;
        if (person.facebook_url) result['person.facebook_url'] = person.facebook_url;
        if (person.extrapolated_email_confidence) result['person.extrapolated_email_confidence'] = person.extrapolated_email_confidence;
        if (person.organization_id) result['person.organization_id'] = person.organization_id;
        if (person.state) result['person.state'] = person.state;
        if (person.city) result['person.city'] = person.city;
        if (person.country) result['person.country'] = person.country;

        // Department fields as arrays or strings
        if (person.departments) {
            if (Array.isArray(person.departments)) {
                result['person.departments'] = person.departments.join(', ');
            } else {
                result['person.departments'] = String(person.departments);
            }
        }

        if (person.subdepartments) {
            if (Array.isArray(person.subdepartments)) {
                result['person.subdepartments'] = person.subdepartments.join(', ');
            } else {
                result['person.subdepartments'] = String(person.subdepartments);
            }
        }

        if (person.functions) {
            if (Array.isArray(person.functions)) {
                result['person.functions'] = person.functions.join(', ');
            } else {
                result['person.functions'] = String(person.functions);
            }
        }

        if (person.seniority) result['person.seniority'] = person.seniority;

        // === EDUCATION ===
        let education = 'N/A';
        // Try multiple potential paths for education data as seen in the AppScript code
        const educationData = person.education_history || person.educations || person.education || [];

        if (Array.isArray(educationData) && educationData.length > 0) {
            education = educationData.map(edu => {
                let edStr = edu.school || '';
                if (edu.degree) edStr += edStr ? `: ${edu.degree}` : edu.degree;
                if (edu.field_of_study) edStr += edStr.includes(':') ? ` in ${edu.field_of_study}` : edu.field_of_study;

                const startDate = edu.start_date || edu.start_year;
                const endDate = edu.end_date || edu.end_year;

                if (startDate || endDate) {
                    edStr += ` (${startDate || ''}–${endDate || 'Present'})`;
                }

                return edStr;
            }).filter(ed => ed.trim() !== "").join("; ");
        }
        result['education'] = education;

        // === EMPLOYMENT HISTORY ===
        let empHistory = '';
        if (Array.isArray(person.employment_history) && person.employment_history.length > 0) {
            empHistory = person.employment_history.map(e => {
                const title = e.title || "";
                const company = e.organization_name || "";
                const start = e.start_date || "";
                const end = e.end_date || "";
                return `${title} @ ${company} (${start}–${end || "Present"})`;
            }).join(" | ");
        }
        result['employment_history_summary'] = empHistory;

        // === ORGANIZATION FIELDS ===
        if (org.id) result['organization.id'] = org.id;
        if (org.name) result['organization.name'] = org.name;
        if (org.website_url) result['organization.website_url'] = org.website_url;
        if (org.linkedin_url) result['organization.linkedin_url'] = org.linkedin_url;
        if (org.founded_year) result['organization.founded_year'] = org.founded_year;
        if (org.logo_url) result['organization.logo_url'] = org.logo_url;
        if (org.primary_domain) result['organization.primary_domain'] = org.primary_domain;
        if (org.industry) result['organization.industry'] = org.industry;
        if (org.estimated_num_employees) result['organization.estimated_num_employees'] = org.estimated_num_employees;
        if (org.retail_location_count) result['organization.retail_location_count'] = org.retail_location_count;
        if (org.raw_address) result['organization.raw_address'] = org.raw_address;
        if (org.street_address) result['organization.street_address'] = org.street_address;
        if (org.city) result['organization.city'] = org.city;
        if (org.state) result['organization.state'] = org.state;
        if (org.postal_code) result['organization.postal_code'] = org.postal_code;
        if (org.country) result['organization.country'] = org.country;
        if (org.seo_description) result['organization.seo_description'] = org.seo_description;
        if (org.short_description) result['organization.short_description'] = org.short_description;
        if (org.total_funding) result['organization.total_funding'] = org.total_funding;
        if (org.latest_funding_round_date) result['organization.latest_funding_round_date'] = org.latest_funding_round_date;

        // === TECHNOLOGY FIELDS ===
        // Technology names
        if (org.technology_names) {
            if (Array.isArray(org.technology_names)) {
                result['organization.technology_names'] = org.technology_names.join(", ");
            } else {
                result['organization.technology_names'] = String(org.technology_names);
            }
        }

        // Current technologies
        if (org.current_technologies && Array.isArray(org.current_technologies)) {
            const techNames = org.current_technologies.map(t => t.name).filter(Boolean);
            result['organization.current_technologies'] = techNames.join(", ");

            // Tech categories
            const techCategories = [...new Set(org.current_technologies.map(t => t.category).filter(Boolean))];
            result['organization.current_technology_categories'] = techCategories.join(", ");
        }

        return result;
    } catch (error) {
        console.error("Error extracting Apollo fields:", error);
        return { apolloError: error.message };
    }
}

export default {
    processApolloEnrichment
};