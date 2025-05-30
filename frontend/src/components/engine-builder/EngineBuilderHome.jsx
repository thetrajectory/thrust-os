// components/engine-builder/EngineBuilderHome.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../../services/supabaseClient';
import storageUtils from '../../utils/storageUtils';

const EngineBuilderHome = () => {
    const navigate = useNavigate();
    const [savedEngines, setSavedEngines] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSavedEngines = async () => {
            try {
                const { data, error } = await supabase
                    .from('engine_db')
                    .select('*')
                    .eq('is_custom_engine', true)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setSavedEngines(data || []);
            } catch (error) {
                console.error('Error fetching saved engines:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSavedEngines();
    }, []);

    const handleCreateNew = () => {
        // Clear any existing engine builder state
        storageUtils.removeFromStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_STATE);
        navigate('/engine-builder/initialize');
    };

    const handleUseExisting = (engineName) => {
        storageUtils.saveToStorage(storageUtils.STORAGE_KEYS.ENGINE_BUILDER_SELECTED, engineName);
        navigate('/engine-builder/upload');
    };

    const handleBack = () => {
        navigate('/');
    };

    return (
        <div className="flex flex-col items-center justify-center max-w-4xl mx-auto">
            <button
                onClick={handleBack}
                className="self-start mb-4 text-blue-600 hover:underline"
            >
                Back to landing page
            </button>

            <h2 className="text-4xl font-bold text-center mb-12">
                Engine Builder
            </h2>

            <div className="w-full flex justify-center space-x-8 mb-16">
                <button
                    onClick={handleCreateNew}
                    className="px-8 py-4 text-lg bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                >
                    Create New Engine
                </button>

                {savedEngines.length > 0 && (
                    <button
                        onClick={() => navigate('/engine-builder/select-existing')}
                        className="px-8 py-4 text-lg border-2 border-blue-400 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                        Use Existing Engine
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="text-gray-500">Loading saved engines...</div>
            ) : savedEngines.length > 0 ? (
                <div className="w-full">
                    <h3 className="text-xl font-bold mb-4">Recent Engines</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {savedEngines.slice(0, 4).map((engine) => (
                            <div
                                key={engine.engine_name}
                                className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
                                onClick={() => handleUseExisting(engine.engine_name)}
                            >
                                <div className="font-bold">{engine.engine_name}</div>
                                <div className="text-sm text-gray-500">Type: {engine.engine_type}</div>
                                <div className="text-xs text-gray-400 mt-2">
                                    Created: {new Date(engine.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-gray-500">No saved engines yet. Create your first one!</div>
            )}
        </div>
    );
};

export default EngineBuilderHome;