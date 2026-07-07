import type { SpeciesResourceLink } from "./types";

function speciesSearchValue(species: string): string {
  return species.trim().replace(/\s+/g, " ");
}

function speciesParts(species: string): { normalized: string; genus: string; speciesEpithet: string; infraspecies: string } {
  const normalized = speciesSearchValue(species);
  const [genus = "", speciesEpithet = "", ...infraspeciesParts] = normalized.split(" ");
  return {
    normalized,
    genus,
    speciesEpithet,
    infraspecies: infraspeciesParts.join(" ")
  };
}

export function isSpeciesSpecificResourceUrl(species: string, url: string): boolean {
  const { normalized, genus, speciesEpithet } = speciesParts(species);
  if (!genus || !speciesEpithet) return false;
  const lowerUrl = decodeURIComponent(url).toLowerCase();
  const normalizedLower = normalized.toLowerCase();
  const genusLower = genus.toLowerCase();
  const speciesLower = speciesEpithet.toLowerCase();
  return lowerUrl.includes(normalizedLower) || (lowerUrl.includes(genusLower) && lowerUrl.includes(speciesLower));
}

export function buildSpeciesResourceLinks(species: string): SpeciesResourceLink[] {
  const { genus, speciesEpithet, infraspecies } = speciesParts(species);
  const pnwQuery =
    genus && speciesEpithet
      ? `https://www.pnwherbaria.org/data/results.php?Genus=${encodeURIComponent(genus)}&Species=${encodeURIComponent(speciesEpithet)}${infraspecies ? `&Infraspecies=${encodeURIComponent(infraspecies)}` : ""}&IncludeSynonyms=Y`
      : null;
  const links: SpeciesResourceLink[] = pnwQuery
    ? [
        {
          label: "PNW Herbaria specimen search",
          source: "Consortium of Pacific Northwest Herbaria",
          url: pnwQuery,
          purpose: "Pacific Northwest herbarium specimen records and regional distribution for this taxon."
        }
      ]
    : [];
  return links.filter((link) => isSpeciesSpecificResourceUrl(species, link.url));
}
