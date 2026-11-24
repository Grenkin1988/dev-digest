# Onion Architecture skill

## Motivation

Server modules already lean toward layers. Route headers say "transport layer only", and
repositories say "the ONLY place that touches the table". Nothing wrote the rule down, and the
code drifted: `pulls/routes.ts` and `polling/routes.ts` query `container.db` directly, and
services take the whole `Container` and build their own repositories (a service locator). This
skill makes the dependency rule explicit for our stack (Fastify, Zod contracts, Drizzle, the
`Container`, adapters, reviewer-core) without forcing a folder refactor. Layers map onto the
existing flat files.

Decisions (2026-11-24):
- **Flat files, not layer folders**: `constants/helpers` = domain, `service` = application,
  `repository` = infrastructure, `routes` = presentation, `Container` = composition root.
- **Guidance only, no automated enforcement yet.** `dependency-cruiser` is already a server
  dependency, so a `forbidden` ruleset (`depcruise src --validate`) would be the natural
  follow-up (see "Enforcement" below).
- **New and changed code only.** Known deviations are listed in `SKILL.md` §6.

## Files

| File | Holds |
|---|---|
| [SKILL.md](SKILL.md) | ring table, placement algorithm, per-tool summary, checklists, known deviations |
| [examples.md](examples.md) | before/after from real code |
| [references/layers.md](references/layers.md) | rationale per ring, edge cases (`platform/*`, `vendor/shared`, reviewer-core) |
| [references/fastify.md](references/fastify.md) | routes and job handlers as driving adapters |
| [references/zod-contracts.md](references/zod-contracts.md) | contracts as boundary DTOs, parse-don't-validate |
| [references/drizzle.md](references/drizzle.md) | repositories, tenancy, transactions |
| [references/di-container.md](references/di-container.md) | composition root, constructor injection, migrating service-locator services |
| [references/adapters.md](references/adapters.md) | ports, adapters, mocks, facades |
| [references/testing.md](references/testing.md) | which test per ring |

## Sources

**Tiers:** A = originator / official docs · B = recognized expert · C = community (backup only).
All links were opened on 2026-11-24.

### Onion / Clean / Hexagonal
- A — [Jeffrey Palermo: The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/): "all coupling is toward the center". Repository interfaces sit in the core, implementations outside it.
- A — [Jeffrey Palermo: part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) · [series incl. part 4](https://jeffreypalermo.com/tag/onion-architecture): a worked example, with constructor injection from the outside.
- A — [Robert C. Martin: The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html): the Dependency Rule. Simple data structures cross boundaries.
- A — [Alistair Cockburn: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) · [Wikipedia summary](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)): primary/secondary adapters. Run "without either a UI or a database".
- B — [Herberto Graça: Onion Architecture](https://herbertograca.com/2017/09/21/onion-architecture/): use-case ports belong to the application ring.
- B — [Allegro Tech: Onion Architecture](https://blog.allegro.tech/2023/02/onion-architecture.html): domain / application / infrastructure. Enforce direction with tooling.
- B — [NDepend: Onion Architecture layers](https://blog.ndepend.com/onion-architecture-layers/): keep ORM types out of the core. Not worth the full pattern for small CRUD.
- C — [Clean vs Onion vs Hexagonal](https://nguyenlephong.github.io/en/blog/architecture/clean-vs-onion-vs-hexagonal) · [Thoughtworks: Demystify architecture patterns](https://www.thoughtworks.com/en-au/insights/blog/architecture/demystify-software-architecture-patterns)

### Node.js / TypeScript
- B — [Khalil Stemmler: Clean Node.js Architecture](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/): policy vs. detail, ports and adapters in TS.
- B — [Remo Jansen: Onion Architecture in Node.js with TypeScript](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad) · [Enforce it with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi)
- B — [Sairyss: Domain-Driven Hexagon](https://github.com/Sairyss/domain-driven-hexagon): broad reference ("a recommendation, not a rule"). Inactive.

### Fastify
- A — [Fastify Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) · [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) · [Ecosystem (@fastify/awilix)](https://fastify.dev/docs/latest/Guides/Ecosystem/)
- B — [Building a modular monolith with Fastify (talk)](https://gitnation.com/contents/building-a-modular-monolith-with-fastify)
- C — [marcoturi/fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate): Clean + DDD on Fastify, with dependency-cruiser in CI · [Snyk: Fastify plugins as DI](https://snyk.io/blog/fastify-plugins-for-backend-node-js-api)

### Drizzle / Repository
- A — [Drizzle: Transactions](https://orm.drizzle.team/docs/transactions)
- A — [Martin Fowler: Repository](https://martinfowler.com/eaaCatalog/repository.html)
- B — [Cosmic Python, ch. 2: Repository pattern](https://github.com/cosmicpython/book/blob/master/chapter_02_repository.asciidoc): the ORM depends on the model, not the reverse. Fake repositories for tests.
- C — [Repository pattern with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae) · [Stop massacring the repository pattern](https://dev.to/adamthedeveloper/stop-massacring-the-repository-pattern-a-love-letter-to-separation-of-concerns-2c38)

### DI / composition root
- B — [Mark Seemann: Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/) · [Service Locator is an Anti-Pattern](https://blog.ploeh.dk/2010/02/03/ServiceLocatorisanAnti-Pattern) · [Composition Root location](https://blog.ploeh.dk/2019/06/17/composition-root-location/)
- B — counterpoint: [Jimmy Bogard: Service Locator is not an Anti-Pattern](https://www.jimmybogard.com/service-locator-is-not-an-anti-pattern)

### Zod / boundaries
- B — [Alexis King: Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- A — [Zod docs](https://zod.dev/)

### Enforcement (future work)
- A — [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- C — [Atomic Object: restrict imports with dependency-cruiser](https://spin.atomicobject.com/dependency-cruiser-imports/) · [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS)

## Changelog
- **1.0.0** (2026-11-24): first version.
