import type { CodeIndex, CodeSymbol, RepoRef } from '@devdigest/shared';
import { extractEndpoints } from '../../adapters/codeindex/extract.js';
import { readContainedFile } from '../../platform/contained-read.js';
import type { RepoIntelRepository, FullSymbolRow } from './repository.js';
import type { BlastCallerRow, BlastChangedSymbol, BlastResult } from './types.js';
import { MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * Blast radius: who calls the symbols a diff changes, and which HTTP endpoints
 * that reaches. Served from the persistent index when it's built and repo-intel
 * is enabled; otherwise a best-effort ripgrep pass over the clone (always
 * tagged `degraded: true`).
 */
export class BlastRadius {
  constructor(
    private readonly repo: RepoIntelRepository,
    private readonly codeIndex: CodeIndex,
    /** Use the persistent index (REPO_INTEL_ENABLED). The ripgrep path works either way. */
    private readonly usePersistentIndex: boolean,
  ) {}

  /**
   * Best-effort blast over the injected `codeIndex` — a faithful port of
   * blast/service.ts mapped into the facade's `BlastResult` shape, then
   * tagged `degraded: true` so consumers can branch.
   *
   * Why "always degraded" in T1: there's no persistent rank/decl_file yet, so
   * every caller gets `rank: 0` and HTTP impact is detected by re-reading the
   * clone (not the index). T2 promotes this path to the persistent layer.
   */
  async get(repoId: string, changedFiles: string[]): Promise<BlastResult> {
    // T3: serve from the persistent index when it's built. Falls through to the
    // ripgrep best-effort below when the flag is off / index is absent.
    if (this.usePersistentIndex && changedFiles.length > 0) {
      const persistent = await this.tryPersistentBlast(repoId, changedFiles);
      if (persistent) return persistent;
    }

    const empty: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };

    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath || changedFiles.length === 0) return empty;

    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const changedSet = new Set(changedFiles);

    let allSymbols: CodeSymbol[];
    try {
      allSymbols = await this.codeIndex.symbols(ref);
    } catch {
      return empty;
    }

    // changed symbols = declared in any changed file (dedup by name+file).
    const changedSymbols: BlastChangedSymbol[] = [];
    const seen = new Set<string>();
    for (const s of allSymbols) {
      if (!changedSet.has(s.path)) continue;
      const key = `${s.name}:${s.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
    }

    const callerRows: BlastCallerRow[] = [];
    const endpoints = new Set<string>();
    const callerSeen = new Set<string>();

    for (const sym of changedSymbols) {
      let refs;
      try {
        refs = await this.codeIndex.references(ref, sym.name);
      } catch {
        continue;
      }
      const callerFiles = new Set<string>();
      for (const r of refs) {
        if (r.fromPath === sym.file) continue; // skip the decl's own file
        const callerName = enclosingSymbolName(allSymbols, r.fromPath, r.line);
        const key = `${r.fromPath}|${callerName}|${sym.name}`;
        if (callerSeen.has(key)) continue;
        callerSeen.add(key);
        callerRows.push({
          file: r.fromPath,
          symbol: callerName,
          viaSymbol: sym.name,
          line: r.line,
          rank: 0, // ripgrep/degraded path has no persistent rank
        });
        callerFiles.add(r.fromPath);
      }

      // Detect HTTP routes reachable from any caller file (best-effort, just
      // like the legacy blast service).
      for (const file of callerFiles) {
        const content = await readClone(repo.clonePath, file);
        if (!content) continue;
        for (const e of extractEndpoints(content)) endpoints.add(e);
      }
    }

    return {
      changedSymbols,
      callers: callerRows,
      impactedEndpoints: [...endpoints],
      degraded: true,
      reason: 'no_data',
    };
  }

  /**
   * Persistent-index blast (T3): reads symbols / resolved references / file_rank
   * / file_facts straight from Postgres — NO clone parsing on the hot path.
   * Returns `null` when the index isn't usable (caller falls back to ripgrep).
   *
   * Callers are PRECISE: only references whose `decl_file` resolved to a changed
   * file count. That favours precision over recall — an ambiguous
   * (NULL decl_file) reference is not asserted as a caller.
   */
  private async tryPersistentBlast(
    repoId: string,
    changedFiles: string[],
  ): Promise<BlastResult | null> {
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || (state.status !== 'full' && state.status !== 'partial')) return null;

    // Changed symbols = declared in a changed file. Skip the qualified
    // `Class.method` dual-emit (the bare form already covers the name).
    const declRows = await this.repo.getSymbolRows(repoId, changedFiles);
    const changedSymbols: BlastChangedSymbol[] = [];
    const nameSet = new Set<string>();
    const seenSym = new Set<string>();
    for (const s of declRows) {
      if (s.name.includes('.')) continue;
      const key = `${s.name}:${s.path}`;
      if (!seenSym.has(key)) {
        seenSym.add(key);
        changedSymbols.push({ file: s.path, name: s.name, kind: s.kind });
      }
      nameSet.add(s.name);
    }
    if (nameSet.size === 0) {
      return { changedSymbols, callers: [], impactedEndpoints: [], degraded: false };
    }

    // Resolved cross-file callers.
    const callerRows = await this.repo.getResolvedCallers(repoId, changedFiles, [...nameSet]);
    const callerFiles = [...new Set(callerRows.map((c) => c.fromPath))];

    // Enclosing caller symbol from the callers' persistent symbol rows.
    const callerSymRows = await this.repo.getSymbolRows(repoId, callerFiles);
    const symsByFile = new Map<string, FullSymbolRow[]>();
    for (const s of callerSymRows) {
      const arr = symsByFile.get(s.path);
      if (arr) arr.push(s);
      else symsByFile.set(s.path, [s]);
    }

    const callers: BlastCallerRow[] = [];
    const seenCaller = new Set<string>();
    for (const c of callerRows) {
      const enclosing =
        enclosingFromRows(symsByFile.get(c.fromPath) ?? [], c.line) ??
        c.fromPath.split('/').pop() ??
        c.fromPath;
      const key = `${c.fromPath}|${enclosing}|${c.toSymbol}`;
      if (seenCaller.has(key)) continue;
      seenCaller.add(key);
      callers.push({
        file: c.fromPath,
        symbol: enclosing,
        viaSymbol: c.toSymbol,
        line: c.line,
        rank: c.rank,
      });
    }
    callers.sort((a, b) => b.rank - a.rank);

    // Precomputed facts per caller file (endpoints + crons), so consumers can
    // attribute them to the changed symbol whose callers live in that file.
    const facts = await this.repo.getFileFacts(repoId, callerFiles);
    const endpoints = new Set<string>();
    const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
    for (const f of facts) {
      factsByFile[f.filePath] = { endpoints: f.endpoints, crons: f.crons };
      for (const e of f.endpoints) endpoints.add(e);
    }

    return {
      changedSymbols,
      callers: callers.slice(0, MAX_CALLERS_PER_SYMBOL),
      impactedEndpoints: [...endpoints],
      factsByFile,
      degraded: false,
    };
  }
}

/** Enclosing top-level (bare-name) symbol for a line, from persistent rows. */
function enclosingFromRows(rows: FullSymbolRow[], line: number): string | null {
  const hit = rows
    .filter((s) => !s.name.includes('.') && (s.line ?? 0) <= line)
    .sort((a, b) => (b.line ?? 0) - (a.line ?? 0))[0];
  return hit?.name ?? null;
}

// ---------------------------------------------------------------------------
// helpers — local to T1, replaced when blast/onboarding migrate to the facade.
// ---------------------------------------------------------------------------

/**
 * Best-effort: name the enclosing top-level symbol of a reference line. Mirrors
 * blast/helpers.ts callerName so we get the same caller labels.
 */
function enclosingSymbolName(
  allSymbols: CodeSymbol[],
  fromPath: string,
  line: number,
): string {
  const inFile = allSymbols
    .filter((s) => s.path === fromPath && s.line <= line && !s.name.includes('.'))
    .sort((a, b) => b.line - a.line);
  return inFile[0]?.name ?? fromPath.split('/').pop() ?? fromPath;
}

function readClone(clonePath: string, file: string): Promise<string | null> {
  // S6 — containment-checked: a committed symlink can't read outside the clone.
  return readContainedFile(clonePath, file);
}
