const LIBRARY_BASE = "/library";

export function libraryHref(options?: { folderId?: string }): string {
  if (!options?.folderId) return LIBRARY_BASE;
  return `${LIBRARY_BASE}?folder=${encodeURIComponent(options.folderId)}`;
}

export function libraryTemplateHref(folderId: string, templateId: string): string {
  return `${LIBRARY_BASE}/${folderId}/${templateId}`;
}

export function libraryNewTemplateHref(folderId: string): string {
  return `${LIBRARY_BASE}/${folderId}/new`;
}

export function trainingPlansHref(): string {
  return `${LIBRARY_BASE}/training-plans`;
}

export function trainingPlanHref(id: string): string {
  return `${LIBRARY_BASE}/training-plans/${id}`;
}
