// services/find-advisor/videocx/employmentHistoryAnalysisService.jsx
import apiClient from '../../../utils/apiClient';

// Employment history analysis prompt
const EMPLOYMENT_HISTORY_PROMPT = (employmentHistory) => {
  return `"## :brain: FINAL ADVISOR SCORING PROMPT — VIDEOCX.IO
You are evaluating a potential advisor for **VideoCX.io** — an enterprise video infrastructure platform powering compliant, regulated customer interactions in BFSI: onboarding, KYC, credit verification, virtual advisory, and policy servicing.
Your job is to assess whether the advisor is **strategically relevant and trusted** enough to influence or support our GTM motion.
Return only a structured 3-part score:
1. **Customer:** Whether they are *currently* in a buyer role
2. **Seniority:** Based on total professional years
3. **Experience Relevance:** Based on trust path exposure and strategic proximity
Use the scoring rubrics below. Then return your evaluation using the strict output format.
---
## :dart: PRODUCT + BUYER CONTEXT
VideoCX.io is used by 60+ BFSI organizations including banks, NBFCs, TPAs, and insurers.
Core use cases:
* Video KYC & digital onboarding
* Credit verification
* Customer support & policy servicing
* Virtual RM / advisory flows
**Target Buyers:**
* COOs
* CIOs / Infra & IT heads
* Heads of Risk, Compliance, Ops
* Transformation / CX leads
**Who influences deals:**
* Ex-risk/ops leaders who’ve done onboarding/KYC transitions
* Big 4 consultants or regtech PMs who guided compliance change
* TCS/Infosys delivery leads who implemented onboarding stacks
* Semi-retired execs still advising BFSI orgs
* Infra PMs or GTM leaders from BFSI-focused SaaS vendors
---
## :straight_ruler: AXIS 1: SENIORITY (1–5)
Score only on **total years of experience** and **role maturity**.
| Score | Definition                                                |
| ----- | --------------------------------------------------------- |
| 5     | 15+ years — SVP+, CXO, Partner, or Board-level roles      |
| 4     | 10–15 years — Director+, transformation lead, seasoned PM |
| 3     | 5–10 years — mid-level PM, manager, product owner         |
| 2     | 2–5 years — junior manager, associate consultant          |
| 1     | <2 years — early career, no strategic experience          |
→ **Strict rule:** Seniority ≠ brand. Score based on scope + years, not just org.
---
## :brain: AXIS 2: EXPERIENCE RELEVANCE (1–5)
This is your most important signal. Score based on the **trust value, repeatability, and adjacency** of the advisor’s past roles.
Prioritize those who influenced buyers from **outside**, across **multiple orgs**, with **system-level exposure**.
| Score | Definition                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **5** | :white_check_mark: **Top-tier indirect trust path exposure**. Has worked across multiple BFSI clients/orgs as an advisor, integrator, delivery lead, or regtech PM in onboarding/KYC/compliance. May also have direct buyer role in past. |
| **4** | :white_check_mark: **One strong indirect trust role** in buyer ecosystem — e.g., SaaS PM, Big 4 consultant, BFSI transformation lead. Deep context but not repeated across orgs.                                                          |
| **3** | :large_yellow_circle: **Direct buyer experience only** — e.g., Head of Risk or Ops at BFSI org, but no consulting, delivery, or system-wide role. Trusted inside one org, not across many.                                                  |
| **2** | :warning: BFSI-adjacent roles, but unclear exposure — e.g., CX manager, branch ops, support. Weak trust vector.                                                                                                                 |
| **1** | :x: Wrong function or domain. No BFSI onboarding, infra, or compliance context — e.g., B2C SaaS, ecommerce, HR, edtech.                                                                                                    |
### :dart: CONCEPTUAL CLARITY (for scoring relevance):
**Relevance is high when:**
* Advisor had **system-level access** to onboarding/KYC decision cycles
* Worked **across orgs** (consulting, delivery, regtech)
* Was a **known enabler** of buyer teams, even if not the buyer
* Was trusted to **guide or unblock** compliance, risk, or ops teams
* Has **repeatable pattern** across BFSI clients
**Relevance is low when:**
* BFSI tag exists, but only in sales/support/ops branches
* Worked *in* buyer org, but never influenced change
* Worked in unrelated verticals (media, ecommerce, health)
* Had brand name logos but in irrelevant functions
### :lock: Hardcoded 5/5 Examples:
* “Senior Consultant @ FMI” (known BFSI onboarding consultant)
* “Delivery Lead @ TCS, BFSI vertical” (multi-client onboarding stacks)
* “GTM Advisor @ Regtech onboarding SaaS”
* “Advisor to 3 NBFCs on credit infra transitions”
* “Ex-COO, now board member to SFB transformation program”
---
## :closed_lock_with_key: CURRENT BUYER (Yes/No)
Look at the most recent role/title/org.
Say **Yes** if:
* Currently employed at a BFSI org (Bank, NBFC, Insurer, TPA)
* In a role related to Ops, Risk, Compliance, Infra, or Transformation
* Could reasonably influence or veto a product like ours
Say **No** if:
* Advisory/consulting/fractional role
* Exited industry
* In unrelated vertical or function
* No longer in decision pathway
→ **Be strict. If unsure, default to No.**
---
## :inbox_tray: INPUT FORMAT (DROPZONE)
Analyze the following advisor’s experience snippet:
## Experience of advisor for you to analyze starts
${employmentHistory}
## Experience of advisor for you to analyze ends
---
## :outbox_tray: OUTPUT FORMAT (MANDATORY)
Return only this:
"
  Customer: <Yes /No >
    ~
    Seniority: X / 5
    [One tight, info - dense justification — total years, role scope]
  ~
    Experience relevance: X / 5
    [One tight, info - dense justification — trust path, role pattern, buyer proximity]
"
### :white_check_mark: Example
"
  Customer: No
  ~
    Seniority: 4 / 5
  12 + years across strategy and ops roles, including VP and SVP at regional BFSI org.
~
    Experience relevance: 5 / 5
Led onboarding advisory across 4 BFSI clients as consultant; deep repeatable trust path.
"
---
### :octagonal_sign: STRICT INSTRUCTIONS:
* No markdown, no extra symbols, no summarizing language
* No total score — score only the 2 axes + customer flag
* Do not hallucinate context — reason only from the input
* Use hardcoded patterns AND conceptual logic to guide judgment
* Be sharp. Be precise. Be consistent."`;
};

