// components/engine-builder/FileUpload.jsx
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../../services/supabaseClient';
import storageUtils from '../../utils/storageUtils';

const FileUpload = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [engineData, setEngineData] = useState(null);
    const [engineName, setEngineName] = useState('');
    const [uploadStatus, setUploadStatus] = useState({ message: '', isError: false });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if we have a selected engine or current engine state
        const selectedEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_SELECTED);
        const currentEngine = storageUtils.loadFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);

        if (!selectedEngine && !currentEngine) {
            // If neither, redirect to engine selection
            navigate('/engine-builder');
            return;
        }

        // If we have a selected engine name, fetch it from Supabase
        if (selectedEngine) {
            fetchEngine(selectedEngine);
        } else if (currentEngine) {
            // Use current engine state
            setEngineData(currentEngine);
            setEngineName(currentEngine.engineName);
            setIsLoading(false);
        }
    }, [navigate]);

    const fetchEngine = async (name) => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('engine_db')
                .select('*')
                .eq('engine_name', name)
                .single();

            if (error) throw error;

            if (!data) {
                setUploadStatus({
                    message: `Engine "${name}" not found`,
                    isError: true
                });
                setIsLoading(false);
                return;
            }

            // Transform from DB format to state format
            const engineState = {
                engineName: data.engine_name,
                engineType: data.engine_type,
                inputSchema: data.pipeline.inputSchema,
                steps: data.pipeline.steps
            };

            setEngineData(engineState);
            setEngineName(data.engine_name);

            // Save current engine to storage
            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE, engineState);

            // Clear selected engine
            storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_SELECTED);
        } catch (error) {
            console.error('Error fetching engine:', error);
            setUploadStatus({
                message: `Error loading engine: ${error.message}`,
                isError: true
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleBack = () => {
        navigate('/engine-builder');
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];

        if (!selectedFile) {
            setFile(null);
            setUploadStatus({ message: '', isError: false });
            return;
        }

        // Validate file is a CSV
        if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
            setUploadStatus({
                message: 'Please upload a CSV file',
                isError: true
            });
            return;
        }

        setFile(selectedFile);
        setUploadStatus({
            message: `File "${selectedFile.name}" selected`,
            isError: false
        });
    };

    const handleUpload = () => {
        if (!file) {
            setUploadStatus({
                message: 'Please select a file first',
                isError: true
            });
            return;
        }

        // Parse CSV file
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    setUploadStatus({
                        message: `Error parsing CSV: ${results.errors[0].message}`,
                        isError: true
                    });
                    return;
                }

                // Ensure we have at least some data
                if (results.data.length === 0) {
                    setUploadStatus({
                        message: 'CSV file is empty',
                        isError: true
                    });
                    return;
                }

                // Validate CSV against input schema
                const schema = engineData.inputSchema;
                if (schema && schema.fields) {
                    const requiredFields = schema.fields.filter(field => !field.optional);
                    const missingFields = requiredFields.filter(field =>
                        !results.data[0].hasOwnProperty(field) &&
                        !results.data[0].hasOwnProperty(field.replace(/_/g, ' '))
                    );

                    if (missingFields.length > 0) {
                        setUploadStatus({
                            message: `CSV missing required fields: ${missingFields.join(', ')}`,
                            isError: true
                        });
                        return;
                    }
                }

                // Initialize each row with empty relevanceTag
                const preparedData = results.data.map(row => ({
                    ...row,
                    relevanceTag: ''
                }));

                // Save CSV data to storage
                storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CSV_DATA, preparedData);

                // Navigate to execution page
                navigate('/engine-builder/execute');
            },
            error: (error) => {
                setUploadStatus({
                    message: `Error parsing CSV: ${error.message}`,
                    isError: true
                });
            }
        });
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-lg text-gray-600">Loading engine data...</div>
            </div>
        );
    }

    if (!engineData) {
        return (
            <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
                <button
                    onClick={handleBack}
                    className="self-start mb-4 text-blue-600 hover:underline"
                >
                    Back to Engine Builder
                </button>

                <div className="w-full p-6 border rounded-lg bg-red-50 text-red-700">
                    <h3 className="text-xl font-bold mb-2">Error</h3>
                    <p>{uploadStatus.message || 'Failed to load engine data'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center max-w-2xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>

            <h2 className="text-4xl font-bold text-center mb-8">
                Upload CSV for "{engineName}"
            </h2>

            <div className="w-full p-4 bg-blue-50 rounded-lg mb-8">
                <h3 className="font-bold text-lg mb-2">Engine Details</h3>
                <p><span className="font-medium">Type:</span> {engineData.engineType}</p>
                <p><span className="font-medium">Input Schema:</span> {engineData.inputSchema?.type}</p>
                <p><span className="font-medium">Steps:</span> {engineData.steps.length}</p>
            </div>

            <div className="w-full border-2 border-dashed border-gray-300 rounded-lg p-12 text-center mb-8">
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="csvInput"
                />
                <label
                    htmlFor="csvInput"
                    className="cursor-pointer text-blue-600 hover:text-blue-800 text-lg font-medium"
                >
                    Click to select a CSV file
                </label>

                {uploadStatus.message && (
                    <div className={`mt-4 ${uploadStatus.isError ? 'text-red-600' : 'text-green-600'}`}>
                        {uploadStatus.message}
                    </div>
                )}
            </div>

            <div className="w-full">
                <button
                    onClick={handleUpload}
                    disabled={!file}
                    className={`w-full py-3 px-4 rounded-lg text-white ${file ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
                        }`}
                >
                    Upload and Process
                </button>
            </div>

            <div className="w-full mt-8 bg-gray-100 p-4 rounded-lg">
                <h3 className="text-lg font-medium mb-2">Expected CSV Format</h3>
                <p className="mb-2">Your CSV should include the following fields:</p>
                <div className="flex flex-wrap gap-2 mb-4">
                    {engineData.inputSchema?.fields.map((field, index) => (
                        <span key={index} className="px-2 py-1 bg-blue-100 rounded-md text-sm">
                            {field}
                        </span>
                    ))}
                </div>
                <p className="text-sm text-gray-600">
                    The engine will process all rows and maintain the original data, while adding enrichment fields and tagging any filtered rows.
                </p>
            </div>
        </div>
    );
};

export default FileUpload;