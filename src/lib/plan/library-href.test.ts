import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  libraryHref,
  libraryNewTemplateHref,
  libraryTemplateHref,
} from "@/lib/plan/library-href";

describe("libraryHref", () => {
  it("returns base library path", () => {
    assert.equal(libraryHref(), "/plan/library");
  });

  it("includes folder query when provided", () => {
    assert.equal(libraryHref({ folderId: "folder-1" }), "/plan/library?folder=folder-1");
  });
});

describe("libraryTemplateHref", () => {
  it("builds edit template path", () => {
    assert.equal(libraryTemplateHref("folder-1", "tpl-1"), "/plan/library/folder-1/tpl-1");
  });
});

describe("libraryNewTemplateHref", () => {
  it("builds new template path", () => {
    assert.equal(libraryNewTemplateHref("folder-1"), "/plan/library/folder-1/new");
  });
});
