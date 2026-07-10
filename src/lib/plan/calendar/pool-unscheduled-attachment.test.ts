import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  unscheduledAttachmentDiscipline,
  unscheduledAttachmentLabel,
  unscheduledDisciplinesMatch,
  type UnscheduledAttachment,
} from "./pool-unscheduled-attachment";

describe("pool-unscheduled-attachment", () => {
  it("reads label and discipline from library attachment", () => {
    const attachment: UnscheduledAttachment = {
      kind: "library",
      template: {
        templateId: "t1",
        folderId: "f1",
        folderName: "Intervals",
        folderKind: "LIBRARY",
        name: "Threshold",
        discipline: "BIKE",
        sortOrder: 0,
      },
    };
    assert.equal(unscheduledAttachmentLabel(attachment), "Threshold");
    assert.equal(unscheduledAttachmentDiscipline(attachment), "BIKE");
    assert.equal(unscheduledDisciplinesMatch("BIKE", attachment), true);
    assert.equal(unscheduledDisciplinesMatch("RUN", attachment), false);
  });
});
