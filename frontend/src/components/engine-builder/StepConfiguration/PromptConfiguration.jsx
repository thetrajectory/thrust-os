// components/engine-builder/StepConfiguration/PromptConfiguration.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { serviceRegistry } from '../../../services/engine-builder/serviceRegistry';
import storageUtils from '../../../utils/storageUtils';
import ToggleOption from '../../common/ToggleOption';

const PromptConfiguration = () => {
    const navigate = useNavigate();
    const { stepIndex } = useParams();
    const stepIdx = parseInt(stepIndex, 10);

    const [engineState, setEngineState] = useState(null);
    const [service, setService] = useState(null);
    const [promptText, setPromptText] = useState('');
    const [useFilter, setUseFilter] = useState(false);
    const [error, setError] = useState('');
    const [availableFields, setAvailableFields] = useState([]);
    const [detectedPlaceholders, setDetectedPlaceholders] = useState([]);
    const [invalidPlaceholders, setInvalidPlaceholders] = useState([]);

    // Apollo enrichment specific options
    const [filterByApollo, setFilterByApollo] = useState(false);
    const [analyzeWebsite, setAnalyzeWebsite] = useState(false);
    const [analyzeExperience, setAnalyzeExperience] = useState(false);
    const [analyzeSitemap, setAnalyzeSitemap] = useState(false);

    useEffect(() => {
        // Load current engine state
        const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
        if (!state || !state.steps || !state.steps[stepIdx]) {
            navigate('/engine-builder/step-declaration');
            return;
        }

        const currentStep = state.steps[stepIdx];
        if (!currentStep.service) {
            navigate(`/engine-builder/configure-step/${stepIdx}`);
            return;
        }

        setEngineState(state);
        setService(serviceRegistry[currentStep.service]);

        // Set available fields based on input schema and previous steps
        const fields = getAvailableFields(state, stepIdx);
        setAvailableFields(fields);

        // Set existing configuration
        if (currentStep.service !== 'apolloEnrichment' && currentStep.service !== 'financialInsight') {
            setPromptText(currentStep.config.prompt || '');
            setUseFilter(!!currentStep.filter);
        } else if (currentStep.service === 'financialInsight') {
            // For financial insight, set existing prompt if available
            setPromptText(currentStep.config.prompt || '');
            setUseFilter(!!currentStep.filter);
        }

        // Set Apollo enrichment specific options if they exist
        if (currentStep.service === 'apolloEnrichment') {
            if (currentStep.config.options) {
                const options = currentStep.config.options;
                setFilterByApollo(options.filterByApollo || false);
                setAnalyzeWebsite(options.analyzeWebsite || false);
                setAnalyzeExperience(options.analyzeExperience || false);
                setAnalyzeSitemap(options.analyzeSitemap || false);
            }
        }
    }, [navigate, stepIdx]);

    // Update detected placeholders when prompt changes (only for non-Apollo services)
    useEffect(() => {
        if (service && service.displayName !== 'Apollo Enrichment' && promptText && availableFields.length > 0) {
            // For Financial Insight service, only check for <extractedText> placeholder
            if (service.displayName === 'Financial Insight Analysis') {
                const hasExtractedTextPlaceholder = promptText.includes('<extractedText>');
                setDetectedPlaceholders(hasExtractedTextPlaceholder ? ['extractedText'] : []);
                setInvalidPlaceholders([]);
            } else {
                // For other services, check all placeholders
                const placeholders = extractPlaceholders(promptText);
                setDetectedPlaceholders(placeholders);

                // Check for invalid placeholders
                const invalid = placeholders.filter(p => !availableFields.includes(p));
                setInvalidPlaceholders(invalid);
            }
        } else {
            setDetectedPlaceholders([]);
            setInvalidPlaceholders([]);
        }
    }, [promptText, availableFields, service]);

    const handleBack = () => {
        // If this is the first step (stepIdx = 0), go back to step declaration page
        if (stepIdx === 0) {
            navigate('/engine-builder/step-declaration');
        } else {
            // For other steps, go to the previous step's filter configuration
            navigate(`/engine-builder/configure-step/${stepIdx - 1}/filter`);
        }
    };

    const handleSubmit = () => {
        if (service && service.displayName === 'Apollo Enrichment') {
            // Apollo Enrichment validation and navigation
            const hasAnalysisOptions = analyzeWebsite || analyzeExperience || analyzeSitemap;

            if (!filterByApollo && !hasAnalysisOptions) {
                setError('Please select at least one option for Apollo enrichment');
                return;
            }

            // Save Apollo configuration
            const config = {
                options: {
                    filterByApollo,
                    analyzeWebsite,
                    analyzeExperience,
                    analyzeSitemap
                },
                prompts: {} // Initialize empty prompts
            };

            // Update step with configuration
            const updatedSteps = [...engineState.steps];
            updatedSteps[stepIdx] = {
                ...updatedSteps[stepIdx],
                config
            };

            const updatedState = {
                ...engineState,
                steps: updatedSteps
            };

            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

            // Navigation logic based on selections
            if (filterByApollo) {
                // Go to Apollo filter page first
                navigate(`/engine-builder/configure-step/${stepIdx}/apollo-filter`);
            } else if (hasAnalysisOptions) {
                // Go to analysis prompts page
                navigate(`/engine-builder/configure-step/${stepIdx}/analysis-prompts`);
            } else {
                // Go to next step or review
                if (stepIdx < engineState.steps.length - 1) {
                    navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
                } else {
                    navigate('/engine-builder/review');
                }
            }
        } else if (service && service.displayName === 'Financial Insight Analysis') {
            // Financial Insight validation and navigation
            if (!promptText.trim()) {
                setError('Please enter a prompt');
                return;
            }

            // For Financial Insight, check for the <extractedText> placeholder
            if (!promptText.includes('<extractedText>')) {
                setError('Your prompt must include the <extractedText> placeholder where the annual report text will be inserted');
                return;
            }

            // Create configuration for Financial Insight service
            const config = {
                prompt: promptText.trim()
            };

            // Update step with configuration
            const updatedSteps = [...engineState.steps];
            updatedSteps[stepIdx] = {
                ...updatedSteps[stepIdx],
                config
            };

            const updatedState = {
                ...engineState,
                steps: updatedSteps
            };

            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

            // Navigate based on filter selection
            if (useFilter) {
                navigate(`/engine-builder/configure-step/${stepIdx}/filter`);
            } else {
                // Remove any existing filter
                updatedSteps[stepIdx].filter = null;
                storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, {
                    ...updatedState,
                    steps: updatedSteps
                });

                // Check if there are more steps to configure
                if (stepIdx < engineState.steps.length - 1) {
                    navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
                } else {
                    navigate('/engine-builder/review');
                }
            }
        } else {
            // Other services validation and navigation
            if (!promptText.trim()) {
                setError('Please enter a prompt');
                return;
            }

            // Validate placeholders for prompt analysis
            if (service && service.displayName === 'Prompt Analysis' && invalidPlaceholders.length > 0) {
                setError(`Invalid placeholders detected: ${invalidPlaceholders.join(', ')}. Available fields: ${availableFields.join(', ')}`);
                return;
            }

            // Create configuration for other services
            const config = {
                prompt: promptText.trim()
            };

            // Update step with configuration
            const updatedSteps = [...engineState.steps];
            updatedSteps[stepIdx] = {
                ...updatedSteps[stepIdx],
                config
            };

            const updatedState = {
                ...engineState,
                steps: updatedSteps
            };

            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

            // Navigate based on filter selection
            if (useFilter) {
                navigate(`/engine-builder/configure-step/${stepIdx}/filter`);
            } else {
                // Remove any existing filter
                updatedSteps[stepIdx].filter = null;
                storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, {
                    ...updatedState,
                    steps: updatedSteps
                });

                // Check if there are more steps to configure
                if (stepIdx < engineState.steps.length - 1) {
                    navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
                } else {
                    navigate('/engine-builder/review');
                }
            }
        }
    };

    // Get available fields based on input schema and previous steps
    const getAvailableFields = (state, currentStepIdx) => {
        let fields = [];

        // Start with input schema fields
        if (state.inputSchema && state.inputSchema.fields) {
            fields = [...state.inputSchema.fields];
        } else {
            // Default fields if no schema
            fields = ['first_name', 'last_name', 'position', 'company', 'email_id', 'linkedin_url'];
        }

        // Add fields from previous steps
        for (let i = 0; i < currentStepIdx; i++) {
            const step = state.steps[i];
            if (step.service && serviceRegistry[step.service] && serviceRegistry[step.service].outputFields) {
                const outputFields = serviceRegistry[step.service].outputFields.map(field =>
                    typeof field === 'string' ? field : field.name
                );
                fields = [...fields, ...outputFields];
            }
        }

        // Remove duplicates and sort
        return [...new Set(fields)].sort();
    };

    // Extract placeholders from prompt text
    const extractPlaceholders = (prompt) => {
        const placeholderRegex = /<(\w+)>/g;
        const placeholders = [];
        let match;

        while ((match = placeholderRegex.exec(prompt)) !== null) {
            if (!placeholders.includes(match[1])) {
                placeholders.push(match[1]);
            }
        }

        return placeholders;
    };

    const renderFinancialInsightHelp = () => {
        return (
            <div className="w-full mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h3 className="font-bold text-lg mb-3 text-yellow-800">Financial Insight Instructions</h3>
                <div className="space-y-3 text-sm text-yellow-700">
                    <p>
                        You must include the <span className="font-mono bg-yellow-100 px-2 py-1 rounded">&lt;extractedText&gt;</span> placeholder
                        in your prompt. This will be replaced with the annual report text for analysis.
                    </p>

                    <div>
                        <p className="font-medium mb-2">Example prompt:</p>
                        <div className="bg-yellow-100 p-3 rounded font-mono text-sm">
                            Analyze the following annual report and provide insights on revenue trends, growth strategy, and risk factors:
                            <br /><br />
                            &lt;extractedText&gt;
                            <br /><br />
                            Provide a structured analysis with bullet points for each category.
                        </div>
                    </div>

                    <div className="p-2 bg-yellow-100 border border-yellow-300 rounded">
                        <p className="font-medium text-yellow-800">⚠️ Important:</p>
                        <p className="text-yellow-700">Annual reports are long documents (often 50+ pages). Structure your prompt to extract specific insights rather than asking for a general summary.</p>
                    </div>

                    {detectedPlaceholders.includes('extractedText') ? (
                        <div className="p-2 bg-green-100 border border-green-300 rounded">
                            <p className="font-medium text-green-800">✓ Placeholder detected</p>
                            <p className="text-green-700">Your prompt includes the required &lt;extractedText&gt; placeholder.</p>
                        </div>
                    ) : (
                        <div className="p-2 bg-red-100 border border-red-300 rounded">
                            <p className="font-medium text-red-800">✗ Missing placeholder</p>
                            <p className="text-red-700">Your prompt must include the &lt;extractedText&gt; placeholder.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderPromptSection = () => {
        if (service && service.displayName === 'Apollo Enrichment') {
            return (
                <div className="w-full mb-8">
                    <div className="p-6 bg-yellow-50 rounded-lg border border-yellow-200 mb-6">
                        <h3 className="font-bold text-lg mb-4 text-yellow-800">Apollo Enrichment Configuration</h3>
                        <p className="text-sm text-yellow-700 mb-6">
                            Apollo enrichment will automatically enrich your leads with comprehensive profile and company data using LinkedIn URLs.
                            Configure your enrichment options below.
                        </p>

                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-6">
                            <h4 className="font-medium text-blue-800 mb-2">🔍 How it works:</h4>
                            <ul className="text-sm text-blue-700 space-y-1">
                                <li>• Uses Supabase caching to save API credits</li>
                                <li>• Only processes untagged rows from previous steps</li>
                                <li>• Requires linkedin_url field from previous step</li>
                                <li>• Automatically handles rate limiting and retries</li>
                            </ul>
                        </div>

                        <div className="space-y-6">
                            <div className="border-b border-yellow-200 pb-4">
                                <h4 className="font-medium text-yellow-800 mb-3">Basic Enrichment Options</h4>
                                <ToggleOption
                                    label="Filter out leads based on Apollo enrichment results before proceeding to next step?"
                                    value={filterByApollo}
                                    onChange={setFilterByApollo}
                                />
                                {filterByApollo && (
                                    <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                                        <p className="text-sm text-green-700">
                                            <strong>Next:</strong> You'll configure filter rules based on Apollo data like company size, industry, job seniority, etc.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h4 className="font-medium text-yellow-800 mb-3">AI Analysis Options</h4>
                                <div className="space-y-4">
                                    <ToggleOption
                                        label="Analyze each company's website content with AI?"
                                        value={analyzeWebsite}
                                        onChange={setAnalyzeWebsite}
                                    />

                                    <ToggleOption
                                        label="Analyze each person's LinkedIn experience history with AI?"
                                        value={analyzeExperience}
                                        onChange={setAnalyzeExperience}
                                    />

                                    <ToggleOption
                                        label="Analyze each company's website sitemap structure with AI?"
                                        value={analyzeSitemap}
                                        onChange={setAnalyzeSitemap}
                                    />
                                </div>

                                {(analyzeWebsite || analyzeExperience || analyzeSitemap) && (
                                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                                        <p className="text-sm text-purple-700">
                                            <strong>Next:</strong> You'll configure prompts for each selected analysis on the next step.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // Check if this is the Financial Insight service
        const isFinancialInsight = service && service.displayName === 'Financial Insight Analysis';

        return (
            <>
                {/* Financial Insight specific help */}
                {isFinancialInsight && renderFinancialInsightHelp()}

                {/* Prompt Analysis specific help */}
                {service && service.displayName === 'Prompt Analysis' && (
                    <div className="w-full mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h3 className="font-bold text-lg mb-3 text-blue-800">Prompt Analysis Instructions</h3>
                        <div className="space-y-3 text-sm text-blue-700">
                            <p>
                                Use <span className="font-mono bg-blue-100 px-2 py-1 rounded">&lt;fieldName&gt;</span> placeholders
                                in your prompt to insert data from each row.
                            </p>

                            <div>
                                <p className="font-medium mb-2">Example:</p>
                                <div className="bg-blue-100 p-3 rounded font-mono text-sm">
                                    "Analyze this person: &lt;first_name&gt; &lt;last_name&gt; works as &lt;position&gt; at &lt;company&gt;.
                                    Are they a decision maker for our product?"
                                </div>
                            </div>

                            <div className="p-2 bg-blue-100 border border-blue-300 rounded">
                                <p className="font-medium text-blue-800">⚡ Performance Optimization:</p>
                                <p className="text-blue-700">Keep responses short (1-3 words) for faster processing of large datasets (10,000+ rows).</p>
                            </div>

                            {detectedPlaceholders.length > 0 && (
                                <div>
                                    <p className="font-medium">Detected placeholders:</p>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {detectedPlaceholders.map(placeholder => (
                                            <span
                                                key={placeholder}
                                                className={`px-2 py-1 rounded text-xs font-mono ${invalidPlaceholders.includes(placeholder)
                                                    ? 'bg-red-100 text-red-700 border border-red-300'
                                                    : 'bg-green-100 text-green-700 border border-green-300'
                                                    }`}
                                            >
                                                &lt;{placeholder}&gt;
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {invalidPlaceholders.length > 0 && (
                                <div className="p-2 bg-red-100 border border-red-300 rounded">
                                    <p className="font-medium text-red-800">Invalid placeholders detected!</p>
                                    <p className="text-red-700">Available fields: {availableFields.join(', ')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Prompt Configuration */}
                <div className="w-full mb-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <label className="block font-medium mb-2">
                            {isFinancialInsight
                                ? 'Enter your financial insight prompt'
                                : service && service.displayName === 'Prompt Analysis'
                                    ? 'Enter your custom prompt'
                                    : 'Add your prompt here'}
                        </label>
                        <textarea
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            className="w-full h-48 p-4 border rounded-lg"
                            placeholder={
                                isFinancialInsight
                                    ? "Enter your financial insight prompt with the <extractedText> placeholder. Example: Analyze the following annual report and provide insights on revenue trends, growth strategies, and risks:\n\n<extractedText>\n\nProvide a structured analysis with bullet points for each category."
                                    : service && service.displayName === 'Prompt Analysis'
                                        ? "Enter your prompt with <fieldName> placeholders. Example: Analyze <first_name> <last_name> who works as <position> at <company>. Keep responses short for faster processing."
                                        : service?.promptTemplate || "Enter your prompt here..."
                            }
                        ></textarea>
                    </div>

                    <div>
                        <p className="font-medium mb-2">
                            {isFinancialInsight ? 'Required Placeholder' : 'Available Fields'}
                        </p>
                        <p className="text-sm text-gray-600 mb-4">
                            {isFinancialInsight
                                ? "You must include the <extractedText> placeholder in your prompt. This will be replaced with the actual annual report text."
                                : service && service.displayName === 'Prompt Analysis'
                                    ? "Use <fieldName> syntax to insert these values into your prompt"
                                    : "Copy and paste these values into your prompt to customize for each row you upload"
                            }
                        </p>
                        <div className="bg-gray-100 p-4 rounded-lg max-h-48 overflow-y-auto">
                            {isFinancialInsight ? (
                                <div className="mb-2">
                                    <code className="text-sm bg-yellow-200 px-2 py-1 rounded">
                                        {'<extractedText>'}
                                    </code>
                                    <span className="ml-2 text-sm text-gray-600">Annual report text content</span>
                                </div>
                            ) : (
                                availableFields.map((field, index) => (
                                    <div key={index} className="mb-2">
                                        <code className="text-sm bg-gray-200 px-2 py-1 rounded">
                                            {service && service.displayName === 'Prompt Analysis' ? `<${field}>` : `{{${field}}}`}
                                        </code>
                                        <span className="ml-2 text-sm text-gray-600">{field}</span>
                                    </div>
                                ))
                            )}
                            {!isFinancialInsight && availableFields.length === 0 && (
                                <div className="text-gray-500 text-sm">
                                    No fields available from input schema
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Filter toggle for non-Apollo services */}
                <div className="w-full mb-8">
                    <ToggleOption
                        label={`Do you want to filter out leads based on this ${service.displayName.toLowerCase()}?`}
                        value={useFilter}
                        onChange={setUseFilter}
                    />

                    {useFilter && (
                        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-700">
                                <strong>Note:</strong> You'll be able to configure filter rules on the next step.
                                Filters will be applied case-insensitively for better matching.
                            </p>
                        </div>
                    )}
                </div>
            </>
        );
    };

    if (!engineState || !service) return null;

    return (
        <div className="flex flex-col items-center justify-center max-w-6xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>

            <h2 className="text-4xl font-bold text-center mb-6">
                Configure Step {stepIdx + 1}
            </h2>

            <div className="text-center mb-8">
                <p className="text-xl font-medium mb-2">Service: {service.displayName}</p>
                <p className="text-gray-600">{service.description}</p>
            </div>

            {/* Render prompt section based on service type */}
            {renderPromptSection()}

            {error && (
                <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            <div className="w-full flex justify-center mt-8">
                <button
                    onClick={handleSubmit}
                    disabled={
                        (service && service.displayName === 'Apollo Enrichment' &&
                            (!filterByApollo && !analyzeWebsite && !analyzeExperience && !analyzeSitemap)) ||
                        (service && service.displayName === 'Financial Insight Analysis' &&
                            (!promptText.trim() || !promptText.includes('<extractedText>'))) ||
                        (service && service.displayName !== 'Apollo Enrichment' &&
                            service.displayName !== 'Financial Insight Analysis' &&
                            (!promptText.trim() || invalidPlaceholders.length > 0))
                    }
                    className={`px-12 py-3 text-lg rounded-full transition-colors ${((service && service.displayName === 'Apollo Enrichment' &&
                            (filterByApollo || analyzeWebsite || analyzeExperience || analyzeSitemap))) ||
                            (service && service.displayName === 'Financial Insight Analysis' &&
                                promptText.trim() && promptText.includes('<extractedText>')) ||
                            (service && service.displayName !== 'Apollo Enrichment' &&
                                service.displayName !== 'Financial Insight Analysis' &&
                                promptText.trim() && invalidPlaceholders.length === 0)
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default PromptConfiguration;