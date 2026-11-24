import type {
  ConnTestRequest,
  ConnTestResult,
  GitHubClient,
  LLMProvider,
  Provider,
  SecretsProvider,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import type { SettingsRepository } from './repository.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { redactKey, rowsToSettings } from './helpers.js';

export interface SettingsServiceDeps {
  repo: SettingsRepository;
  secrets: SecretsProvider;
  github: () => Promise<GitHubClient>;
  /** A GitHub client for a CANDIDATE token (not persisted, not cached). */
  githubWithToken: (token: string) => GitHubClient;
  llm: (provider: Provider) => Promise<LLMProvider>;
  /** A provider built from a CANDIDATE key (not persisted, not cached). */
  llmWithKey: (provider: Provider, key: string) => Promise<LLMProvider>;
  /** Drop cached clients so the next resolve picks up a changed secret. */
  invalidateSecretCaches: () => void;
}

/**
 * Settings: non-secret prefs (key/value rows) plus the provider-key
 * connection test. Secret VALUES never leave this service — only booleans.
 */
export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.deps.repo.listForWorkspace(workspaceId));
  }

  async update(workspaceId: string, userId: string, body: SettingsUpdate): Promise<Settings> {
    await this.deps.repo.upsertMany(workspaceId, userId, body);
    return this.get(workspaceId);
  }

  /** Which provider keys are configured (booleans only). */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) => [provider, Boolean(await this.deps.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * S11 — a candidate key is verified with a throwaway client FIRST and
   * persisted only if the check passes, so a typo never overwrites a working
   * key in ~/.devdigest/secrets.json.
   */
  async testConnection({ provider, key }: ConnTestRequest): Promise<ConnTestResult> {
    const { secrets } = this.deps;
    if (key && !secrets.set) {
      return { provider, ok: false, message: 'Secrets backend is read-only' };
    }
    let message: string;
    try {
      if (provider === GITHUB_PROVIDER) {
        const gh = key ? this.deps.githubWithToken(key) : await this.deps.github();
        message = `Connected as @${await gh.currentLogin()}`;
      } else {
        const llm = key
          ? await this.deps.llmWithKey(provider, key)
          : await this.deps.llm(provider);
        const models = await llm.listModels();
        message = `OK — ${models.length} models available`;
      }
    } catch (err) {
      // Provider SDK errors can echo the key back; never return it.
      const safe = redactKey((err as Error).message, key);
      return { provider, ok: false, message: key ? `${safe} — key not saved` : safe };
    }
    if (key) {
      try {
        await secrets.set!(SECRET_KEY_BY_PROVIDER[provider], key);
        this.deps.invalidateSecretCaches();
      } catch (err) {
        return { provider, ok: false, message: `Key verified but could not be saved: ${(err as Error).message}` };
      }
    }
    return { provider, ok: true, message };
  }
}
