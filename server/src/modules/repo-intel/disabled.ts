import type { RepoIntelReads } from './queries.js';
import type { FileRankRow, RefRow, RepoMapResult, SignatureRow, SymbolRow } from './types.js';

/**
 * Null Object for the rank / symbol / phantom reads when REPO_INTEL_ENABLED is
 * off: every read resolves to an empty result, never throws. Consumers
 * (run-executor, blast, hooks) then fall back to their pre-repo-intel behaviour.
 * Chosen once in the composition root, instead of a flag check in every method.
 */
export class DisabledRepoIntelQueries implements RepoIntelReads {
  async getFileRank(): Promise<FileRankRow[]> {
    return [];
  }
  async getSymbolsInFiles(): Promise<SymbolRow[]> {
    return [];
  }
  async getCallerSignatures(): Promise<SignatureRow[]> {
    return [];
  }
  async getUnresolvedReferences(): Promise<RefRow[]> {
    return [];
  }
  async getConventionSamples(): Promise<string[]> {
    return [];
  }
  async getTopFilesByRank(): Promise<string[]> {
    return [];
  }
  async getCriticalPaths(): Promise<string[][]> {
    return [];
  }
}

/** The repo-map the facade serves while repo-intel is switched off. */
export const DISABLED_REPO_MAP: RepoMapResult = {
  text: '',
  tokens: 0,
  cached: false,
  degraded: true,
  reason: 'flag_off',
};
