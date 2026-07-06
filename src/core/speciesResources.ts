import type { SpeciesResourceLink } from "./types";

function speciesSearchValue(species: string): string {
  return species.trim().replace(/\s+/g, " ");
}

export function buildSpeciesResourceLinks(species: string): SpeciesResourceLink[] {
  const normalized = speciesSearchValue(species);
  const query = encodeURIComponent(normalized);
  const [genus = "", speciesEpithet = ""] = normalized.split(" ");
  const pnwQuery =
    genus && speciesEpithet
      ? `https://www.pnwherbaria.org/data/results.php?Genus=${encodeURIComponent(genus)}&Species=${encodeURIComponent(speciesEpithet)}&IncludeSynonyms=Y`
      : "https://www.pnwherbaria.org/data/search.php";
  return [
    {
      label: "GBIF species search",
      source: "GBIF",
      url: `https://www.gbif.org/species/search?q=${query}`,
      purpose: "Taxonomy, synonym checks, global occurrence records, and specimen-backed distribution context."
    },
    {
      label: "USDA PLANTS database",
      source: "USDA PLANTS",
      url: "https://plants.sc.egov.usda.gov/",
      purpose: "US plant profiles, distribution, symbols, characteristics, images, and references; search by scientific name."
    },
    {
      label: "PNW Herbaria specimen search",
      source: "Consortium of Pacific Northwest Herbaria",
      url: pnwQuery,
      purpose: "Pacific Northwest herbarium specimen records and regional distribution; search by scientific name."
    },
    {
      label: "Burke Flora of the PNW checklist",
      source: "Burke Herbarium",
      url: "https://burkeherbarium.org/pnwflora/",
      purpose: "Flora of the Pacific Northwest taxonomy, accepted names, and synonym context."
    },
    {
      label: "Calflora advanced search",
      source: "Calflora",
      url: "https://www.calflora.org/entry/advanced.html",
      purpose: "California plant traits, native/rare status, observations, and habitat filters; search by scientific name."
    }
  ];
}
