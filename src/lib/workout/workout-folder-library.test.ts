import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFolderTree } from "@/lib/workout/workout-folder-library";

describe("buildFolderTree", () => {
  it("nests folders and sorts workouts by sortOrder", () => {
    const tree = buildFolderTree(
      [
        {
          id: "root",
          name: "Track",
          folderKind: "LIBRARY",
          discipline: "RUN",
          sortOrder: 0,
          parentFolderId: null,
          lastCompletedAt: null,
          lastCompletedTemplate: null,
        },
        {
          id: "prog",
          name: "Tuesday",
          folderKind: "PROGRESSION",
          discipline: "RUN",
          sortOrder: 0,
          parentFolderId: "root",
          lastCompletedAt: null,
          lastCompletedTemplate: null,
        },
      ],
      [
        {
          id: "w2",
          folderId: "prog",
          name: "Week 2",
          discipline: "RUN",
          sortOrder: 1,
        },
        {
          id: "w1",
          folderId: "prog",
          name: "Week 1",
          discipline: "RUN",
          sortOrder: 0,
        },
      ]
    );

    assert.equal(tree.length, 1);
    assert.equal(tree[0]?.children.length, 1);
    assert.equal(tree[0]?.children[0]?.workouts[0]?.name, "Week 1");
    assert.equal(tree[0]?.children[0]?.workouts[1]?.name, "Week 2");
  });
});
