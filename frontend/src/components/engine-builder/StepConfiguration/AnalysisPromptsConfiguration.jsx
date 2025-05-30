// components/engine-builder/StepConfiguration/AnalysisPromptsConfiguration.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import storageUtils from '../../../utils/storageUtils';
import PromptInput from '../../common/PromptInput';
import ToggleOption from '../../common/ToggleOption';

const AnalysisPromptsConfiguration = () => {
    const navigate = useNavigate();
    const { stepIndex } = useParams();
    const stepIdx = parseInt(stepIndex, 10);

    const [engineState, setEngineState] = useState(null);
    const [selectedAnalyses, setSelectedAnalyses] = useState({
        analyzeWebsite: false,
        analyzeExperience: false,
        analyzeSitemap: false
    });

    // Prompts for different analysis types
    const [websitePrompt, setWebsitePrompt] = useState('');
    const [experiencePrompt, setExperiencePrompt] = useState('');
    const [sitemapPrompt, setSitemapPrompt] = useState('');

    // Filter options for each analysis
    const [websiteFilter, setWebsiteFilter] = useState(false);
    const [experienceFilter, setExperienceFilter] = useState(false);
    const [sitemapFilter, setSitemapFilter] = useState(false);

    const [error, setError] = useState('');
    const [sitemapPlaceholderMissing, setSitemapPlaceholderMissing] = useState(false);

    useEffect(() => {
        // Load current engine state
        const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
        if (!state || !state.steps || !state.steps[stepIdx]) {
            navigate('/engine-builder/step-declaration');
            return;
        }

        const currentStep = state.steps[stepIdx];
        if (!currentStep.service || currentStep.service !== 'apolloEnrichment') {
            navigate(`/engine-builder/configure-step/${stepIdx}`);
            return;
        }

        setEngineState(state);

        // Load selected analyses from config
        if (currentStep.config.options) {
            const options = currentStep.config.options;
            setSelectedAnalyses({
                analyzeWebsite: options.analyzeWebsite || false,
                analyzeExperience: options.analyzeExperience || false,
                analyzeSitemap: options.analyzeSitemap || false
            });
        }

        // Load existing prompts if they exist
        if (currentStep.config.prompts) {
            const prompts = currentStep.config.prompts;
            setWebsitePrompt(prompts.websitePrompt || '');
            setExperiencePrompt(prompts.experiencePrompt || '');
            setSitemapPrompt(prompts.sitemapPrompt || '');
        }

        // Load filter options if they exist
        if (currentStep.analysisFilters) {
            setWebsiteFilter(currentStep.analysisFilters.websiteFilter || false);
            setExperienceFilter(currentStep.analysisFilters.experienceFilter || false);
            setSitemapFilter(currentStep.analysisFilters.sitemapFilter || false);
        }
    }, [navigate, stepIdx]);

    // Check for mandatory website_sitemaps placeholder
    useEffect(() => {
        if (selectedAnalyses.analyzeSitemap && sitemapPrompt) {
            setSitemapPlaceholderMissing(!sitemapPrompt.includes('<website_sitemaps>'));
        } else {
            setSitemapPlaceholderMissing(false);
        }
    }, [sitemapPrompt, selectedAnalyses.analyzeSitemap]);

    const handleBack = () => {
        // Check if Apollo filter was configured
        const currentStep = engineState.steps[stepIdx];
        if (currentStep.config.options.filterByApollo) {
            navigate(`/engine-builder/configure-step/${stepIdx}/apollo-filter`);
        } else {
            navigate(`/engine-builder/configure-step/${stepIdx}/prompt`);
        }
    };

    const handleSubmit = () => {
        // Validate that all selected analyses have prompts
        if (selectedAnalyses.analyzeWebsite && !websitePrompt.trim()) {
            setError('Please enter a website analysis prompt');
            return;
        }
        if (selectedAnalyses.analyzeExperience && !experiencePrompt.trim()) {
            setError('Please enter an experience analysis prompt');
            return;
        }
        if (selectedAnalyses.analyzeSitemap && !sitemapPrompt.trim()) {
            setError('Please enter a sitemap analysis prompt');
            return;
        }

        // Validate sitemap placeholder
        if (selectedAnalyses.analyzeSitemap && !sitemapPrompt.includes('<website_sitemaps>')) {
            setError('Your sitemap analysis prompt must include the <website_sitemaps> placeholder');
            return;
        }

        // Update step with analysis prompts and filter options
        const updatedSteps = [...engineState.steps];
        updatedSteps[stepIdx] = {
            ...updatedSteps[stepIdx],
            config: {
                ...updatedSteps[stepIdx].config,
                prompts: {
                    websitePrompt: selectedAnalyses.analyzeWebsite ? websitePrompt.trim() : '',
                    experiencePrompt: selectedAnalyses.analyzeExperience ? experiencePrompt.trim() : '',
                    sitemapPrompt: selectedAnalyses.analyzeSitemap ? sitemapPrompt.trim() : ''
                }
            },
            analysisFilters: {
                websiteFilter: selectedAnalyses.analyzeWebsite ? websiteFilter : false,
                experienceFilter: selectedAnalyses.analyzeExperience ? experienceFilter : false,
                sitemapFilter: selectedAnalyses.analyzeSitemap ? sitemapFilter : false
            }
        };

        const updatedState = {
            ...engineState,
            steps: updatedSteps
        };

        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

        // Check if any analysis filters are enabled
        const hasAnalysisFilters = (selectedAnalyses.analyzeWebsite && websiteFilter) ||
            (selectedAnalyses.analyzeExperience && experienceFilter) ||
            (selectedAnalyses.analyzeSitemap && sitemapFilter);

        if (hasAnalysisFilters) {
            // Go to analysis filters page
            navigate(`/engine-builder/configure-step/${stepIdx}/analysis-filters`);
        } else {
            // Check if there are more steps to configure
            if (stepIdx < engineState.steps.length - 1) {
                navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
            } else {
                navigate('/engine-builder/review');
            }
        }
    };

    if (!engineState) return null;

    return (
        <div className="flex flex-col items-center justify-center max-w-6xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>

            <h2 className="text-4xl font-bold text-center mb-6">
                Configure AI Analysis Prompts
            </h2>

            <div className="text-center mb-8">
                <p className="text-xl font-medium">Set up custom AI prompts for your selected analyses</p>
                <p className="text-gray-600 mt-2">
                    Each analysis will run on the enriched Apollo data to provide additional insights
                </p>
            </div>

            <div className="w-full mb-8 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium mb-2">🤖 AI Analysis Information</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Use specific placeholders in your prompts for dynamic content insertion</li>
                    <li>Each analysis will use Apollo data + your custom prompt to generate insights</li>
                    <li>You can optionally filter leads based on each analysis result</li>
                    <li>Keep prompts focused and specific for better AI responses</li>
                </ul>
            </div>

            <div className="w-full space-y-8">
                {/* Website Analysis */}
                {selectedAnalyses.analyzeWebsite && (
                    <div className="p-6 border rounded-lg bg-green-50">
                        <h3 className="text-xl font-bold mb-4 text-green-800">Website Content Analysis</h3>
                        <PromptInput
                            title="Website Analysis Prompt"
                            prompt={websitePrompt}
                            onChange={setWebsitePrompt}
                            placeholder="Example: Analyze the company website for <company> and identify their main products, target customers, and competitive advantages. Focus on how our services might benefit them."
                        />

                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-2">Available Placeholders:</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-2">
                                    <code className="text-xs bg-blue-100 px-2 py-1 rounded">&lt;company&gt;</code>
                                    <span className="text-xs text-blue-700">Company name</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="text-xs bg-blue-100 px-2 py-1 rounded">&lt;website_content&gt;</code>
                                    <span className="text-xs text-blue-700">Scraped content</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4">
                            <ToggleOption
                                label="Filter leads based on website analysis results?"
                                value={websiteFilter}
                                onChange={setWebsiteFilter}
                            />
                            {websiteFilter && (
                                <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-700">
                                        <strong>Next:</strong> You'll configure website analysis filter rules on the next step.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Experience Analysis */}
                {selectedAnalyses.analyzeExperience && (
                    <div className="p-6 border rounded-lg bg-purple-50">
                        <h3 className="text-xl font-bold mb-4 text-purple-800">LinkedIn Experience Analysis</h3>
                        <PromptInput
                            title="Experience Analysis Prompt"
                            prompt={experiencePrompt}
                            onChange={setExperiencePrompt}
                            placeholder="Example: Analyze the career progression of this person: <employmentHistory>. Identify their decision-making authority, industry expertise, and potential pain points our solution could address."
                        />

                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-2">Available Placeholder:</h4>
                            <div className="flex items-center gap-2">
                                <code className="text-sm bg-blue-100 px-2 py-1 rounded">&lt;employmentHistory&gt;</code>
                                <span className="text-sm text-blue-700">- Will be replaced with the person's employment history from Apollo</span>
                            </div>
                        </div>

                        <div className="mt-4">
                            <ToggleOption
                                label="Filter leads based on experience analysis results?"
                                value={experienceFilter}
                                onChange={setExperienceFilter}
                            />
                            {experienceFilter && (
                                <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-700">
                                        <strong>Next:</strong> You'll configure experience analysis filter rules on the next step.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Sitemap Analysis */}
                {selectedAnalyses.analyzeSitemap && (
                    <div className="p-6 border rounded-lg bg-orange-50">
                        <h3 className="text-xl font-bold mb-4 text-orange-800">Website Sitemap Analysis</h3>
                        <PromptInput
                            title="Sitemap Analysis Prompt"
                            prompt={sitemapPrompt}
                            onChange={setSitemapPrompt}
                            placeholder="Example: Analyze the sitemap structure of <company>'s website using these URLs: <website_sitemaps>. Identify their product offerings, service categories, and potential areas where our solution could integrate."
                        />

                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <h4 className="font-medium text-blue-800 mb-2">Required Placeholder:</h4>
                            <div className="flex items-center gap-2 mb-2">
                                <code className="text-sm bg-blue-100 px-2 py-1 rounded">&lt;website_sitemaps&gt;</code>
                                <span className="text-sm text-blue-700">Will be replaced with extracted sitemap URLs</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <code className="text-sm bg-blue-100 px-2 py-1 rounded">&lt;company&gt;</code>
                                <span className="text-sm text-blue-700">Company name</span>
                            </div>

                            {sitemapPlaceholderMissing && (
                                <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded">
                                    <p className="text-sm text-red-700">Your prompt must include the <code>&lt;website_sitemaps&gt;</code> placeholder.</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-4">
                            <ToggleOption
                                label="Filter leads based on sitemap analysis results?"
                                value={sitemapFilter}
                                onChange={setSitemapFilter}
                            />
                            {sitemapFilter && (
                                <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-700">
                                        <strong>Next:</strong> You'll configure sitemap analysis filter rules on the next step.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <div className="w-full mt-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            <div className="w-full flex justify-center mt-8">
                <button
                    onClick={handleSubmit}
                    disabled={
                        (selectedAnalyses.analyzeWebsite && !websitePrompt.trim()) ||
                        (selectedAnalyses.analyzeExperience && !experiencePrompt.trim()) ||
                        (selectedAnalyses.analyzeSitemap && (!sitemapPrompt.trim() || !sitemapPrompt.includes('<website_sitemaps>')))
                    }
                    className={`px-12 py-3 text-lg rounded-full transition-colors ${((selectedAnalyses.analyzeWebsite && websitePrompt.trim()) || !selectedAnalyses.analyzeWebsite) &&
                            ((selectedAnalyses.analyzeExperience && experiencePrompt.trim()) || !selectedAnalyses.analyzeExperience) &&
                            ((selectedAnalyses.analyzeSitemap && sitemapPrompt.trim() && sitemapPrompt.includes('<website_sitemaps>')) || !selectedAnalyses.analyzeSitemap)
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

export default AnalysisPromptsConfiguration;