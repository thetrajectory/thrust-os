// services/videocx/titleRelevanceService.jsx
import apiClient from '../../utils/apiClient';

// Title relevance prompt from the provided original
const TITLE_RELEVANCE_PROMPT = position =>
  `## Classify Title into Enterprise VideoCX Buyer Category ##
Hi ChatGPT, your task is to **analyze a professional title or tagline** and classify it into **only one of the following categories**:
- **Founder**
- **Relevant**
- **Irrelevant**
You must classify based on whether the person is likely to **influence, own, or directly impact decisions** related to **enterprise deployment of Video KYC, Video Banking, and AI-enabled video customer engagement platforms** — particularly within financial services, insurance, or lending institutions.
---
### :brain: Category Definitions & Rules
#### **Founder**
Use **only** if the title includes clear founding language:
- :white_check_mark: **Founder**, **Co-Founder**, **Founding Partner**, or **Founding CTO**
- :white_check_mark: CEO or Managing Director **only if founding is clearly implied**
Presidents, Chairmans can also be classified here, but
Do **not** classify COOs or other CXOs as "Founder" unless explicitly labeled as such
---
#### **Relevant**
Use this for **senior decision-makers in the following five enterprise functions**, aligned with the buyer profile for enterprise-grade video customer interaction platforms:
- **Banking & Financial Services Operations**
  - Chief Operating Officer, EVP – Retail Ops, VP Operations, Head of Customer Onboarding
- **Risk, Compliance & KYC**
  - Chief Compliance Officer, Head of Regulatory Affairs, Director KYC & AML, Internal Audit Lead
- **IT Infrastructure & Security**
  - Chief Information Security Officer, VP IT Infrastructure, Head of Enterprise Architecture, VP Cloud Hosting
- **Digital Transformation & CX**
  - Chief Digital Officer, Head of Digital Transformation, VP Customer Experience, Innovation Lead
- **Enterprise Procurement**
  - Head of Vendor Management, IT Procurement Lead, Director Strategic Sourcing
:white_check_mark: Titles must be **mid-senior or above**
:x: Exclude if junior (e.g., Analyst, Executive, Coordinator)
:arrow_right: Even if “VideoCX” or “KYC” isn’t explicitly mentioned, ask:
*Does this title suggest someone who owns or shapes workflows around digital onboarding, video-based customer engagement, or compliance-grade service delivery in a financial institution?*
If yes → **Relevant**
---
#### **Irrelevant**
Use for:
- **All other functions**, including Sales, Marketing, HR, Legal, Talent Acquisition, Customer Support, Admin, Strategy
- **All junior roles**, regardless of department
- **Ambiguous titles** with no direct connection to enterprise digital operations, compliance, or infrastructure
**Examples:**
- Sales Director, VP Marketing, HR Business Partner, Legal Advisor, Customer Success Manager, Strategy Director, Country Manager
- KYC Analyst, Digital Intern, Procurement Executive, Junior Architect, Talent Lead, Customer Service Rep
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
markdown
Copy
Edit
## :label: Tagging Logic
- **Founders**: Only titles with explicit founding language (Founder, Co-Founder, Founding Partner, etc.)
- **Relevant**: Senior decision-makers in Ops, Risk/Compliance, IT Infra, Digital CX, or Procurement — particularly within BFSI sectors using/considering video-based onboarding or verification platforms.
- **Irrelevant**: Sales, Marketing, HR, Legal, Strategy, junior roles, or anyone outside core buying centers for compliance-grade enterprise video platforms.`;

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

    // Call OpenAI API for all positions
    const result = await callOpenAIAPI(position, apiKey, model);
    const tokenUsage = result.totalTokens || 0;

    // Extract the response
    const responseText = result.completion.trim();

    // Log the raw response
    logCallback(`Raw model response: "${responseText}"`);
    console.log("OpenAI raw response:", responseText);

    // Determine relevance category based on normalized response
    let relevance;
    let score;
    let classificationMethod = 'api-response';

    // Case-insensitive exact match
    const responseLower = responseText.toLowerCase();

    if (responseLower === 'founder') {
      relevance = 'Founder';
      score = 3; // Highest priority
    } else if (responseLower === 'relevant') {
      relevance = 'Relevant';
      score = 2; // Medium priority
    } else if (responseLower === 'irrelevant') {
      relevance = 'Irrelevant';
      score = 0; // No priority
    } else {
      // If no exact match, check for partial matches
      classificationMethod = 'partial-match';

      if (responseLower.includes('founder')) {
        relevance = 'Founder';
        score = 3;
      } else if (responseLower.includes('relevant') && !responseLower.includes('irrelevant')) {
        relevance = 'Relevant';
        score = 2;
      } else if (responseLower.includes('irrelevant')) {
        relevance = 'Irrelevant';
        score = 0;
      } else {
        // Default case for completely unexpected responses
        relevance = 'Irrelevant';
        score = 0;
        classificationMethod = 'default-fallback';
        logCallback(`Warning: Completely unexpected response "${responseText}" for position "${position}". Defaulting to Irrelevant.`);
      }

      // Log warning for non-exact match responses
      if (!responseLower.match(/^(founder|relevant|irrelevant)$/)) {
        logCallback(`Warning: Unexpected response format "${responseText}" for position "${position}". Interpreted as ${relevance}.`);
      }
    }

    return {
      index,
      data: {
        titleRelevance: relevance,
        titleRelevanceScore: score,
        originalResponse: responseText,
        classificationMethod: classificationMethod,
        customPrompt: TITLE_RELEVANCE_PROMPT(position)
      },
      tokens: tokenUsage
    };
  } catch (error) {
    console.error(`Failed to process title: ${error.message}`);
    logCallback(`Error processing item: ${error.message}`);

    // Return ERROR status instead of default classification
    return {
      index,
      data: {
        titleRelevance: 'ERROR',
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