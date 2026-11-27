import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FILE_AT_REF_MAX_BYTES,
  GitFileAtRefReader,
} from '../src/adapters/git/file-at-ref.js';
import { RepoFileError } from '../src/modules/intent/ports.js';

/**
 * GitFileAtRefReader: validation happens before git is spawned (the clone path is
 * not even resolved), `git show <sha>:<path>` reads the commit rather than the
 * working tree, and blobs over the size cap are refused. The git part uses a
 * throw-away local repo: no network.
 */
const repo = { owner: 'acme', name: 'widgets' };
const run = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    .toString()
    .trim();

let work: string;
let sha: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'dd-file-at-ref-'));
  run(work, 'init', '-q', '-b', 'main');
  run(work, 'config', 'user.email', 't@example.com');
  run(work, 'config', 'user.name', 't');
  run(work, 'config', 'core.autocrlf', 'false');
  await mkdir(join(work, 'docs'));
  await writeFile(join(work, 'docs', 'plan.md'), '# Plan\ncommitted text\n');
  await writeFile(join(work, 'docs', 'big.md'), 'x'.repeat(FILE_AT_REF_MAX_BYTES + 1));
  run(work, 'add', '.');
  run(work, 'commit', '-q', '-m', 'init');
  sha = run(work, 'rev-parse', 'HEAD');
  // the working tree differs from the commit: the reader must return the commit's content
  await writeFile(join(work, 'docs', 'plan.md'), 'UNCOMMITTED EDIT\n');
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('GitFileAtRefReader: rejects before spawning git', () => {
  const clonePathFor = vi.fn(() => work);
  const reader = new GitFileAtRefReader(clonePathFor);

  it.each(['HEAD', 'main', 'zzzzzzz', 'abc', 'ABCDEF1', '--output=x', `${'a'.repeat(41)}`, ''])(
    'invalid sha %j',
    async (bad) => {
      await expect(reader.read(repo, bad, 'docs/plan.md')).rejects.toMatchObject({ code: 'invalid' });
    },
  );

  it.each([
    '../secret.md',
    'docs/../../etc/passwd',
    'docs/./a.md',
    '/etc/passwd',
    '-rf',
    '',
    'docs/a b.md',
    'docs/a;rm -rf.md',
    'docs/$(whoami).md',
    'docs\\a.md',
    // valid characters but outside the docs/specs + PR-template allowlist
    'src/secret.ts',
    '.env',
    'docs/plan.txt',
  ])('invalid path %j', async (bad) => {
    await expect(reader.read(repo, 'abcdef1', bad)).rejects.toMatchObject({ code: 'invalid' });
    await expect(reader.read(repo, 'abcdef1', bad)).rejects.toBeInstanceOf(RepoFileError);
  });

  it('never resolved the clone path for any rejected input', () => {
    expect(clonePathFor).not.toHaveBeenCalled();
  });
});

describe('GitFileAtRefReader: reads against a real local repo', () => {
  const reader = () => new GitFileAtRefReader(() => work);

  it('returns the committed content, not the working tree', async () => {
    const text = await reader().read(repo, sha, 'docs/plan.md');
    expect(text).toContain('committed text');
    expect(text).not.toContain('UNCOMMITTED');
  });

  it('accepts an abbreviated sha (7+ hex chars)', async () => {
    await expect(reader().read(repo, sha.slice(0, 7), 'docs/plan.md')).resolves.toContain('# Plan');
  });

  it('enforces the size cap before reading the blob', async () => {
    await expect(reader().read(repo, sha, 'docs/big.md')).rejects.toMatchObject({ code: 'too_large' });
  });

  it('a path missing at the ref → not_found', async () => {
    await expect(reader().read(repo, sha, 'docs/nope.md')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('an unknown (but well-formed) sha → not_found', async () => {
    await expect(reader().read(repo, 'deadbeefdeadbeef', 'docs/plan.md')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
