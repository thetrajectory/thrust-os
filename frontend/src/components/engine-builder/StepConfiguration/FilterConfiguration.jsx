// components/engine-builder/StepConfiguration/FilterConfiguration.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import storageUtils from '../../../utils/storageUtils';
import { serviceRegistry } from '../../../services/engine-builder/serviceRegistry';

const FilterConfiguration = () => {
  const navigate = useNavigate();
  const { stepIndex } = useParams();
  const stepIdx = parseInt(stepIndex, 10);
  
  const [engineState, setEngineState] = useState(null);
  const [service, setService] = useState(null);
  const [filterRules, setFilterRules] = useState([]);
  const [error, setError] = useState('');

  // Added state for financial insights specific filtering
  const [isFinancialInsightService, setIsFinancialInsightService] = useState(false);
  const [financialFilterType, setFinancialFilterType] = useState('basic');

  useEffect(() => {
    // Load current engine state
    const state = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
    if (!state || !state.steps || !state.steps[stepIdx]) {
      // If invalid state, redirect
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
    
    // Check if this is the financial insight service
    setIsFinancialInsightService(currentStep.service === 'financialInsight');
    
    // Initialize filter rules from existing config or create default
    if (currentStep.filter && currentStep.filter.rules) {
      setFilterRules(currentStep.filter.rules);
    } else {
      // Create appropriate default rule based on service
      if (currentStep.service === 'financialInsight') {
        // Default rule for financial insight - filter out private companies
        setFilterRules([{
          field: 'companyType',
          operator: 'equals',
          value: 'Private',
          action: 'eliminate'
        }]);
      } else {
        // Default empty rule for other services
        setFilterRules([{
          field: '',
          operator: 'contains',
          value: '',
          action: 'eliminate'
        }]);
      }
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

  const handleFinancialFilterTypeChange = (type) => {
    setFinancialFilterType(type);
    
    // Set default rules based on the selected filter type
    if (type === 'companyType') {
      setFilterRules([{
        field: 'companyType',
        operator: 'equals',
        value: 'Private',
        action: 'eliminate'
      }]);
    } else if (type === 'reportAvailability') {
      setFilterRules([{
        field: 'annualReportStatus',
        operator: 'equals',
        value: 'not_found',
        action: 'eliminate'
      }]);
    } else if (type === 'textQuality') {
      setFilterRules([{
        field: 'annualReportTextStatus',
        operator: 'contains',
        value: 'Failed',
        action: 'eliminate'
      }]);
    } else if (type === 'insightContent') {
      setFilterRules([{
        field: 'financialInsights',
        operator: 'contains',
        value: '',
        action: 'eliminate'
      }]);
    } else {
      // Basic filter
      setFilterRules([{
        field: '',
        operator: 'contains',
        value: '',
        action: 'eliminate'
      }]);
    }
  };

  const handleSubmit = () => {
    // Validate rules
    const invalidRules = filterRules.some(rule => !rule.field || !rule.value);
    if (invalidRules) {
      setError('All filter rules must have field and value');
      return;
    }

    // Update step with filter configuration
    const updatedSteps = [...engineState.steps];
    updatedSteps[stepIdx] = {
      ...updatedSteps[stepIdx],
      filter: {
        rules: filterRules,
        tagPrefix: `${service.displayName.toLowerCase().replace(/\s+/g, '_')}_filtered`
      }
    };

    // Update engine state
    const updatedState = {
      ...engineState,
      steps: updatedSteps
    };

    // Save to storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);

    // Check if there are more steps to configure
    if (stepIdx < engineState.steps.length - 1) {
      navigate(`/engine-builder/configure-step/${stepIdx + 1}`);
    } else {
      navigate('/engine-builder/review');
    }
  };

  const handleSave = () => {
    // Save current progress without validation
    const updatedSteps = [...engineState.steps];
    updatedSteps[stepIdx] = {
      ...updatedSteps[stepIdx],
      filter: {
        rules: filterRules,
        tagPrefix: `${service.displayName.toLowerCase().replace(/\s+/g, '_')}_filtered`
      }
    };

    // Update engine state
    const updatedState = {
      ...engineState,
      steps: updatedSteps
    };

    // Save to storage
    storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, updatedState);
    
    // Show feedback
    setError('');
    alert('Filter configuration saved!');
  };

  // Get available fields for filtering based on the service
  const getFilterFields = () => {
    if (!service) return [];
    
    // Special case for Financial Insight service
    if (isFinancialInsightService) {
      if (financialFilterType === 'companyType') {
        return [
          { value: 'companyType', label: 'Company Type' },
          { value: 'isPublicCompany', label: 'Is Public Company' }
        ];
      } else if (financialFilterType === 'reportAvailability') {
        return [
          { value: 'annualReportUrl', label: 'Annual Report URL' },
          { value: 'annualReportStatus', label: 'Annual Report Status' },
          { value: 'annualReportSource', label: 'Annual Report Source' }
        ];
      } else if (financialFilterType === 'textQuality') {
        return [
          { value: 'annualReportTextStatus', label: 'Text Extraction Status' },
          { value: 'annualReportTextSource', label: 'Text Extraction Source' }
        ];
      } else if (financialFilterType === 'insightContent') {
        return [
          { value: 'financialInsights', label: 'Financial Insights' },
          { value: 'financialInsightsSource', label: 'Insights Source' }
        ];
      }
    }
    
    // Special case for Apollo enrichment
    if (service.displayName === 'Apollo Enrichment') {
      return [
        { value: 'headcount', label: 'Employee Count' },
        { value: 'organization.industry', label: 'Industry' },
        { value: 'organization.country', label: 'Country' },
        { value: 'organization.city', label: 'City' },
        { value: 'person.seniority', label: 'Job Seniority' },
        { value: 'person.departments', label: 'Department' },
        { value: 'person.functions', label: 'Job Function' },
        { value: 'organization.estimated_num_employees', label: 'Company Size' },
        { value: 'organization.founded_year', label: 'Founded Year' }
      ];
    }
    
    // Standard approach for other services
    if (!service.outputFields) return [];
    
    return service.outputFields.map(field => ({
      value: field.name,
      label: field.displayName || field.name
    }));
  };

  // Get operator options based on field type
  const getOperatorOptions = (fieldName) => {
    // Boolean fields
    if (fieldName === 'isPublicCompany') {
      return [
        { value: 'equals', label: 'equals' }
      ];
    }
    
    // Numeric fields
    if (['headcount', 'organization.estimated_num_employees', 'organization.founded_year'].includes(fieldName)) {
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

  // Get value input type based on field
  const getValueInputType = (fieldName) => {
    if (fieldName === 'isPublicCompany') {
      return 'boolean';
    }
    
    if (['companyType'].includes(fieldName)) {
      return 'select';
    }
    
    if (['annualReportStatus', 'annualReportTextStatus'].includes(fieldName)) {
      return 'status-select';
    }
    
    if (['headcount', 'organization.estimated_num_employees', 'organization.founded_year'].includes(fieldName)) {
      return 'number';
    }
    
    return 'text';
  };

  // Get options for select fields
  const getSelectOptions = (fieldName) => {
    if (fieldName === 'companyType') {
      return [
        { value: 'Public', label: 'Public' },
        { value: 'Private', label: 'Private' }
      ];
    }
    
    if (fieldName === 'isPublicCompany') {
      return [
        { value: 'true', label: 'True' },
        { value: 'false', label: 'False' }
      ];
    }
    
    if (fieldName === 'annualReportStatus') {
      return [
        { value: 'found', label: 'Found' },
        { value: 'not_found', label: 'Not Found' },
        { value: 'no_results', label: 'No Results' },
        { value: 'error', label: 'Error' }
      ];
    }
    
    if (fieldName === 'annualReportTextStatus') {
      return [
        { value: 'Text extraction completed successfully', label: 'Success' },
        { value: 'Failed to extract text from annual report', label: 'Failed' },
        { value: 'Error processing annual report', label: 'Error' }
      ];
    }
    
    return [];
  };

  const renderValueInput = (rule, index) => {
    const inputType = getValueInputType(rule.field);
    
    if (inputType === 'boolean') {
      return (
        <select
          value={rule.value}
          onChange={(e) => updateRule(index, 'value', e.target.value)}
          className="w-full p-2 border rounded-lg"
        >
          <option value="">Select value</option>
          {getSelectOptions(rule.field).map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    
    if (inputType === 'select' || inputType === 'status-select') {
      return (
        <select
          value={rule.value}
          onChange={(e) => updateRule(index, 'value', e.target.value)}
          className="w-full p-2 border rounded-lg"
        >
          <option value="">Select value</option>
          {getSelectOptions(rule.field).map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    
    if (rule.operator === 'between') {
      return (
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
      );
    }
    
    return (
      <input
        type={inputType === 'number' ? 'number' : 'text'}
        value={rule.value}
        onChange={(e) => updateRule(index, 'value', e.target.value)}
        className="w-full p-2 border rounded-lg"
        placeholder="Enter value"
      />
    );
  };

  if (!engineState || !service) return null;

  return (
    <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
      <button
        onClick={handleBack}
        className="self-start mb-4 text-blue-600 hover:underline"
      >
        Back to previous screen
      </button>
      
      <h2 className="text-4xl font-bold text-center mb-6">
        Configure Filtering for Step {stepIdx + 1}
      </h2>
      
      <div className="text-center mb-8">
        <p className="text-xl font-medium">Set up filters for {service.displayName}</p>
        <p className="text-gray-600 mt-2">
          Define rules to automatically filter out leads that don't meet your criteria
        </p>
      </div>

      {/* Financial Insight specific filter type selector */}
      {isFinancialInsightService && (
        <div className="w-full mb-8 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-4">Financial Insight Filter Type</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => handleFinancialFilterTypeChange('companyType')}
              className={`p-3 rounded-lg text-sm ${
                financialFilterType === 'companyType'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Company Type Filters
            </button>
            <button
              onClick={() => handleFinancialFilterTypeChange('reportAvailability')}
              className={`p-3 rounded-lg text-sm ${
                financialFilterType === 'reportAvailability'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Annual Report Availability
            </button>
            <button
              onClick={() => handleFinancialFilterTypeChange('textQuality')}
              className={`p-3 rounded-lg text-sm ${
                financialFilterType === 'textQuality'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Text Extraction Quality
            </button>
            <button
              onClick={() => handleFinancialFilterTypeChange('insightContent')}
              className={`p-3 rounded-lg text-sm ${
                financialFilterType === 'insightContent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              Financial Insight Content
            </button>
          </div>
          
          {/* Help text based on selected filter type */}
          <div className="mt-4 text-sm">
            {financialFilterType === 'companyType' && (
              <p>Filter companies based on their public/private status. Typically, you want to eliminate private companies.</p>
            )}
            {financialFilterType === 'reportAvailability' && (
              <p>Filter companies based on whether an annual report was found. Typically, you want to eliminate companies with no reports.</p>
            )}
            {financialFilterType === 'textQuality' && (
              <p>Filter companies based on whether text extraction was successful. Typically, you want to eliminate companies with failed extractions.</p>
            )}
            {financialFilterType === 'insightContent' && (
              <p>Filter companies based on the content of their financial insights. Use this to filter for specific trends or issues.</p>
            )}
          </div>
        </div>
      )}

      <div className="w-full mb-8 p-4 bg-yellow-50 rounded-lg">
        <h3 className="font-medium mb-2">How Filtering Works</h3>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Leads that match your "eliminate" rules will be tagged and excluded from further processing</li>
          <li>Tagged leads remain in your final export but are marked for easy identification</li>
          <li>Multiple rules work with OR logic - matching any rule will filter the lead</li>
        </ul>
      </div>
      
      <div className="w-full mb-8">
        {filterRules.map((rule, index) => (
          <div key={index} className="mb-6 p-4 border rounded-lg bg-gray-50">
            <div className="flex items-center mb-4">
              <span className="font-medium mr-4">Rule {index + 1}</span>
              
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
                <label className="block text-sm font-medium mb-1">Field</label>
                <select
                  value={rule.field}
                  onChange={(e) => updateRule(index, 'field', e.target.value)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">Select field</option>
                  {getFilterFields().map(field => (
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
                {renderValueInput(rule, index)}
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
                {' '}If {getFilterFields().find(f => f.value === rule.field)?.label || rule.field} {rule.operator} "{rule.value}", then {rule.action === 'eliminate' ? 'filter out the lead' : 'keep the lead'}
              </div>
            )}
          </div>
        ))}
        
        <button
          onClick={addRule}
          className="text-blue-600 hover:text-blue-800 flex items-center"
        >
          <span className="mr-1">+</span> Add another rule
        </button>
      </div>

      {/* Example Section - Customized for Financial Insight service */}
      <div className="w-full mb-8 p-4 bg-gray-100 rounded-lg">
        <h3 className="font-medium mb-2">Example Filter Rules</h3>
        <div className="text-sm space-y-1">
          {isFinancialInsightService ? (
            <>
              <p>• <span className="font-mono">Company Type equals "Private"</span> → Eliminate (filter out private companies)</p>
              <p>• <span className="font-mono">Annual Report Status equals "not_found"</span> → Eliminate (filter companies without annual reports)</p>
              <p>• <span className="font-mono">Text Extraction Status contains "Failed"</span> → Eliminate (filter companies with failed text extraction)</p>
              <p>• <span className="font-mono">Financial Insights contains "financial distress"</span> → Eliminate (filter companies showing signs of distress)</p>
            </>
          ) : (
            <>
              <p>• <span className="font-mono">Employee Count less than 50</span> → Eliminate (filter out small companies)</p>
              <p>• <span className="font-mono">Industry contains "retail"</span> → Eliminate (exclude retail companies)</p>
              <p>• <span className="font-mono">Job Seniority equals "Entry"</span> → Eliminate (focus on senior roles)</p>
            </>
          )}
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-lg">
          {error}
        </div>
      )}
      
      <div className="w-full flex justify-center space-x-4 mt-8">
        <button
          onClick={handleSave}
          className="px-8 py-3 text-lg bg-gray-200 text-gray-800 rounded-full hover:bg-gray-300 transition-colors"
        >
          Save Progress
        </button>
        
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

export default FilterConfiguration;