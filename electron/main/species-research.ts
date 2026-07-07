import type { DashboardData, ImportResult, SpeciesResearchResult, SpeciesTaxonomyMatch } from "../../src/core/types";
import { generateSpeciesResearch } from "./openai-insights";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type ResearchSynthesizer = typeof generateSpeciesResearch;
const SOURCE_FETCH_TIMEOUT_MS = 10_000;

interface GbifMatchResponse {
  usageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
  confidence?: number;
  matchType?: string;
  kingdom?: string;
  genus?: string;
  family?: string;
}

function normalizeSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function fetchWithTimeout(fetcher: Fetcher, input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function binomial(value: string | null | undefined): string | null {
  const parts = normalizeSpaces(value ?? "").toLowerCase().split(" ").filter(Boolean);
  return parts.length >= 2 ? `${parts[0]} ${parts[1]}` : null;
}

function genusName(value: string): string | null {
  const genus = normalizeSpaces(value).split(" ")[0] ?? "";
  return /^[A-Za-z][A-Za-z-]+$/.test(genus) ? genus : null;
}

function isPlantMatch(match: GbifMatchResponse): boolean {
  return !match.kingdom || match.kingdom.toLowerCase() === "plantae";
}

function isAcceptedSpeciesMatch(species: string, match: GbifMatchResponse): boolean {
  if (!isPlantMatch(match)) return false;
  if (match.rank !== "SPECIES") return false;
  if (!["ACCEPTED", "SYNONYM"].includes(match.status ?? "")) return false;
  if (match.matchType !== "EXACT") return false;
  if (typeof match.confidence === "number" && match.confidence < 90) return false;
  const requestedBinomial = binomial(species);
  const canonicalBinomial = binomial(match.canonicalName ?? match.scientificName);
  const matchedBinomial = binomial(match.scientificName);
  if (match.status === "SYNONYM") {
    return Boolean(requestedBinomial && matchedBinomial && requestedBinomial === matchedBinomial);
  }
  return Boolean(requestedBinomial && canonicalBinomial && requestedBinomial === canonicalBinomial);
}

function isAcceptedGenusMatch(genus: string, match: GbifMatchResponse): boolean {
  if (!isPlantMatch(match)) return false;
  if (match.rank !== "GENUS") return false;
  if (!["ACCEPTED", "SYNONYM"].includes(match.status ?? "")) return false;
  if (match.matchType !== "EXACT") return false;
  if (typeof match.confidence === "number" && match.confidence < 90) return false;
  const requestedGenus = genus.toLowerCase();
  const canonicalGenus = normalizeSpaces(match.canonicalName ?? match.scientificName ?? "").split(" ")[0]?.toLowerCase();
  const matchedGenus = normalizeSpaces(match.scientificName ?? "").split(" ")[0]?.toLowerCase();
  return requestedGenus === canonicalGenus || requestedGenus === matchedGenus;
}

function localSpeciesName(importResult: ImportResult, species: string): string | null {
  const normalized = normalizeSpaces(species).toLowerCase();
  return importResult.trials.find((trial) => trial.species.toLowerCase() === normalized)?.species ?? null;
}

export async function fetchGbifTaxonomyMatch(
  species: string,
  fetcher: Fetcher = fetch
): Promise<SpeciesTaxonomyMatch | null> {
  const url = new URL("https://api.gbif.org/v1/species/match");
  url.searchParams.set("name", normalizeSpaces(species));
  url.searchParams.set("kingdom", "Plantae");
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("strict", "false");
  url.searchParams.set("verbose", "true");

  const response = await fetchWithTimeout(fetcher, url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`GBIF taxonomy lookup failed with HTTP ${response.status}.`);
  const match = (await response.json()) as GbifMatchResponse;
  if (!isAcceptedSpeciesMatch(species, match)) return null;

  return {
    requestedName: normalizeSpaces(species),
    canonicalName: match.canonicalName ?? null,
    scientificName: match.scientificName ?? null,
    rank: match.rank ?? null,
    status: match.status ?? null,
    matchType: match.matchType ?? null,
    confidence: typeof match.confidence === "number" ? match.confidence : null,
    usageKey: typeof match.usageKey === "number" ? match.usageKey : null,
    genus: match.genus ?? null,
    family: match.family ?? null
  };
}

async function fetchGbifGenusTaxonomyMatch(
  species: string,
  fetcher: Fetcher = fetch
): Promise<SpeciesTaxonomyMatch | null> {
  const genus = genusName(species);
  if (!genus) return null;
  const url = new URL("https://api.gbif.org/v1/species/match");
  url.searchParams.set("name", genus);
  url.searchParams.set("kingdom", "Plantae");
  url.searchParams.set("rank", "GENUS");
  url.searchParams.set("strict", "false");
  url.searchParams.set("verbose", "true");

  const response = await fetchWithTimeout(fetcher, url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`GBIF genus lookup failed with HTTP ${response.status}.`);
  const match = (await response.json()) as GbifMatchResponse;
  if (!isAcceptedGenusMatch(genus, match)) return null;

  return {
    requestedName: normalizeSpaces(species),
    canonicalName: match.canonicalName ?? null,
    scientificName: match.scientificName ?? null,
    rank: match.rank ?? null,
    status: match.status ?? null,
    matchType: match.matchType ?? null,
    confidence: typeof match.confidence === "number" ? match.confidence : null,
    usageKey: typeof match.usageKey === "number" ? match.usageKey : null,
    genus: match.genus ?? genus,
    family: match.family ?? null
  };
}

export async function researchSpeciesWithExternalSources({
  apiKey,
  species,
  importResult,
  dashboard,
  fetcher = fetch,
  synthesizer = generateSpeciesResearch
}: {
  apiKey: string;
  species: string;
  importResult: ImportResult;
  dashboard: DashboardData;
  fetcher?: Fetcher;
  synthesizer?: ResearchSynthesizer;
}): Promise<SpeciesResearchResult> {
  const localSpecies = localSpeciesName(importResult, species);
  if (!localSpecies) throw new Error(`No local trial rows found for ${species}.`);
  let taxonomy: SpeciesTaxonomyMatch | null = null;
  try {
    taxonomy = await fetchGbifTaxonomyMatch(localSpecies, fetcher);
    if (!taxonomy) taxonomy = await fetchGbifGenusTaxonomyMatch(localSpecies, fetcher);
  } catch {
    taxonomy = null;
  }
  return synthesizer({
    apiKey,
    species: localSpecies,
    importResult,
    dashboard,
    taxonomy,
    sources: []
  });
}