/**
 * Process employment history analysis
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processEmploymentHistoryAnalysis(data, logCallback, progressCallback) {
  logCallback("Starting Employment History Analysis...");

  // Filter data to only process untagged rows
  const untaggedData = data.filter(row => !row.relevanceTag);
  logCallback(`Processing ${untaggedData.length} untagged rows out of ${data.length} total rows.`);

  // Safety check - if no untagged rows, return original data
  if (untaggedData.length === 0) {
    logCallback("No untagged rows to process. Skipping employment history analysis.");
    return {
      data: data,
      analytics: {
        processedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        tokensUsed: 0,
        startTime: Date.now(),
        endTime: Date.now(),
        processingTimeSeconds: 0
      }
    };
  }

  const startTimestamp = Date.now();

  // Get configuration from environment
  const apiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
  const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL || "gpt-4o-mini";
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_EMPLOYMENT_BATCH_SIZE || "5");

  if (!apiKey) {
    throw new Error('OpenAI API key is not set. Please check your environment configuration.');
  }

  // Create a map for fast lookup of original indexes
  const originalIndexMap = new Map();
  data.forEach((row, index) => {
    // Use multiple fields for better matching
    const key = getUniqueKey(row);
    if (key) {
      originalIndexMap.set(key, index);
    }
  });

  // Initialize result array with original data
  const processedData = [...data];

  // Track analytics
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let tokensUsed = 0;

  // Process in batches
  for (let i = 0; i < untaggedData.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, untaggedData.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each batch in parallel
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = untaggedData[index];

      // Find original index
      const key = getUniqueKey(row);
      const originalIndex = key ? originalIndexMap.get(key) : -1;

      if (originalIndex === undefined || originalIndex === -1) {
        logCallback(`Warning: Could not find original index for item ${index + 1}. Using fallback approach.`);
        // Skip the error logging for now, we'll handle it in the Promise
      }

      // Create a promise for processing this item
      const processPromise = (async () => {
        try {
          // Get the actual index to update in the original data
          let targetIndex = originalIndex;

          // If we couldn't find the index using the key, try a fallback approach
          if (targetIndex === undefined || targetIndex === -1) {
            targetIndex = data.findIndex(item =>
              (item.id && item.id === row.id) ||
              (item.linkedin_url && item.linkedin_url === row.linkedin_url) ||
              (item.first_name && item.last_name &&
                item.first_name === row.first_name &&
                item.last_name === row.last_name)
            );

            if (targetIndex === -1) {
              logCallback(`Error: Could not map item ${index + 1} to original data. Skipping.`);
              throw new Error("Could not find matching index in original data");
            }
            logCallback(`Found fallback index ${targetIndex} for item ${index + 1}.`);
          }

          // Skip processing if row is already tagged
          if (row.relevanceTag) {
            logCallback(`Skipping item ${index + 1}: Already tagged as "${row.relevanceTag}"`);
            skippedCount++;
            return { targetIndex, skipped: true };
          }

          // Extract employment history from the row
          const employmentHistory = row.employment_history_summary || '';

          if (!employmentHistory.trim()) {
            logCallback(`Item ${index + 1}: No employment history available, but still processing`);
          }

          // Process this item
          const result = await analyzeEmploymentHistory(row, employmentHistory, index, apiKey, model, logCallback);

          if (!result) {
            logCallback(`Error: Got undefined result for item ${index + 1}`);
            throw new Error("Undefined result from analysis");
          }

          // Get the response text
          const responseText = result.response || '';

          return {
            targetIndex,
            skipped: false,
            result,
            responseText
          };
        } catch (error) {
          logCallback(`Error processing item ${index + 1}: ${error.message}`);
          // Return the error to handle it in the main Promise.all handler
          return {
            targetIndex: originalIndex !== -1 ? originalIndex : index,
            error: error.message
          };
        }
      })();

      batchPromises.push(processPromise);
    }

    // Wait for all promises in this batch to complete
    const batchResults = await Promise.all(batchPromises);

    // Process the results of this batch
    for (const result of batchResults) {
      if (result.skipped) {
        // Already counted skipped in the promise
        continue;
      } else if (result.error) {
        errorCount++;

        // Add error info to the processed data
        if (result.targetIndex >= 0 && result.targetIndex < processedData.length) {
          processedData[result.targetIndex] = {
            ...processedData[result.targetIndex],
            advisorAnalysisError: result.error
          };
        }
      } else {
        // Successfully processed
        processedCount++;

        // Store the raw API response in the original data array
        if (result.targetIndex >= 0 && result.targetIndex < processedData.length) {
          processedData[result.targetIndex] = {
            ...processedData[result.targetIndex],
            advisorAnalysisResponse: result.responseText,
            advisorAnalysisPrompt: result.result.prompt || ''
          };
          logCallback(`Successfully stored analysis response at index ${result.targetIndex}`);
        }

        // Update token usage
        if (result.result.tokens) {
          tokensUsed += result.result.tokens;
        }
      }
    }

    // Update progress after each batch
    progressCallback(Math.min(100, ((i + currentBatchSize) / untaggedData.length) * 100));

    // Add a small delay between batches to avoid rate limiting
    if (i + currentBatchSize < untaggedData.length) {
      logCallback("Pausing briefly between batches to avoid rate limits...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Employment History Analysis Complete:`);
  logCallback(`- Processed: ${processedCount}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- Total tokens used: ${tokensUsed}`);
  logCallback(`- Processing Time: ${processingTimeSeconds.toFixed(2)} seconds`);

  // Verify how many rows have analysis responses
  const rowsWithResponses = processedData.filter(row => row.advisorAnalysisResponse).length;
  logCallback(`- Rows with analysis responses: ${rowsWithResponses} out of ${processedData.length} total rows`);

  return {
    data: processedData,
    analytics: {
      processedCount,
      skippedCount,
      errorCount,
      tokensUsed,
      rowsWithResponses,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

/**
 * Generate a unique key for a row to aid in mapping
 * @param {Object} row - Data row
 * @returns {string} - Unique key
 */
