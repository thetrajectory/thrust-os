// services/companyRelevanceService.js
import apiClient from '../utils/apiClient';

// Load environment variables
// dotenv.config();

/**
 * Company relevance prompt template
 * @param {string} companyDesc - Company description
 * @param {string} websiteContent - Website content
 * @returns {string} - Prompt template
 */
const COMPANY_RELEVANCE_PROMPT = (companyDesc, websiteContent) => {
  let prompt = `Hi ChatGPT, your task is to analyze a company's website content and classify them into **one of three buckets**:

  1. A **Score from 1–5/5** → if they are a **potential sales lead**
  2. **Competitor** → if they offer **offshore/global team building, recruiting, or delivery staffing**
  3. **Irrelevant** → if they are clearly outside our target sectors and show no need for software/AI/delivery teams

  ---

  ### 🔍 How to Think About Fit

  The company is considered a **fit for us (and should be scored)** if:

  - They operate in any of the following industries:
  **SaaS**, **AI/ML**, **developer tools**, **infra platforms**, **data/analytics products**, **IT services**, **digital consulting**, **creative agencies**, **performance marketing firms**, **content studios**, **SEO/CRM/email marketing agencies**, **revops or GTM agencies**, **CX/BPO platforms**, **tech-enabled research ops**, or similar.

  - OR if their **team needs center around software, AI, machine learning, engineering, data science**
  This includes even niche firms **outside core industries**, if they have a heavy dependency on **technical or SOFTWARE roles**.

  **In short: if they either operate in a known target industry OR depend on software/AI teams—they are fair game.**

  ---

  ### 🧠 Scoring Criteria (Only apply a score if they are not a Competitor or Irrelevant)

  | Score | When to use it |
  |-------|----------------|
  | **5/5** | They are in a target industry *and* show clear scale intent—such as hiring, funding, offshore ops, or growth strain |
  | **4/5** | Target industry is confirmed, but no visible scale signals yet |
  | **3/5** | Could be relevant, but very vague site—unclear product/team structure |
  | **2/5** | Slight possibility of relevance, but weak or niche—no obvious delivery needs |
  | **1/5** | Almost no fit, but not 100% disqualified |

  ---

  ### 🚀 What Counts as Real "Intent to Scale"

  To give a 5/5, look for real signals that they are scaling or have delivery pain:
  - **Funding news** or VC mentions
  - **Hiring** 5+ delivery roles (engineering, design, content, GTM, support, etc.)
  - Case studies or blog posts talking about **scaling**, **ramping teams**, or **offloading ops**
  - Explicit mention of **global/offshore team use**, **expansion**, **fast hiring**, or **delivery optimization**

  ---

  ### ❌ What Makes a Company "Competitor"

  Mark as **Competitor** if:
  - They help other companies **hire, staff, or manage teams** in tech, AI, GTM, or marketing
  - They offer **offshore delivery**, **pods**, **staff augmentation**, or **team-building** services in India, Philippines, LATAM, etc.
  - They sell **talent infrastructure**, **dedicated teams**, or run as **an outsourcing partner** for execution functions

  **If they sound like us—they *are* us. Competitor.**

  ---

  ### ✅ Final Output Format (Strictly Use This Format):

  **Score: <1–5>/5** **OR** **Competitor** **OR** **Irrelevant**

  **Reasoning:**  
  - <One crisp, 10–12 word definition of what they do>  
  - <Industry + team structure fit — highlight specific technical/delivery needs and why: ****BASICALLY WHY YOU THINK THIS COMPANY'S PRODUCT REQUIRES A TECH/SOFTWARE TEAM****>   
  - <Why they got this score — include growth signals, red flags, or other context>

  **Company Overview:**  
  ${companyDesc}
  B2B / B2C?

  ---

  ### 'Target Company Website Content' starts ###

  ${websiteContent}

  ### 'Target Company Website Content' ends ###


  Return only the final output. No introductions, no explanations—just the output.`;

  return prompt;
};

/**
 * Process company relevance for a batch of data
 * @param {Array} data - Array of lead data objects
 * @param {Function} logCallback - Callback function to log messages
 * @param {Function} progressCallback - Callback function to update progress
 * @returns {Promise<Object>} - Object containing processed data and analytics
 */
