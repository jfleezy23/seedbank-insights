import { contextBridge, ipcRenderer } from "electron";
import type {
  AnalysisScope,
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

export interface SeedBankApi {
  getDashboard(): Promise<DashboardData>;
  getDataset(): Promise<DatasetState>;
  previewWorkbooks(): Promise<ImportPreview[]>;
  checkWorkbookUpdate(sourceId: number): Promise<ImportPreview>;
  relinkWorkbookSource(sourceId: number): Promise<ImportPreview | null>;
  commitImportPreviews(tokens: string[]): Promise<DatasetResponse>;
  createAnalysisScope(name: string, batchIds: number[]): Promise<DatasetResponse>;
  setAnalysisScope(scopeId: number): Promise<DatasetResponse>;
  getTreatmentCodebook(): Promise<TreatmentCodebookEntry[]>;
  saveTreatmentCodebookEntry(entry: Omit<TreatmentCodebookEntry, "id" | "builtIn">): Promise<TreatmentCodebookEntry[]>;
  exportAdvancedAnalysis(): Promise<{ directory: string; files: string[] } | null>;
  selectWorkbook(): Promise<DashboardData | null>;
  importLocalDefaultWorkbook(): Promise<DashboardData | null>;
  getOpenAiStatus(): Promise<OpenAiStatus>;
  saveOpenAiKey(key: string, batchId?: number): Promise<OpenAiStatus>;
  clearOpenAiKey(batchId?: number): Promise<OpenAiStatus>;
  generateSpeciesInsights(force?: boolean, batchId?: number): Promise<DashboardData>;
  getSpeciesResearchCacheStatus(batchId?: number): Promise<SpeciesResearchCacheStatus>;
  researchSpecies(batchId: number, species: string, force?: boolean): Promise<SpeciesResearchResult>;
  askQuestion(question: string): Promise<AskAnswer>;
}

const api: SeedBankApi = {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  getDataset: () => ipcRenderer.invoke("dataset:get"),
  previewWorkbooks: () => ipcRenderer.invoke("dataset:previewSelect"),
  checkWorkbookUpdate: (sourceId) => ipcRenderer.invoke("dataset:checkUpdate", sourceId),
  relinkWorkbookSource: (sourceId) => ipcRenderer.invoke("dataset:relink", sourceId),
  commitImportPreviews: (tokens) => ipcRenderer.invoke("dataset:commitPreviews", tokens),
  createAnalysisScope: (name, batchIds) => ipcRenderer.invoke("dataset:createScope", name, batchIds),
  setAnalysisScope: (scopeId) => ipcRenderer.invoke("dataset:setScope", scopeId),
  getTreatmentCodebook: () => ipcRenderer.invoke("codebook:get"),
  saveTreatmentCodebookEntry: (entry) => ipcRenderer.invoke("codebook:save", entry),
  exportAdvancedAnalysis: () => ipcRenderer.invoke("analysis:export"),
  selectWorkbook: () => ipcRenderer.invoke("workbook:select"),
  importLocalDefaultWorkbook: () => ipcRenderer.invoke("workbook:importLocalDefault"),
  getOpenAiStatus: () => ipcRenderer.invoke("openai:status"),
  saveOpenAiKey: (key, batchId) => ipcRenderer.invoke("openai:saveKey", key, batchId),
  clearOpenAiKey: (batchId) => ipcRenderer.invoke("openai:clearKey", batchId),
  generateSpeciesInsights: (force, batchId) => ipcRenderer.invoke("openai:generateSpeciesInsights", force, batchId),
  getSpeciesResearchCacheStatus: (batchId) => ipcRenderer.invoke("openai:speciesResearchCacheStatus", batchId),
  researchSpecies: (batchId, species, force) => ipcRenderer.invoke("openai:researchSpecies", batchId, species, force),
  askQuestion: (question) => ipcRenderer.invoke("openai:ask", question)
};

contextBridge.exposeInMainWorld("seedbank", api);
