"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { Discipline } from "@prisma/client";
import { Select } from "@/components/ui";
import { libraryHref } from "@/lib/plan/library-href";
import { DISCIPLINE_DISPLAY_LABELS } from "@/lib/plan/discipline-labels";
import type { PoolLibraryTemplate } from "@/lib/plan/calendar/pool-library";
import { poolLibraryDragId } from "@/lib/plan/workout-builder-dnd";
import type { FolderTreeNode } from "@/lib/workout/workout-folder-library";

const DISCIPLINE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All sports" },
  { value: "SWIM", label: "Swim" },
  { value: "BIKE", label: "Bike" },
  { value: "RUN", label: "Run" },
];

function LibraryTemplateCard({ template }: { template: PoolLibraryTemplate }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: poolLibraryDragId(template.templateId),
    data: { type: "pool-library-template", template },
  });

  const disciplineLabel =
    DISCIPLINE_DISPLAY_LABELS[template.discipline] ?? template.discipline;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900 ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{template.name}</p>
        <p className="truncate text-[10px] text-zinc-500">
          {disciplineLabel}
          {template.folderKind === "PROGRESSION" && template.sortOrder != null
            ? ` · #${template.sortOrder + 1}`
            : null}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none pt-0.5 text-zinc-400 hover:text-zinc-600 active:cursor-grabbing"
        aria-label={`Drag ${template.name}`}
        {...listeners}
        {...attributes}
      >
        ⠿
      </button>
    </div>
  );
}

function LibraryFolderNode({
  node,
  depth,
  defaultOpen,
}: {
  node: FolderTreeNode;
  depth: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasWorkouts = node.workouts.length > 0;
  const hasChildren = node.children.length > 0;
  const showHeader = hasWorkouts || hasChildren;

  if (!showHeader) return null;

  return (
    <div style={{ paddingLeft: depth > 0 ? `${depth * 8}px` : undefined }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span className="w-3 text-[10px] text-zinc-400" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="truncate">{node.name}</span>
        {node.folderKind === "PROGRESSION" ? (
          <span className="ml-auto shrink-0 text-[9px] uppercase text-zinc-400">prog</span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-1 space-y-1">
          {node.workouts.map((workout) => (
            <LibraryTemplateCard
              key={workout.id}
              template={{
                templateId: workout.id,
                folderId: node.id,
                folderName: node.name,
                folderKind: node.folderKind,
                name: workout.name,
                discipline: workout.discipline,
                sortOrder: workout.sortOrder,
              }}
            />
          ))}
          {node.children.map((child) => (
            <LibraryFolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              defaultOpen={depth < 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PoolLibrarySection() {
  const [discipline, setDiscipline] = useState<string>("ALL");
  const [tree, setTree] = useState<FolderTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tree: "1" });
      if (discipline !== "ALL") params.set("discipline", discipline);
      const res = await fetch(`/api/plan/workout-folders?${params.toString()}`);
      if (!res.ok) {
        setError("Could not load library");
        return;
      }
      const data = (await res.json()) as { tree: FolderTreeNode[] };
      setTree(data.tree);
    } catch {
      setError("Could not load library");
    } finally {
      setLoading(false);
    }
  }, [discipline]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const templateCount = useMemo(() => {
    let count = 0;
    function walk(nodes: FolderTreeNode[]) {
      for (const node of nodes) {
        count += node.workouts.length;
        walk(node.children);
      }
    }
    walk(tree);
    return count;
  }, [tree]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          className="h-7 min-w-0 flex-1 py-0 text-xs"
          aria-label="Filter library by sport"
        >
          {DISCIPLINE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Link
          href={libraryHref()}
          className="shrink-0 text-[10px] text-sky-600 hover:underline dark:text-sky-400"
        >
          Manage →
        </Link>
      </div>

      {loading ? (
        <p className="text-[11px] text-zinc-500">Loading library…</p>
      ) : error ? (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : templateCount === 0 ? (
        <p className="text-[11px] text-zinc-500">
          No workouts in your library yet.{" "}
          <Link href={libraryHref()} className="text-sky-600 hover:underline dark:text-sky-400">
            Create one
          </Link>
          .
        </p>
      ) : (
        <div className="max-h-52 space-y-1 overflow-y-auto pr-0.5">
          {tree.map((node) => (
            <LibraryFolderNode key={node.id} node={node} depth={0} defaultOpen />
          ))}
        </div>
      )}
    </div>
  );
}
