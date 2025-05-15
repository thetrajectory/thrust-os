// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const path = require('path');
const helmet = require('helmet');


require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "blob:", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https://api.openai.com", "https://api.apollo.io", "https://api.coresignal.com", "https://scrape.serper.dev", "https://*.supabase.co"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'"],
      childSrc: ["'self'", "blob:"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
    },
  })
);
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});

// Test endpoint to verify the server is working correctly
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Proxy server is running correctly' });
});

// Apollo API proxy
app.post('/api/apollo/people/match', async (req, res) => {
  try {
    console.log('Proxying Apollo people/match request...');
    
    // Validate request body
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is required' });
    }
    
    const response = await axios.post(
      'https://api.apollo.io/api/v1/people/match',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      }
    );
    
    console.log('Apollo API response received successfully');
    res.json(response.data);
  } catch (error) {
    console.error('Apollo API error:', error.message);
    console.error('Response data:', error.response?.data);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Apollo API',
        details: error.response?.data || error.message
      }
    });
  }
});

// Apollo Fetch Indian Leads
app.post('/api/apollo/organizations/contacts/india', async (req, res) => {
  try {
    console.log('Proxying Apollo organizations/contacts/india request...', req.body);
    
    // Validate request body
    if (!req.body || !req.body.api_key || !req.body.organization_id) {
      return res.status(400).json({ 
        error: 'Request body must include api_key and organization_id' 
      });
    }
    
    // Properly structure the URL with query parameters
    const url = 'https://api.apollo.io/api/v1/mixed_people/search/';
    const params = {
      'person_locations[]': 'india',
      'organization_ids[]': req.body.organization_id,
      api_key: req.body.api_key,
      // page: req.body.page || 1,
      // per_page: req.body.per_page || 10,
    };
    
    console.log('Apollo API request params:', params);
    
    const response = await axios.get(url, { params });
    
    console.log('Apollo API response pagination:', response.data.pagination);
    
    res.json(response.data);
  } catch (error) {
    console.error('Apollo Org Contacts API error:', error.message);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Apollo Organizations API',
        details: error.response?.data || error.message
      }
    });
  }
});

// Apollo Fetch Other Country Leads
// In server.js - Updated API endpoint for other countries
app.post('/api/apollo/organizations/contacts/othercountries', async (req, res) => {
  try {
    console.log('Proxying Apollo organizations/contacts/othercountries request...', req.body);
    
    // Validate request body
    if (!req.body || !req.body.api_key || !req.body.organization_id) {
      return res.status(400).json({ 
        error: 'Request body must include api_key and organization_id' 
      });
    }
    
    // Properly structure the URL with query parameters
    const url = 'https://api.apollo.io/api/v1/mixed_people/search';
    const params = {
      'person_locations[]': ['pakistan', 'bangladesh', 'indonesia', 'philippines', 'vietnam'],
      'organization_ids[]': req.body.organization_id,
      api_key: req.body.api_key,
      // page: req.body.page || 1,
      // per_page: req.body.per_page || 10,
    };
    
    console.log('Apollo API request params for other countries:', params);
    
    const response = await axios.get(url, { params });
    console.log('Apollo API response pagination for other countries:', response.data.pagination);
    
    res.json(response.data);
  } catch (error) {
    console.error('Apollo Org Contacts API error:', error.message);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Apollo Organizations API',
        details: error.response?.data || error.message
      }
    });
  }
});

// OpenAI API proxy
app.post('/api/openai/chat/completions', async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'OpenAI API key not configured' });
    }
    
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: 'Error calling OpenAI API',
      details: error.response?.data || error.message
    });
  }
});

