// services/titleRelevanceService.js
import axios from 'axios';

// Title relevance prompt template
const TITLE_RELEVANCE_PROMPT = position =>
  `## Classify Title into GCC-Relevant Category ##

Hi ChatGPT, your task is to **analyze a professional title or tagline** and classify it into **only one of the following categories**:

- **Founder**
- **Relevant**
- **Irrelevant**

You must classify based on whether the person is likely to **influence or make decisions** related to **setting up a Global Capability Center (GCC)** or **building global tech/talent teams**.

---

### 🧠 Category Definitions & Rules

#### **Founder**  
Use **only** if the title includes clear founding language:
- ✅ **Founder**, **Co-Founder**, **Founding Partner**, or **Founding CTO**
- ✅ CEO or Managing Director **only if founding is clearly implied**
- ❌ Do **not** classify COOs, Presidents, or other CXOs as "Founder" unless explicitly labeled as such

---

#### **Relevant**  
Use this for **senior decision-makers in the following four functions only**:

- **Engineering Leadership**  
  - CTO, VP Engineering, Head of Engineering, Director of Software, Platform Engineering Lead

- **IT Leadership**  
  - CIO, Head of IT, VP IT, Infrastructure Lead, Enterprise Tech Director

- **Product Leadership**  
  - CPO, Head of Product, VP Product, Director Product Management

- **Finance Leadership**  
  - CFO, VP Finance, Finance Director, Head of FP&A

✅ Titles must be **mid-senior or above**
❌ Exclude if junior (e.g., Associate, Analyst, Intern, Executive)

➡️ Even if "GCC" isn't mentioned, ask:  
*Does this title suggest someone who decides on where/how to build engineering/product/talent capacity globally?*

If yes → **Relevant**

---

#### **Irrelevant**  
Use for:
- **All other functions**, including Sales, Marketing, HR, Talent, Customer Success, Legal, Admin, Procurement, Business/Strategy
- **All junior roles**, regardless of department
- **Ambiguous titles** with no strong functional signal

**Examples:**  
- Sales Director, Marketing VP, HR Business Partner, Talent Acquisition Lead, Country Manager, Strategy Director, Business Head  
- Product Analyst, Finance Executive, Engineering Intern, Technical Recruiter, Associate Architect

---

### 'Job Title Input' starts ###

${position}

### 'Job Title Input' ends ###

---

## Ideal output format starts ##

[One of: Founder | Relevant | Irrelevant]

## Ideal output format ends ##

---

IMPORTANT: Return ONLY the final category name. No introductions, no explanations, no other text—just one of these three words: Founder, Relevant, or Irrelevant.`;

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