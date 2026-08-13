import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  libraryHref,
  libraryNewTemplateHref,
  libraryTemplateHref,
  trainingPlanHref,
  trainingPlansHref,
} from "@/lib/plan/library-href";

describe("libraryHref", () => {
  it("returns base library path", () => {
    assert.equal(libraryHref(), "/library");
  });

  it("includes folder query when provided", () => {
    assert.equal(libraryHref({ folderId: "folder-1" }), "/library?folder=folder-1");
  });
});

describe("libraryTemplateHref", () => {
  it("builds edit template path", () => {
    assert.equal(libraryTemplateHref("folder-1", "tpl-1"), "/library/folder-1/tpl-1");
  });
});

describe("libraryNewTemplateHref", () => {
  it("builds new template path", () => {
    assert.equal(libraryNewTemplateHref("folder-1"), "/library/folder-1/new");
  });
});

describe("trainingPlansHref", () => {
  it("builds training plans list path", () => {
    assert.equal(trainingPlansHref(), "/library/training-plans");
  });
});

describe("trainingPlanHref", () => {
  it("builds training plan editor path", () => {
    assert.equal(trainingPlanHref("plan-1"), "/library/training-plans/plan-1");
  });
});
