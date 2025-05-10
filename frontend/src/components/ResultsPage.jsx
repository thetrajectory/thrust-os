// components/ResultsPage.jsx
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import React, { useEffect, useMemo, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import reportsService from '../services/reportsService';
import storageUtils from '../utils/storageUtils';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const ResultsPage = (props) => {
  const navigate = useNavigate();

  // State for data and statistics
  const [processedData, setProcessedData] = useState([]);
  const [originalCount, setOriginalCount] = useState(props.originalCount || 0);
  const [finalCount, setFinalCount] = useState(props.finalCount || 0);
  const [analytics, setAnalytics] = useState(props.analytics || {});
  const [filterAnalytics, setFilterAnalytics] = useState(props.filterAnalytics || {});

  const [stats, setStats] = useState({
    totalLeads: 0,
    foundersCount: 0,
    relevantCount: 0,
    irrelevantCount: 0,
    finalCount: 0
  });

  // Load data from session storage on component mount
  useEffect(() => {
    // Load all required data from session storage
    const storedProcessedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSED);
    const storedFilteredData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTERED);
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ANALYTICS);
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTER_ANALYTICS);
    const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);

    console.log("Loaded analytics:", storedAnalytics);
    console.log("Loaded filter analytics:", storedFilterAnalytics);

    // Set state from storage
    if (storedProcessedData && storedProcessedData.length > 0) {
      setProcessedData(storedProcessedData);
    }

    if (storedCsvData && storedCsvData.length > 0) {
      setOriginalCount(storedCsvData.length);
    }

    if (storedFilteredData && storedFilteredData.length > 0) {
      setFinalCount(storedFilteredData.length);
    } else if (storedProcessedData) {
      setFinalCount(storedProcessedData.length);
    }

    if (storedAnalytics) {
      setAnalytics(storedAnalytics);
    }

    if (storedFilterAnalytics) {
      setFilterAnalytics(storedFilterAnalytics);
    }
  }, []);

  // Use useMemo to prevent recreating this object on every render
  const chartData = useMemo(() => {
    return {
      labels: ['Founders', 'Relevant', 'Irrelevant', 'Filtered Out'],
      datasets: [
        {
          label: 'Leads Distribution',
          data: [
            stats.foundersCount,
            stats.relevantCount,
            stats.irrelevantCount,
            stats.totalLeads - stats.finalCount
          ],
          backgroundColor: [
            'rgba(54, 162, 235, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 99, 132, 0.6)',
            'rgba(201, 203, 207, 0.6)'
          ],
          borderColor: [
            'rgb(54, 162, 235)',
            'rgb(75, 192, 192)',
            'rgb(255, 99, 132)',
            'rgb(201, 203, 207)'
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [stats]);

  // Compute stats only when necessary data changes
  useEffect(() => {
    if (!processedData || processedData.length === 0) return;

    // Calculate statistics from processed data
    const foundersCount = processedData.filter(row => row.titleRelevance === 'Founder').length;
    const relevantCount = processedData.filter(row => row.titleRelevance === 'Relevant').length;
    const irrelevantCount = processedData.filter(row => row.titleRelevance === 'Irrelevant' || !row.titleRelevance).length;

    setStats({
      totalLeads: originalCount || processedData.length,
      foundersCount,
      relevantCount,
      irrelevantCount,
      finalCount: finalCount || processedData.length
    });

    // Calculate analytics if not already loaded
    if (!analytics || Object.keys(analytics).length === 0) {
      const calculatedAnalytics = {
        titleRelevance: {
          founderCount: foundersCount,
          relevantCount: relevantCount,
          irrelevantCount: irrelevantCount,
          errorCount: 0,
          totalProcessed: processedData.length
        }
      };

      setAnalytics(calculatedAnalytics);
      // Save to storage
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ANALYTICS, calculatedAnalytics);
    }
  }, [processedData, originalCount, finalCount, analytics]);

  // Format number with commas for thousands
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handleDownloadData = () => {
    if (processedData && processedData.length > 0) {
      const result = reportsService.downloadProcessedDataCsv(processedData);
      if (!result.success) {
        alert(`Error downloading data: ${result.error}`);
      }
    } else {
      alert('No data available to download');
    }
  };

  // Using arrow function to preserve 'this' context
  const handleDownloadReport = () => {
    // Retrieve all necessary data from storage to ensure complete analytics
    const storedProcessedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSED) || [];
    const storedFilteredData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTERED) || [];
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ANALYTICS) || {};
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTER_ANALYTICS) || {};
    const storedLogs = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.LOGS) || [];
    const storedStepStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS) || {};
    const originalCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA) || [];

    // Log what we're working with for debugging
    console.log("Analytics loaded from storage:", storedAnalytics);
    console.log("Process status loaded from storage:", storedStepStatus);

    // Construct enrichment state with all available data
    const enrichmentState = {
      processedData: storedProcessedData,
      originalCount: originalCsvData.length || this.state.originalCount,
      finalCount: storedFilteredData.length || this.state.finalCount,
      analytics: storedAnalytics,
      filterAnalytics: storedFilterAnalytics,
      logs: storedLogs,
      stepStatus: storedStepStatus,
      pipeline: [
        'titleRelevance',
        'apolloEnrichment',
        'headcountFilter',
        'domainScraping',
        'companyRelevance',
        'indianLeads',
        'otherCountryLeads',
        'openJobs'
      ]
    };

    console.log("Enrichment state for report:", enrichmentState);

    try {
      const result = reportsService.downloadReportsCsv(enrichmentState);
      if (!result.success) {
        alert(`Error downloading report: ${result.error}`);
      } else {
        alert("Analytics report downloaded successfully!");
      }
    } catch (error) {
      console.error("Error downloading report:", error);
      alert(`Error downloading report: ${error.message}`);
    }
  };

  const handleBack = () => {
    navigate('/processing');
  };

  const runDiagnostics = () => {
    // Load all data from storage
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ANALYTICS);
    const storedStepStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESS_STATUS);
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.FILTER_ANALYTICS);

    console.log("=== DIAGNOSTICS ===");
    console.log("Stored Analytics:", storedAnalytics);
    console.log("Stored Step Status:", storedStepStatus);
    console.log("Stored Filter Analytics:", storedFilterAnalytics);

    alert("Diagnostics complete - check console for details");
  };

  return (
    <div className="container mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">Processing Results</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>
            <div className="space-y-2">
              <p><span className="font-medium">Total Leads Processed:</span> {formatNumber(stats.totalLeads)}</p>
              <p><span className="font-medium">Founders:</span> {formatNumber(stats.foundersCount)}</p>
              <p><span className="font-medium">Relevant Titles:</span> {formatNumber(stats.relevantCount)}</p>
              <p><span className="font-medium">Irrelevant Titles:</span> {formatNumber(stats.irrelevantCount)}</p>
              <p><span className="font-medium">Final Selected Leads:</span> {formatNumber(stats.finalCount)}</p>
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={handleDownloadData}
                disabled={!processedData || processedData.length === 0}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Download Processed Data
              </button>

              <button
                onClick={handleDownloadReport}
                className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
              >
                Download Analytics Report
              </button>

              <button
                onClick={handleBack}
                className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300"
              >
                Back to Processing
              </button>

              <button
                onClick={runDiagnostics}
                className="w-full bg-purple-600 text-white py-2 px-4 rounded hover:bg-purple-700"
              >
                Run Diagnostics
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Data Distribution</h3>
            <div className="h-64">
              {stats.totalLeads > 0 && (
                <Pie data={chartData} options={{ maintainAspectRatio: false }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {processedData && processedData.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-3">Lead Preview</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Relevance</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.slice(0, 10).map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.first_name || row.person?.first_name || ''} {row.last_name || row.person?.last_name || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.position || row.person?.title || row.title || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.company || row.organization?.name || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${row.titleRelevance === 'Founder' ? 'bg-blue-100 text-blue-800' :
                        row.titleRelevance === 'Relevant' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {row.titleRelevance || 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {processedData.length > 10 && (
              <p className="mt-2 text-sm text-gray-500">Showing 10 of {formatNumber(processedData.length)} leads</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsPage;