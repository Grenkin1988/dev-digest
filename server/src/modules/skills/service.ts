import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { SkillsRepository } from './repository.js';
import {
  MAX_IMPORT_BYTES,
  MSG_INITIAL,
  STATS_WINDOW_DAYS,
  msgRestored,
} from './constants.js';
import {
  autoVersionMessage,
  computeSkillStats,
  extractSkillFromZip,
  isContentChange,
  isZip,
  nameFromFilename,
  parseSkillMarkdown,
  toSkillDto,
  toSkillVersionDto,
  type SkillStats,
  type SkillVersionDto,
} from './helpers.js';

/**
 * Skills service. A skill is a named block of markdown instructions that agents
 * link (agent_skills) and that is appended to their prompt. CRUD + version
 * history + import preview + stats. Import preview NEVER persists: the caller
 * confirms by POSTing the (possibly edited) result to `create`.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
  message?: string;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  message?: string;
}

export interface ImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Archive entries that were skipped (never decompressed or executed). */
  ignored_files: string[];
  warnings: string[];
  /** A skill with this name already exists in the workspace. */
  name_conflict: boolean;
}

export interface SkillsServiceDeps {
  repo: SkillsRepository;
}

export class SkillsService {
  private readonly repo: SkillsRepository;

  constructor(deps: SkillsServiceDeps) {
    this.repo = deps.repo;
  }

  async list(workspaceId: string): Promise<Skill[]> {
    return (await this.repo.list(workspaceId)).map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const name = input.name.trim();
    await this.assertNameFree(workspaceId, name);
    const row = await this.repo.insert({
      workspaceId,
      name,
      description: input.description.trim(),
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      message: input.message?.trim() || MSG_INITIAL,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const name = patch.name?.trim();
    if (name !== undefined && name !== existing.name) await this.assertNameFree(workspaceId, name, id);
    const bump = isContentChange(existing, patch)
      ? { message: patch.message?.trim() || autoVersionMessage(existing, patch) }
      : null;
    const row = await this.repo.update(
      workspaceId,
      id,
      {
        ...(name !== undefined ? { name } : {}),
        ...(patch.description !== undefined ? { description: patch.description.trim() } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      bump,
    );
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  // ---- versions -----------------------------------------------------------

  /** Newest first; undefined when the skill isn't in this workspace. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return (await this.repo.listVersions(id)).map(toSkillVersionDto);
  }

  /** Restore an old snapshot as a NEW version (history is never rewritten). */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const snap = await this.repo.getVersion(id, version);
    if (!snap) throw new NotFoundError('Skill version not found');
    return this.update(workspaceId, id, {
      body: snap.body,
      ...(snap.description !== null ? { description: snap.description } : {}),
      message: msgRestored(version),
    });
  }

  // ---- stats --------------------------------------------------------------

  private since(): Date {
    return new Date(Date.now() - STATS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }

  /** Per-skill stats for one skill; undefined when it isn't in this workspace. */
  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    return computeSkillStats(id, await this.repo.statsInput(workspaceId, this.since()));
  }

  /** Card-footer stats for every skill, keyed by skill id. */
  async statsAll(workspaceId: string): Promise<Record<string, Pick<SkillStats, 'agents' | 'pull_pct' | 'accept_pct'>>> {
    const [skills, input] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.statsInput(workspaceId, this.since()),
    ]);
    const out: Record<string, Pick<SkillStats, 'agents' | 'pull_pct' | 'accept_pct'>> = {};
    for (const s of skills) {
      const st = computeSkillStats(s.id, input);
      out[s.id] = { agents: st.agents, pull_pct: st.pull_pct, accept_pct: st.accept_pct };
    }
    return out;
  }

  // ---- import -------------------------------------------------------------

  /**
   * Extract the core of a skill from an uploaded .md or .zip. Reads text only;
   * nothing is saved, written to disk or executed.
   */
  async importPreview(workspaceId: string, filename: string, contentBase64: string): Promise<ImportPreview> {
    const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
    if (bytes.length === 0) throw new ValidationError('The uploaded file is empty.');
    if (bytes.length > MAX_IMPORT_BYTES) {
      throw new ValidationError(`The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
    }

    const lowerName = filename.toLowerCase();
    const isMarkdown = /\.(md|markdown|txt)$/.test(lowerName);
    if (!isMarkdown && !lowerName.endsWith('.zip') && !isZip(bytes)) {
      throw new ValidationError('Upload a .md file or a .zip archive.');
    }

    const warnings: string[] = [];
    let text: string;
    let ignored: string[] = [];
    let fallback = nameFromFilename(filename);
    if (!isMarkdown || isZip(bytes)) {
      const zip = extractSkillFromZip(bytes);
      text = zip.text;
      ignored = zip.ignored;
      const dir = zip.source.includes('/') ? zip.source.split('/')[0]! : '';
      if (dir) fallback = dir;
      if (ignored.length > 0) {
        warnings.push(
          `${ignored.length} other file(s) in the archive were ignored. Scripts and other executable parts are never read or run.`,
        );
      }
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }

    const parsed = parseSkillMarkdown(text, fallback);
    if (!parsed.description) warnings.push('No description found — write one as a directive before saving.');
    const conflict = await this.repo.getByName(workspaceId, parsed.name);
    return { ...parsed, ignored_files: ignored, warnings, name_conflict: conflict !== undefined };
  }

  private async assertNameFree(workspaceId: string, name: string, exceptId?: string): Promise<void> {
    const clash = await this.repo.getByName(workspaceId, name);
    if (clash && clash.id !== exceptId) {
      throw new AppError('conflict', `A skill named "${name}" already exists.`, 409);
    }
  }
}
