export function libraryHref(options?: { folderId?: string }): string {
  const base = "/plan/library";
  if (!options?.folderId) return base;
  return `${base}?folder=${encodeURIComponent(options.folderId)}`;
}

export function libraryTemplateHref(folderId: string, templateId: string): string {
  return `/plan/library/${folderId}/${templateId}`;
}

export function libraryNewTemplateHref(folderId: string): string {
  return `/plan/library/${folderId}/new`;
}
