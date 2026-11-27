import type { RepoRef } from '@devdigest/shared';

/** Why a read at a ref failed (mapped to `missing_context` reasons by the service). */
export type RepoFileErrorCode = 'invalid' | 'not_found' | 'too_large' | 'timeout';

export class RepoFileError extends Error {
  constructor(
    public readonly code: RepoFileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RepoFileError';
  }
}

/**
 * Read one file of the local clone as it exists at a commit (not the working
 * tree). Module-local port: only the intent module needs it. Rejects with
 * `RepoFileError`.
 */
export interface RepoFileAtRef {
  read(repo: RepoRef, sha: string, path: string): Promise<string>;
}
