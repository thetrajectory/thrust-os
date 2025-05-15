// services/videocx/titleRelevanceService.jsx
import axios from 'axios';

// Title relevance prompt template for Enterprise Device Benefits Buyer
const TITLE_RELEVANCE_PROMPT = position =>
  `## Classify Title into Enterprise Device Benefits Buyer Category ##
Hi ChatGPT, your task is to **analyze a professional title or tagline** and classify it into **only one of the following categories**:
- **Founder**
- **Relevant**
- **Irrelevant**
You must classify based on whether the person is likely to **influence or make decisions** related to **employee device benefit programs**, **leasing workflows**, or **orchestrating HR-Finance-IT coordination** in **large enterprises (500+ employees)**.
---
### :brain: Category Definitions & Rules
#### **Founder**
Use **only** if the title includes clear founding language:
- :white_check_mark: **Founder**, **Co-Founder**, **Founding Partner**, or **Founding CTO**
- :white_check_mark: CEO or Managing Director **only if founding is clearly implied**
- :x: Do **not** classify COOs, Presidents, or other CXOs as "Founder" unless explicitly labeled as such
---
#### **Relevant**
Use this for **decision-makers or strong influencers** in the following enterprise functions — especially those who:
- Control payroll, IT provisioning, or benefits workflows
- Coordinate across HR, IT, and Finance
- Implement or scale employee-facing perks, leasing, or compensation-linked infra
**Accepted Functions & Titles:**
| Function | Typical Relevant Titles |
|----------|-------------------------|
| **People/HR** | CHRO, VP People, Head of HR, Director People Ops, Total Rewards Lead, Benefits Program Manager, Compensation Lead |
| **Finance/Payroll** | CFO, VP Finance, Head of Payroll, Director FP&A, Controller, Senior Payroll Manager |
| **IT / End-User Support** | CIO, VP IT, Director End-User Computing, IT Asset Manager |
| **Procurement / Vendor Mgmt** | Head of Procurement, Strategic Sourcing Lead, Vendor Governance Director |
| **Ops / Cross-functional** | COO, Chief of Staff, Director of Workplace Ops |
| **Specialist Tags** | "Total Rewards", "Compensation", "Benefits", "Employee Experience", "Payroll" — if tied to manager+ scope |
:white_check_mark: Use only if role is **Director or above**, *or* is a **clearly scoped specialist** in a relevant function (e.g., "Compensation Manager" at 10,000+ org)
:white_check_mark: "Manager", "Lead", or "Specialist" are valid **only** if:
- Role is within a top-priority function (HR/Payroll/IT/Comp & Benefits)
- Title clearly signals implementation responsibility, not just execution
:x: **Do not include** generalists (e.g., "HR Manager", "IT Analyst") unless function is *narrowly focused* and **title + level indicate control or implementation authority**
:arrow_right: Even if "device leasing" isn't mentioned, ask:
*Does this title suggest the person could reasonably design, approve, or run a modern, scalable employee benefit or device program tied to payroll or IT workflows?*
If yes → **Relevant**
---
#### **Irrelevant**
Use for:
- **All unrelated functions**, such as Sales, Marketing, Customer Success, Legal, Admin, Country Mgmt
- **All junior roles**, regardless of function
- **Generic titles** like "Business Head" or "Strategy Lead" unless grounded in a relevant function
- **Broad talent/people/ops roles** with no visible link to payroll, benefits, or asset provisioning
**Examples:**
- Sales Director, Marketing VP, HR Executive, Talent Acquisition Lead, Country Manager
- Product Analyst, Finance Associate, IT Support Executive, Procurement Trainee
- "Business Strategy Lead" (unless nested in HR/IT/Payroll context)
---
### 'Job Title Input' starts ###
${position}
### 'Job Title Input' ends ###
---
## Ideal output format starts ##
[One of: Founder | Relevant | Irrelevant]
## Ideal output format ends ##
---
Return only the final output. No introductions, no explanations—just the output.
## :label: Tagging Logic
- **Founders**: Use only when founding roles are explicitly stated (Founder, Co-Founder, etc.)
- **Relevant**: Titles from HR, Payroll, IT, Ops, and Finance with **director+ seniority** or **narrow specialist scope** (Comp/Benefits/Rewards/etc.)
- **Irrelevant**: All others—especially generalists, juniors, or roles with no clear authority or linkage to device benefits
Return only the final output. No introductions, no explanations—just the output.`;

/**
 * Process title relevance for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processTitleRelevance(data, logCallback, progressCallback) {
  logCallback("Starting Title Relevance Analysis...");

  // Get configuration from environment
  const apiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
  const model = import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_MODEL;
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_TITLE_RELEVANCE_BATCH_SIZE || "100");

  const startTimestamp = Date.now();

  if (!apiKey) {
    throw new Error('OpenAI API key is not set. Please check your environment configuration.');
  }

  // Initialize result array with original data
  const processedData = [...data];

  // Track analytics
  let founderCount = 0;
  let relevantCount = 0;
  let irrelevantCount = 0;
  let errorCount = 0;
  let tokensUsed = 0;
  let skippedCount = 0;

  // Process in batches
  for (let i = 0; i < data.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, data.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = data[index];

      // Skip processing if row is already tagged - unlikely in title relevance step as it's the first step
      if (row.relevanceTag) {
        logCallback(`Skipping item ${index + 1}: Already tagged as "${row.relevanceTag}"`);
        skippedCount++;
        progressCallback((index + 1) / data.length * 100);
        continue;
      }

      // Create a promise for each item in the batch
      const processPromise = processSingleTitle(row, index, apiKey, model, logCallback)
        .then(result => {
          // Update the result in the processedData array
          processedData[index] = {
            ...processedData[index],
            ...result.data
          };

          // Update analytics
          if (result.data.titleRelevance === 'Founder') {
            founderCount++;
          } else if (result.data.titleRelevance === 'Relevant') {
            relevantCount++;
          } else if (result.data.titleRelevance === 'Irrelevant') {
            irrelevantCount++;
          }

          // Track tokens
          if (result.tokens) {
            tokensUsed += result.tokens;
          }

          // Log individual item completion
          logCallback(`Processed item ${index + 1}: ${result.data.titleRelevance} - ${row.position || 'No position'}`);

          // Update progress
          progressCallback((index + 1) / data.length * 100);
        })
        .catch(error => {
          logCallback(`Error processing item ${index + 1}: ${error.message}`);
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            titleRelevance: 'ERROR',
            titleRelevanceScore: 0,
            titleRelevanceError: error.message
          };

          // Update progress even on error
          progressCallback((index + 1) / data.length * 100);
        });

      batchPromises.push(processPromise);
    }

    // Wait for all items in the batch to complete
    await Promise.all(batchPromises);

    // Add a small delay between batches
    if (i + currentBatchSize < data.length) {
      logCallback("Pausing briefly before next batch...");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Title Relevance Analysis Complete:`);
  logCallback(`- Founders: ${founderCount}`);
  logCallback(`- Relevant: ${relevantCount}`);
  logCallback(`- Irrelevant: ${irrelevantCount}`);
  logCallback(`- Skipped: ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);
  logCallback(`- Total tokens used: ${tokensUsed}`);
  logCallback(`- Processing Time: ${processingTimeSeconds.toFixed(2)} seconds`);

  return {
    data: processedData,
    analytics: {
      founderCount,
      relevantCount,
      irrelevantCount,
      skippedCount,
      errorCount,
      tokensUsed,
      totalProcessed: data.length - skippedCount,
      startTimes: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

/**
 * Process a single title
 * @param {Object} row - Data row to process
 * @param {number} index - Index of the row
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - OpenAI model to use
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Processing result
 */
