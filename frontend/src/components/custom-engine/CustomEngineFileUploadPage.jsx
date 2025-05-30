// components/custom-engine/CustomEngineFileUploadPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import storageUtils from '../../utils/storageUtils';

const CustomEngineFileUploadPage = ({ onFileUpload, onBack }) => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState({ message: '', isError: false });
  const [customEngineData, setCustomEngineData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileStats, setFileStats] = useState(null);

  useEffect(() => {
    // Load custom engine data
    const engineData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);
    if (!engineData) {
      navigate('/client');
      return;
    }
    
    setCustomEngineData(engineData);
  }, [navigate]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    if (!selectedFile) {
      setFile(null);
      setUploadStatus({ message: '', isError: false });
      setFileStats(null);
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

    // Check file size
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      setUploadStatus({
        message: 'File size too large. Please upload files smaller than 50MB.',
        isError: true
      });
      return;
    }

    setFile(selectedFile);
    setFileStats({
      name: selectedFile.name,
      size: fileSizeMB.toFixed(2) + ' MB',
      lastModified: new Date(selectedFile.lastModified).toLocaleDateString()
    });
    setUploadStatus({
      message: `File "${selectedFile.name}" selected (${fileSizeMB.toFixed(2)} MB)`,
      isError: false
    });
  };

  const normalizeFieldNames = (data) => {
    return data.map(row => {
      const normalizedRow = { ...row };
      
      // Map common field variations
      if (!normalizedRow.first_name && normalizedRow.fname) {
        normalizedRow.first_name = normalizedRow.fname;
      }
      
      if (!normalizedRow.last_name && normalizedRow.lname) {
        normalizedRow.last_name = normalizedRow.lname;
      }
      
      if (!normalizedRow.email && normalizedRow.email_id) {
        normalizedRow.email = normalizedRow.email_id;
      }
      
      if (!normalizedRow.company && normalizedRow.company_name) {
        normalizedRow.company = normalizedRow.company_name;
      }
      
      if (!normalizedRow.position && normalizedRow.title) {
        normalizedRow.position = normalizedRow.title;
      }
      
      // Initialize relevanceTag field
      normalizedRow.relevanceTag = '';
      
      return normalizedRow;
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

    setIsProcessing(true);
    setUploadStatus({ message: 'Processing CSV file...', isError: false });

    // Parse CSV file
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            setUploadStatus({
              message: `Error parsing CSV: ${results.errors[0].message}`,
              isError: true
            });
            setIsProcessing(false);
            return;
          }

          // Ensure we have at least some data
          if (results.data.length === 0) {
            setUploadStatus({
              message: 'CSV file is empty',
              isError: true
            });
            setIsProcessing(false);
            return;
          }

          // Check for essential fields (using flexible field names)
          const headers = Object.keys(results.data[0]).map(h => h.toLowerCase());
          
          const hasName = headers.some(h => h.includes('first') || h.includes('fname')) && 
                         headers.some(h => h.includes('last') || h.includes('lname'));
          
          const hasCompany = headers.some(h => h.includes('company') || h.includes('organization'));
          
          const hasPosition = headers.some(h => h.includes('position') || h.includes('title'));
          
          if (!hasName || !hasCompany || !hasPosition) {
            setUploadStatus({
              message: 'CSV must include name (first/last), company, and position/title fields',
              isError: true
            });
            setIsProcessing(false);
            return;
          }
          
          // Normalize field names for consistency
          const normalizedData = normalizeFieldNames(results.data);

          // Update file stats with row count
          setFileStats(prev => ({
            ...prev,
            rowCount: normalizedData.length,
            columns: Object.keys(normalizedData[0]).length
          }));

          // Save to storage
          storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, normalizedData);

          setUploadStatus({
            message: `Successfully processed ${normalizedData.length} rows`,
            isError: false
          });

          // Call the callback and navigate
          if (onFileUpload) {
            onFileUpload(file, normalizedData);
          }
          
          setTimeout(() => {
            navigate('/custom-engine/processing');
          }, 1000);

        } catch (error) {
          setUploadStatus({
            message: `Error processing CSV: ${error.message}`,
            isError: true
          });
          setIsProcessing(false);
        }
      },
      error: (error) => {
        setUploadStatus({
          message: `Error parsing CSV: ${error.message}`,
          isError: true
        });
        setIsProcessing(false);
      }
    });
  };

  if (!customEngineData) {
    return <div className="flex justify-center items-center h-64">Loading engine data...</div>;
  }

  return (
    <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="self-start mb-4 text-blue-600 hover:underline"
        disabled={isProcessing}
      >
        Back to previous screen
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-8">
        Upload CSV for "{customEngineData.engine_name}"
      </h2>

      <div className="w-full max-w-3xl">
        {/* Engine Details */}
        <div className="p-4 bg-blue-50 rounded-lg mb-6">
          <h3 className="font-bold mb-2">Custom Engine Details</h3>
          <p><span className="font-medium">Engine Type:</span> {customEngineData.engine_type}</p>
          <p><span className="font-medium">Input Schema:</span> {customEngineData.pipeline.inputSchema?.type}</p>
          <p><span className="font-medium">Processing Steps:</span> {customEngineData.pipeline.steps.length}</p>
        </div>
        
        {/* File Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center mb-6">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
            id="csvInput"
            disabled={isProcessing}
          />
          <label
            htmlFor="csvInput"
            className={`cursor-pointer text-lg font-medium ${
              isProcessing ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Click to select a CSV file'}
          </label>

          {fileStats && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">File:</span> {fileStats.name}</div>
                <div><span className="font-medium">Size:</span> {fileStats.size}</div>
                {fileStats.rowCount && (
                  <>
                    <div><span className="font-medium">Rows:</span> {fileStats.rowCount.toLocaleString()}</div>
                    <div><span className="font-medium">Columns:</span> {fileStats.columns}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {uploadStatus.message && (
            <div className={`mt-4 p-3 rounded-lg ${
              uploadStatus.isError ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
            }`}>
              {uploadStatus.message}
            </div>
          )}
        </div>

        {/* Upload Button */}
        <div className="mb-8">
          <button
            onClick={handleUpload}
            disabled={!file || isProcessing}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium ${
              file && !isProcessing 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-gray-400 cursor-not-allowed'
            }`}
          >
            {isProcessing ? 'Processing...' : 'Upload and Start Processing'}
          </button>
        </div>

        {/* CSV Format Requirements */}
        <div className="bg-gray-100 p-6 rounded-lg">
          <h3 className="text-lg font-medium mb-4">CSV Format Requirements</h3>
          
          <div className="mb-4">
            <h4 className="font-medium mb-2">Required Fields (can be in any order):</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {['first_name', 'last_name', 'email_id', 'company', 'position', 'linkedin_url', 'connected_on'].map((field, index) => (
                <span key={index} className="px-2 py-1 bg-blue-100 rounded-md text-sm">
                  {field}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <h4 className="font-medium mb-2">Field Variations Accepted:</h4>
            <ul className="list-disc pl-5 text-sm space-y-1">
              <li>first_name or fname</li>
              <li>last_name or lname</li>
              <li>email_id or email</li>
              <li>company or company_name</li>
              <li>position or title</li>
            </ul>
          </div>

          <div className="text-sm text-gray-600">
            <p><span className="font-medium">Maximum file size:</span> 50MB</p>
            <p><span className="font-medium">Supported format:</span> CSV files only</p>
            <p><span className="font-medium">Large datasets:</span> Files with 10,000+ rows will be processed in chunks for optimal performance</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomEngineFileUploadPage;