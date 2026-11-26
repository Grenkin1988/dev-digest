import type { FeatureModelChoice, LLMProvider, RepoRef } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { ConventionsRepository, InsertConvention } from './repository.js';
import {
  CONFIG_FILE_CANDIDATES,
  CONFIG_MAX_BYTES,
  EXTRACTION_SCHEMA_NAME,
  MAX_CANDIDATES,
  SAMPLE_COUNT,
  SAMPLE_MAX_BYTES,
  SNIPPET_MAX_CHARS,
  SYSTEM_PROMPT_FILE,
} from './constants.js';
import {
  buildUserPrompt,
  capBytes,
  locateSnippet,
  normaliseRule,
  toConventionView,
  type PromptFile,
} from './helpers.js';
import { ConventionExtraction, type ConventionList, type ConventionView, type PatchConventionBody } from './schemas.js';

/** The slice of a repo the service needs (structural, no repository import). */
export interface ConventionsRepoInfo {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface ConventionsServiceDeps {
  repo: ConventionsRepository;
  getRepo: (workspaceId: string, repoId: string) => Promise<ConventionsRepoInfo | undefined>;
  /** Top-ranked source paths (repo-intel). */
  samples: (repoId: string, n: number) => Promise<string[]>;
  /** Read a file from the clone (git port). */
  readFile: (repo: RepoRef, path: string) => Promise<string>;
  /** The workspace's provider+model for the `conventions` feature. */
  model: (workspaceId: string) => Promise<FeatureModelChoice>;
  llm: (provider: FeatureModelChoice['provider']) => Promise<LLMProvider>;
}

/**
 * Conventions application service: one scan = one structured LLM call, then a
 * mechanical grounding check (the evidence must exist in a provided file).
 */
export class ConventionsService {
  constructor(private readonly deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    await this.requireRepo(workspaceId, repoId);
    return this.snapshot(workspaceId, repoId);
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) throw new AppError('not_cloned', 'Repository has not been cloned yet.', 409);
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    // Files are chosen by code, never by the model.
    const configs: PromptFile[] = [];
    for (const path of CONFIG_FILE_CANDIDATES) {
      const content = await this.read(ref, path, CONFIG_MAX_BYTES);
      if (content) configs.push({ path, content });
    }
    const samplePaths = await this.deps.samples(repo.id, SAMPLE_COUNT);
    const samples: PromptFile[] = [];
    for (const path of samplePaths.slice(0, SAMPLE_COUNT)) {
      const content = await this.read(ref, path, SAMPLE_MAX_BYTES);
      if (content) samples.push({ path, content });
    }
    const known = new Map<string, string>();
    for (const f of [...configs, ...samples]) known.set(f.path, f.content);

    const choice = await this.deps.model(workspaceId);
    let data: ConventionExtraction;
    try {
      const provider = await this.deps.llm(choice.provider);
      const system = await renderPrompt(SYSTEM_PROMPT_FILE, { max: String(MAX_CANDIDATES) });
      const res = await provider.completeStructured({
        model: choice.model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: buildUserPrompt(configs, samples) },
        ],
        temperature: 0,
      });
      data = res.data;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('extraction_failed', err instanceof Error ? err.message : String(err), 502);
    }

    // Dedupe against decided (accepted/rejected) rows and within this batch.
    const existing = await this.deps.repo.listByRepo(workspaceId, repo.id);
    const seenRules = new Set<string>();
    const seenSpans = new Set<string>();
    for (const row of existing) {
      if (row.status === 'pending') continue;
      seenRules.add(normaliseRule(row.rule));
      if (row.evidencePath && row.startLine !== null && row.endLine !== null) {
        seenSpans.add(`${row.evidencePath}:${row.startLine}-${row.endLine}`);
      }
    }

    const inserts: InsertConvention[] = [];
    for (const c of data.conventions) {
      const content = known.get(c.evidence_path);
      if (content === undefined) continue; // unknown / unreadable path
      const loc = locateSnippet(content, c.evidence_snippet);
      if (!loc) continue; // snippet not in the file
      const rule = c.rule.trim().slice(0, 1000);
      const key = normaliseRule(rule);
      const span = `${c.evidence_path}:${loc.startLine}-${loc.endLine}`;
      if (!key || seenRules.has(key) || seenSpans.has(span)) continue;
      seenRules.add(key);
      seenSpans.add(span);
      inserts.push({
        rule,
        category: c.category.trim().toLowerCase(),
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet.slice(0, SNIPPET_MAX_CHARS),
        startLine: loc.startLine,
        endLine: loc.endLine,
        confidence: c.confidence,
      });
      if (inserts.length >= MAX_CANDIDATES) break;
    }

    await this.deps.repo.replacePending(repo.id, workspaceId, inserts);
    return this.snapshot(workspaceId, repo.id);
  }

  async patch(workspaceId: string, id: string, body: PatchConventionBody): Promise<ConventionView> {
    const row = await this.deps.repo.update(workspaceId, id, {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.rule !== undefined ? { rule: body.rule } : {}),
    });
    if (!row) throw new NotFoundError('Convention not found');
    return toConventionView(row);
  }

  // ---- internals ----------------------------------------------------------

  private async snapshot(workspaceId: string, repoId: string): Promise<ConventionList> {
    const [rows, last] = await Promise.all([
      this.deps.repo.listByRepo(workspaceId, repoId),
      this.deps.repo.lastScanAt(workspaceId, repoId),
    ]);
    return { conventions: rows.map(toConventionView), last_scan_at: last ? last.toISOString() : null };
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ConventionsRepoInfo> {
    const repo = await this.deps.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** A missing file reads as empty or throws; both mean "not there". */
  private async read(ref: RepoRef, path: string, maxBytes: number): Promise<string | null> {
    try {
      const text = await this.deps.readFile(ref, path);
      return text.trim() ? capBytes(text, maxBytes) : null;
    } catch {
      return null;
    }
  }
}
