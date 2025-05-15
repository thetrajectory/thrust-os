// services/videocx/titleRelevanceService.jsx
import apiClient from '../../utils/apiClient';

// Title relevance prompt from the provided original
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
- **Relevant**: Use for all **director seniority** posts like: CEOs, CSOs, CROs, Presidents, Titles from HR, Payroll, IT, Ops, and Finance with **director+ seniority** or **narrow specialist scope** (Comp/Benefits/Rewards/etc.)
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
    const responseText = result.completion.trim().toLowerCase();

    // Log the raw response
    logCallback(`Raw model response: "${result.completion.trim()}"`);

    // Determine relevance category based on normalized response and position
    let relevance;
    let score;

    // EXACT TEXT MATCH (case-insensitive)
    if (responseText === 'founder') {
      relevance = 'Founder';
      score = 3; // Highest priority
    } else if (responseText === 'relevant') {
      relevance = 'Relevant';
      score = 2; // Medium priority
    } else if (responseText === 'irrelevant') {
      relevance = 'Irrelevant';
      score = 0; // No priority
    } else {
      // FALLBACK: If no exact match, look for keywords in the response
      if (responseText.includes('founder') && !responseText.includes('not founder')) {
        relevance = 'Founder';
        score = 3;
      } else if (responseText.includes('relevant') && !responseText.includes('irrelevant')) {
        relevance = 'Relevant';
        score = 2;
      } else if (responseText.includes('irrelevant')) {
        relevance = 'Irrelevant';
        score = 0;
      } else {
        // SECONDARY FALLBACK: If no keywords in response, analyze the position
        const positionLower = position.toLowerCase();
        
        // Check for clear founder indicators
        if (
          positionLower.includes('founder') || 
          positionLower.includes('co-founder') ||
          positionLower.includes('founding')
        ) {
          relevance = 'Founder';
          score = 3;
          logCallback(`Position-based classification: "${position}" -> Founder`);
        }
        // Check for C-suite and director+ positions in relevant departments
        else if (
          (
            (positionLower.includes('ceo') || 
             positionLower.includes('cfo') || 
             positionLower.includes('cio') || 
             positionLower.includes('cto') ||
             positionLower.includes('president') ||
             positionLower.includes('chief') ||
             positionLower.includes('director') ||
             positionLower.includes('head of') ||
             positionLower.includes('vp ') ||
             positionLower.includes('vice president')) 
             &&
            (positionLower.includes('hr') ||
             positionLower.includes('human resource') ||
             positionLower.includes('people') ||
             positionLower.includes('finance') ||
             positionLower.includes('payroll') ||
             positionLower.includes('it') ||
             positionLower.includes('information technology') ||
             positionLower.includes('procurement') ||
             positionLower.includes('operations') ||
             positionLower.includes('benefits') ||
             positionLower.includes('compensation'))
          )
        ) {
          relevance = 'Relevant';
          score = 2;
          logCallback(`Position-based classification: "${position}" -> Relevant (senior role in relevant department)`);
        }
        // Check for specialized roles in relevant areas
        else if (
          (positionLower.includes('benefits') ||
           positionLower.includes('compensation') ||
           positionLower.includes('total rewards') ||
           positionLower.includes('payroll') ||
           positionLower.includes('it asset')) &&
          (positionLower.includes('manager') ||
           positionLower.includes('lead') ||
           positionLower.includes('specialist') ||
           positionLower.includes('administrator'))
        ) {
          relevance = 'Relevant';
          score = 2;
          logCallback(`Position-based classification: "${position}" -> Relevant (specialized role)`);
        }
        // All other positions default to Irrelevant
        else {
          relevance = 'Irrelevant';
          score = 0;
          logCallback(`Position-based classification: "${position}" -> Irrelevant (default)`);
        }
      }
    }

    return {
      index,
      data: {
        titleRelevance: relevance,
        titleRelevanceScore: score,
        originalResponse: result.completion.trim(),
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
  try {
    const response = await apiClient.openai.chatCompletion({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: "system", content: "You are an expert in classifying executive titles." },
        { role: "user", content: prompt }
      ],
      max_tokens: 10, // Very short response needed
      temperature: 0.1 // Low temperature for consistent results
    });

    // Extract the completion
    let completion = '';
    if (response && response.choices && response.choices.length > 0) {
      completion = response.choices[0].message.content;
    }

    // Extract token usage
    let totalTokens = 0;
    if (response && response.usage) {
      totalTokens = response.usage.total_tokens || 0;
    }

    return {
      completion,
      totalTokens
    };
  } catch (error) {
    console.error("OpenAI API request failed:", error);
    throw new Error(`OpenAI API request failed: ${error.message}`);
  }
}

export default {
  processTitleRelevance
};