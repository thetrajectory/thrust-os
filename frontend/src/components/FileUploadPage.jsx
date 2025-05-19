// components/FileUploadPage.js
import Papa from 'papaparse';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import storageUtils from '../utils/storageUtils';

const FileUploadPage = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState({
        message: '',
        isError: false
    });

    function parseCustomDate(dateStr) {
        if (!dateStr) return null;

        // If it's already in ISO format, just return it
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}(T.*)?$/)) {
            return dateStr.split('T')[0]; // Extract just the date part if it has time
        }

        try {
            // Handle format like "17-Jan-18" or variations
            const match = dateStr.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2}|\d{4})/);
            if (match) {
                const day = match[1].padStart(2, '0');
                let month;
                const monthStr = match[2].toLowerCase();
                const months = {
                    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                    'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
                };
                month = months[monthStr];
                if (!month) {
                    console.warn(`Unknown month in date: ${dateStr}`);
                    return new Date().toISOString().split('T')[0]; // Use today as fallback
                }

                let year = match[3];
                // Convert 2-digit year to 4-digit
                if (year.length === 2) {
                    const twoDigitYear = parseInt(year);
                    year = twoDigitYear < 50 ? `20${year}` : `19${year}`;
                }

                // Return YYYY-MM-DD format
                return `${year}-${month}-${day}`;
            }

            // Handle DD/MM/YYYY or MM/DD/YYYY format
            const slashMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (slashMatch) {
                // For simplicity, assume DD/MM/YYYY format
                const day = slashMatch[1].padStart(2, '0');
                const month = slashMatch[2].padStart(2, '0');
                const year = slashMatch[3];

                // Validate month and day
                if (parseInt(month) > 0 && parseInt(month) <= 12 &&
                    parseInt(day) > 0 && parseInt(day) <= 31) {
                    return `${year}-${month}-${day}`;
                }
            }

            // Try using Date object for other formats
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
                return parsedDate.toISOString().split('T')[0];
            }

            // If all else fails, use today's date
            console.warn(`Failed to parse date: ${dateStr}, using today`);
            return new Date().toISOString().split('T')[0];
        } catch (e) {
            console.error(`Error parsing date: ${dateStr}`, e);
            return new Date().toISOString().split('T')[0]; // Use today's date as fallback
        }
    }

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];

        if (!selectedFile) {
            setFile(null);
            setUploadStatus({ message: '', isError: false });
            return;
        }

        // Validate file is a CSV
        if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
            setUploadStatus({
                message: 'Please upload a CSV file',
                isError: true
            });
            return;
        }

        setFile(selectedFile);
        setUploadStatus({
            message: `File "${selectedFile.name}" selected`,
            isError: false
        });
    };

    const handleUpload = () => {
        if (!file) {
            setUploadStatus({
                message: 'Please select a file first',
                isError: true
            });
            return;
        }

        // Parse CSV file
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    setUploadStatus({
                        message: `Error parsing CSV: ${results.errors[0].message}`,
                        isError: true
                    });
                    return;
                }

                // Ensure we have at least some data
                if (results.data.length === 0) {
                    setUploadStatus({
                        message: 'CSV file is empty',
                        isError: true
                    });
                    return;
                }

                // Check if CSV has required fields
                const firstRow = results.data[0];
                const hasPosition = 'position' in firstRow || 'title' in firstRow;
                const hasCompany = 'company' in firstRow || 'organization' in firstRow;

                if (!hasPosition || !hasCompany) {
                    setUploadStatus({
                        message: 'CSV must include position/title and company/organization columns',
                        isError: true
                    });
                    return;
                }

                // Normalize data if needed
                const normalizedData = results.data.map(row => {
                    // Make position field consistent
                    if (!row.position && row.title) {
                        row.position = row.title;
                    }
                    // Make company field consistent
                    if (!row.company && row.organization) {
                        row.company = row.organization;
                    }

                    // Process connected_on field - always assign a value
                    const originalConnectedOn = row.connected_on;
                    row.connected_on = originalConnectedOn ? parseCustomDate(originalConnectedOn) : new Date().toISOString().split('T')[0];

                    // Log for debugging
                    if (originalConnectedOn) {
                        console.log(`Converted date: ${originalConnectedOn} -> ${row.connected_on}`);
                    }

                    // Initialize relevanceTag field
                    row.relevanceTag = '';

                    return row;
                });

                // Get the advisor from storage
                const advisor = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ADVISOR);

                // Add advisor info to the data
                const enrichedData = normalizedData.map(row => ({
                    ...row,
                    advisorName: advisor || 'Unknown Advisor'
                }));

                // Save data to session storage
                console.log(`CSV data loaded: ${enrichedData.length} rows`);
                storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, enrichedData);

                // Get client and engine from storage
                const client = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
                const engine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE);

                // Determine prefix based on both client and engine
                let prefix;
                if (engine === 'Advisor Finder') {
                    prefix = client === 'Video CX' ? 'find-advisor/videocx' : 'find-advisor/incommon';
                } else {
                    prefix = client === 'Video CX' ? 'videocx' : 'incommon';
                }

                // Navigate to processing page
                navigate(`/${prefix}/processing`);
            },
            error: (error) => {
                setUploadStatus({
                    message: `Error parsing CSV: ${error.message}`,
                    isError: true
                });
            }
        });
    };

    const handleBack = () => {
        navigate('/advisor');
    };

    const templateUrl = "https://docs.google.com/spreadsheets/d/1qBb3oMdwjk6yJHFSQXrbZmXTiC072oNXL1X45hkczDc/edit?usp=sharing";

    return (
        <div className="flex flex-col items-center justify-center">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>
            <h2 className="text-4xl font-bold text-center mb-12">
                Upload CSV File
            </h2>

            <div className="w-full max-w-lg">
                <div className="mb-4 text-center">
                    <p className="text-gray-700 mb-2">Need a template? Use this spreadsheet format:</p>
                    <a
                        href={templateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                    >
                        Download CSV Template
                    </a>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center mb-8">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                        id="csvInput"
                    />
                    <label
                        htmlFor="csvInput"
                        className="cursor-pointer text-blue-600 hover:text-blue-800 text-lg font-medium"
                    >
                        Click to select a CSV file
                    </label>

                    {uploadStatus.message && (
                        <div className={`mt-4 ${uploadStatus.isError ? 'text-red-600' : 'text-green-600'}`}>
                            {uploadStatus.message}
                        </div>
                    )}
                </div>

                <div className="mt-6">
                    <button
                        onClick={handleUpload}
                        disabled={!file}
                        className={`w-full py-3 px-4 rounded-lg text-white ${file ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
                            }`}
                    >
                        Upload and Process
                    </button>
                </div>

                <div className="mt-8 bg-gray-100 p-4 rounded-lg">
                    <h3 className="text-lg font-medium mb-2">About the enrichment process:</h3>
                    <p>After uploading your CSV file, the system will sequentially apply the following enrichments:</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Title Relevance Analysis</li>
                        <li>Apollo Lead Enrichment</li>
                        <li>Other Enrichments Specific to Client</li>
                    </ul>
                    <p className="mt-2">You'll be able to monitor the progress of each step and download the final enriched CSV when complete.</p>
                </div>
            </div>
        </div>
    );
};

export default FileUploadPage;