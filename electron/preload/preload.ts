import { contextBridge, ipcRenderer } from "electron";
import type {
  AskAnswer,
  DashboardData,
  DatasetState,
  ImportPreview,
  SpeciesResearchCacheStatus,
  SpeciesResearchResult,
  TreatmentCodebookEntry
} from "../../src/core/types";

export interface DatasetResponse {
  dataset: DatasetState;
  dashboard: DashboardData;
}

export interface OpenAiStatus {
  configured: boolean;
  safeStorageAvailable: boolean;
  dashboard?: DashboardData;
}

export interface CodebookSaveResponse extends DatasetResponse {
  entries: TreatmentCodebookEntry[];
}

export interface SeedBankApi {
  getDashboard(): Promise<DashboardData>;
  getDataset(): Promise<DatasetState>;
  previewWorkbooks(): Promise<ImportPreview[]>;
  checkWorkbookUpdate(sourceId: number): Promise<ImportPreview>;
  relinkWorkbookSource(sourceId: number): Promise<ImportPreview | null>;
  selectPreviewWorksheet(token: string, worksheetName: string): Promise<ImportPreview>;
  commitImportPreviews(tokens: string[]): Promise<DatasetResponse>;
  createAnalysisScope(name: string, batchIds: number[]): Promise<DatasetResponse>;
  setAnalysisScope(scopeId: number): Promise<DatasetResponse>;
  getTreatmentCodebook(): Promise<TreatmentCodebookEntry[]>;
  saveTreatmentCodebookEntry(entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">): Promise<CodebookSaveResponse>;
  exportAdvancedAnalysis(): Promise<{ directory: string; files: string[] } | null>;
  getOpenAiStatus(): Promise<OpenAiStatus>;
  saveOpenAiKey(key: string, batchId?: number): Promise<OpenAiStatus>;
  clearOpenAiKey(batchId?: number): Promise<OpenAiStatus>;
  generateSpeciesInsights(force?: boolean, batchId?: number): Promise<DashboardData>;
  getSpeciesResearchCacheStatus(batchId?: number): Promise<SpeciesResearchCacheStatus>;
  researchSpecies(batchId: number, species: string, force?: boolean, confirmed?: boolean): Promise<SpeciesResearchResult>;
  askQuestion(question: string, confirmed?: boolean): Promise<AskAnswer>;
}

const api: SeedBankApi = {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  getDataset: () => ipcRenderer.invoke("dataset:get"),
  previewWorkbooks: () => ipcRenderer.invoke("dataset:previewSelect"),
  checkWorkbookUpdate: (sourceId) => ipcRenderer.invoke("dataset:checkUpdate", sourceId),
  relinkWorkbookSource: (sourceId) => ipcRenderer.invoke("dataset:relink", sourceId),
  selectPreviewWorksheet: (token, worksheetName) => ipcRenderer.invoke("dataset:selectWorksheet", token, worksheetName),
  commitImportPreviews: (tokens) => ipcRenderer.invoke("dataset:commitPreviews", tokens),
  createAnalysisScope: (name, batchIds) => ipcRenderer.invoke("dataset:createScope", name, batchIds),
  setAnalysisScope: (scopeId) => ipcRenderer.invoke("dataset:setScope", scopeId),
  getTreatmentCodebook: () => ipcRenderer.invoke("codebook:get"),
  saveTreatmentCodebookEntry: (entry) => ipcRenderer.invoke("codebook:save", entry),
  exportAdvancedAnalysis: () => ipcRenderer.invoke("analysis:export"),
  getOpenAiStatus: () => ipcRenderer.invoke("openai:status"),
  saveOpenAiKey: (key, batchId) => ipcRenderer.invoke("openai:saveKey", key, batchId),
  clearOpenAiKey: (batchId) => ipcRenderer.invoke("openai:clearKey", batchId),
  generateSpeciesInsights: (force, batchId) => ipcRenderer.invoke("openai:generateSpeciesInsights", force, batchId),
  getSpeciesResearchCacheStatus: (batchId) => ipcRenderer.invoke("openai:speciesResearchCacheStatus", batchId),
  researchSpecies: (batchId, species, force, confirmed) => ipcRenderer.invoke("openai:researchSpecies", batchId, species, force, confirmed),
  askQuestion: (question, confirmed) => ipcRenderer.invoke("openai:ask", question, confirmed)
};

contextBridge.exposeInMainWorld("seedbank", api);
