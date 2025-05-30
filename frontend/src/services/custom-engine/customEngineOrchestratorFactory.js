// services/custom-engine/customEngineOrchestratorFactory.js
import { CustomEngineOrchestrator } from './customEngineOrchestrator';

class CustomEngineOrchestratorFactory {
  constructor() {
    // Keep track of created orchestrators
    this.orchestrators = new Map();
    // Default orchestrator for backward compatibility
    this.defaultOrchestrator = new CustomEngineOrchestrator();
  }

  // Get or create an orchestrator for a specific engine
  getOrCreateOrchestrator(engineId, engineData = null) {
    // If we already have an orchestrator for this engine, return it
    if (this.orchestrators.has(engineId)) {
      return this.orchestrators.get(engineId);
    }

    // Create a new orchestrator
    const orchestrator = new CustomEngineOrchestrator();
    
    // Initialize with engine data if provided
    if (engineData) {
      // FIX: Change setEngineData to setEngine
      orchestrator.setEngine(engineData);
    }
    
    // Store the orchestrator
    this.orchestrators.set(engineId, orchestrator);
    
    return orchestrator;
  }

  // Get the default orchestrator (for backward compatibility)
  getDefaultOrchestrator() {
    return this.defaultOrchestrator;
  }

  // Reset a specific orchestrator
  resetOrchestrator(engineId) {
    if (this.orchestrators.has(engineId)) {
      const orchestrator = this.orchestrators.get(engineId);
      orchestrator.reset();
      return true;
    }
    return false;
  }

  // Reset all orchestrators
  resetAll() {
    this.defaultOrchestrator.reset();
    this.orchestrators.forEach(orchestrator => {
      orchestrator.reset();
    });
  }
}

const orchestratorFactory = new CustomEngineOrchestratorFactory();
export default orchestratorFactory;