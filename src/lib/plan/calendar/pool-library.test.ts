import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import { flattenLibraryTemplates, libraryTemplateCount } from "./pool-library";

function folder(
  id: string,
  name: string,
  overrides: Partial<FolderTreeNode> = {}
): FolderTreeNode {
  return {
    id,
    name,
    folderKind: "LIBRARY",
    discipline: null,
    sortOrder: 0,
    parentFolderId: null,
    lastCompletedAt: null,
    lastCompletedTemplate: null,
    children: [],
    workouts: [],
    ...overrides,
  };
}

describe("pool-library", () => {
  it("flattens workouts from nested folders", () => {
    const tree: FolderTreeNode[] = [
      folder("f1", "Intervals", {
        workouts: [
          { id: "t1", name: "Threshold", discipline: "BIKE", sortOrder: 0 },
        ],
        children: [
          folder("f2", "Short", {
            workouts: [{ id: "t2", name: "VO2", discipline: "RUN", sortOrder: 0 }],
          }),
        ],
      }),
    ];

    const flat = flattenLibraryTemplates(tree);
    assert.equal(flat.length, 2);
    assert.equal(flat[0]?.templateId, "t1");
    assert.equal(flat[0]?.folderName, "Intervals");
    assert.equal(flat[1]?.name, "VO2");
    assert.equal(libraryTemplateCount(tree), 2);
  });
});
