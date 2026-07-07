import { describe, expect, it } from "vitest";
import { buildSpeciesResourceLinks, isSpeciesSpecificResourceUrl } from "../../src/core/speciesResources";

describe("species resource links", () => {
  it("keeps only taxon-specific visible reference links", () => {
    const links = buildSpeciesResourceLinks("Lomatium testii");
    expect(links.map((link) => link.source)).toContain("Consortium of Pacific Northwest Herbaria");
    expect(links.map((link) => link.source)).not.toContain("GBIF");
    expect(links.find((link) => link.source === "Consortium of Pacific Northwest Herbaria")?.url).toContain(
      "Genus=Lomatium&Species=testii"
    );
    expect(links.map((link) => link.source)).not.toContain("USDA PLANTS");
    expect(links.map((link) => link.source)).not.toContain("Burke Herbarium");
    expect(links.map((link) => link.source)).not.toContain("Calflora");
  });

  it("keeps infraspecies terms in specific PNW Herbaria searches", () => {
    const pnwLink = buildSpeciesResourceLinks("Lomatium grayi var. depauperatum").find(
      (link) => link.source === "Consortium of Pacific Northwest Herbaria"
    );
    expect(pnwLink?.url).toContain("Genus=Lomatium&Species=grayi");
    expect(pnwLink?.url).toContain("Infraspecies=var.%20depauperatum");
  });

  it("rejects generic resource URLs that do not include the taxon", () => {
    expect(isSpeciesSpecificResourceUrl("Phacelia heterophylla", "https://www.gbif.org/species/search")).toBe(false);
    expect(
      isSpeciesSpecificResourceUrl(
        "Phacelia heterophylla",
        "https://www.pnwherbaria.org/data/results.php?Genus=Phacelia&Species=heterophylla"
      )
    ).toBe(true);
  });
});
