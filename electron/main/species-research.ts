import type {
  DashboardData,
  ImportBatchSummary,
  ImportResult,
  SpeciesResearchCacheStatus,
  SpeciesResearchResult,
  SpeciesResearchSource,
  SpeciesTaxonomyMatch
} from "../../src/core/types";
import { discoverSpeciesResearchSources, generateSpeciesResearch } from "./openai-insights";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type ResearchSynthesizer = typeof generateSpeciesResearch;
type ResearchSourceDiscoverer = typeof discoverSpeciesResearchSources;
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

function speciesIdentity(value: string | null | undefined): string {
  return normalizeSpaces(value ?? "").toLowerCase();
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

export async function summarizeSpeciesResearchCacheStatus({
  batch,
  species,
  cacheVersion,
  readCache
}: {
  batch: ImportBatchSummary;
  species: string[];
  cacheVersion: string;
  readCache: (batch: ImportBatchSummary, species: string) => Promise<SpeciesResearchResult | null>;
}): Promise<SpeciesResearchCacheStatus> {
  const speciesByIdentity = new Map<string, string>();
  for (const rawSpecies of species) {
    const normalized = normalizeSpaces(rawSpecies);
    if (!normalized) continue;
    const identity = speciesIdentity(normalized);
    if (!speciesByIdentity.has(identity)) speciesByIdentity.set(identity, normalized);
  }
  const speciesList = [...speciesByIdentity.values()].sort((a, b) => a.localeCompare(b));
  const missingSpecies: string[] = [];
  const generatedAtValues: string[] = [];

  for (const speciesName of speciesList) {
    const cached = await readCache(batch, speciesName);
    if (cached?.status === "ready" && speciesIdentity(cached.species) === speciesIdentity(speciesName)) {
      if (cached.generatedAt) generatedAtValues.push(cached.generatedAt);
    } else {
      missingSpecies.push(speciesName);
    }
  }

  return {
    batchId: batch.id ?? null,
    cacheVersion,
    totalSpecies: speciesList.length,
    researchedSpecies: speciesList.length - missingSpecies.length,
    missingSpecies,
    generatedAtLatest: generatedAtValues.sort()[generatedAtValues.length - 1] ?? null
  };
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
  sourceDiscoverer = discoverSpeciesResearchSources,
  synthesizer = generateSpeciesResearch
}: {
  apiKey: string;
  species: string;
  importResult: ImportResult;
  dashboard: DashboardData;
  fetcher?: Fetcher;
  sourceDiscoverer?: ResearchSourceDiscoverer;
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
  let sources: SpeciesResearchSource[] = [];
  try {
    const family =
      importResult.trials.find((trial) => speciesIdentity(trial.species) === speciesIdentity(localSpecies))?.family ??
      taxonomy?.family ??
      null;
    sources = await sourceDiscoverer({ apiKey, species: localSpecies, taxonomy, family });
  } catch {
    console.warn("OpenAI source discovery was unavailable; continuing with local evidence only.");
    sources = [];
  }
  return synthesizer({
    apiKey,
    species: localSpecies,
    importResult,
    dashboard,
    taxonomy,
    sources
  });
}
