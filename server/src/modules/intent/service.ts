import type {
  IntentConfidence,
  IntentMode,
  IntentSource,
  MissingContext,
  PrIntentRecord,
  PrIntentResponse,
  RepoRef,
} from '@devdigest/shared';
import { buildIntentPrompt, classifyIntent, type IntentPromptInput } from '@devdigest/reviewer-core';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { estimateTokens } from '../skills/helpers.js';
import {
  BODY_MAX_CHARS,
  DOC_MAX_CHARS,
  INTENT_FEATURE,
  ISSUE_BODY_MAX_CHARS,
  PR_TEMPLATE_CANDIDATES,
  SOURCE_TIMEOUT_MS,
  TEMPLATE_MAX_CHARS,
  TITLE_MAX_CHARS,
} from './constants.js';
import type { IntentDeps, IntentPullRef } from './deps.js';
import {
  addedLinesExcerpt,
  capText,
  computeConfidence,
  extractReferences,
  filterOffReason,
  formatIntentLogLine,
  isEffectivelyEmptyBody,
  isStale,
  issueDisplayRef,
  issueFailureReason,
  prepareCommits,
  prepareFiles,
  renderIntentSection,
  safeErrorSummary,
  shouldFilterByScope,
  type IntentLogEvent,
} from './helpers.js';
import { RepoFileError } from './ports.js';

/** What the review executor gets for one PR (never throws; absent on a hard miss). */
export interface ForReviewResult {
  /** Present when an intent exists to inject; absent when derivation failed. */
  intent?: { text: string; filter: boolean };
  /** `intent: …` live-log line (kinds, refs and counts only). */
  logLine: string;
  /** Why the scope filter is off (undefined when it is on or there is no intent). */
  filterOffReason?: string;
  outcome: 'reused' | 'derived' | 'stale' | 'unavailable';
}

interface DeriveResult {
  record: PrIntentRecord;
  headSha: string;
  logEvent: IntentLogEvent;
}

/** Reject after `ms`; the underlying work is abandoned (its result is ignored). */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Intent application service. `derive` collects the sources (all capped, none
 * fetched from arbitrary URLs), runs the quarantined classifier once, computes
 * confidence in code and stores the result. A per-PR single-flight stops a
 * review and a concurrent Re-derive from paying twice (same pattern as
 * `PullsService.detailRefreshedAt`).
 */
export class IntentService {
  private readonly inflight = new Map<string, Promise<DeriveResult>>();

  constructor(private readonly deps: IntentDeps) {}

