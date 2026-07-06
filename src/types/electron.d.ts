import type { SeedBankApi } from "../../electron/preload/preload";

declare global {
  interface Window {
    seedbank?: SeedBankApi;
  }
}

export {};
