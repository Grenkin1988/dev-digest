import type { SkillType } from "@devdigest/shared";
import type { ImportPreview } from "@/lib/hooks/skills";
import { ALLOWED_EXTENSIONS, MAX_FILE_BYTES } from "./constants";

export type FileCheck = "ok" | "tooLarge" | "badType";

/** Client-side guard before uploading (the server re-checks both). */
export function checkFile(file: { name: string; size: number }): FileCheck {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "badType";
  if (file.size > MAX_FILE_BYTES) return "tooLarge";
  return "ok";
}

/** Base64 of raw bytes, in chunks so large files do not overflow the call stack. */
export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export interface ImportForm {
  name: string;
  description: string;
  type: SkillType;
}

export function formFromPreview(p: ImportPreview): ImportForm {
  return { name: p.name, description: p.description, type: p.type };
}

/** Save needs a name and a description; the body came from the file. */
export function canSaveImport(form: ImportForm): boolean {
  return form.name.trim() !== "" && form.description.trim() !== "";
}
