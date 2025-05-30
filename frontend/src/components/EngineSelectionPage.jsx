// components/EngineSelectionPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../services/supabaseClient';
import storageUtils from '../utils/storageUtils';

const EngineSelectionPage = ({ engineType }) => {
    const navigate = useNavigate();

    const [standardEngines, setStandardEngines] = useState([]);
    const [customEngines, setCustomEngines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Save engine type to storage
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_TYPE, engineType);

        // Fetch both standard and custom engines based on engine type
        const fetchEngines = async () => {
            setIsLoading(true);

            try {
                // Define standard engines based on engineType
                let standards = [];

                if (engineType === 'advisor') {
                    standards = [
                        { name: 'Incommon AI', active: true },
                        { name: 'Video CX', active: true }
                    ];
                } else if (engineType === 'account') {
                    standards = [
                        { name: 'Account Engine', active: false }
                    ];
                } else if (engineType === 'find-advisor') {
                    standards = [
                        { name: 'Video CX', active: true }
                    ];
                }

                setStandardEngines(standards);

                // Fetch custom engines from Supabase
                const { data, error } = await supabase
                    .from('engine_db')
                    .select('*')
                    .eq('engine_type', engineType)
                    .eq('is_custom_engine', true);

                if (error) throw error;

                setCustomEngines(data || []);
            } catch (err) {
                console.error('Error fetching engines:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchEngines();
    }, [engineType]);

    const handleEngineSelect = (engine, isCustom = false) => {
        // Store engine information
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE, engine.name || engine);

        if (isCustom) {
            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA, engine);
            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE, true);
        } else {
            storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.CUSTOM_ENGINE_DATA);
            storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.IS_CUSTOM_ENGINE, false);
        }

        // Navigate to client selection
        const engineName = isCustom ? engine.engine_name : engine;
        navigate(`/${engineType}/${engineName}/client`);
    };

    const handleBack = () => {
        navigate('/');
    };

    const getPageTitle = () => {
        switch (engineType) {
            case 'advisor': return 'Select Advisor Engine';
            case 'account': return 'Select Account Engine';
            case 'find-advisor': return 'Select Advisor Finder Engine';
            default: return 'Select Engine';
        }
    };

    return (
        <div className="flex flex-col items-center justify-center">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to previous screen
            </button>

            <h2 className="text-4xl font-bold text-center mb-12">
                {getPageTitle()}
            </h2>

            {isLoading ? (
                <div className="text-gray-500">Loading engines...</div>
            ) : (
                <>
                    {/* Standard Engines */}
                    <h3 className="text-xl font-medium text-center mb-4">Standard Engines</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mb-8">
                        {standardEngines.map((engine, index) => (
                            <button
                                key={index}
                                onClick={() => handleEngineSelect(engine.name)}
                                className={`px-4 py-3 text-lg border-2 ${engine.active
                                    ? 'border-blue-300 hover:bg-blue-50'
                                    : 'border-gray-300 text-gray-400 cursor-not-allowed'
                                    } rounded-full transition-colors`}
                                disabled={!engine.active}
                            >
                                {engine.name}
                                {!engine.active && <span className="block text-xs">(Coming Soon)</span>}
                            </button>
                        ))}
                    </div>

                    {/* Custom Engines */}
                    {customEngines.length > 0 && (
                        <>
                            <h3 className="text-xl font-medium text-center mb-4 mt-8">Your Custom Engines</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-4xl">
                                {customEngines.map((engineData, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleEngineSelect(engineData, true)}
                                        className="px-6 py-4 text-lg border-2 border-green-300 hover:bg-green-50 rounded-lg transition-colors"
                                    >
                                        <div className="font-bold">{engineData.engine_name}</div>
                                        <div className="text-sm text-gray-600 mt-1">
                                            {new Date(engineData.created_at).toLocaleDateString()}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Build custom engine button */}
                    <div className="mt-12">
                        <button
                            onClick={() => navigate('/engine-builder')}
                            className="px-6 py-3 text-lg border-2 border-green-400 rounded-full hover:bg-green-50 transition-colors"
                        >
                            Build a New Custom Engine
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default EngineSelectionPage;