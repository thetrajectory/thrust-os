// components/engine-builder/PipelineReview.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serviceRegistry } from '../../services/engine-builder/serviceRegistry';
import supabase from '../../services/supabaseClient';
import storageUtils from '../../utils/storageUtils';

const PipelineReview = () => {
    const navigate = useNavigate();
    const [engineState, setEngineState] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Load current engine state
        const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
        if (!state || !state.steps || state.steps.length === 0) {
            // If invalid state, redirect
            navigate('/engine-builder/step-declaration');
            return;
        }

        setEngineState(state);
    }, [navigate]);

    const handleBack = () => {
        const lastStepIndex = engineState.steps.length - 1;
        navigate(`/engine-builder/configure-step/${lastStepIndex}/filter`);
    };

    const saveEngine = async () => {
        setSaving(true);
        setError('');

        try {
            // Save to Supabase with proper engine type categorization
            const { data, error } = await supabase
                .from('engine_db')
                .upsert({
                    engine_name: engineState.engineName,
                    engine_type: engineState.engineType,
                    is_custom_engine: true,
                    client_type: engineState.engineName,
                    pipeline: {
                        inputSchema: engineState.inputSchema,
                        steps: engineState.steps
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'engine_name'
                });

            if (error) throw error;

            // Navigate to file upload
            navigate('/engine-builder/upload');
        } catch (err) {
            console.error('Error saving engine:', err);
            setError(`Failed to save engine: ${err.message || 'Unknown error'}`);
        } finally {
            setSaving(false);
        }
    };

    // Helper function to render Apollo enrichment options
    const renderEnrichmentOptions = (step) => {
        if (step.service !== 'apolloEnrichment' || !step.config.options) return null;
        
        const options = step.config.options;
        const prompts = step.config.prompts || {};
        
        return (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="font-medium text-sm mb-2">Additional Analysis Options:</p>
                <div className="space-y-2">
                    {options.filterByApollo && (
                        <div className="flex items-center text-sm">
                            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                            Apply filters to Apollo enrichment results
                        </div>
                    )}
                    {options.analyzeWebsite && (
                        <div className="text-sm">
                            <div className="flex items-center">
                                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                Website analysis enabled
                            </div>
                            {prompts.websitePrompt && (
                                <div className="mt-1 ml-4 text-xs italic text-gray-600">
                                    "{prompts.websitePrompt.substring(0, 80)}..."
                                </div>
                            )}
                        </div>
                    )}
                    {options.analyzeExperience && (
                        <div className="text-sm">
                            <div className="flex items-center">
                                <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                                Experience history analysis enabled
                            </div>
                            {prompts.experiencePrompt && (
                                <div className="mt-1 ml-4 text-xs italic text-gray-600">
                                    "{prompts.experiencePrompt.substring(0, 80)}..."
                                </div>
                            )}
                        </div>
                    )}
                    {options.analyzeSitemap && (
                        <div className="text-sm">
                            <div className="flex items-center">
                                <span className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></span>
                                Sitemap analysis enabled
                            </div>
                            {prompts.sitemapPrompt && (
                                <div className="mt-1 ml-4 text-xs italic text-gray-600">
                                    "{prompts.sitemapPrompt.substring(0, 80)}..."
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const calculateEstimatedTime = () => {
        // Rough time estimates per step (in seconds per 100 rows)
        const timeEstimates = {
            promptAnalysis: 30,
            apolloEnrichment: 45,
            serperEnrichment: 60,
            financialData: 40,
            jobOpenings: 35
        };

        let totalTime = 0;
        engineState.steps.forEach(step => {
            totalTime += timeEstimates[step.service] || 30;
        });

        return Math.ceil(totalTime / 60); // Convert to minutes
    };

    if (!engineState) return null;

    return (
        <div className="flex flex-col items-center justify-center max-w-5xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous step
            </button>

            <h2 className="text-4xl font-bold text-center mb-8">
                Review Your Custom Engine
            </h2>

            {/* Engine Overview */}
            <div className="w-full mb-8 p-6 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <h3 className="text-lg font-bold mb-2">Engine Details</h3>
                        <p><span className="font-medium">Name:</span> {engineState.engineName}</p>
                        <p><span className="font-medium">Type:</span> {engineState.engineType}</p>
                        <p><span className="font-medium">Input Schema:</span> {engineState.inputSchema?.type}</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold mb-2">Pipeline Stats</h3>
                        <p><span className="font-medium">Processing Steps:</span> {engineState.steps.length}</p>
                        <p><span className="font-medium">Filtering Steps:</span> {engineState.steps.filter(s => s.filter?.rules?.length > 0).length}</p>
                        <p><span className="font-medium">Est. Time per 100 rows:</span> ~{calculateEstimatedTime()} min</p>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold mb-2">Expected Fields</h3>
                        <p><span className="font-medium">Input Fields:</span> {engineState.inputSchema?.fields?.length || 0}</p>
                        <p><span className="font-medium">Output Fields:</span> 50+ enriched fields</p>
                        <p><span className="font-medium">Custom Analysis:</span> {engineState.steps.filter(s => s.service === 'apolloEnrichment' && s.config.options).length > 0 ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            </div>

            {/* Processing Pipeline */}
            <div className="w-full mb-8">
                <h3 className="text-2xl font-bold mb-6">Processing Pipeline</h3>

                {engineState.steps.map((step, index) => (
                    <div key={index} className="mb-6 p-6 border rounded-lg bg-white shadow-sm">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h4 className="text-xl font-bold mb-2">
                                    Step {index + 1}: {serviceRegistry[step.service]?.displayName || step.service}
                                </h4>
                                <p className="text-gray-600 text-sm">
                                    {serviceRegistry[step.service]?.description || 'Custom processing step'}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate(`/engine-builder/configure-step/${index}`)}
                                className="text-blue-600 hover:text-blue-800 text-sm px-3 py-1 border border-blue-300 rounded"
                            >
                                Edit Step
                            </button>
                        </div>

                        {/* Prompt Display */}
                        <div className="mb-4">
                            <p className="font-medium mb-2">Configuration:</p>
                            <div className="p-3 bg-gray-100 rounded-lg">
                                <p className="text-sm font-mono whitespace-pre-wrap">
                                    {step.config.prompt || 'Using default configuration'}
                                </p>
                            </div>
                        </div>

                        {/* Show Apollo enrichment options if present */}
                        {renderEnrichmentOptions(step)}

                        {/* Filtering Rules */}
                        {step.filter?.rules?.length > 0 ? (
                            <div className="mt-4">
                                <p className="font-medium mb-2">Filtering Rules:</p>
                                <div className="bg-yellow-50 p-3 rounded-lg">
                                    {step.filter.rules.map((rule, ruleIdx) => (
                                        <div key={ruleIdx} className="mb-2 last:mb-0 text-sm">
                                            <span className="font-mono bg-white px-2 py-1 rounded">
                                                If {rule.field} {rule.operator} "{rule.value}" → {rule.action}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                                <p className="text-gray-500 text-sm">No filtering rules configured</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Processing Flow Visualization */}
            <div className="w-full mb-8 p-4 bg-gray-50 rounded-lg overflow-x-auto">
                <h3 className="font-medium mb-3">Data Flow</h3>
                <div className="flex items-center space-x-3 min-w-max">
                    <div className="px-3 py-2 bg-blue-500 text-white rounded-md text-sm">
                        CSV Upload
                    </div>
                    {engineState.steps.map((step, index) => (
                        <React.Fragment key={index}>
                            <div className="text-gray-400">→</div>
                            <div className="px-3 py-2 bg-green-500 text-white rounded-md text-sm">
                                {serviceRegistry[step.service]?.displayName || step.service}
                            </div>
                        </React.Fragment>
                    ))}
                    <div className="text-gray-400">→</div>
                    <div className="px-3 py-2 bg-purple-500 text-white rounded-md text-sm">
                        Enriched Results
                    </div>
                </div>
            </div>

            {error && (
                <div className="w-full mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
                    <h3 className="font-bold mb-2">Error</h3>
                    <p>{error}</p>
                </div>
            )}

            <div className="w-full flex justify-center space-x-6 mt-8">
                <button
                    onClick={() => navigate('/engine-builder/step-declaration')}
                    className="px-8 py-3 text-lg border-2 border-blue-400 rounded-lg hover:bg-blue-50 transition-colors"
                >
                    Edit Pipeline
                </button>

                <button
                    onClick={saveEngine}
                    disabled={saving}
                    className={`px-12 py-3 text-lg rounded-lg transition-colors ${
                        saving 
                            ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                            : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                >
                    {saving ? 'Saving Engine...' : 'Save & Continue to Upload'}
                </button>
            </div>

            {/* Additional Information */}
            <div className="w-full mt-8 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium mb-2">What happens next?</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Your custom engine will be saved and ready for use</li>
                    <li>You'll be able to upload CSV files and process them through your pipeline</li>
                    <li>Results will include all enriched data and can be exported as CSV</li>
                    <li>You can reuse this engine for future data processing</li>
                </ul>
            </div>
        </div>
    );
};

export default PipelineReview;