# DI: the Container as composition root

`platform/container.ts` (`Container`) is our composition root ("Pure DI"). It holds config, `db`,
`JobRunner`, `runBus`, and lazily built adapters and shared repositories, with
`ContainerOverrides` for tests.

## Rules

1. **Only the composition root calls `new` on infrastructure.** That means the `Container`, or
   a module plugin's setup line that builds its service from container parts. Seemann:
   compose the object graph in one place, and "only applications should have Composition Roots".
2. **New services use constructor injection of narrow dependencies**:
   ```ts
   export interface NotificationServiceDeps {
     repo: NotificationRepository;   // or a NotificationStore port from ports.ts
     github: () => Promise<GitHubClient>; // port from @devdigest/shared, resolved lazily
     jobs: Pick<JobRunner, 'enqueue'>;
   }
   export class NotificationService {
     constructor(private deps: NotificationServiceDeps) {}
   }
   // routes.ts (composition step)
   const service = new NotificationService({
     repo: new NotificationRepository(app.container.db),
     github: () => app.container.github(),   // async getter: resolves the token lazily
     jobs: app.container.jobs,
   });
   ```
   A service that takes the whole `Container` is a **service locator**: its dependencies are
   hidden, and missing ones surface at run time rather than compile time (Seemann, "Service
   Locator is an Anti-Pattern"). Bogard's counterpoint (locators are fine inside framework
   plumbing) doesn't apply to application services.
3. **Lazy getters are for adapters that need secrets or are expensive** (`git`, `github`, LLM
   providers). Add a getter plus a `ContainerOverrides` field for every new adapter.
4. **Cross-module repositories** are exposed by the `Container` (`agentsRepo`, `reviewRepo`;
   see the comment at `container.ts:80`). Never deep-import `../other-module/repository.js`
   from a service or route. When a service needs another module's data, inject a function
   (`PullsServiceDeps.usageForPulls`, wired from `reviewRepo` in the Container) rather than
   the repository type.
5. **Every service is built once in the `Container`** (`reposService`, `agentsService`,
   `reviewService`, `pullsService`, `settingsService`, `repoIntelService`) from a narrow
   `XServiceDeps` interface declared next to the service (`reviews/deps.ts`,
   `repo-intel/deps.ts`, `pulls/service.ts` `PullsServiceDeps`). Routes, job handlers and boot
   code read `container.<x>Service`; they never `new` a service, so a job handler and a route
   share one instance. Tests construct the service directly with fakes for those deps.
