import type { WorkoutNode } from "@/lib/workout/workout-tree";

export function pathKey(path: number[]): string {
  return path.length === 0 ? "root" : path.join(".");
}

export function parsePathKey(key: string): number[] {
  if (!key || key === "root") return [];
  return key.split(".").map((p) => Number(p));
}

export function nodeDragId(path: number[]): string {
  return `node:${pathKey(path)}`;
}

export function parseNodeDragId(id: string | number): number[] | null {
  const s = String(id);
  if (!s.startsWith("node:")) return null;
  const key = s.slice(5);
  const path = parsePathKey(key);
  return path.some((n) => !Number.isInteger(n) || n < 0) ? null : path;
}

export function slotDragId(parentPath: number[], index: number): string {
  return `slot:${pathKey(parentPath)}:${index}`;
}

export function parseSlotDragId(
  id: string | number
): { parentPath: number[]; index: number } | null {
  const s = String(id);
  if (!s.startsWith("slot:")) return null;
  const rest = s.slice(5);
  const colon = rest.lastIndexOf(":");
  if (colon < 0) return null;
  const parentPath = parsePathKey(rest.slice(0, colon));
  const index = Number(rest.slice(colon + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  if (parentPath.some((n) => !Number.isInteger(n) || n < 0)) return null;
  return { parentPath, index };
}

export function pathsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isAncestorPath(ancestor: number[], path: number[]): boolean {
  if (ancestor.length === 0) return false;
  if (path.length < ancestor.length) return false;
  return ancestor.every((v, i) => path[i] === v);
}

function updateAtPath(
  nodes: WorkoutNode[],
  path: number[],
  updater: (node: WorkoutNode) => WorkoutNode
): WorkoutNode[] {
  const [head, ...rest] = path;
  return nodes.map((node, i) => {
    if (i !== head) return node;
    if (rest.length === 0) return updater(node);
    if (node.kind !== "repeat") return node;
    return { ...node, children: updateAtPath(node.children, rest, updater) };
  });
}

export function getNodeAtPath(nodes: WorkoutNode[], path: number[]): WorkoutNode | null {
  if (path.length === 0) return null;
  let list = nodes;
  let node: WorkoutNode | null = null;
  for (let i = 0; i < path.length; i++) {
    node = list[path[i]] ?? null;
    if (!node) return null;
    if (i < path.length - 1) {
      if (node.kind !== "repeat") return null;
      list = node.children;
    }
  }
  return node;
}

function removeNodeAtPath(
  nodes: WorkoutNode[],
  path: number[]
): { nodes: WorkoutNode[]; removed: WorkoutNode | null } {
  if (path.length === 0) return { nodes, removed: null };
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  if (parentPath.length === 0) {
    const removed = nodes[index] ?? null;
    return { nodes: nodes.filter((_, i) => i !== index), removed };
  }

  const parent = getNodeAtPath(nodes, parentPath);
  if (!parent || parent.kind !== "repeat") return { nodes, removed: null };

  const removed = parent.children[index] ?? null;
  const newChildren = parent.children.filter((_, i) => i !== index);
  return {
    nodes: updateAtPath(nodes, parentPath, () => ({ ...parent, children: newChildren })),
    removed,
  };
}

function insertNodeAt(
  nodes: WorkoutNode[],
  parentPath: number[],
  index: number,
  node: WorkoutNode
): WorkoutNode[] {
  if (parentPath.length === 0) {
    const next = [...nodes];
    next.splice(index, 0, node);
    return next;
  }

  const parent = getNodeAtPath(nodes, parentPath);
  if (!parent || parent.kind !== "repeat") return nodes;

  const children = [...parent.children];
  children.splice(index, 0, node);
  return updateAtPath(nodes, parentPath, () => ({ ...parent, children }));
}

export function canMoveWorkoutNode(
  fromPath: number[],
  toParentPath: number[],
  toIndex: number
): boolean {
  if (fromPath.length === 0) return false;
  if (isAncestorPath(fromPath, toParentPath)) return false;

  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  if (pathsEqual(fromParent, toParentPath)) {
    if (fromIndex === toIndex || fromIndex + 1 === toIndex) return false;
  }

  if (toParentPath.length > 0) {
    const targetParent = toParentPath; // parent must be repeat — validated at insert
    if (isAncestorPath(fromPath, targetParent)) return false;
  }

  return true;
}

export function moveWorkoutNode(
  nodes: WorkoutNode[],
  fromPath: number[],
  toParentPath: number[],
  toIndex: number
): WorkoutNode[] {
  if (!canMoveWorkoutNode(fromPath, toParentPath, toIndex)) return nodes;

  if (toParentPath.length > 0) {
    const parent = getNodeAtPath(nodes, toParentPath);
    if (!parent || parent.kind !== "repeat") return nodes;
  }

  const { nodes: without, removed } = removeNodeAtPath(nodes, fromPath);
  if (!removed) return nodes;

  let index = toIndex;
  const fromParent = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1];
  if (pathsEqual(fromParent, toParentPath) && fromIndex < index) {
    index -= 1;
  }

  return insertNodeAt(without, toParentPath, index, removed);
}
