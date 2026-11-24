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
   see the comment at `container.ts:70`). Never deep-import `../other-module/repository.js`
   from a service or route.
5. **Migrating an existing `constructor(container)` service** (`repos/service.ts:32`,
   `agents/service.ts:54`, `reviews/service.ts:35`, `repo-intel/service.ts:104`): do it only
   while changing that service. Keep the public method surface, and move the `new Repository`
   call to the plugin or `Container`. `ReviewRunExecutor` (`reviews/run-executor.ts:44`)
   already receives its repositories by constructor. That's the direction to go, minus the
   `container` argument.
