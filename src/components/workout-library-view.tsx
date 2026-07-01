"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Discipline, WorkoutFolderKind } from "@prisma/client";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";
import { libraryNewTemplateHref, libraryTemplateHref } from "@/lib/plan/library-href";

type WorkoutLibraryViewProps = {
  initialTree: FolderTreeNode[];
};

function FolderTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node.id);
          if (node.children.length > 0) setOpen((v) => !v);
        }}
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm ${
          isSelected
            ? "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
            : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.children.length > 0 ? (
          <span className="w-3 text-[10px] text-zinc-400">{open ? "▾" : "▸"}</span>
        ) : (
          <span className="w-3" />
        )}
        <span className="truncate font-medium">{node.name}</span>
        <span className="ml-auto text-[10px] uppercase text-zinc-400">
          {node.folderKind === "PROGRESSION" ? "prog" : "lib"}
        </span>
      </button>
      {open
        ? node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}

function findNode(tree: FolderTreeNode[], id: string): FolderTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

export function WorkoutLibraryView({ initialTree }: WorkoutLibraryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tree, setTree] = useState(initialTree);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("folder") ?? initialTree[0]?.id ?? null
  );
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderKind, setNewFolderKind] = useState<WorkoutFolderKind>("LIBRARY");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = selectedId ? findNode(tree, selectedId) : null;

  const reloadTree = useCallback(async () => {
    const res = await fetch("/api/plan/workout-folders?tree=1");
    if (!res.ok) return;
    const data = (await res.json()) as { tree: FolderTreeNode[] };
    setTree(data.tree);
  }, []);

  useEffect(() => {
    const folder = searchParams.get("folder");
    if (folder) setSelectedId(folder);
  }, [searchParams]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/plan/workout-folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        parentFolderId: selected?.folderKind === "LIBRARY" ? selectedId : null,
        folderKind: newFolderKind,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" ? data.error : "Could not create folder");
      return;
    }
    setNewFolderName("");
    await reloadTree();
    router.refresh();
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete this empty folder?")) return;
    setBusy(true);
    const res = await fetch(`/api/plan/workout-folders/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(typeof data?.error === "string" ? data.error : "Could not delete folder");
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await reloadTree();
    router.refresh();
  }

  async function deleteWorkout(folderId: string, templateId: string) {
    if (!confirm("Delete this workout?")) return;
    setBusy(true);
    const res = await fetch(
      `/api/plan/workout-folders/${folderId}/workouts/${templateId}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) {
      alert("Could not delete workout");
      return;
    }
    await reloadTree();
    router.refresh();
  }

  async function moveWorkout(folderId: string, templateId: string, direction: -1 | 1) {
    if (!selected) return;
    const idx = selected.workouts.findIndex((w) => w.id === templateId);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= selected.workouts.length) return;
    const orderedIds = selected.workouts.map((w) => w.id);
    const [moved] = orderedIds.splice(idx, 1);
    orderedIds.splice(next, 0, moved!);
    setBusy(true);
    await fetch(`/api/plan/workout-folders/${folderId}/workouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    setBusy(false);
    await reloadTree();
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <section className="h-fit rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Folders
        </h2>
        <div className="max-h-[60vh] space-y-0.5 overflow-y-auto">
          {tree.length === 0 ? (
            <p className="text-sm text-zinc-500">No folders yet.</p>
          ) : (
            tree.map((node) => (
              <FolderTreeItem
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))
          )}
        </div>
        <div className="mt-4 space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <Label>New folder</Label>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
          />
          <Select
            value={newFolderKind}
            onChange={(e) => setNewFolderKind(e.target.value as WorkoutFolderKind)}
          >
            <option value="LIBRARY">Library</option>
            <option value="PROGRESSION">Progression</option>
          </Select>
          <Button type="button" disabled={busy} onClick={() => void createFolder()}>
            Add folder
          </Button>
        </div>
      </section>

      <div className="space-y-4">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {!selected ? (
          <Card>
            <p className="text-sm text-zinc-500">Select a folder to view workouts.</p>
          </Card>
        ) : (
          <Card title={selected.name}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Link href={libraryNewTemplateHref(selected.id)}>
                <Button type="button">Add workout</Button>
              </Link>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void deleteFolder(selected.id)}
              >
                Delete folder
              </Button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              {selected.folderKind === "PROGRESSION" ? "Progression" : "Library"}
              {selected.discipline ? ` · ${selected.discipline}` : ""}
              {selected.lastCompletedTemplate
                ? ` · Last done: ${selected.lastCompletedTemplate.name}`
                : ""}
            </p>
            {selected.workouts.length === 0 ? (
              <p className="text-sm text-zinc-500">No workouts in this folder.</p>
            ) : (
              <ul className="space-y-2">
                {selected.workouts.map((workout, index) => (
                  <li
                    key={workout.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                  >
                    <div>
                      <p className="font-medium">
                        {selected.folderKind === "PROGRESSION" ? `${index + 1}. ` : ""}
                        {workout.name}
                      </p>
                      <p className="text-xs text-zinc-500">{workout.discipline}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selected.folderKind === "PROGRESSION" ? (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1"
                            disabled={busy || index === 0}
                            onClick={() => void moveWorkout(selected.id, workout.id, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            className="px-2 py-1"
                            disabled={busy || index === selected.workouts.length - 1}
                            onClick={() => void moveWorkout(selected.id, workout.id, 1)}
                          >
                            ↓
                          </Button>
                        </>
                      ) : null}
                      <Link href={libraryTemplateHref(selected.id, workout.id)}>
                        <Button type="button" variant="secondary" className="px-2 py-1">
                          Edit
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-2 py-1"
                        disabled={busy}
                        onClick={() => void deleteWorkout(selected.id, workout.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {selected.folderKind === "LIBRARY" && selected.children.length > 0 ? (
              <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Subfolders</p>
                <ul className="space-y-1 text-sm">
                  {selected.children.map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        className="text-sky-600 hover:underline dark:text-sky-400"
                        onClick={() => setSelectedId(child.id)}
                      >
                        {child.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  );
}
