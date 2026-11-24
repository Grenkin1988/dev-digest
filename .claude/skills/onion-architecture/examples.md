# Examples: before → after

Grounded in real DevDigest code. "Before" snippets are shortened.

## 1. Query in a route → repository + service

**Before** (`server/src/modules/pulls/routes.ts:32-70`: the route queries Postgres, calls GitHub
and upserts rows):
```ts
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(container, req);
  const [repo] = await container.db.select().from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
  if (!repo) throw new NotFoundError('Repo not found');
  const gh = await container.github();
  for (const pr of await gh.listPullRequests({ owner: repo.owner, name: repo.name })) {
    await container.db.insert(t.pullRequests).values({ /* … */ }).onConflictDoUpdate(/* … */);
  }
  // … more SQL, cost aggregation, mapping
});
```

**After**:
```ts
// routes.ts — presentation
app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
  const { workspaceId } = await getContext(app.container, req);
  return service.listForRepo(workspaceId, req.params.id);
});

// service.ts — application
async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
  const repo = await this.deps.repos.getById(workspaceId, repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  const remote = await this.tryListRemote(repo);            // degrades offline
  if (remote) await this.deps.pulls.upsertMany(workspaceId, repo.id, remote);
  const rows = await this.deps.pulls.listForRepo(workspaceId, repo.id);
  const usage = await this.deps.runs.usageForPulls(rows.map((r) => r.id));
  return rows.map((r) => toPrMeta(r, usage.get(r.id)));     // pure helper
}

// repository.ts — infrastructure: upsertMany / listForRepo hold the Drizzle code
```

## 2. Service locator → narrow constructor deps

**Before** (`repos/service.ts:32-33`):
```ts
constructor(private container: Container) {
  this.repo = new RepoRepository(container.db);
}
// later: this.container.git.clone(...), this.container.jobs.enqueue(...)
```

**After**:
```ts
export interface RepoServiceDeps {
  repo: RepoRepository;
  git: GitClient;
  jobs: Pick<JobRunner, 'enqueue' | 'register'>;
}
export class RepoService {
  constructor(private deps: RepoServiceDeps) {}
}
// routes.ts
const service = new RepoService({
  repo: new RepoRepository(app.container.db),
  git: app.container.git,
  jobs: app.container.jobs,
});
```
Tests now pass `{ repo: fakeRepo, git: new MockGitClient(), jobs: fakeJobs }`. No container and no DB.

## 3. Pure domain with injected impurity (good, keep doing this)

`reviews/cost.ts:12` (`CostEstimator`) / `:22` (`runCost`): the cost math takes an estimator
function instead of importing `PriceBook`, so `server/test/run-cost.test.ts` needs no mocks.

## 4. Thin route (good, keep doing this)

`repos/routes.ts:19-48`: it builds the service once, and every handler is
`getContext` → one service call → status.

## 5. External library behind a facade (good)

`repo-intel/types.ts:137` (`RepoIntel`): reviews and other features code against this interface.
ast-grep, dependency-cruiser, graphology and tiktoken stay behind it, and the "degraded
contract" lets callers fall back without try/catch.

## 6. Cross-module repository import → container or service

**Before**: `pulls/routes.ts:11` `import { usageForPulls } from '../reviews/repository/run.repo.js'`.
**After**: add a `usageForPulls` method to the shared `ReviewRepository` facade
(`reviews/repository.ts:26`, exposed as `container.reviewRepo`) and inject it as `runs`
(example 1). The pulls module never reaches into `reviews/` internals.