  /** Stored intent + current head + staleness. No LLM call. */
  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const record = (await this.deps.repo.getForPull(prId)) ?? null;
    return this.toResponse(record, pull.headSha);
  }

  /** Re-derive now (explicit user action). Joins an in-flight derive for the same PR. */
  async derive(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const res = await this.deriveOnce(workspaceId, pull);
    return this.toResponse(res.record, res.headSha);
  }

  /**
   * Intent for a review run: reuse a stored one (stale → context only), or
   * derive when absent. Best-effort: a failure never fails the review.
   */
  async forReview(workspaceId: string, prId: string): Promise<ForReviewResult | undefined> {
    try {
      const pull = await this.deps.getPullRef(workspaceId, prId);
      if (!pull) return undefined;
      const existing = await this.deps.repo.getForPull(prId);
      let record: PrIntentRecord;
      let outcome: 'reused' | 'derived' | 'stale';
      let logEvent: IntentLogEvent;
      let headSha = pull.headSha;
      if (existing) {
        record = existing;
        const stale = isStale(existing.head_sha, pull.headSha);
        outcome = stale ? 'stale' : 'reused';
        logEvent = stale
          ? { kind: 'stale', derivedSha: existing.head_sha, headSha: pull.headSha }
          : {
              kind: 'reused',
              derivedSha: existing.head_sha,
              confidence: existing.confidence ?? 'low',
              inScopeCount: existing.in_scope.length,
              outOfScopeCount: existing.out_of_scope.length,
            };
      } else {
        const res = await this.deriveOnce(workspaceId, pull);
        record = res.record;
        headSha = res.headSha;
        outcome = 'derived';
        logEvent = res.logEvent;
      }
      const mode: IntentMode = record.mode ?? 'author_description';
      const confidence: IntentConfidence = record.confidence ?? 'low';
      const stale = isStale(record.head_sha, headSha);
      const decision = { mode, confidence, stale };
      const filter = shouldFilterByScope(decision);
      return {
        intent: {
          text: renderIntentSection({
            mode,
            confidence,
            summary: record.intent,
            inScope: record.in_scope,
            outOfScope: record.out_of_scope,
            stale,
            derivedSha: record.head_sha,
          }),
          filter,
        },
        logLine: formatIntentLogLine(logEvent),
        ...(filter ? {} : { filterOffReason: filterOffReason(decision) }),
        outcome,
      };
    } catch (err) {
      // Provider/schema errors can embed fragments of model output: log only a
      // short single-line summary, never the full message.
      const message = safeErrorSummary(err);
      this.deps.log.warn({ prId, err: message }, 'intent: unavailable');
      return {
        logLine: formatIntentLogLine({ kind: 'unavailable', message }),
        outcome: 'unavailable',
      };
    }
  }

  // ---- internals ------------------------------------------------------------

  private async requirePull(workspaceId: string, prId: string): Promise<IntentPullRef> {
    const pull = await this.deps.getPullRef(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  private toResponse(record: PrIntentRecord | null, currentHeadSha: string): PrIntentResponse {
    return {
      intent: record,
      current_head_sha: currentHeadSha,
      stale: record ? isStale(record.head_sha, currentHeadSha) : false,
    };
  }

  private deriveOnce(workspaceId: string, pull: IntentPullRef): Promise<DeriveResult> {
    const running = this.inflight.get(pull.id);
    if (running) return running;
    const p = this.doDerive(workspaceId, pull).finally(() => this.inflight.delete(pull.id));
    this.inflight.set(pull.id, p);
    return p;
  }

  private async doDerive(workspaceId: string, pull: IntentPullRef): Promise<DeriveResult> {
    const started = this.deps.now();
    const detail = await this.deps.pullDetail(workspaceId, pull.id);
    const headSha = detail.head_sha;
    const repoRef: RepoRef = { owner: pull.repo.owner, name: pull.repo.name };
    const missing: MissingContext[] = [];
    const sources: IntentSource[] = [];

    // The clone may lack the head commit; best-effort, never fatal.
    try {
      await withTimeout(this.deps.fetchPullHead(repoRef, pull.number), SOURCE_TIMEOUT_MS);
    } catch {
      /* offline / no token: reads below record `not_present_at_head` */
    }

    // ---- mode: real description vs. changes only ---------------------------
    const body = detail.body ?? null;
    const template = body && body.trim().length > 0 ? await this.readTemplate(repoRef, headSha) : null;
    const mode: IntentMode = isEffectivelyEmptyBody(body, template)
      ? 'inferred_from_changes'
      : 'author_description';

    const title = capText(detail.title, TITLE_MAX_CHARS);
    sources.push({ kind: 'title', ref: 'title', chars: title.text.length, truncated: title.truncated });
    const input: IntentPromptInput = {
      mode,
      title: title.text,
      issues: [],
      docs: [],
      commits: [],
      files: [],
    };

    let contextFetched = 0;
    if (mode === 'author_description' && body) {
      const b = capText(body, BODY_MAX_CHARS);
      input.body = b.text;
      sources.push({ kind: 'body', ref: 'body', chars: b.text.length, truncated: b.truncated });

      const refs = extractReferences(detail.title, body, repoRef, pull.number);
      missing.push(...refs.missing);
      await this.fetchIssues(refs.issues, repoRef, input, sources, missing);
      await this.fetchDocs(refs.docs, repoRef, headSha, input, sources, missing);
      contextFetched = input.issues.length + input.docs.length;
    }

    // ---- changes: files, hunk headers, commits -----------------------------
    const prepared = prepareFiles(detail.files);
    input.files = prepared.files;
    input.moreFiles = prepared.moreFiles;
    sources.push({
      kind: 'files',
      ref: String(detail.files.length),
      chars: prepared.files.reduce((n, f) => n + f.path.length, 0),
      truncated: prepared.moreFiles > 0,
    });
    sources.push({
      kind: 'hunks',
      ref: String(prepared.hunkCount),
      chars: prepared.files.reduce((n, f) => n + f.hunks.reduce((m, h) => m + h.length, 0), 0),
      truncated: false,
    });
    const commits = prepareCommits(detail.commits);
    input.commits = commits;
    sources.push({
      kind: 'commits',
      ref: String(commits.length),
      chars: commits.reduce((n, c) => n + c.subject.length + (c.body?.length ?? 0), 0),
      truncated: false,
    });
    if (mode === 'inferred_from_changes') {
      const excerpt = addedLinesExcerpt(detail.files);
      if (excerpt.lines.length > 0) {
        input.addedLines = excerpt.lines;
        sources.push({
          kind: 'added_lines',
          ref: `${excerpt.lines.length} lines`,
          chars: excerpt.lines.reduce((n, l) => n + l.length, 0),
          truncated: excerpt.truncated,
        });
      }
    }

    // ---- one classifier call -------------------------------------------------
    const prompt = buildIntentPrompt(input);
    const tokensEst = estimateTokens(prompt.map((m) => m.content).join('\n'));
    const choice = await this.deps.model(workspaceId);
    const llm = await this.deps.llm(choice.provider);
    let res: Awaited<ReturnType<typeof classifyIntent>>;
    try {
      res = await classifyIntent({ llm, model: choice.model, prompt, sessionId: `intent:${pull.id}` });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(
        `Intent model call failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const confidence = computeConfidence({
      mode,
      contextFetched,
      commitSubjects: commits.map((c) => c.subject),
      missingCount: missing.length,
      inScopeCount: res.output.in_scope.length,
    });

    const record = await this.deps.repo.upsertDerived(pull.id, {
      intent: res.output.summary,
      inScope: res.output.in_scope,
      outOfScope: res.output.out_of_scope,
      mode,
      confidence,
      sources,
      missingContext: missing,
      provider: choice.provider,
      model: choice.model,
      headSha,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
    });

    const logEvent: IntentLogEvent = {
      kind: 'derived',
      provider: choice.provider,
      model: choice.model,
      mode,
      confidence,
      sources,
      missingCount: missing.length,
      tokensEst,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
    };
    // Structured log: kinds, refs and sizes only (never body / issue / doc / commit text).
    this.deps.log.info(
      {
        prId: pull.id,
        feature: INTENT_FEATURE,
        headSha,
        mode,
        confidence,
        provider: choice.provider,
        model: choice.model,
        sources,
        missing,
        tokensEst,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
        durationMs: this.deps.now() - started,
      },
      'intent: derived',
    );
    return { record, headSha, logEvent };
  }

  /** First PR template found at the head; a missing template is not an error. */
  private async readTemplate(repo: RepoRef, headSha: string): Promise<string | null> {
    for (const path of PR_TEMPLATE_CANDIDATES) {
      try {
        const text = await withTimeout(this.deps.repoFiles.read(repo, headSha, path), SOURCE_TIMEOUT_MS);
        return text.slice(0, TEMPLATE_MAX_CHARS);
      } catch {
        /* not present at this path */
      }
    }
    return null;
  }

  private async fetchIssues(
    refs: ReturnType<typeof extractReferences>['issues'],
    repoRef: RepoRef,
    input: IntentPromptInput,
    sources: IntentSource[],
    missing: MissingContext[],
  ): Promise<void> {
    if (refs.length === 0) return;
    let gh: Awaited<ReturnType<IntentDeps['github']>>;
    try {
      gh = await this.deps.github();
    } catch {
      for (const r of refs) missing.push({ ref: issueDisplayRef(r, repoRef), reason: 'no_token' });
      return;
    }
    for (const r of refs) {
      const display = issueDisplayRef(r, repoRef);
      try {
        const issue = await withTimeout(
          gh.getIssue({ owner: r.owner, name: r.name }, r.number),
          SOURCE_TIMEOUT_MS,
        );
        const b = capText(issue.body ?? '', ISSUE_BODY_MAX_CHARS);
        const t = capText(issue.title, TITLE_MAX_CHARS);
        input.issues.push({ number: r.number, title: t.text, body: b.text });
        sources.push({
          kind: 'issue',
          ref: display,
          chars: t.text.length + b.text.length,
          truncated: b.truncated || t.truncated,
        });
      } catch (err) {
        missing.push({ ref: display, reason: issueFailureReason(err) });
      }
    }
  }

  private async fetchDocs(
    paths: string[],
    repoRef: RepoRef,
    headSha: string,
    input: IntentPromptInput,
    sources: IntentSource[],
    missing: MissingContext[],
  ): Promise<void> {
    for (const path of paths) {
      try {
        const text = await withTimeout(this.deps.repoFiles.read(repoRef, headSha, path), SOURCE_TIMEOUT_MS);
        const d = capText(text, DOC_MAX_CHARS);
        input.docs.push({ path, content: d.text });
        sources.push({ kind: 'doc', ref: path, chars: d.text.length, truncated: d.truncated });
      } catch (err) {
        missing.push({ ref: path, reason: docFailureReason(err) });
      }
    }
  }
}

function docFailureReason(err: unknown): MissingContext['reason'] {
  if (err instanceof RepoFileError) {
    switch (err.code) {
      case 'too_large':
        return 'too_large';
      case 'timeout':
        return 'timeout';
      case 'invalid':
        return 'path_not_allowlisted';
      case 'not_found':
        return 'not_present_at_head';
    }
  }
  return err instanceof Error && /timed out/i.test(err.message) ? 'timeout' : 'not_present_at_head';
}
