import { contextBridge, ipcRenderer } from "electron";
import type { DashboardData } from "../../src/core/types";

export interface OpenAiStatus {
  configured: boolean;
  safeStorageAvailable: boolean;
}

export interface SeedBankApi {
  getDashboard(): Promise<DashboardData>;
  selectWorkbook(): Promise<DashboardData | null>;
  importLocalDefaultWorkbook(): Promise<DashboardData | null>;
  getOpenAiStatus(): Promise<OpenAiStatus>;
  saveOpenAiKey(key: string): Promise<OpenAiStatus>;
  clearOpenAiKey(): Promise<OpenAiStatus>;
}

const api: SeedBankApi = {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  selectWorkbook: () => ipcRenderer.invoke("workbook:select"),
  importLocalDefaultWorkbook: () => ipcRenderer.invoke("workbook:importLocalDefault"),
  getOpenAiStatus: () => ipcRenderer.invoke("openai:status"),
  saveOpenAiKey: (key) => ipcRenderer.invoke("openai:saveKey", key),
  clearOpenAiKey: () => ipcRenderer.invoke("openai:clearKey")
};

contextBridge.exposeInMainWorld("seedbank", api);