// Serper Search Proxy
app.post('/api/serper/search', async (req, res) => {
  try {
    console.log('Proxying Serper search request...');
    
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'Serper API key not configured' });
    }
    
    // Validate request body
    if (!req.body) {
      return res.status(400).json({ error: 'Request body is required' });
    }
    
    console.log(`Performing Serper search with query: ${req.body.q}`);
    
    const response = await axios.post(
      'https://google.serper.dev/search',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log('Serper Search API response received successfully');
    res.json(response.data);
  } catch (error) {
    console.error('Serper Search API error:', error.message);
    console.error('Response details:', error.response?.data);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Serper Search API',
        details: error.response?.data || error.message
      }
    });
  }
});

// Serper API proxy
app.post('/api/serper/website', async (req, res) => {
  try {
    console.log('Proxying Serper website request...');
    console.log('Request body:', req.body); // Log the request body for debugging
    
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'Serper API key not configured' });
    }
    
    // Validate request body
    if (!req.body || !req.body.url) {
      return res.status(400).json({ error: 'URL is required in request body' });
    }
    
    const url = req.body.url;
    console.log(`Scraping website: ${url}`);
    
    // Use proper error handling with axios
    try {
      const response = await axios.post(
        'https://scrape.serper.dev', // Correct endpoint
        { url: url },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': apiKey,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          redirect: "follow",
          timeout: 60000 // Increase timeout to 60 seconds
        }
      );
      
      console.log('Serper API response received successfully');
      
      // Return the successful response
      res.json(response.data);
    } catch (apiError) {
      // Handle API errors more gracefully
      console.error('Serper API error:', apiError.message);
      console.error('Response details:', apiError.response?.data);
      
      // If the site is blocking the request, return a specific error
      if (apiError.response?.status === 403) {
        return res.status(403).json({
          error: 'Site is blocking the scraping attempt',
          details: apiError.response?.data || apiError.message,
          url: url
        });
      }
      
      // For other errors, return a generic message
      res.status(apiError.response?.status || 500).json({
        error: 'Error calling Serper API',
        details: apiError.response?.data || apiError.message,
        url: url,
        // Include a fallback text to help the client continue
        fallbackText: "Unable to scrape website content. Please try again later."
      });
    }
  } catch (error) {
    console.error('Server error handling scraping request:', error.message);
    res.status(500).json({
      error: 'Server error processing scraping request',
      details: error.message
    });
  }
});

// Serper sitemap API proxy
app.post('/api/serper/sitemap', async (req, res) => {
  try {
    console.log('Proxying Serper sitemap request...');
    
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'Serper API key not configured' });
    }
    
    // Validate request body
    if (!req.body || !req.body.url) {
      return res.status(400).json({ error: 'URL is required in request body' });
    }
    
    const response = await axios.post(
      'https://api.serper.dev/api/sitemap',
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey
        }
      }
    );
    
    console.log('Serper Sitemap API response received successfully');
    res.json(response.data);
  } catch (error) {
    console.error('Serper Sitemap API error:', error.message);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Serper Sitemap API',
        details: error.response?.data || error.message
      }
    });
  }
});

// Coresignal Search API proxy - FIXED with exact endpoint matching
app.post('/api/coresignal/search', async (req, res) => {
  try {
    console.log('Proxying Coresignal search request...');
    
    const apiKey = process.env.CORESIGNAL_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'Coresignal API key not configured' });
    }
    
    // Validate request body
    if (!req.body || !req.body.query) {
      return res.status(400).json({ error: 'Query is required in request body' });
    }
    
    // Extract LinkedIn URL for logging
    let linkedinUrl = '';
    try {
      if (req.body.query.bool?.must) {
        const queryString = req.body.query.bool.must.find(q => q.query_string)?.query_string;
        linkedinUrl = queryString?.query || '';
      } else if (req.body.query.query_string) {
        linkedinUrl = req.body.query.query_string.query || '';
      }
    } catch (e) {
      // Just for logging
    }
    
    console.log(`Searching Coresignal for LinkedIn URL: ${linkedinUrl}`);
    console.log('Search request body:', JSON.stringify(req.body));
    
    // IMPORTANT: Use EXACTLY the same URL and headers from your working example
    const response = await axios.post(
      'https://api.coresignal.com/cdapi/v2/company_multi_source/search/es_dsl', // EXACT URL
      req.body,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey // EXACTLY as shown in your example
        },
        timeout: 30000
      }
    );
    
    console.log('Coresignal Search API response status:', response.status);
    console.log('Coresignal Search API response data:', JSON.stringify(response.data).substring(0, 200));
    
    res.json(response.data);
  } catch (error) {
    console.error('Coresignal Search API error:', error.message);
    console.error('Error response status:', error.response?.status);
    console.error('Error response data:', error.response?.data);
    
    // Structured error response
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Coresignal Search API',
        details: error.response?.data || error.message
      }
    });
  }
});

