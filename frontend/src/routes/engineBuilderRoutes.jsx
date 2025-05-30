// routes/engineBuilderRoutes.jsx
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EngineBuilderHome from '../components/engine-builder/EngineBuilderHome';
import EngineInitialization from '../components/engine-builder/EngineInitialization';
import InputSchemaSelection from '../components/engine-builder/InputSchemaSelection';
import StepDeclaration from '../components/engine-builder/StepDeclaration';
import ServiceSelection from '../components/engine-builder/StepConfiguration/ServiceSelection';
import PromptConfiguration from '../components/engine-builder/StepConfiguration/PromptConfiguration';
import FilterConfiguration from '../components/engine-builder/StepConfiguration/FilterConfiguration';
import PipelineReview from '../components/engine-builder/PipelineReview';
import FileUpload from '../components/engine-builder/FileUpload';
import PipelineExecution from '../components/engine-builder/PipelineExecution';
import ResultsPage from '../components/engine-builder/ResultsPage';
import RouteGuard from '../components/RouteGuard';

const EngineBuilderRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<EngineBuilderHome />} />
      <Route path="/initialize" element={<EngineInitialization />} />
      
      {/* Input Schema Selection */}
      <Route path="/input-schema" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/initialize"
        >
          <InputSchemaSelection />
        </RouteGuard>
      } />
      
      {/* Step Declaration */}
      <Route path="/step-declaration" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/initialize"
        >
          <StepDeclaration />
        </RouteGuard>
      } />
      
      {/* Step Configuration */}
      <Route path="/configure-step/:stepIndex" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/step-declaration"
        >
          <ServiceSelection />
        </RouteGuard>
      } />
      
      <Route path="/configure-step/:stepIndex/prompt" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/step-declaration"
        >
          <PromptConfiguration />
        </RouteGuard>
      } />
      
      <Route path="/configure-step/:stepIndex/filter" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/step-declaration"
        >
          <FilterConfiguration />
        </RouteGuard>
      } />
      
      {/* Pipeline Review */}
      <Route path="/review" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder/step-declaration"
        >
          <PipelineReview />
        </RouteGuard>
      } />
      
      {/* File Upload */}
      <Route path="/upload" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE']} 
          redirectTo="/engine-builder"
        >
          <FileUpload />
        </RouteGuard>
      } />
      
      {/* Pipeline Execution */}
      <Route path="/execute" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE', 'CSV_DATA']} 
          redirectTo="/engine-builder/upload"
        >
          <PipelineExecution />
        </RouteGuard>
      } />
      
      {/* Results Page */}
      <Route path="/results" element={
        <RouteGuard 
          requiredState={['ENGINE_BUILDER_STATE', 'PROCESSED_DATA']} 
          redirectTo="/engine-builder/execute"
        >
          <ResultsPage />
        </RouteGuard>
      } />
      
      {/* Catch-all redirect */}
      <Route path="*" element={<Navigate to="/engine-builder" replace />} />
    </Routes>
  );
};

export default EngineBuilderRoutes;