export async function processCompanyRelevance(data, logCallback, progressCallback) {
  logCallback("Starting Company Relevance Analysis...");

  const startTimestamp = Date.now();

  // Get configuration from environment variables
  const apiKey = import.meta.env.VITE_REACT_APP_OPENAI_API_KEY;
  const model = import.meta.env.VITE_REACT_APP_COMPANY_RELEVANCE_MODEL;
  const batchSize = parseInt(import.meta.env.VITE_REACT_APP_COMPANY_RELEVANCE_BATCH_SIZE);
  const maxContentLength = parseInt(import.meta.env.VITE_REACT_APP_MAX_WEBSITE_CONTENT_LENGTH);

  if (!apiKey) {
    throw new Error('OpenAI API key is not set. Please check your environment configuration.');
  }

  // Initialize result array with original data
  const processedData = [...data];

  // Track analytics
  let tooSmallCount = 0;
  let tooLargeCount = 0;
  let relevanceScores = {
    0: 0, // Irrelevant
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  let errorCount = 0;
  let skippedCount = 0;
  let tokensUsed = 0;

  // Process in batches
  for (let i = 0; i < data.length; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, data.length - i);
    logCallback(`Processing batch ${Math.floor(i / batchSize) + 1}: items ${i + 1} to ${i + currentBatchSize}`);

    // Process each item in the batch
    const batchPromises = [];

    for (let j = 0; j < currentBatchSize; j++) {
      const index = i + j;
      const row = data[index];

      // Skip processing if row is already tagged
      if (row.relevanceTag) {
        logCallback(`Skipping item ${index + 1}: Already tagged as "${row.relevanceTag}"`);
        skippedCount++;
        progressCallback((index + 1) / data.length * 100);
        continue;
      }

      // Skip rows that are marked as irrelevant in title relevance step
      if (row.titleRelevance === 'Irrelevant') {
        logCallback(`Skipping item ${index + 1}: Irrelevant title`);
        processedData[index] = {
          ...processedData[index],
          companyRelevance: 'Skipped - Irrelevant Title',
          companyRelevanceScore: 0
        };
        skippedCount++;
        progressCallback((index + 1) / data.length * 100);
        continue;
      }

      // Check for employee count limits
      const employeeCount = row.organization?.estimated_num_employees;
      if (employeeCount) {
        const count = parseInt(employeeCount);
        if (!isNaN(count)) {
          if (count < 10) {
            logCallback(`Skipping item ${index + 1}: Too Small (${count} employees)`);
            processedData[index] = {
              ...processedData[index],
              companyRelevance: 'Too Small',
              companyRelevanceScore: 0
            };
            tooSmallCount++;
            progressCallback((index + 1) / data.length * 100);
            continue;
          }
          if (count > 1500) {
            logCallback(`Skipping item ${index + 1}: Too Large (${count} employees)`);
            processedData[index] = {
              ...processedData[index],
              companyRelevance: 'Too Large',
              companyRelevanceScore: 0
            };
            tooLargeCount++;
            progressCallback((index + 1) / data.length * 100);
            continue;
          }
        }
      }

      // Create a promise for each item in the batch
      const processPromise = processCompany(row, index, apiKey, model, maxContentLength, logCallback)
        .then(result => {
          // Update the result in the processedData array
          processedData[result.index] = {
            ...processedData[result.index],
            ...result.data
          };

          // Update analytics
          relevanceScores[result.data.companyRelevanceScore]++;

          tokensUsed += result.tokens || 0;

          // Log individual item completion
          logCallback(`Processed item ${result.index + 1}: Company relevance score ${result.data.companyRelevanceScore}/5`);

          // Update progress
          progressCallback((index + 1) / data.length * 100);
        })
        .catch(error => {
          logCallback(`Error processing item ${index + 1}: ${error.message}`);
          errorCount++;

          // Add error info to the processed data
          processedData[index] = {
            ...processedData[index],
            companyRelevance: 'ERROR',
            companyRelevanceScore: 0,
            companyError: error.message
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

  // Calculate high relevance (scores 3-5)
  const highRelevance = relevanceScores[3] + relevanceScores[4] + relevanceScores[5];

  const endTimestamp = Date.now();
  const processingTimeSeconds = (endTimestamp - startTimestamp) / 1000;

  // Log analysis summary
  logCallback(`Company Relevance Analysis Complete:`);
  logCallback(`- High Relevance (3-5): ${highRelevance}`);
  logCallback(`- Low Relevance (1-2): ${relevanceScores[1] + relevanceScores[2]}`);
  logCallback(`- Too Small: ${tooSmallCount}`);
  logCallback(`- Too Large: ${tooLargeCount}`);
  logCallback(`- Skipped (Irrelevant Title): ${skippedCount}`);
  logCallback(`- Errors: ${errorCount}`);

  return {
    data: processedData,
    analytics: {
      highRelevance,
      lowRelevance: relevanceScores[1] + relevanceScores[2],
      tooSmallCount,
      tooLargeCount,
      skippedCount,
      errorCount,
      relevanceScores,
      totalProcessed: data.length - skippedCount - tooSmallCount - tooLargeCount,
      startTime: startTimestamp,
      endTime: endTimestamp,
      processingTimeSeconds: processingTimeSeconds
    }
  };
}

/**
 * Process a single company for relevance
 * @param {Object} row - Data row to process
 * @param {number} index - Index of the row
 * @param {string} apiKey - OpenAI API key
 * @param {string} model - OpenAI model
 * @param {number} maxContentLength - Maximum website content length
 * @param {Function} logCallback - Callback function for logging
 * @returns {Promise<Object>} - Processing result
 */
// In processCompany function in companyRelevanceService.jsx
async function processCompany(row, index, apiKey, model, maxContentLength, logCallback) {
  try {
    // Create company description from available data
    const companyDesc = [
      row.organization?.name || row.company,
      row.organization?.industry,
      row.organization?.short_description
    ].filter(Boolean).join(' - ');

    if (!companyDesc || companyDesc.trim() === '') {
      throw new Error('Insufficient company data');
    }

    const websiteContent = (row.raw_website || '').slice(0, maxContentLength);
    const prompt = COMPANY_RELEVANCE_PROMPT(companyDesc, websiteContent);

    logCallback(`Analyzing company relevance for: ${companyDesc}`);

    // === Call OpenAI GPT API ===
    const response = await apiClient.openai.chatCompletion({
      model: model,
      messages: [
        { role: 'system', content: "You are an expert B2B company evaluator." },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 500
    });

    let tokenUsage = 0;
    if (response & response.usage) {
      tokenUsage = response.usage.total_tokens || 0;
    } else if (response && response.data && response.data.usage) {
      tokenUsage = response.data.usage.total_tokens || 0;
    }

    // FIX: Check response structure and access correctly
    // The proxy is returning the OpenAI response directly, not nested under data
    let responseText = '';
    if (response && response.choices && response.choices[0] && response.choices[0].message) {
      // Direct format from OpenAI API
      responseText = response.choices[0].message.content?.trim();
    } else if (response && response.data && response.data.choices) {
      // Format when API response is nested under data (original expected format)
      responseText = response.data.choices[0].message.content?.trim();
    } else {
      throw new Error("Unexpected OpenAI API response format");
    }

    if (!responseText) {
      throw new Error("OpenAI API returned empty content");
    }

    // Extract score
    let relevanceScore = 0;
    const scoreMatch = responseText.match(/(\d)\/5/);
    if (scoreMatch) {
      relevanceScore = parseInt(scoreMatch[1]);
    } else if (responseText.toLowerCase().includes('irrelevant')) {
      relevanceScore = 0;
    } else if (responseText.toLowerCase().includes('competitor')) {
      relevanceScore = 0;
    }

    return {
      index,
      tokens: tokenUsage,
      data: {
        companyRelevance: responseText,
        companyRelevanceScore: relevanceScore,
        customCompanyPrompt: prompt
      }
    };
  } catch (error) {
    throw new Error(`Failed to analyze company relevance: ${error.message}`);
  }
}

export default {
  processCompanyRelevance
};