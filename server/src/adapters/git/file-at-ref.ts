import { simpleGit } from 'simple-git';
import type { RepoRef } from '@devdigest/shared';
import { RepoFileError, type RepoFileAtRef } from '../../modules/intent/ports.js';
import { DOC_PATH_PATTERN, PR_TEMPLATE_CANDIDATES } from '../../modules/intent/constants.js';

/** Hard caps: a blob over MAX_BYTES is rejected before it is read; git gets TIMEOUT_MS. */
export const FILE_AT_REF_MAX_BYTES = 100 * 1024;
export const FILE_AT_REF_TIMEOUT_MS = 10_000;

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const PATH_PATTERN = /^[\w.@+-]+(\/[\w.@+-]+)*$/;

/** Defence in depth: the caller allowlists paths too, this is the last gate before git. */
function assertSafe(sha: string, path: string): void {
  if (!SHA_PATTERN.test(sha)) throw new RepoFileError('invalid', 'Invalid commit sha');
  if (
    path.startsWith('/') ||
    path.startsWith('-') ||
    path.split('/').some((seg) => seg === '.' || seg === '..') ||
    !PATH_PATTERN.test(path)
  ) {
    throw new RepoFileError('invalid', 'Invalid file path');
  }
  // Same allowlist the intent helpers apply (docs/specs markdown + the fixed PR
  // template locations), re-checked here so no other caller can read arbitrary files.
  if (!DOC_PATH_PATTERN.test(path) && !PR_TEMPLATE_CANDIDATES.includes(path)) {
    throw new RepoFileError('invalid', 'File path not allowlisted');
  }
}

/**
 * `git show <sha>:<path>` against the local clone. No shell: simple-git gets an
 * argument array. Never reads the working tree and never touches the network.
 */
export class GitFileAtRefReader implements RepoFileAtRef {
  constructor(private readonly clonePathFor: (repo: RepoRef) => string) {}

  async read(repo: RepoRef, sha: string, path: string): Promise<string> {
    assertSafe(sha, path);
    const git = simpleGit({
      baseDir: this.clonePathFor(repo),
      timeout: { block: FILE_AT_REF_TIMEOUT_MS },
    });
    const spec = `${sha}:${path}`;
    let size: number;
    try {
      size = Number((await git.raw(['cat-file', '-s', spec])).trim());
    } catch (err) {
      throw toFileError(err);
    }
    if (!Number.isFinite(size)) throw new RepoFileError('not_found', 'File not present at ref');
    if (size > FILE_AT_REF_MAX_BYTES) throw new RepoFileError('too_large', 'File too large');
    try {
      return await git.raw(['show', spec]);
    } catch (err) {
      throw toFileError(err);
    }
  }
}

function toFileError(err: unknown): RepoFileError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out|block timeout/i.test(msg)) return new RepoFileError('timeout', 'git timed out');
  return new RepoFileError('not_found', 'File not present at ref');
}
