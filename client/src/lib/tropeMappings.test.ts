import { describe, expect, it } from "vitest";
import { DEFAULT_TROPE_MAPPINGS } from "./tropeMappings";

describe("DEFAULT_TROPE_MAPPINGS", () => {
  it("contains the supported cross-platform worldbuilding vocabulary", () => {
    const abo = DEFAULT_TROPE_MAPPINGS.find((mapping) => mapping.key === "ABO");
    const modern = DEFAULT_TROPE_MAPPINGS.find((mapping) => mapping.key === "現代Paro");

    expect(abo).toMatchObject({ ao3Query: "Alpha/Beta/Omega Dynamics", localQuery: "ABO", cxcQuery: "ABO" });
    expect(modern?.aliases).toContain("現背");
    expect(DEFAULT_TROPE_MAPPINGS).toHaveLength(7);
  });
});
