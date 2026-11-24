import type { RepoIntelRepository } from './repository.js';
import type { RepoMapResult } from './types.js';
import { DEFAULT_REPO_MAP_TOKEN_BUDGET } from './constants.js';

/**
 * Serves the cached repo-map for the repo's last-indexed SHA. The pipeline only
 * renders it at `DEFAULT_REPO_MAP_TOKEN_BUDGET`; other budgets (or an unindexed
 * / partial-without-rank repo) miss and degrade cleanly.
 */
export class RepoMapReader {
  constructor(private readonly repo: RepoIntelRepository) {}

  async get(repoId: string, tokenBudget?: number): Promise<RepoMapResult> {
    const degraded: RepoMapResult = { text: '', tokens: 0, cached: false, degraded: true, reason: 'no_data' };
    const state = await this.repo.tryGetIndexState(repoId);
    if (!state || !state.lastIndexedSha) return degraded;
    const budget = tokenBudget ?? DEFAULT_REPO_MAP_TOKEN_BUDGET;
    const hit = await this.repo.getRepoMapCache(repoId, state.lastIndexedSha, budget);
    if (!hit) return degraded;
    return { text: hit.mapText, tokens: hit.tokenCount, cached: true };
  }
}
