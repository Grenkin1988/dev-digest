/** Largest upload the server accepts (matches MAX_IMPORT_BYTES there). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** File input `accept` list. */
export const ACCEPT = ".md,.markdown,.txt,.zip";

export const ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt", ".zip"] as const;
