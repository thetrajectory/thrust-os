// Modify FindAdvisorResultsPage.jsx
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import reportsService from '../../../services/find-advisor/videocx/reportsService';
import storageUtils from '../../../utils/storageUtils';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const FindAdvisorResultsPage = () => {
  const navigate = useNavigate();

  // State for data and statistics
  const [processedData, setProcessedData] = useState([]);
  const [originalCount, setOriginalCount] = useState(0);
  // Add new state for custom filename
  const [customFilename, setCustomFilename] = useState('');

  // Load data from session storage on component mount
  useEffect(() => {
    // Load all required data from session storage
    const storedProcessedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED);
    const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);

    // Set state from storage
    if (storedProcessedData && storedProcessedData.length > 0) {
      setProcessedData(storedProcessedData);
    }

    if (storedCsvData && storedCsvData.length > 0) {
      setOriginalCount(storedCsvData.length);
    }
  }, []);

  // Format number with commas for thousands
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Handle download functions
  const handleDownloadData = () => {
    let dataToDownload = processedData;

    if (!dataToDownload || dataToDownload.length === 0) {
      dataToDownload = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_PROCESSED);
    }

    if (!dataToDownload || dataToDownload.length === 0) {
      dataToDownload = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
    }

    if (dataToDownload && dataToDownload.length > 0) {
      // Create filename with .csv extension if not provided
      let filename = customFilename.trim();
      if (filename && !filename.toLowerCase().endsWith('.csv')) {
        filename += '.csv';
      } else if (!filename) {
        filename = 'advisor_finder_data.csv';
      }

      const result = reportsService.downloadProcessedDataCsv(dataToDownload, filename);
      if (!result.success) {
        alert(`Error downloading data: ${result.error}`);
      } else {
        alert("Data downloaded successfully!");
      }
    } else {
      alert('No data available to download.');
    }
  };

  const handleDownloadReport = () => {
    // Create filename with .csv extension if not provided
    let filename = customFilename.trim();
    if (filename && !filename.toLowerCase().endsWith('.csv')) {
      filename += '.csv';
    } else if (!filename) {
      filename = 'advisor_finder_report.csv';
    }

    const result = reportsService.downloadReportsCsv({
      processedData,
      analytics: storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_ANALYTICS),
      filterAnalytics: storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FIND_ADVISOR_FILTER_ANALYTICS)
    }, filename);

    if (!result.success) {
      alert(`Error generating report: ${result.error}`);
    } else {
      alert("Report downloaded successfully!");
    }
  };

  const handleBack = () => {
    navigate('/find-advisor/videocx/processing');
  };

  return (
    <div className="container mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Advisor Finder Results</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>
            <div className="space-y-2">
              <p><span className="font-medium">Total Leads Processed:</span> {formatNumber(originalCount)}</p>
              <p><span className="font-medium">Final Processed Leads:</span> {formatNumber(processedData.length)}</p>
            </div>

            {/* Add filename input field */}
            <div className="mt-4">
              <label htmlFor="customFilename" className="block text-sm font-medium text-gray-700 mb-1">
                Output Filename (optional)
              </label>
              <input
                type="text"
                id="customFilename"
                value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                placeholder="Enter filename for download"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank for default filename or enter your preferred name (.csv will be added if missing)
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={handleDownloadData}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
              >
                Download Processed Data
              </button>

              <button
                onClick={handleDownloadReport}
                className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 mt-3"
              >
                Download Analytics Report
              </button>

              <button
                onClick={handleBack}
                className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300"
              >
                Back to Processing
              </button>
            </div>
          </div>
        </div>
      </div>

      {processedData && processedData.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-3">Potential Advisors Preview</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Connection Time</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.slice(0, 10).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.first_name || row.person?.first_name || ''} {row.last_name || row.person?.last_name || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.position || row.person?.title || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.company || row.organization?.name || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.connectionTime || 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {processedData.length > 10 && (
              <p className="mt-2 text-sm text-gray-500">Showing top 10 contacts of {formatNumber(processedData.length)} total contacts</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FindAdvisorResultsPage;