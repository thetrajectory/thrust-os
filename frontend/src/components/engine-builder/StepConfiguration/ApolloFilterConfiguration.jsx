// components/engine-builder/StepConfiguration/ApolloFilterConfiguration.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import storageUtils from '../../../utils/storageUtils';

const ApolloFilterConfiguration = () => {
    const navigate = useNavigate();
    const { stepIndex } = useParams();
    const stepIdx = parseInt(stepIndex, 10);

    const [engineState, setEngineState] = useState(null);
    const [filterRules, setFilterRules] = useState([]);
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

        // Initialize filter rules from existing config or create default
        if (currentStep.apolloFilter && currentStep.apolloFilter.rules) {
            setFilterRules(currentStep.apolloFilter.rules);
        } else {
            // Create a default empty rule
            setFilterRules([{
                field: '',
                operator: 'contains',
                value: '',
                action: 'eliminate'
            }]);
        }
    }, [navigate, stepIdx]);

    const handleBack = () => {
        navigate(`/engine-builder/configure-step/${stepIdx}/prompt`);
    };

    const updateRule = (index, field, value) => {
        const updatedRules = [...filterRules];
        updatedRules[index] = { ...updatedRules[index], [field]: value };
        setFilterRules(updatedRules);
    };

    const addRule = () => {
        setFilterRules([...filterRules, {
            field: '',
            operator: 'contains',
            value: '',
            action: 'eliminate'
        }]);
    };

    const removeRule = (index) => {
        if (filterRules.length <= 1) {
            return; // Keep at least one rule
        }
        setFilterRules(filterRules.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        // Validate rules
        const invalidRules = filterRules.some(rule => !rule.field || !rule.value);
        if (invalidRules) {
            setError('All filter rules must have field and value');
            return;
        }

        // Update step with Apollo filter configuration
        const updatedSteps = [...engineState.steps];
        updatedSteps[stepIdx] = {
            ...updatedSteps[stepIdx],
            apolloFilter: {
                rules: filterRules,
                tagPrefix: 'apollo_filtered'
            }
        };

        const updatedState = {
            ...engineState,
            steps: updatedSteps
        };

        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

        // Check if there are analysis options selected
        const currentStep = updatedSteps[stepIdx];
        const hasAnalysisOptions = currentStep.config.options &&
            (currentStep.config.options.analyzeWebsite ||
                currentStep.config.options.analyzeExperience ||
                currentStep.config.options.analyzeSitemap);

        if (hasAnalysisOptions) {
            // Go to analysis prompts page
            navigate(`/engine-builder/configure-step/${stepIdx}/analysis-prompts`);
        } else {
            // Check if there are more steps to configure
            if (stepIdx < engineState.steps.length - 1) {
                navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
            } else {
                navigate('/engine-builder/review');
            }
        }
    };

    // Get Apollo-specific filter fields
    const getApolloFilterFields = () => {
        return [
            { value: 'organization.estimated_num_employees', label: 'Company Size (Employee Count)' },
            { value: 'organization.industry', label: 'Industry' },
            { value: 'organization.country', label: 'Company Country' },
            { value: 'organization.city', label: 'Company City' },
            { value: 'organization.founded_year', label: 'Founded Year' },
            { value: 'person.seniority', label: 'Job Seniority' },
            { value: 'person.departments', label: 'Department' },
            { value: 'person.functions', label: 'Job Function' },
            { value: 'person.city', label: 'Person City' },
            { value: 'person.state', label: 'Person State' },
            { value: 'person.country', label: 'Person Country' },
            { value: 'person.title', label: 'Job Title' },
            { value: 'organization.name', label: 'Company Name' }
        ];
    };

    // Get operator options based on field type
    const getOperatorOptions = (fieldName) => {
        // Numeric fields
        if (['organization.estimated_num_employees', 'organization.founded_year'].includes(fieldName)) {
            return [
                { value: 'greaterThan', label: 'greater than' },
                { value: 'lessThan', label: 'less than' },
                { value: 'equals', label: 'equals' },
                { value: 'between', label: 'between' }
            ];
        }

        // Text fields
        return [
            { value: 'contains', label: 'contains' },
            { value: 'equals', label: 'equals' },
            { value: 'startsWith', label: 'starts with' },
            { value: 'endsWith', label: 'ends with' }
        ];
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
                Configure Apollo Filtering Rules
            </h2>

            <div className="text-center mb-8">
                <p className="text-xl font-medium">Filter leads based on Apollo enrichment data</p>
                <p className="text-gray-600 mt-2">
                    Define rules to automatically filter out leads that don't meet your criteria from Apollo data
                </p>
            </div>

            <div className="w-full mb-8 p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-medium mb-2">How Apollo Filtering Works</h3>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Qualified leads that pass all rules remain untagged and continue to next step</li>
                    <li>Disqualified leads that match elimination rules are tagged and excluded from further processing</li>
                    <li>Multiple rules work with OR logic - matching any rule will filter the lead</li>
                    <li>All comparisons are case-insensitive for better matching</li>
                </ul>
            </div>

            <div className="w-full mb-8">
                {filterRules.map((rule, index) => (
                    <div key={index} className="mb-6 p-4 border rounded-lg bg-gray-50">
                        <div className="flex items-center mb-4">
                            <span className="font-medium mr-4">Apollo Filter Rule {index + 1}</span>

                            {filterRules.length > 1 && (
                                <button
                                    onClick={() => removeRule(index)}
                                    className="ml-auto text-red-500 hover:text-red-700"
                                    title="Remove rule"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            {/* Field Selection */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Apollo Field</label>
                                <select
                                    value={rule.field}
                                    onChange={(e) => updateRule(index, 'field', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="">Select Apollo field</option>
                                    {getApolloFilterFields().map(field => (
                                        <option key={field.value} value={field.value}>
                                            {field.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Operator Selection */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Condition</label>
                                <select
                                    value={rule.operator}
                                    onChange={(e) => updateRule(index, 'operator', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    {getOperatorOptions(rule.field).map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Value Input */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Value</label>
                                {rule.operator === 'between' ? (
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="text"
                                            value={rule.value.split(',')[0] || ''}
                                            onChange={(e) => {
                                                const secondValue = rule.value.split(',')[1] || '';
                                                updateRule(index, 'value', `${e.target.value},${secondValue}`);
                                            }}
                                            className="w-full p-2 border rounded-lg"
                                            placeholder="Min"
                                        />
                                        <span>-</span>
                                        <input
                                            type="text"
                                            value={rule.value.split(',')[1] || ''}
                                            onChange={(e) => {
                                                const firstValue = rule.value.split(',')[0] || '';
                                                updateRule(index, 'value', `${firstValue},${e.target.value}`);
                                            }}
                                            className="w-full p-2 border rounded-lg"
                                            placeholder="Max"
                                        />
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={rule.value}
                                        onChange={(e) => updateRule(index, 'value', e.target.value)}
                                        className="w-full p-2 border rounded-lg"
                                        placeholder="Enter value"
                                    />
                                )}
                            </div>

                            {/* Action Selection */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Action</label>
                                <select
                                    value={rule.action}
                                    onChange={(e) => updateRule(index, 'action', e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="eliminate">Eliminate (filter out)</option>
                                    <option value="pass">Keep (pass through)</option>
                                </select>
                            </div>
                        </div>

                        {rule.field && rule.value && (
                            <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                                <span className="font-medium">Rule Preview:</span>
                                {' '}If {getApolloFilterFields().find(f => f.value === rule.field)?.label || rule.field} {rule.operator} "{rule.value}", then {rule.action === 'eliminate' ? 'filter out the lead' : 'keep the lead'}
                            </div>
                        )}
                    </div>
                ))}

                <button
                    onClick={addRule}
                    className="text-blue-600 hover:text-blue-800 flex items-center"
                >
                    <span className="mr-1">+</span> Add another Apollo filter rule
                </button>
            </div>

            {/* Example Section */}
            <div className="w-full mb-8 p-4 bg-gray-100 rounded-lg">
                <h3 className="font-medium mb-2">Example Apollo Filter Rules</h3>
                <div className="text-sm space-y-1">
                    <p>• <span className="font-mono">Company Size less than 50</span> → Eliminate (filter out small companies)</p>
                    <p>• <span className="font-mono">Industry contains "retail"</span> → Eliminate (exclude retail companies)</p>
                    <p>• <span className="font-mono">Job Seniority equals "Entry"</span> → Eliminate (focus on senior roles)</p>
                    <p>• <span className="font-mono">Company Country equals "India"</span> → Keep (only Indian companies)</p>
                </div>
            </div>

            {error && (
                <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-lg">
                    {error}
                </div>
            )}

            <div className="w-full flex justify-center space-x-4 mt-8">
                <button
                    onClick={handleSubmit}
                    className="px-12 py-3 text-lg bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                >
                    Continue
                </button>
            </div>
        </div>
    );
};

export default ApolloFilterConfiguration;