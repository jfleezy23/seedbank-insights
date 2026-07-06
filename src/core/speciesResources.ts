import type { SpeciesResourceLink } from "./types";

function speciesSearchValue(species: string): string {
  return species.trim().replace(/\s+/g, " ");
}

export function buildSpeciesResourceLinks(species: string): SpeciesResourceLink[] {
  const normalized = speciesSearchValue(species);
  const query = encodeURIComponent(normalized);
  const [genus = "", speciesEpithet = "", ...infraspeciesParts] = normalized.split(" ");
  const infraspecies = infraspeciesParts.join(" ");
  const pnwQuery =
    genus && speciesEpithet
      ? `https://www.pnwherbaria.org/data/results.php?Genus=${encodeURIComponent(genus)}&Species=${encodeURIComponent(speciesEpithet)}${infraspecies ? `&Infraspecies=${encodeURIComponent(infraspecies)}` : ""}&IncludeSynonyms=Y`
      : null;
  return [
    {
      label: "GBIF species search",
      source: "GBIF",
      url: `https://www.gbif.org/species/search?q=${query}`,
      purpose: "Taxonomy, synonym checks, global occurrence records, and specimen-backed distribution context."
    },
    ...(pnwQuery
      ? [
          {
            label: "PNW Herbaria specimen search",
            source: "Consortium of Pacific Northwest Herbaria",
            url: pnwQuery,
            purpose: "Pacific Northwest herbarium specimen records and regional distribution for this taxon."
          }
        ]
      : [])
  ];
}
