// components/custom-engine/CustomEngineResultsPage.jsx
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import customEngineFileStorageService from '../../services/custom-engine/customEngineFileStorageService';
import storageUtils from '../../utils/storageUtils';

const CustomEngineResultsPage = ({ onBack }) => {
    const navigate = useNavigate();
    const [customEngineData, setCustomEngineData] = useState(null);
    const [results, setResults] = useState(null);
    const [processingStats, setProcessingStats] = useState(null);
    const [filterView, setFilterView] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [downloadingCsv, setDownloadingCsv] = useState(false);
    const [downloadingReport, setDownloadingReport] = useState(false);

    useEffect(() => {
        // Load custom engine data and results
        const engineData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);
        const processingAnalytics = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS);
        let data = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA);

        // Try to get data from file storage if not available in session
        if (!data || data.length === 0) {
            data = customEngineFileStorageService.getProcessedData();
        }

        if (!engineData) {
            navigate('/client');
            return;
        }

        if (!data || data.length === 0) {
            navigate('/custom-engine/processing');
            return;
        }

        setCustomEngineData(engineData);
        setResults(data);

        // Calculate statistics
        if (processingAnalytics) {
            setProcessingStats(processingAnalytics);
        } else {
            const originalCsvData = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);
            const stats = customEngineFileStorageService.getProcessingStats(data);
            const analyticsData = {
                originalCount: originalCsvData?.length || data.length,
                finalCount: stats.qualifiedLeads,
                filteredCounts: {},
                stepMetrics: [],
                processingStats: stats
            };
            setProcessingStats(analyticsData);
        }

        setIsLoading(false);
    }, [navigate]);

    const handleDownloadCSV = async () => {
        if (!results || results.length === 0) {
            alert('No results to download');
            return;
        }

        setDownloadingCsv(true);

        try {
            // Filter data based on current view
            let dataToExport = [];

            if (filterView === 'all') {
                dataToExport = results;
            } else if (filterView === 'qualified') {
                dataToExport = results.filter(row => !row.relevanceTag);
            } else if (filterView === 'disqualified') {
                dataToExport = results.filter(row => row.relevanceTag);
            }

            // Use file storage service to download
            const filename = `${customEngineData.engine_name.replace(/[^a-zA-Z0-9]/g, '_')}_results_${filterView}.csv`;
            const downloadResult = customEngineFileStorageService.downloadProcessedDataCsv(dataToExport, filename);

            if (!downloadResult.success) {
                alert(`Download failed: ${downloadResult.error}`);
            }

        } catch (error) {
            console.error('Error downloading CSV:', error);
            alert(`Download failed: ${error.message}`);
        } finally {
            setDownloadingCsv(false);
        }
    };

    const handleDownloadReport = async () => {
        if (!processingStats) {
            alert('No processing statistics to download');
            return;
        }

        setDownloadingReport(true);

        try {
            // ENHANCED: Load and pass the actual stored metrics to file storage service
            let enhancedProcessingStats = { ...processingStats };

            // Try to get the real metrics from MetricsStorageService
            try {
                const metricsStorageService = (await import('../../services/analytics/MetricsStorageService')).default;
                metricsStorageService.loadMetrics();
                const storedMetrics = metricsStorageService.getAllMetrics();

                if (storedMetrics && storedMetrics.stepMetrics && storedMetrics.stepMetrics.length > 0) {
                    enhancedProcessingStats.stepMetrics = storedMetrics.stepMetrics;
                    console.log('📊 Using stored metrics for report download:', storedMetrics.stepMetrics.length, 'steps');

                    // Log each step for debugging
                    storedMetrics.stepMetrics.forEach(step => {
                        console.log(`📊 Step: ${step.stepName}, Tokens: ${step.tokensUsed}, Credits: ${step.creditsUsed}, Substep: ${step.specificMetrics?.isSubstep || false}`);
                    });
                }
            } catch (error) {
                console.log('⚠️ Could not load MetricsStorageService for report download:', error);
            }

            // Use file storage service to generate report with enhanced metrics
            const reportResult = customEngineFileStorageService.generateProcessingReport(results, enhancedProcessingStats);

            if (!reportResult.success) {
                alert(`Report generation failed: ${reportResult.error}`);
            } else {
                console.log('✅ Report generated successfully:', reportResult.message);
            }

        } catch (error) {
            console.error('Error generating report:', error);
            alert(`Report generation failed: ${error.message}`);
        } finally {
            setDownloadingReport(false);
        }
    };

    const handleNewAnalysis = () => {
        // Clear current data
        customEngineFileStorageService.clearData();
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.CSV_DATA);

        navigate('/');
    };

    const handleRunAgain = () => {
        // Keep engine data but clear processed results
        customEngineFileStorageService.clearData();
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSED_DATA);
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.PROCESSING_ANALYTICS);

        navigate('/custom-engine/upload');
    };

    // Format numbers with commas
    const formatNumber = (num) => {
        return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") || "0";
    };

    // Get display columns for results table
    const getDisplayColumns = (data) => {
        if (!data || data.length === 0) return [];

        // Priority columns that should always be shown first if they exist
        const priorityColumns = [
            'first_name', 'last_name', 'email', 'company', 'position',
            'headcount', 'relevanceTag', 'promptAnalysis', 'serper_insights',
            'website_analysis', 'experience_analysis', 'sitemap_analysis',
            'financial_insights', 'job_insights'
        ];

        // Get all keys from the first row
        const allKeys = Object.keys(data[0]);

        // First include priority columns that exist in the data
        const orderedColumns = priorityColumns.filter(col => allKeys.includes(col));

        // Then add other columns (up to a reasonable limit)
        const remainingColumns = allKeys.filter(key => !orderedColumns.includes(key));
        const additionalColumns = remainingColumns.slice(0, 8 - orderedColumns.length);

        return [...orderedColumns, ...additionalColumns];
    };

    // Get filtered data based on current view
    const getFilteredData = () => {
        if (!results) return [];

        if (filterView === 'all') return results;
        if (filterView === 'qualified') return results.filter(row => !row.relevanceTag);
        if (filterView === 'disqualified') return results.filter(row => row.relevanceTag);
        return results;
    };

    // Calculate pass rate
    const getPassRate = () => {
        if (!processingStats) return 0;
        return processingStats.originalCount > 0
            ? ((processingStats.finalCount / processingStats.originalCount) * 100).toFixed(1)
            : 0;
    };

    // Fixed handleDownloadMetricsReport function
    const handleDownloadMetricsReport = async () => {
        if (!processingStats) {
            alert('No metrics data available');
            return;
        }

        const metricsData = [];

        // ENHANCED: Load metrics from MetricsStorageService to get Apollo substeps
        let stepMetricsToProcess = [];

        try {
            // Import and load the actual stored metrics
            const metricsStorageService = (await import('../../services/analytics/MetricsStorageService')).default;
            metricsStorageService.loadMetrics();
            const storedMetrics = metricsStorageService.getAllMetrics();

            if (storedMetrics && storedMetrics.stepMetrics && storedMetrics.stepMetrics.length > 0) {
                stepMetricsToProcess = storedMetrics.stepMetrics;
                console.log('📊 Using stored metrics with', stepMetricsToProcess.length, 'steps for metrics report');

                // Debug log each step
                stepMetricsToProcess.forEach(step => {
                    console.log(`📊 Found step: ${step.stepName}, Tokens: ${step.tokensUsed}, Credits: ${step.creditsUsed}, IsSubstep: ${step.specificMetrics?.isSubstep || false}`);
                });
            } else {
                console.log('⚠️ No stored metrics found, using processingStats fallback');
                stepMetricsToProcess = processingStats.stepMetrics || [];
            }
        } catch (error) {
            console.error('Error loading MetricsStorageService:', error);
            stepMetricsToProcess = processingStats.stepMetrics || [];
        }

        // Helper function to safely extract metrics
        const extractMetric = (metric, field, defaultValue = 0) => {
            if (!metric) {
                console.log(`⚠️ Metric is null for field: ${field}`);
                return defaultValue;
            }
            const value = metric[field] !== undefined ? metric[field] : defaultValue;
            return value;
        };

        // ENHANCED: Sort metrics to ensure proper order (main steps first, then their substeps)
        const sortedMetrics = stepMetricsToProcess.sort((a, b) => {
            const aIsSubstep = a.specificMetrics?.isSubstep || false;
            const bIsSubstep = b.specificMetrics?.isSubstep || false;

            // If both are main steps or both are substeps, sort alphabetically
            if (aIsSubstep === bIsSubstep) {
                return a.stepName.localeCompare(b.stepName);
            }

            // Main steps come before substeps
            return aIsSubstep ? 1 : -1;
        });

        // ENHANCED: Process each step INCLUDING Apollo substeps with proper display names
        sortedMetrics.forEach(metric => {
            const inputCount = extractMetric(metric, 'inputCount');
            const outputCount = extractMetric(metric, 'outputCount');
            const tokensUsed = extractMetric(metric, 'tokensUsed');
            const creditsUsed = extractMetric(metric, 'creditsUsed');
            const processingTime = extractMetric(metric, 'processingTime');
            const supabaseHits = extractMetric(metric, 'supabaseHits');
            const apiCalls = extractMetric(metric, 'apiCalls');
            const errors = extractMetric(metric, 'errors');
            const apiTool = metric.apiTool || 'Internal';

            // ENHANCED: Better display names for Apollo substeps and main steps
            let displayStepName;
            const isSubstep = metric.specificMetrics?.isSubstep;

            if (isSubstep) {
                // Map Apollo substep names to user-friendly display names
                const substepDisplayNames = {
                    'apolloEnrichment_website': 'Website Analysis',
                    'apolloEnrichment_experience': 'Employee History Analysis',
                    'apolloEnrichment_sitemap': 'Sitemaps Scraping'
                };

                displayStepName = substepDisplayNames[metric.stepName] ||
                    `${metric.stepName.replace('apolloEnrichment_', '').toUpperCase()} Analysis`;
            } else {
                // Main step display names
                const mainStepDisplayNames = {
                    'apolloEnrichment': 'Apollo Enrichment',
                    'promptAnalysis': 'Prompt Analysis',
                    'financialInsight': 'Financial Insight',
                    'jobOpenings': 'Job Openings',
                    'serperEnrichment': 'Serper Enrichment'
                };

                displayStepName = mainStepDisplayNames[metric.stepName] || metric.stepName;
            }

            // ENHANCED: Add detailed debugging info in notes
            const debugNotes = isSubstep ?
                `Part of ${metric.specificMetrics.parentStep} | ${metric.specificMetrics.description || 'Substep'}` :
                `Main step | ${metric.specificMetrics?.description || 'Core processing'} | API: ${apiTool}`;

            // Add the metric row
            metricsData.push({
                'Date': new Date().toLocaleDateString(),
                'Time': new Date().toLocaleTimeString(),
                'Engine': customEngineData?.engine_name || 'Custom Engine',
                'Step': displayStepName,
                'Total Rows': inputCount,
                'Processed Rows': outputCount,
                'Tokens Used': tokensUsed, // Now shows actual tracked tokens from logs
                'Credits Used': creditsUsed, // Now shows actual tracked credits from logs
                'API Calls': apiCalls,
                'Time to Run (seconds)': processingTime > 0 ? (processingTime / 1000).toFixed(2) : '0',
                'Average Token/Row': inputCount > 0 && tokensUsed > 0 ? (tokensUsed / inputCount).toFixed(2) : '0',
                'Average Time/Row (seconds)': inputCount > 0 && processingTime > 0 ? ((processingTime / 1000) / inputCount).toFixed(4) : '0',
                'API/Tool': apiTool,
                'Supabase Hits': supabaseHits,
                'Errors': errors,
                'Notes': debugNotes
            });

            console.log(`📊 Added metrics row: ${displayStepName} (Tokens: ${tokensUsed}, Credits: ${creditsUsed}, Supabase: ${supabaseHits})`);
        });

        // ENHANCED: Calculate corrected totals from all steps including substeps
        const totalRows = processingStats.originalCount || 0;
        const totalTokens = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'tokensUsed'), 0);
        const totalCredits = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'creditsUsed'), 0);
        const totalTime = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'processingTime'), 0);
        const totalApiCalls = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'apiCalls'), 0);
        const totalSupabaseHits = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'supabaseHits'), 0);
        const totalErrors = sortedMetrics.reduce((sum, metric) => sum + extractMetric(metric, 'errors'), 0);

        // Count Apollo substeps for reporting
        const apolloSubsteps = sortedMetrics.filter(m => m.specificMetrics?.isSubstep && m.stepName.startsWith('apolloEnrichment')).length;

        console.log(`📊 TOTALS - Steps: ${sortedMetrics.length} (${apolloSubsteps} Apollo substeps), Tokens: ${totalTokens}, Credits: ${totalCredits}, Supabase: ${totalSupabaseHits}`);

        // Add total row
        metricsData.push({
            'Date': new Date().toLocaleDateString(),
            'Time': new Date().toLocaleTimeString(),
            'Engine': customEngineData?.engine_name || 'Custom Engine',
            'Step': 'TOTAL - ALL STEPS',
            'Total Rows': totalRows,
            'Processed Rows': processingStats.finalCount || 0,
            'Tokens Used': totalTokens,
            'Credits Used': totalCredits,
            'API Calls': totalApiCalls,
            'Time to Run (seconds)': totalTime > 0 ? (totalTime / 1000).toFixed(2) : '0',
            'Average Token/Row': totalRows > 0 && totalTokens > 0 ? (totalTokens / totalRows).toFixed(2) : '0',
            'Average Time/Row (seconds)': totalRows > 0 && totalTime > 0 ? ((totalTime / 1000) / totalRows).toFixed(4) : '0',
            'API/Tool': 'Multiple APIs',
            'Supabase Hits': totalSupabaseHits,
            'Errors': totalErrors,
            'Notes': `Pass Rate: ${getPassRate()}% | Total Steps: ${sortedMetrics.length} | Apollo Substeps: ${apolloSubsteps}`
        });

        // ENHANCED: Validate that we have Apollo substeps if Apollo was processed
        const hasApolloMain = sortedMetrics.some(m => m.stepName === 'apolloEnrichment');
        const hasApolloSubsteps = apolloSubsteps > 0;

        if (hasApolloMain && !hasApolloSubsteps) {
            console.warn('⚠️ Apollo main step found but no substeps detected. Check substep creation logic.');
        } else if (hasApolloMain && hasApolloSubsteps) {
            console.log(`✅ Apollo processing detected with ${apolloSubsteps} substeps`);
        }

        // Convert to CSV and download
        const csv = Papa.unparse(metricsData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${customEngineData?.engine_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'custom_engine'}_metrics_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);

        console.log(`✅ Metrics report downloaded with ${metricsData.length - 1} processing steps (including ${apolloSubsteps} Apollo substeps) + 1 total row`);
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-lg text-gray-600">Loading results...</div>
            </div>
        );
    }

    if (!customEngineData || !results || !processingStats) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-lg text-red-600">No results data found. Please run the processing again.</div>
            </div>
        );
    }

    const filteredData = getFilteredData();

    return (
        <div className="flex flex-col items-center justify-center max-w-6xl mx-auto">
            <button
                onClick={onBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>

            <h2 className="text-4xl font-bold text-center mb-8">
                {customEngineData.engine_name} - Processing Results
            </h2>

            {/* Results Overview */}
            <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-gray-100 p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-gray-800">
                        {formatNumber(processingStats.originalCount)}
                    </div>
                    <div className="text-gray-600 mt-2">Original Rows</div>
                </div>

                <div className="bg-green-100 p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-green-800">
                        {formatNumber(processingStats.finalCount)}
                    </div>
                    <div className="text-green-600 mt-2">Qualified Leads</div>
                </div>

                <div className="bg-yellow-100 p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-yellow-800">
                        {formatNumber(processingStats.originalCount - processingStats.finalCount)}
                    </div>
                    <div className="text-yellow-600 mt-2">Tagged/Filtered</div>
                </div>

                <div className="bg-blue-100 p-6 rounded-lg text-center">
                    <div className="text-4xl font-bold text-blue-800">
                        {getPassRate()}%
                    </div>
                    <div className="text-blue-600 mt-2">Pass Rate</div>
                </div>
            </div>


            {/* Error Summary (if any) */}
            {processingStats.processingStats && processingStats.processingStats.errorRows > 0 && (
                <div className="w-full mb-8 p-4 bg-red-50 rounded-lg border border-red-200">
                    <h3 className="text-lg font-bold text-red-800 mb-2">Processing Issues</h3>
                    <p className="text-red-700">
                        {formatNumber(processingStats.processingStats.errorRows)} rows encountered processing errors.
                        These rows are included in the export with error markers for review.
                    </p>
                </div>
            )}

            {/* Results Preview */}
            <div className="w-full mb-8">
                <h3 className="text-xl font-bold mb-4">Results Preview</h3>

                {/* Filter buttons */}
                <div className="mb-4 flex flex-wrap gap-3">
                    <button
                        onClick={() => setFilterView('all')}
                        className={`px-4 py-2 rounded-lg transition-colors ${filterView === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                            }`}
                    >
                        All Rows ({formatNumber(results.length)})
                    </button>
                    <button
                        onClick={() => setFilterView('qualified')}
                        className={`px-4 py-2 rounded-lg transition-colors ${filterView === 'qualified'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                            }`}
                    >
                        Qualified ({formatNumber(processingStats.finalCount)})
                    </button>
                    <button
                        onClick={() => setFilterView('disqualified')}
                        className={`px-4 py-2 rounded-lg transition-colors ${filterView === 'disqualified'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                            }`}
                    >
                        Tagged/Filtered ({formatNumber(processingStats.originalCount - processingStats.finalCount)})
                    </button>
                </div>

                {/* Results table */}
                <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                            <tr>
                                {getDisplayColumns(results).map((key, index) => (
                                    <th key={index} className="py-3 px-4 border-b text-left text-sm font-medium text-gray-700">
                                        {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.slice(0, 5).map((row, rowIndex) => (
                                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    {getDisplayColumns(results).map((key, colIndex) => (
                                        <td key={colIndex} className="py-3 px-4 border-b text-sm">
                                            {key === 'relevanceTag' && row[key] ? (
                                                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                                                    {row[key]}
                                                </span>
                                            ) : key.endsWith('_analysis') || key.endsWith('_insights') ? (
                                                row[key] ? (
                                                    <span className="text-xs text-purple-700" title={row[key]}>
                                                        {String(row[key]).substring(0, 50)}...
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )
                                            ) : typeof row[key] === 'object' ? (
                                                JSON.stringify(row[key]).substring(0, 40) +
                                                (JSON.stringify(row[key]).length > 40 ? '...' : '')
                                            ) : (
                                                String(row[key] || '').substring(0, 40) +
                                                (String(row[key] || '').length > 40 ? '...' : '')
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredData.length > 5 && (
                        <div className="p-4 bg-gray-50 text-center text-sm text-gray-500">
                            Showing 5 of {formatNumber(filteredData.length)} rows
                        </div>
                    )}

                    {filteredData.length === 0 && (
                        <div className="p-8 text-center text-gray-500">
                            No data matches the current filter
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-wrap justify-center gap-4 mb-8">
                <button
                    onClick={handleDownloadCSV}
                    disabled={downloadingCsv || !results || results.length === 0}
                    className={`px-6 py-3 rounded-lg transition-colors ${downloadingCsv || !results || results.length === 0
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                >
                    {downloadingCsv ? 'Downloading...' : `Download ${filterView === 'all' ? 'All' : filterView.charAt(0).toUpperCase() + filterView.slice(1)} Results CSV`}
                </button>

                <button
                    onClick={handleDownloadMetricsReport}
                    disabled={downloadingReport || !processingStats}
                    className={`px-6 py-3 rounded-lg transition-colors ${downloadingReport || !processingStats
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                >
                    {downloadingReport ? 'Generating...' : 'Download Processing Report'}
                </button>

                <button
                    onClick={handleRunAgain}
                    className="px-6 py-3 border-2 border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                    Run Engine Again
                </button>

                <button
                    onClick={handleNewAnalysis}
                    className="px-6 py-3 border-2 border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Start New Analysis
                </button>
            </div>

            {/* Usage Tips */}
            <div className="w-full p-6 bg-blue-50 rounded-lg">
                <h3 className="font-bold mb-3">💡 Tips for Using Your Results</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <h4 className="font-medium mb-2">Data Interpretation:</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Qualified leads have passed all your filtering criteria</li>
                            <li>Tagged leads show why they were filtered out</li>
                            <li>Analysis fields contain AI-generated insights</li>
                            <li>Processing errors are marked for manual review</li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-medium mb-2">Next Steps:</h4>
                        <ul className="list-disc pl-5 space-y-1">
                            <li>Export qualified leads for your outreach campaigns</li>
                            <li>Review tagged leads to refine your filtering rules</li>
                            <li>Use AI insights to personalize your messaging</li>
                            <li>Save the processing report for performance tracking</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomEngineResultsPage;