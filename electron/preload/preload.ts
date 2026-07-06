import { contextBridge, ipcRenderer } from "electron";
import type { AskAnswer, DashboardData } from "../../src/core/types";

export interface OpenAiStatus {
  configured: boolean;
  safeStorageAvailable: boolean;
  dashboard?: DashboardData;
}

export interface SeedBankApi {
  getDashboard(): Promise<DashboardData>;
  selectWorkbook(): Promise<DashboardData | null>;
  importLocalDefaultWorkbook(): Promise<DashboardData | null>;
  getOpenAiStatus(): Promise<OpenAiStatus>;
  saveOpenAiKey(key: string, batchId?: number): Promise<OpenAiStatus>;
  clearOpenAiKey(batchId?: number): Promise<OpenAiStatus>;
  generateSpeciesInsights(force?: boolean, batchId?: number): Promise<DashboardData>;
  askQuestion(question: string): Promise<AskAnswer>;
}

const api: SeedBankApi = {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  selectWorkbook: () => ipcRenderer.invoke("workbook:select"),
  importLocalDefaultWorkbook: () => ipcRenderer.invoke("workbook:importLocalDefault"),
  getOpenAiStatus: () => ipcRenderer.invoke("openai:status"),
  saveOpenAiKey: (key, batchId) => ipcRenderer.invoke("openai:saveKey", key, batchId),
  clearOpenAiKey: (batchId) => ipcRenderer.invoke("openai:clearKey", batchId),
  generateSpeciesInsights: (force, batchId) => ipcRenderer.invoke("openai:generateSpeciesInsights", force, batchId),
  askQuestion: (question) => ipcRenderer.invoke("openai:ask", question)
};

contextBridge.exposeInMainWorld("seedbank", api);
