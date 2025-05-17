// services/find-advisor/videocx/employmentHistoryAnalysisService.jsx
import apiClient from '../../../utils/apiClient';

// Employment history analysis prompt
const EMPLOYMENT_HISTORY_PROMPT = (employmentHistory) => {
  return `"# 🧠 FINAL EVALUATION PROMPT — ADVISOR SCORING FOR TORTOISE (EXHAUSTIVE VERSION)

You are evaluating a potential strategic advisor for **Tortoise** — a B2B SaaS platform that enables large Indian enterprises (500+ employees) to offer premium devices (phones, laptops) as employee benefits via:

* **Zero cost to employer**
* **Payroll deduction for employees**
* **Full HRMS + approval integration**
* **GST and financial optimization**
* **Repair, replacement, and leasing lifecycle management**

---

## 🎯 OUR BUYERS

We sell to enterprise functions including:

**Primary Buyers**

* Head of HR
* Head of Total Rewards / Compensation & Benefits
* Head of Payroll / FinanceOps

**Key Enablers**

* CHRO org
* PeopleOps leadership
* Procurement (logistics/sourcing alignment)
* Finance (GST, deductions, off-balance-sheet leasing)
* System integrators (Darwinbox, SAP, GreytHR, etc.)

---

## 📥 ADVISOR INPUT DROPZONE

Analyze the following advisor based on their employment history:

---

### Experience of advisor for you to analyze starts

${employmentHistory}

### Experience of advisor for you to analyze ends

---

## ✅ YOUR TASK

You will score the advisor across three axes:

---

### 1️⃣ CUSTOMER

Are they currently in a **buyer role** for Tortoise?

Mark **Yes** only if all are true:

* Current title is in HR, Comp & Benefits, or Payroll/Finance
* Company has >500 employees
* Role implies decision rights (e.g., Head of, VP, Director)

If they are retired, advising, consulting, or operating in a non-buyer function, mark **No**

---

### 2️⃣ SENIORITY (YEARS OF EXPERIENCE)

Score based purely on how long they've worked. Do **not** mix this with relevance or function.

| Score | Total Experience |
| ----- | ---------------- |
| 5     | 15+ years        |
| 4     | 10–14 years      |
| 3     | 5–9 years        |
| 2     | 2–4 years        |
| 1     | <2 years         |

Use visible start dates across roles. Round down if uncertain.

---

### 3️⃣ EXPERIENCE RELEVANCE (HIGH TRUST, INDIRECT BUYER CREDIBILITY)

This is the most important axis.

You are scoring **how strategically relevant the advisor's past roles are** to **Tortoise's GTM motion**, based on:

* **Indirect trust paths to our buyers**
* **Roles that helped buyers implement/pay for similar systems**
* **Past decision-maker roles in relevant orgs (secondary)**
* **Clear system + workflow exposure** (especially around benefits, payroll, GST, HRMS)

This is not about popularity or fame — this is about **trustable adjacency**.

---

## 🟩 SCORE: 5/5 — High Trust Enabler + Historical Buyer Proximity

These advisors are **credible to Tortoise buyers** because they've consistently:

* Advised, implemented, or enabled programs for HR/Payroll orgs
* Worked at HRTech, Payroll SaaS, Benefits SaaS, or enterprise consultancies
* Delivered projects related to device perks, deductions, approval flows, or GST design
* OR held decision-making buyer roles *and* now operate in consulting / GTM / advisory capacities

📌 **Hardcoded Roles**:

* HR Transformation Consultant @ Big 4 (EY, PwC, KPMG, Deloitte)
* GTM/Partnerships Lead @ Darwinbox, PeopleStrong, GreytHR
* Payroll Ops Head @ SAP/Oracle implementation vendor
* Flex Benefits Architect / Device Perks Program Owner
* HRMS Deployment Leader @ Fortune 500 firm

📌 **Company Types**:

* Indian IT/ITES (Infosys, Wipro, TCS scale)
* BFSI, Conglomerates, FMCG with 10K+ employees
* HRTech, CompTech, Payroll SaaS with Indian enterprise footprint
* System integrators or enterprise delivery teams

📌 **Conceptual Anchors**:

* Has "walked the floor" of large HR/Payroll teams
* Speaks the language of **GST, deduction workflows, HRMS**, **perks UX**
* Buyer would say: "We'd trust them to help us pick or implement Tortoise"

---

## 🟨 SCORE: 4/5 — Indirect Enabler with Buyer Context

These advisors have **vendor-side or platform-side experience**, with some buyer overlap:

* Worked in GTM, delivery, or systems roles related to payroll/HR
* Repeated exposure to buyer orgs without owning final decision
* Less likely to have designed strategy, but often implemented tools

📌 **Hardcoded Roles**:

* HRTech Implementation Consultant
* Solutions Architect @ GreytHR, ZingHR, etc.
* Enterprise AE or CS Lead with repeated HR buyer interface
* Comp Analyst turned product specialist in SaaS

📌 **Company Types**:

* Mid-sized HRTech firms
* Regional system integrators
* Payroll solution providers

📌 **Conceptual Anchors**:

* Helped HR teams deploy, even if they didn't buy
* Understand approval flows, employee UX, payroll sync
* Buyer would say: "They helped us roll out a tool — not strategic, but useful"

---

## 🟨 SCORE: 3/5 — Former Buyer (Single Org, No Ecosystem Leverage)

These advisors have held **relevant buyer roles**, but:

* Only inside one company
* No proof of scale, no follow-on influence
* Not advising now, not part of ecosystem flow

📌 **Hardcoded Roles**:

* CHRO @ 1000-person firm
* Head of Total Rewards (internal-only)
* Payroll lead in legacy firm with no transformation history

📌 **Company Types**:

* Tier 2 enterprises with unknown digital maturity
* Internal HR-only environments

📌 **Conceptual Anchors**:

* They know what device perks are
* Buyer would say: "They've done it, but wouldn't ask them for vendor picks"

---

## 🟧 SCORE: 2/5 — Peripheral or Generalist HR

Exposure exists, but not strategic. Often:

* In startups or generalist ops orgs
* No proof of systems, integrations, payroll logic
* May speak HR language, but not at Tortoise scale

📌 **Hardcoded Roles**:

* HRBP at 200–300 person company
* Admin Ops / Talent Partner hybrid roles
* Culture/Engagement lead without budget influence

📌 **Company Types**:

* Early-stage startups
* Remote-first orgs with outsourced HR

📌 **Conceptual Anchors**:

* Knows the vibe, not the infrastructure
* Buyer would say: "Not relevant to our payroll and GST complexity"

---

## 🟥 SCORE: 1/5 — No Relevance

Zero buyer overlap. Wrong function, vertical, or geography.

📌 **Hardcoded Roles**:

* Product/Marketing in D2C or SaaS
* CTO, Tech Architect, Design
* D2C startup founder

📌 **Conceptual Anchors**:

* Buyer would say: "I don't know why they're in the room"

---

## 🧾 REQUIRED OUTPUT FORMAT (STRICT)
Customer: <Yes/No>

~
Seniority: X/5  
1-line justification — years calculated, total duration, approximate timeline

~
Experience relevance: X/5  
One liner justification — based on trust proximity, actual context  and system patterning - actually give specific roles, reasoning on why their trust sytems, relevant experience adds, i.e. role/company/industry and timelines - bedense and no flaff needed, use acronyms if needed, but tell more. Remember one infodense line

## 🧾 REQUIRED OUTPUT FORMAT (STRICT)

---

## 🧠 SCORING REMINDERS

* Be strict. Do not reward generic SaaS or startup HR.
* Highest score goes to those who can **credibly influence our buyer** through **advisory**, **delivery**, or **strategic ecosystem proximity**
* Past buyers are valuable **only if** they now advise or are embedded in buyer-facing ecosystems
* Penalize irrelevant verticals or "HR-adjacent" product roles unless they worked **inside buyer workflows**"`;
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