function getUniqueKey(row) {
  if (row.id) return `id:${row.id}`;
  if (row.linkedin_url) return `linkedin:${row.linkedin_url}`;
  if (row.first_name && row.last_name) return `name:${row.first_name.toLowerCase()}-${row.last_name.toLowerCase()}`;
  if (row.person?.first_name && row.person?.last_name)
    return `name:${row.person.first_name.toLowerCase()}-${row.person.last_name.toLowerCase()}`;

  // Fallback to composite key
  const email = row.email || row.person?.email || '';
  const company = row.company || row.organization?.name || '';
  const position = row.position || row.person?.title || '';

  if (email || company || position) {
    return `composite:${email.toLowerCase()}-${company.toLowerCase()}-${position.toLowerCase()}`;
  }

  return null;
}

/**
 * Analyze employment history for a single lead
 * @param {Object} row - Data row
 * @param {string} employmentHistory - Employment history text
 * @param {number} index - Index of the row
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - OpenAI model to use
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Analysis result with raw response
 */
async function analyzeEmploymentHistory(row, employmentHistory, index, apiKey, model, logCallback) {
  try {
    logCallback(`Analyzing employment history for lead ${index + 1}`);

    // Create a default placeholder if employment history is empty
    const effectiveHistory = employmentHistory.trim()
      ? employmentHistory
      : "No employment history available for this lead.";

    // Call OpenAI API
    const prompt = EMPLOYMENT_HISTORY_PROMPT(effectiveHistory);

    // Log prompt length for debugging
    logCallback(`Prompt length for item ${index + 1}: ${prompt.length} characters`);

    const result = await apiClient.openai.chatCompletion({
      model: model,
      messages: [
        { role: "system", content: "You are an expert in analyzing career paths and identifying advisor relationships." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    // Extract response text
    let responseText = '';
    if (result && result.choices && result.choices.length > 0) {
      responseText = result.choices[0].message.content.trim();
      logCallback(`Received response for item ${index + 1}: ${responseText.substring(0, 50)}...`);
    } else {
      logCallback(`Warning: No response content for lead ${index + 1}`);
      responseText = "No response received";
    }

    // Track token usage
    let tokenUsage = 0;
    if (result.usage) {
      tokenUsage = result.usage.total_tokens || 0;
      logCallback(`Token usage for item ${index + 1}: ${tokenUsage}`);
    }

    // Return the raw response
    return {
      index,
      response: responseText,
      prompt: prompt,
      tokens: tokenUsage
    };
  } catch (error) {
    console.error(`Error analyzing employment history:`, error);
    logCallback(`Error analyzing employment history for item ${index + 1}: ${error.message}`);

    // Instead of throwing, return a partial result with error information
    return {
      index,
      response: `Error analyzing: ${error.message}`,
      prompt: EMPLOYMENT_HISTORY_PROMPT(employmentHistory || "No employment history available"),
      tokens: 0,
      error: error.message
    };
  }
}

// Export the processor function directly
export const employmentHistoryAnalysis = processEmploymentHistoryAnalysis;

export default {
  processEmploymentHistoryAnalysis,
  employmentHistoryAnalysis
};