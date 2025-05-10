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
                storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, enrichedData);

                // Navigate to processing page
                navigate('/processing');
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

    return (
        <div className="flex flex-col items-center justify-center">
            <button
                onClick={handleBack}
                className="self-center mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>
            <h2 className="text-4xl font-bold text-center mb-12">
                Upload CSV File
            </h2>

            <div className="w-full max-w-lg">
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
                        <li>Domain and Sitemap Scrape</li>
                        <li>Company Relevance Scoring</li>
                        <li>Fetch Indian Leads</li>
                        <li>Scrape Open Jobs</li>
                    </ul>
                    <p className="mt-2">You'll be able to monitor the progress of each step and download the final enriched CSV when complete.</p>
                </div>
            </div>
        </div>
    );
};

export default FileUploadPage;