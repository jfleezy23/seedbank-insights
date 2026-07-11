import { describe, expect, it } from "vitest";
import { humanizeErrorMessage, USER_CANCELLED_REQUEST_MESSAGE } from "../../src/core/errors";

describe("error presentation", () => {
  it("turns Electron IPC cancellation wrappers into plain user feedback", () => {
    expect(
      humanizeErrorMessage(
        new Error("Error invoking remote method 'openai:researchSpecies': Error: Request cancelled by user."),
        "Fallback"
      )
    ).toBe(USER_CANCELLED_REQUEST_MESSAGE);
  });

  it("strips Electron IPC wrappers from actionable messages", () => {
    expect(
      humanizeErrorMessage(
        new Error("Error invoking remote method 'dataset:relink': Error: Workbook source was not found."),
        "Fallback"
      )
    ).toBe("Workbook source was not found.");
  });
});