// Coresignal Collect API proxy - FIXED with exact endpoint matching
app.get('/api/coresignal/collect/:responseCode', async (req, res) => {
  try {
    console.log('Proxying Coresignal collect request...');
    
    const apiKey = process.env.CORESIGNAL_API_KEY;
    if (!apiKey) {
      return res.status(401).json({ error: 'Coresignal API key not configured' });
    }
    
    const { responseCode } = req.params;
    if (!responseCode) {
      return res.status(400).json({ error: 'Response code is required in URL parameter' });
    }
    
    console.log(`Collecting data for response code: ${responseCode}`);
    
    // IMPORTANT: Use EXACTLY the same URL and headers from your working example
    const collectUrl = `https://api.coresignal.com/cdapi/v2/company_multi_source/collect/${responseCode}`; // EXACT URL
    console.log('Collect URL:', collectUrl);
    
    const response = await axios.get(
      collectUrl,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey // EXACTLY as shown in your example
        },
        timeout: 30000
      }
    );
    
    console.log('Coresignal Collect API response status:', response.status);
    
    res.json(response.data);
  } catch (error) {
    console.error('Coresignal Collect API error:', error.message);
    console.error('Error response status:', error.response?.status);
    console.error('Error response data:', error.response?.data);
    
    res.status(error.response?.status || 500).json({
      error: {
        message: 'Error calling Coresignal Collect API',
        details: error.response?.data || error.message
      }
    });
  }
});

// PDF Text Extraction Endpoint
app.post('/api/extract-text/pdf', async (req, res) => {
  try {
    console.log('Proxying PDF text extraction request...');
    
    if (!req.body || !req.body.url) {
      return res.status(400).json({ error: 'URL is required in request body' });
    }
    
    const pdfUrl = req.body.url;
    console.log(`Extracting text from PDF: ${pdfUrl}`);
    
    // Add headers to avoid being blocked
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/pdf,application/x-pdf',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0'
    };
    
    // Fetch the PDF content
    const response = await axios.get(pdfUrl, {
      headers: headers,
      timeout: 60000, // 60 second timeout
      responseType: 'arraybuffer' // Important for PDFs
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({
        error: `Failed to download PDF: HTTP ${response.status}`,
      });
    }
    
    // Use pdf-parse to extract text
    const pdfParse = require('pdf-parse');
    
    const pdfData = await pdfParse(Buffer.from(response.data));
    
    console.log(`Successfully extracted ${pdfData.text.length} characters of text from PDF (${pdfData.numpages} pages)`);
    
    // Return the extracted text
    res.json({
      success: true,
      text: pdfData.text,
      pageCount: pdfData.numpages,
      info: pdfData.info,
      metadata: pdfData.metadata
    });
  } catch (error) {
    console.error('PDF Text Extraction error:', error.message);
    
    res.status(500).json({
      error: {
        message: 'Error extracting text from PDF',
        details: error.message
      }
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  // Serve static files from the React frontend build folder
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  // Handle any other requests by sending the index.html file
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
  });
}


// Start the server
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Test the server at: http://localhost:${PORT}/api/test`);
});