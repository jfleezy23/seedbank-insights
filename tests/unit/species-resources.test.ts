import { describe, expect, it } from "vitest";
import { buildSpeciesResourceLinks } from "../../src/core/speciesResources";

describe("species resource links", () => {
  it("builds curated species reference links with deterministic source labels", () => {
    const links = buildSpeciesResourceLinks("Lomatium testii");
    expect(links.map((link) => link.source)).toContain("GBIF");
    expect(links.map((link) => link.source)).toContain("Consortium of Pacific Northwest Herbaria");
    expect(links.find((link) => link.source === "GBIF")?.url).toContain("Lomatium%20testii");
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
});
