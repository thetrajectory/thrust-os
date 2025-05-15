// components/videocx/VideoCXResultsPage.jsx
import { ArcElement, Chart as ChartJS, Legend, Tooltip } from 'chart.js';
import React, { useEffect, useMemo, useState } from 'react';
import { Pie } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import reportsService from '../../services/videocx/reportsService';
import storageUtils from '../../utils/storageUtils';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

const VideoCXResultsPage = (props) => {
  const navigate = useNavigate();

  // State for data and statistics
  const [processedData, setProcessedData] = useState([]);
  const [originalCount, setOriginalCount] = useState(props.originalCount || 0);
  const [finalCount, setFinalCount] = useState(props.finalCount || 0);
  const [analytics, setAnalytics] = useState(props.analytics || {});
  const [filterAnalytics, setFilterAnalytics] = useState(props.filterAnalytics || {});

  const [stats, setStats] = useState({
    totalLeads: 0,
    decisionMakerCount: 0,
    relevantCount: 0,
    irrelevantCount: 0,
    sufficientHeadcount: 0,
    lowHeadcount: 0,
    noHeadcountData: 0,
    financeIndustryCount: 0,
    otherIndustriesCount: 0,
    publicCompanyCount: 0,
    privateCompanyCount: 0,
    withInsightsCount: 0,
    withoutInsightsCount: 0,
    finalCount: 0
  });

  // Ensure correct client is set
  useEffect(() => {
    const currentClient = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CLIENT);
    if (currentClient !== 'Video CX') {
      console.log("Setting client to Video CX in VideoCXResultsPage");
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CLIENT, 'Video CX');
    }
  }, []);

  // Load data from session storage on component mount
  useEffect(() => {
    // Load all required data from session storage
    const storedProcessedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_PROCESSED);
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_ANALYTICS);
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_FILTER_ANALYTICS);
    const storedCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);

    console.log("Loaded VideoCX analytics:", storedAnalytics);
    console.log("Loaded VideoCX filter analytics:", storedFilterAnalytics);

    // Set state from storage
    if (storedProcessedData && storedProcessedData.length > 0) {
      setProcessedData(storedProcessedData);
    }

    if (storedCsvData && storedCsvData.length > 0) {
      setOriginalCount(storedCsvData.length);
    }

    if (storedProcessedData) {
      // Count leads that are not filtered out by relevanceTag
      setFinalCount(storedProcessedData.filter(row => !row.relevanceTag).length);
    }

    if (storedAnalytics) {
      setAnalytics(storedAnalytics);
    }

    if (storedFilterAnalytics) {
      setFilterAnalytics(storedFilterAnalytics);
    }
  }, []);

  // Chart data for title relevance
  const titleChartData = useMemo(() => {
    return {
      labels: ['Decision Makers', 'Relevant', 'Irrelevant'],
      datasets: [
        {
          label: 'Title Distribution',
          data: [
            stats.decisionMakerCount,
            stats.relevantCount,
            stats.irrelevantCount
          ],
          backgroundColor: [
            'rgba(54, 162, 235, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderColor: [
            'rgb(54, 162, 235)',
            'rgb(75, 192, 192)',
            'rgb(255, 99, 132)'
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [stats]);

  // Chart data for company type
  const companyChartData = useMemo(() => {
    return {
      labels: ['Public Companies', 'Private Companies'],
      datasets: [
        {
          label: 'Company Types',
          data: [
            stats.publicCompanyCount,
            stats.privateCompanyCount
          ],
          backgroundColor: [
            'rgba(255, 206, 86, 0.6)',
            'rgba(153, 102, 255, 0.6)'
          ],
          borderColor: [
            'rgb(255, 206, 86)',
            'rgb(153, 102, 255)'
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [stats]);

  // Chart data for insights
  const insightsChartData = useMemo(() => {
    return {
      labels: ['With Insights', 'Without Insights'],
      datasets: [
        {
          label: 'Insights Extraction',
          data: [
            stats.withInsightsCount,
            stats.withoutInsightsCount
          ],
          backgroundColor: [
            'rgba(75, 192, 192, 0.6)',
            'rgba(255, 99, 132, 0.6)'
          ],
          borderColor: [
            'rgb(75, 192, 192)',
            'rgb(255, 99, 132)'
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [stats]);

  // Compute stats from processed data
  useEffect(() => {
    if (!processedData || processedData.length === 0) return;

    // Calculate statistics from processed data
    const decisionMakerCount = processedData.filter(row => row.titleRelevance === 'Decision Maker').length;
    const relevantCount = processedData.filter(row => row.titleRelevance === 'Relevant').length;
    const irrelevantCount = processedData.filter(row => row.titleRelevance === 'Irrelevant').length;

    // Headcount stats
    const sufficientHeadcount = processedData.filter(row => !row.relevanceTag || (row.relevanceTag !== 'Low Headcount' && row.relevanceTag !== 'No Headcount Data')).length;
    const lowHeadcount = processedData.filter(row => row.relevanceTag === 'Low Headcount').length;
    const noHeadcountData = processedData.filter(row => row.relevanceTag === 'No Headcount Data').length;

    // Industry stats
    const financeIndustryCount = processedData.filter(row => !row.relevanceTag || row.relevanceTag !== 'Irrelevant Industry').length;
    const otherIndustriesCount = processedData.filter(row => row.relevanceTag === 'Irrelevant Industry').length;


    const publicCompanyCount = processedData.filter(row => row.isPublicCompany === true).length;
    const privateCompanyCount = processedData.filter(row => row.isPublicCompany === false).length;

    const withInsightsCount = processedData.filter(row => row.insights && row.insights.length > 0).length;
    const withoutInsightsCount = processedData.filter(row => !row.insights || row.insights.length === 0).length;

    const taggedCount = processedData.filter(row => row.relevanceTag).length;
    const untaggedCount = processedData.filter(row => !row.relevanceTag).length;

    setStats({
      totalLeads: originalCount || processedData.length,
      decisionMakerCount,
      relevantCount,
      irrelevantCount,
      sufficientHeadcount,
      lowHeadcount,
      noHeadcountData,
      financeIndustryCount,
      otherIndustriesCount,
      publicCompanyCount,
      privateCompanyCount,
      withInsightsCount,
      withoutInsightsCount,
      taggedCount,
      untaggedCount,
      finalCount: untaggedCount
    });

    // Update analytics if needed from computed stats
    if (!analytics || Object.keys(analytics).length === 0) {
      const calculatedAnalytics = {
        titleRelevance: {
          decisionMakerCount,
          relevantCount,
          irrelevantCount,
          totalProcessed: processedData.length
        },
        publicCompanyFilter: {
          publicCount: publicCompanyCount,
          privateCount: privateCompanyCount
        },
        insightsExtraction: {
          insightsFound: withInsightsCount,
          noInsights: withoutInsightsCount
        }
      };

      setAnalytics(calculatedAnalytics);
      storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.VIDEOCX_ANALYTICS, calculatedAnalytics);
    }
  }, [processedData, originalCount, analytics]);

  // Format number with commas for thousands
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  // Handle download functions
  const handleDownloadData = () => {
    let dataToDownload = processedData;

    if (!dataToDownload || dataToDownload.length === 0) {
      dataToDownload = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_PROCESSED);
    }

    if (!dataToDownload || dataToDownload.length === 0) {
      dataToDownload = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
    }

    if (dataToDownload && dataToDownload.length > 0) {
      const result = reportsService.downloadProcessedDataCsv(dataToDownload, 'videocx_processed_data.csv');
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
    // Retrieve all necessary data from storage
    const storedProcessedData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_PROCESSED) || [];
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_ANALYTICS) || {};
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_FILTER_ANALYTICS) || {};
    const storedLogs = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_LOGS) || [];
    const storedStepStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_PROCESS_STATUS) || {};
    const originalCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA) || [];

    const enrichmentState = {
      processedData: storedProcessedData,
      originalCount: originalCsvData.length || originalCount,
      finalCount: storedProcessedData.filter(row => !row.relevanceTag).length || finalCount,
      analytics: storedAnalytics,
      filterAnalytics: storedFilterAnalytics,
      logs: storedLogs,
      stepStatus: storedStepStatus,
      pipeline: [
        'titleRelevance',
        'apolloEnrichment',
        'publicCompanyFilter',
        'fetchAnnualReports',
        'insightsExtraction'
      ]
    };

    try {
      const result = reportsService.downloadReportsCsv(enrichmentState, 'videocx_analytics_report.csv');
      if (!result.success) {
        alert(`Error downloading report: ${result.error}`);
      } else {
        alert("VideoCX analytics report downloaded successfully!");
      }
    } catch (error) {
      console.error("Error downloading report:", error);
      alert(`Error downloading report: ${error.message}`);
    }
  };


  const handleBack = () => {
    navigate('/videocx/processing');
  };

  const runDiagnostics = () => {
    // Debug function to see what's in storage
    const storedAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_ANALYTICS);
    const storedStepStatus = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_PROCESS_STATUS);
    const storedFilterAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.VIDEOCX_FILTER_ANALYTICS);

    console.log("=== VIDEOCX DIAGNOSTICS ===");
    console.log("Stored Analytics:", storedAnalytics);
    console.log("Stored Step Status:", storedStepStatus);
    console.log("Stored Filter Analytics:", storedFilterAnalytics);
    console.log("Current processed data:", processedData);

    alert("VideoCX diagnostics complete - check console for details");
  };

  return (
    <div className="container mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4">VideoCX Processing Results</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Summary</h3>
            <div className="space-y-2">
              <p><span className="font-medium">Total Leads Processed:</span> {formatNumber(stats.totalLeads)}</p>
              <p><span className="font-medium">Decision Makers:</span> {formatNumber(stats.decisionMakerCount)}</p>
              <p><span className="font-medium">Relevant Titles:</span> {formatNumber(stats.relevantCount)}</p>
              <p><span className="font-medium">Companies with 100+ Employees:</span> {formatNumber(stats.sufficientHeadcount)}</p>
              <p><span className="font-medium">Financial Services Companies:</span> {formatNumber(stats.financeIndustryCount)}</p>
              <p><span className="font-medium">Public Companies:</span> {formatNumber(stats.publicCompanyCount)}</p>
              <p><span className="font-medium">Companies with Insights:</span> {formatNumber(stats.withInsightsCount)}</p>
              <p><span className="font-medium">Final Selected Leads:</span> {formatNumber(stats.finalCount)}</p>
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-3">
                <h4 className="text-center text-sm font-medium mb-1">Title Relevance</h4>
                <div className="h-40">
                  {stats.totalLeads > 0 && (
                    <Pie data={titleChartData} options={{ maintainAspectRatio: false }} />
                  )}
                </div>
              </div>
              <div className="md:col-span-3/2">
                <h4 className="text-center text-sm font-medium mb-1">Company Type</h4>
                <div className="h-40">
                  {stats.totalLeads > 0 && (
                    <Pie data={companyChartData} options={{ maintainAspectRatio: false }} />
                  )}
                </div>
              </div>
              <div className="md:col-span-3/2">
                <h4 className="text-center text-sm font-medium mb-1">Insights Extraction</h4>
                <div className="h-40">
                  {stats.totalLeads > 0 && (
                    <Pie data={insightsChartData} options={{ maintainAspectRatio: false }} />
                  )}
                </div>
              </div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insights</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.slice(0, 10).map((row, idx) => (
                  <tr key={idx} className={row.relevanceTag ? "bg-gray-100" : ""}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.first_name || row.person?.first_name || ''} {row.last_name || row.person?.last_name || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${row.titleRelevance === 'Decision Maker' ? 'bg-blue-100 text-blue-800' :
                        row.titleRelevance === 'Relevant' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {row.titleRelevance || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{row.company || row.organization?.name || ''}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.isPublicCompany === true ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Public
                        </span>
                      ) : row.isPublicCompany === false ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Private
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          Unknown
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.relevanceTag ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          {row.relevanceTag}
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Qualified
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {row.insights && row.insights.length > 0 ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {row.insights.length} Insights
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          None
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {processedData.length > 10 && (
              <p className="mt-2 text-sm text-gray-500">Showing 10 of {formatNumber(processedData.length)} leads</p>
            )}
          </div>

          {/* Display insights for the first row that has them */}
          {processedData.some(row => row.insights && row.insights.length > 0) && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">Sample Insights</h3>
              <div className="bg-blue-50 p-4 rounded">
                <h4 className="font-medium text-blue-800 mb-2">
                  {processedData.find(row => row.insights && row.insights.length > 0)?.company ||
                    processedData.find(row => row.insights && row.insights.length > 0)?.organization?.name} Insights:
                </h4>
                <ul className="space-y-2">
                  {processedData.find(row => row.insights && row.insights.length > 0)?.insights?.slice(0, 3).map((insight, idx) => (
                    <li key={idx} className="text-sm text-blue-900">• {insight}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoCXResultsPage;