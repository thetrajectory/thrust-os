// routes/dynamicRoutes.jsx
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdvisorSelectionPage from '../components/AdvisorSelectionPage';
import ClientSelectionPage from '../components/ClientSelectionPage';
import FileUploadPage from '../components/FileUploadPage';
import LandingPage from '../components/LandingPage';
import RouteGuard from '../components/RouteGuard';

// Pre-built engine components
import FindAdvisorProcessingPage from '../components/find-advisor/videocx/FindAdvisorProcessingPage';
import FindAdvisorResultsPage from '../components/find-advisor/videocx/FindAdvisorResultsPage';
import OrchestratedProcessingPage from '../components/OrchestratedProcessingPage'; // Incommon
import ResultsPage from '../components/ResultsPage'; // Incommon
import VideoCXProcessingPage from '../components/videocx/VideoCXProcessingPage';
import VideoCXResultsPage from '../components/videocx/VideoCXResultsPage';

// Custom engine components
import CustomEngineFileUploadPage from '../components/custom-engine/CustomEngineFileUploadPage';
import CustomEngineProcessingPage from '../components/custom-engine/CustomEngineProcessingPage';
import CustomEngineResultsPage from '../components/custom-engine/CustomEngineResultsPage';

// Configuration Routes
import AnalysisFiltersConfiguration from '../components/engine-builder/StepConfiguration/AnalysisFiltersConfiguration';
import AnalysisPromptsConfiguration from '../components/engine-builder/StepConfiguration/AnalysisPromptsConfiguration';
import ApolloFilterConfiguration from '../components/engine-builder/StepConfiguration/ApolloFilterConfiguration';

// Engine Builder routes
import EngineBuilderRoutes from './engineBuilderRoutes';

const DynamicRoutes = ({
    handleEngineSelection,
    handleClientSelection,
    handleAdvisorSelection,
    handleFileUpload,
    handleProcessingComplete,
    handleBackNavigation,
    orchestratorMap,
    csvData,
    processedData,
    analytics,
    filterAnalytics,
    selectedEngine
}) => {
    return (
        <Routes>
            {/* Common Routes */}
            <Route path="/" element={<LandingPage onEngineSelect={handleEngineSelection} />} />
            <Route path="/client" element={
                <ClientSelectionPage
                    onClientSelect={handleClientSelection}
                    onBack={handleBackNavigation}
                />
            } />
            <Route path="/advisor" element={
                <RouteGuard requiredState={['CLIENT']} redirectTo="/client">
                    <AdvisorSelectionPage
                        onAdvisorSelect={handleAdvisorSelection}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/upload" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT']} redirectTo="/client">
                    <FileUploadPage
                        onFileUpload={handleFileUpload}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />

            {/* Pre-built engines - Static Routes */}
            {/* Incommon Routes */}
            <Route path="/incommon/processing" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CSV_DATA']} redirectTo="/upload">
                    <OrchestratedProcessingPage
                        csvData={csvData}
                        onProcessingComplete={(data) => handleProcessingComplete(data, 'Incommon AI')}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/incommon/results" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT']} redirectTo="/incommon/processing">
                    <ResultsPage
                        processedData={processedData}
                        originalCount={csvData?.length || 0}
                        analytics={analytics}
                        finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
                        filterAnalytics={filterAnalytics}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />

            {/* VideoCX Routes */}
            <Route path="/videocx/processing" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CSV_DATA']} redirectTo="/upload">
                    <VideoCXProcessingPage
                        csvData={csvData}
                        onProcessingComplete={(data) => handleProcessingComplete(data, 'Video CX')}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/videocx/results" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT']} redirectTo="/videocx/processing">
                    <VideoCXResultsPage
                        processedData={processedData}
                        originalCount={csvData?.length || 0}
                        analytics={analytics}
                        finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
                        filterAnalytics={filterAnalytics}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />

            {/* Advisor Finder Routes */}
            <Route path="/find-advisor/videocx/processing" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CSV_DATA']} redirectTo="/upload">
                    <FindAdvisorProcessingPage
                        csvData={csvData}
                        onProcessingComplete={(data) => handleProcessingComplete(data, 'Find Advisor')}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/find-advisor/videocx/results" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT']} redirectTo="/find-advisor/videocx/processing">
                    <FindAdvisorResultsPage
                        processedData={processedData}
                        originalCount={csvData?.length || 0}
                        analytics={analytics}
                        finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
                        filterAnalytics={filterAnalytics}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />

            {/* Dynamic Routes for Custom Engines */}
            <Route path="/custom-engine/upload" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CUSTOM_ENGINE_DATA']} redirectTo="/client">
                    <CustomEngineFileUploadPage
                        onFileUpload={handleFileUpload}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/custom-engine/processing" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CUSTOM_ENGINE_DATA', 'CSV_DATA']} redirectTo="/custom-engine/upload">
                    <CustomEngineProcessingPage
                        engineData={orchestratorMap.customEngine?.engineData}
                        orchestrator={orchestratorMap.customEngine?.orchestrator}
                        onProcessingComplete={(data) => handleProcessingComplete(data, 'Custom Engine')}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />
            <Route path="/custom-engine/results" element={
                <RouteGuard requiredState={['ENGINE', 'CLIENT', 'CUSTOM_ENGINE_DATA']} redirectTo="/custom-engine/processing">
                    <CustomEngineResultsPage
                        processedData={processedData}
                        originalCount={csvData?.length || 0}
                        analytics={analytics}
                        finalCount={processedData ? processedData.filter(row => !row.relevanceTag).length : 0}
                        filterAnalytics={filterAnalytics}
                        onBack={handleBackNavigation}
                    />
                </RouteGuard>
            } />

            <Route path="/engine-builder/configure-step/:stepIndex/apollo-filter" element={<ApolloFilterConfiguration />} />
            <Route path="/engine-builder/configure-step/:stepIndex/analysis-prompts" element={<AnalysisPromptsConfiguration />} />
            <Route path="/engine-builder/configure-step/:stepIndex/analysis-filters" element={<AnalysisFiltersConfiguration />} />

            {/* Engine Builder Routes */}
            <Route path="/engine-builder/*" element={<EngineBuilderRoutes />} />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />

            <Route path="/client" element={
                <ClientSelectionPage
                    engine={selectedEngine} // Make sure this is being passed from App.jsx
                    onClientSelect={handleClientSelection}
                    onBack={handleBackNavigation}
                />
            } />
        </Routes>
    );
};

export default DynamicRoutes;