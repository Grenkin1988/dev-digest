/**
 * SettingsService with fake repository / secrets — no Postgres. Prefs are
 * batch-upserted and read back; secrets-status exposes booleans only; a
 * candidate key that fails the check is never persisted nor echoed.
 */
import { describe, it, expect } from 'vitest';
import type { GitHubClient, SecretsProvider } from '@devdigest/shared';
import { SettingsService } from '../src/modules/settings/service.js';
import type { SettingsRepository } from '../src/modules/settings/repository.js';
import { redactKey } from '../src/modules/settings/helpers.js';

function setup(secretValues: Record<string, string> = {}) {
  const rows = new Map<string, unknown>();
  const repo = {
    listForWorkspace: async () => [...rows].map(([key, value]) => ({ key, value })),
    upsertMany: async (_ws: string, _u: string, values: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(values)) rows.set(k, v);
    },
  } as unknown as SettingsRepository;
  const stored = { ...secretValues };
  const secrets: SecretsProvider = {
    get: async (k) => stored[k],
    set: async (k, v) => {
      stored[k] = v;
    },
  };
  let invalidated = 0;
  const service = new SettingsService({
    repo,
    secrets,
    github: async () => ({ currentLogin: async () => 'octocat' }) as unknown as GitHubClient,
    githubWithToken: (token) =>
      ({
        currentLogin: async () => {
          if (token !== 'good') throw new Error(`Bad credentials for ${token}`);
          return 'octocat';
        },
      }) as unknown as GitHubClient,
    llm: async () => {
      throw new Error('no key');
    },
    llmWithKey: async () => {
      throw new Error('no key');
    },
    invalidateSecretCaches: () => {
      invalidated += 1;
    },
  });
  return { service, stored, invalidated: () => invalidated };
}

describe('SettingsService', () => {
  it('upserts prefs and returns the merged settings', async () => {
    const { service } = setup();
    await service.update('ws', 'u', { theme: 'dark' } as never);
    const out = await service.update('ws', 'u', { density: 'compact' } as never);
    expect(out).toMatchObject({ theme: 'dark', density: 'compact' });
  });

  it('reports configured keys as booleans only', async () => {
    const { service } = setup({ GITHUB_TOKEN: 'ghp_secret' });
    const status = await service.secretsStatus();
    expect(status.github).toBe(true);
    expect(status.openai).toBe(false);
    expect(JSON.stringify(status)).not.toContain('ghp_secret');
  });

  it('persists a candidate key only after it passes, and redacts it on failure', async () => {
    const { service, stored, invalidated } = setup();
    const bad = await service.testConnection({ provider: 'github', key: 'bad-token' });
    expect(bad.ok).toBe(false);
    expect(bad.message).not.toContain('bad-token');
    expect(stored.GITHUB_TOKEN).toBeUndefined();

    const good = await service.testConnection({ provider: 'github', key: 'good' });
    expect(good.ok).toBe(true);
    expect(stored.GITHUB_TOKEN).toBe('good');
    expect(invalidated()).toBe(1);
  });

  it('redactKey removes every occurrence', () => {
    expect(redactKey('k1 and k1', 'k1')).toBe('[redacted] and [redacted]');
    expect(redactKey('nothing', undefined)).toBe('nothing');
  });
});