async function processSingleTitle(row, index, apiKey, model, logCallback) {
  const position = row.position || '';

  // Skip empty positions
  if (!position.trim()) {
    return {
      index,
      data: {
        titleRelevance: 'Irrelevant',
        titleRelevanceScore: 0,
        customPrompt: ''
      },
      tokens: 0
    };
  }

  try {
    logCallback(`Analyzing position: ${position}`);

    // Call OpenAI API
    const result = await callOpenAIAPI(position, apiKey, model);

    const tokenUsage = result.totalTokens || 0;

    // Extract and normalize the response
    const responseText = result.completion.trim();

    // Exact match to one of the three valid categories
    let relevance;
    let score;

    // After getting the OpenAI response
    console.log("OpenAI raw response:", responseText);

    // Use exact matching for categories with more rigorous checks and handling for founder titles
    if (responseText.toLowerCase() === 'founder') {
      relevance = 'Founder';
      score = 3; // Highest priority
    } else if (responseText.toLowerCase() === 'relevant') {
      relevance = 'Relevant';
      score = 2; // Medium priority
    } else if (responseText.toLowerCase() === 'irrelevant') {
      relevance = 'Irrelevant';
      score = 0; // No priority
    } else {
      // Handle unexpected responses by looking for partial matches or title patterns
      if (responseText.toLowerCase().includes('founder') || position.toLowerCase().includes('founder')) {
        relevance = 'Founder';
        score = 3;
        logCallback(`Special case: Position "${position}" containing "founder" classified as Founder`);
      } else if (responseText.toLowerCase().includes('relevant')) {
        relevance = 'Relevant';
        score = 2;
      } else {
        // Default to Irrelevant for any other response
        relevance = 'Irrelevant';
        score = 0;
      }
      logCallback(`Warning: Unexpected response format "${responseText}" for position "${position}". Defaulting to ${relevance}.`);
    }

    return {
      index,
      data: {
        titleRelevance: relevance,
        titleRelevanceScore: score,
        originalResponse: responseText,
        customPrompt: TITLE_RELEVANCE_PROMPT(position)
      },
      tokens: tokenUsage
    };
  } catch (error) {
    console.error(`Failed to process title: ${error.message}`);
    // Instead of throwing, return a default value
    return {
      index,
      data: {
        titleRelevance: 'Irrelevant',
        titleRelevanceScore: 0,
        titleRelevanceError: error.message
      },
      tokens: 0
    };
  }
}

/**
 * Call OpenAI API to analyze a position
 * @param {string} position - Position to analyze
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - OpenAI model to use
 * @returns {Promise<Object>} - OpenAI API response
 */
async function callOpenAIAPI(position, apiKey, model) {
  // Create the prompt
  const prompt = TITLE_RELEVANCE_PROMPT(position);

  // Set up the request
  const requestData = {
    model: model,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    max_tokens: 10, // Very short response needed
    temperature: 0.1, // Low temperature for consistent results
  };

  try {
    // Make the API request
    const response = await axios.post('/api/openai/chat/completions', requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Check for errors
    if (response.data.error) {
      console.error("OpenAI API Error:", response.data.error);
      throw new Error(`OpenAI API Error: ${response.data.error.message || 'Unknown error'}`);
    }

    // Extract the completion
    const completion = response.data.choices[0].message.content;

    // Extract token usage
    const promptTokens = response.data.usage?.prompt_tokens || 0;
    const completionTokens = response.data.usage?.completion_tokens || 0;
    const totalTokens = response.data.usage?.total_tokens || 0;

    console.log("Title Relevance Finished");
    return {
      completion,
      promptTokens,
      completionTokens,
      totalTokens
    };
  } catch (error) {
    console.error("OpenAI API request failed:", error.response?.data || error.message);
    throw new Error(`OpenAI API request failed: ${error.response?.data?.error?.message || error.message}`);
  }
}

export default {
  processTitleRelevance
};