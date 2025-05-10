// apiClient.js
import axios from 'axios';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_REACT_APP_API_BASE_URL || '',
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor
apiClient.interceptors.request.use(
    (config) => {
        console.log(`Request to ${config.url}`);
        return config;
    },
    (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
    }
);

// Add a response interceptor
apiClient.interceptors.response.use(
    (response) => {
        // Any status code in range 2xx causes this function to trigger
        console.log(`Response from ${response.config.url} received`);
        return response;
    },
    (error) => {
        // Any status codes outside range 2xx cause this function to trigger
        console.error('Response error:', error.message);

        // Extract the most useful error message
        let errorMessage = 'An unexpected error occurred';
        if (error.response) {
            // The request was made and the server responded with a status code outside of 2xx
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);

            // Try to get a useful error message
            if (error.response.data) {
                if (error.response.data.error && typeof error.response.data.error === 'object') {
                    errorMessage = error.response.data.error.message || errorMessage;
                } else if (error.response.data.error && typeof error.response.data.error === 'string') {
                    errorMessage = error.response.data.error;
                } else if (error.response.data.message) {
                    errorMessage = error.response.data.message;
                }
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error request:', error.request);
            errorMessage = 'No response received from server';
        }

        // Create enhanced error object
        const enhancedError = new Error(errorMessage);
        enhancedError.originalError = error;
        enhancedError.statusCode = error.response ? error.response.status : null;
        enhancedError.data = error.response ? error.response.data : null;

        return Promise.reject(enhancedError);
    }
);

// Apollo API methods
const apolloAPI = {
    matchPerson: async (data) => {
        try {
            const response = await apiClient.post('/apollo/people/match', data);
            return response.data;
        } catch (error) {
            console.error('Error in matchPerson:', error.message);
            throw error;
        }
    },

    getIndianContacts: async (data) => {
        try {
            console.log('Requesting Indian contacts for organization:', data.organization_id);

            // Ensure all required parameters are set
            const requestData = {
                api_key: data.api_key,
                organization_id: data.organization_id,
                // page: data.page || 1,
                // per_page: data.per_page || 10,
            };

            const response = await apiClient.post('/apollo/organizations/contacts/india', requestData);

            console.log('Received pagination data:', response.data.pagination);
            return response.data;
        } catch (error) {
            console.error('Error in getIndianContacts:', error.message);
            throw error;
        }
    },

    getOtherCountryContacts: async (data) => {
        try {
            console.log('Requesting other country contacts for organization:', data.organization_id);

            // Ensure all required parameters are set
            const requestData = {
                api_key: data.api_key,
                organization_id: data.organization_id,
                // page: data.page || 1,
                // per_page: data.per_page || 10,
            };

            const response = await apiClient.post('/apollo/organizations/contacts/othercountries', requestData);

            console.log('Received pagination data for other countries:', response.data.pagination);
            return response.data;
        } catch (error) {
            console.error('Error in getOtherCountryContacts:', error.message);
            throw error;
        }
    },
};

// OpenAI API methods
const openAIAPI = {
    chatCompletion: async (data) => {
        try {
            const response = await apiClient.post('/openai/chat/completions', data);
            return response.data;
        } catch (error) {
            console.error('Error in chatCompletion:', error.message);
            throw error;
        }
    }
};

// Serper API methods
// Update the serperAPI object in apiClient.jsx
const serperAPI = {
    scrapeWebsite: async (url) => {
        try {
            console.log(`Scraping website: ${url}`);

            // Ensure URL is properly formatted 
            if (typeof url !== 'string') {
                throw new Error(`Invalid URL: ${JSON.stringify(url)}`);
            }

            // Ensure URL has a protocol
            const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
            console.log(`Formatted URL for scraping: ${formattedUrl}`);

            // Using the direct fetch approach via our proxy server
            const response = await apiClient.post('/serper/website', { url: formattedUrl });

            // Return the data
            return response.data;
        } catch (error) {
            console.error('Error in scrapeWebsite:', error.message);
            throw error;
        }
    }
};

