// components/engine-builder/StepConfiguration/AnalysisFiltersConfiguration.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import storageUtils from '../../../utils/storageUtils';

const AnalysisFiltersConfiguration = () => {
    const navigate = useNavigate();
    const { stepIndex } = useParams();
    const stepIdx = parseInt(stepIndex, 10);
    
    const [engineState, setEngineState] = useState(null);
    const [analysisFilters, setAnalysisFilters] = useState({
        websiteFilter: false,
        experienceFilter: false,
        sitemapFilter: false
    });
    
    // Filter rules for each analysis type
    const [websiteRules, setWebsiteRules] = useState([]);
    const [experienceRules, setExperienceRules] = useState([]);
    const [sitemapRules, setSitemapRules] = useState([]);
    
    const [error, setError] = useState('');

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
        
        // Load analysis filter settings
        if (currentStep.analysisFilters) {
            setAnalysisFilters(currentStep.analysisFilters);
        }
        
        // Initialize default rules for enabled filters
        if (currentStep.analysisFilters.websiteFilter) {
            setWebsiteRules(currentStep.websiteFilterRules || [{
                field: 'website_analysis',
                operator: 'contains',
                value: '',
                action: 'eliminate'
            }]);
        }
        
        if (currentStep.analysisFilters.experienceFilter) {
            setExperienceRules(currentStep.experienceFilterRules || [{
                field: 'experience_analysis',
                operator: 'contains',
                value: '',
                action: 'eliminate'
            }]);
        }
        
        if (currentStep.analysisFilters.sitemapFilter) {
            setSitemapRules(currentStep.sitemapFilterRules || [{
                field: 'sitemap_analysis',
                operator: 'contains',
                value: '',
                action: 'eliminate'
            }]);
        }
    }, [navigate, stepIdx]);

    const handleBack = () => {
        navigate(`/engine-builder/configure-step/${stepIdx}/analysis-prompts`);
    };

    const updateRule = (ruleType, index, field, value) => {
        if (ruleType === 'website') {
            const updatedRules = [...websiteRules];
            updatedRules[index] = { ...updatedRules[index], [field]: value };
            setWebsiteRules(updatedRules);
        } else if (ruleType === 'experience') {
            const updatedRules = [...experienceRules];
            updatedRules[index] = { ...updatedRules[index], [field]: value };
            setExperienceRules(updatedRules);
        } else if (ruleType === 'sitemap') {
            const updatedRules = [...sitemapRules];
            updatedRules[index] = { ...updatedRules[index], [field]: value };
            setSitemapRules(updatedRules);
        }
    };

    const addRule = (ruleType) => {
        const newRule = {
            field: ruleType === 'website' ? 'website_analysis' : 
                   ruleType === 'experience' ? 'experience_analysis' : 'sitemap_analysis',
            operator: 'contains',
            value: '',
            action: 'eliminate'
        };
        
        if (ruleType === 'website') {
            setWebsiteRules([...websiteRules, newRule]);
        } else if (ruleType === 'experience') {
            setExperienceRules([...experienceRules, newRule]);
        } else if (ruleType === 'sitemap') {
            setSitemapRules([...sitemapRules, newRule]);
        }
    };

    const removeRule = (ruleType, index) => {
        if (ruleType === 'website' && websiteRules.length > 1) {
            setWebsiteRules(websiteRules.filter((_, i) => i !== index));
        } else if (ruleType === 'experience' && experienceRules.length > 1) {
            setExperienceRules(experienceRules.filter((_, i) => i !== index));
        } else if (ruleType === 'sitemap' && sitemapRules.length > 1) {
            setSitemapRules(sitemapRules.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = () => {
        // Validate all rules have values
        const allRules = [
            ...(analysisFilters.websiteFilter ? websiteRules : []),
            ...(analysisFilters.experienceFilter ? experienceRules : []),
            ...(analysisFilters.sitemapFilter ? sitemapRules : [])
        ];
        
        const invalidRules = allRules.some(rule => !rule.value.trim());
        if (invalidRules) {
            setError('All filter rules must have a value');
            return;
        }

        // Update step with analysis filter rules
        const updatedSteps = [...engineState.steps];
        updatedSteps[stepIdx] = {
            ...updatedSteps[stepIdx],
            websiteFilterRules: analysisFilters.websiteFilter ? websiteRules : [],
            experienceFilterRules: analysisFilters.experienceFilter ? experienceRules : [],
            sitemapFilterRules: analysisFilters.sitemapFilter ? sitemapRules : []
        };

        const updatedState = {
            ...engineState,
            steps: updatedSteps
        };

        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

        // Check if there are more steps to configure
        if (stepIdx < engineState.steps.length - 1) {
            navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
        } else {
            navigate('/engine-builder/review');
        }
    };

    const renderFilterRules = (ruleType, rules, title, fieldName) => {
        if (!analysisFilters[`${ruleType}Filter`]) return null;
        
        return (
            <div className="mb-8 p-6 border rounded-lg bg-gray-50">
                <h3 className="text-lg font-bold mb-4">{title} Filter Rules</h3>
                
                {rules.map((rule, index) => (
                    <div key={index} className="mb-4 p-4 border rounded-lg bg-white">
                        <div className="flex items-center mb-4">
                            <span className="font-medium mr-4">Rule {index + 1}</span>
                            
                            {rules.length > 1 && (
                                <button 
                                    onClick={() => removeRule(ruleType, index)}
                                    className="ml-auto text-red-500 hover:text-red-700"
                                    title="Remove rule"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Condition</label>
                                <select
                                    value={rule.operator}
                                    onChange={(e) => updateRule(ruleType, index, 'operator', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="contains">contains</option>
                                    <option value="equals">equals</option>
                                    <option value="startsWith">starts with</option>
                                    <option value="endsWith">ends with</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Value</label>
                                <input
                                    type="text"
                                    value={rule.value}
                                    onChange={(e) => updateRule(ruleType, index, 'value', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                    placeholder="Enter filter value"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">Action</label>
                                <select
                                    value={rule.action}
                                    onChange={(e) => updateRule(ruleType, index, 'action', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="eliminate">Eliminate (filter out)</option>
                                    <option value="pass">Keep (pass through)</option>
                                </select>
                            </div>
                        </div>

                        {rule.value && (
                            <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                <span className="font-medium">Rule Preview:</span> 
                                {' '}If {title.toLowerCase()} {rule.operator} "{rule.value}", then {rule.action === 'eliminate' ? 'filter out the lead' : 'keep the lead'}
                            </div>
                        )}
                    </div>
                ))}
                
                <button
                    onClick={() => addRule(ruleType)}
                    className="text-blue-600 hover:text-blue-800 flex items-center"
                >
                    <span className="mr-1">+</span> Add another {title.toLowerCase()} rule
                </button>
            </div>
        );
    };

    if (!engineState) return null;

    return (
        <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>
            
            <h2 className="text-4xl font-bold text-center mb-6">
                Configure Analysis Filter Rules
            </h2>
            
            <div className="text-center mb-8">
                <p className="text-xl font-medium">Filter leads based on AI analysis results</p>
                <p className="text-gray-600 mt-2">
                    Define rules to filter leads based on the AI analysis outputs for each selected analysis
                </p>
            </div>

            <div className="w-full mb-8 p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-medium mb-2">How Analysis Filtering Works</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Each analysis (website, experience, sitemap) generates AI insights</li>
                    <li>Filter rules check these insights for specific keywords or phrases</li>
                    <li>Leads matching elimination rules are tagged and excluded from further processing</li>
                    <li>All comparisons are case-insensitive for better matching</li>
                </ul>
            </div>

            <div className="w-full">
                {/* Website Analysis Rules */}
                {renderFilterRules('website', websiteRules, 'Website Analysis', 'website_analysis')}
                
                {/* Experience Analysis Rules */}
                {renderFilterRules('experience', experienceRules, 'Experience Analysis', 'experience_analysis')}
                
                {/* Sitemap Analysis Rules */}
                {renderFilterRules('sitemap', sitemapRules, 'Sitemap Analysis', 'sitemap_analysis')}
            </div>

            {error && (
                <div className="w-full mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700">{error}</p>
                </div>
            )}

            <div className="w-full flex justify-center mt-8">
                <button
                    onClick={handleSubmit}
                    className="px-12 py-3 text-lg bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                >
                    Complete Apollo Configuration
                </button>
            </div>
        </div>
    );
};

export default AnalysisFiltersConfiguration;