// Coresignal API methods - UPDATED for V2 API
const coresignalAPI = {
    searchCompany: async (queryData) => {
        try {
            console.log('Calling Coresignal search company API...');

            // Extract LinkedIn URL for better logging
            let linkedinUrl = '';
            try {
                if (queryData.query.bool?.must) {
                    const queryStringObj = queryData.query.bool.must.find(q => q.query_string)?.query_string;
                    linkedinUrl = queryStringObj?.query || '';
                } else if (queryData.query.query_string) {
                    linkedinUrl = queryData.query.query_string.query || '';
                }
                console.log(`LinkedIn URL being searched: ${linkedinUrl}`);
            } catch (e) {
                // Just for logging, continue even if we can't extract
            }

            const response = await apiClient.post('/coresignal/search', queryData);

            // Check if we got a valid response
            if (!response.data) {
                console.log('Empty response from Coresignal search API');
                return { error: 'Empty search response' };
            }

            // Handle different response formats
            if (Array.isArray(response.data) && response.data.length > 0) {
                console.log(`Search response code: ${response.data[0]}`);
                return response.data;
            } else if (response.data.error) {
                console.log(`Search error: ${response.data.error.message || 'Unknown error'}`);
                return { error: response.data.error.message || 'Search error' };
            } else {
                console.log('Unexpected response format from search API:', response.data);
                return { error: 'Unexpected response format' };
            }
        } catch (error) {
            console.error('Error in searchCompany:', error.message);

            // Handle authentication errors specially
            if (error.statusCode === 401 || error.message.includes('Authentication failed')) {
                console.error('Authentication failed for Coresignal API');
                return {
                    error: 'Authentication failed for Coresignal API. Please check your API key.',
                    statusCode: 401
                };
            }

            // If we get a 402 Payment Required error, handle gracefully
            if (error.statusCode === 402 || error.message.includes('Payment required')) {
                console.log('Coresignal API payment limit reached');
                return {
                    error: 'Payment required for Coresignal API',
                    statusCode: 402
                };
            }

            // Rethrow general errors
            throw error;
        }
    },

    collectCompanyData: async (responseCode) => {
        try {
            console.log(`Calling Coresignal collect data API for code: ${responseCode}`);

            const response = await apiClient.get(`/coresignal/collect/${responseCode}`);
            return response.data;
        } catch (error) {
            console.error('Error in collectCompanyData:', error.message);

            // Handle authentication errors specially
            if (error.statusCode === 401 || error.message.includes('Authentication failed')) {
                console.error('Authentication failed for Coresignal collect API');
                return {
                    error: 'Authentication failed for Coresignal API. Please check your API key.',
                    statusCode: 401
                };
            }

            // If we get a 402 Payment Required error, handle gracefully
            if (error.statusCode === 402 || error.message.includes('Payment required')) {
                console.log('Coresignal API payment limit reached on collect');
                return {
                    error: 'Payment required for Coresignal API',
                    statusCode: 402
                };
            }

            // Rethrow general errors
            throw error;
        }
    }
};

// Website fetching method
const webAPI = {
    fetchWebsite: async (url) => {
        try {
            const response = await apiClient.get('/fetch-website', {
                params: { url }
            });
            return response.data;
        } catch (error) {
            console.error('Error in fetchWebsite:', error.message);
            throw error;
        }
    }
};

// Test connection to proxy server
const testConnection = async () => {
    try {
        const response = await apiClient.get('/test');
        console.log('Proxy server connection test result:', response.data);
        return { success: true, message: 'Connected to proxy server successfully' };
    } catch (error) {
        console.error('Proxy server connection test failed:', error.message);
        return { success: false, message: `Failed to connect to proxy server: ${error.message}` };
    }
};

export default {
    apollo: apolloAPI,
    openai: openAIAPI,
    serper: serperAPI,
    coresignal: coresignalAPI,
    web: webAPI,
    testConnection,
};