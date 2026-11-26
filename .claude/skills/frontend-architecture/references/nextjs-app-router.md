# Next.js App Router: architecture details

Supplements `SKILL.md` §8. This file covers structure only. File-convention syntax, caching,
streaming and bundle tuning are in `next-best-practices`.

## What Next.js actually prescribes

Next.js is officially **unopinionated** about project organization. It gives you tools
(colocation, private folders, route groups, `src/`) and three example strategies:

1. **Project files outside `app/`.** `app/` is purely routing, and code lives in root-level
   `components/`, `lib/` and so on.
2. **Top-level folders inside `app/`.** `app/components`, `app/lib`.
3. **Split by feature or route.** Globally shared code at the root, route-specific code inside
   the route segments that use it.

The docs' advice: "choose a strategy that works for you and your team and be consistent across
the project". This skill's default combines (1) and (3): shared code outside `app/`, and
route-private code colocated in `_components/`.

## Colocation rules worth remembering

- A folder in `app/` becomes a public route only once it has `page.tsx` or `route.ts`. Only
  what those files return is sent to the client, so colocated files are safe.
- `_private` folders opt a folder and its subfolders out of routing. Colocation doesn't strictly
  need them, but they separate UI logic from routing logic, sort consistently in editors, and
  avoid clashes with future special-file names. Use `_components` (and `_lib` if needed)
  consistently.
- Route groups `(group)` organize routes by section, intent or team, and let a subset of routes
  share a layout without changing the URL.

## Route file responsibilities

| File | Responsible for | Not responsible for |
|------|-----------------|---------------------|
| `layout.tsx` | Shared chrome for a segment, provider placement, `metadata` | Auth enforcement (layouts don't re-render on navigation, so checks there are unreliable), data shaping |
| `page.tsx` | Reading params/search params, choosing the view, composing sections | Domain rules, fetch wiring, large JSX trees |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | Route-level boundaries | Business logic |
| `route.ts` | HTTP endpoints (webhooks, BFF proxy) | Being called from your own Server Components (call the data function directly instead) |

**Thin page pattern:**

```tsx
// app/agents/page.tsx
import { AgentsListView } from "./_components/AgentsListView";

export default function AgentsPage() {
  return <AgentsListView />;
}
```

When a page grows hooks, effects and 200 lines of JSX, move the body into
`_components/<Name>View/` and keep reading `params` in the page (or pass them down).

## Server/Client boundary as architecture

- Server Components fit data access close to the source, secrets and static structure. Client
  Components fit state, event handlers, effects, browser APIs and custom hooks.
- `'use client'` declares an **entry point into the client module graph**. Everything it imports
  becomes client code. So the higher you put it, the more of the tree becomes client code,
  including modules that didn't need to be.
- Put the directive on interactive leaves. To nest server-rendered UI inside a client wrapper,
  pass it as `children` (the "slot" pattern, e.g. a client `<Modal>` wrapping a server `<Cart>`).
- Third-party components that use client-only features but lack the directive get a small
  `'use client'` wrapper in your code.
- Context providers are client components that accept `children`, rendered as deep as possible
  ("wrap `{children}`, not `<html>`").
- Shared pure modules (helpers, model, constants) have no directive and work on both sides. Keep
  them free of browser globals and secrets so that stays true.
- Code that must never reach the client (secrets, DB) starts with `import 'server-only'` to
  prevent "environment poisoning".

**When a client-only app is fine:** if the app is an SPA-style dashboard over a separate API
(state-heavy screens, TanStack Query everywhere), many `'use client'` pages are an accepted
trade-off. Still keep the directive out of `layout.tsx`, keep shared pure modules
directive-free, and keep the option of server components open by not putting browser globals
in model code.

## Choosing the data path

| Situation | Reads | Writes | Where the code lives |
|-----------|-------|--------|----------------------|
| **Separate backend API** (Fastify, Rails, Go…) | API client + TanStack Query hooks in the browser, or prefetch in a Server Component + `HydrationBoundary` | Mutation hooks → API | `lib/api.ts` + per-domain hook modules. Next.js is UI (+ optional BFF proxy via `route.ts`) |
| **Next.js is the backend** | Server Components call a server-only **Data Access Layer** (auth checks + DTOs) | Server Actions in `actions.ts`, auth checked inside each action, then `revalidatePath`/`revalidateTag` | `lib/dal/*` or `features/<f>/server/*` with `import 'server-only'` |
| **Large existing app with an HTTP API** | Keep the HTTP API as the boundary | Same | Same as the first row. Next.js docs recommend the HTTP-API approach here |

Rules that hold in every row:

- Fetch in Server Components directly from the source, **not via your own Route Handlers**. That
  adds an HTTP round trip and fails at build time for prerendered pages.
- Client-side fetching libraries fit data that depends on browser APIs or is polled often. Use
  them deliberately, not by default, in a full-stack Next.js app.
- **Server Actions are public HTTP endpoints.** Validate input and check authorization inside
  every action. They're queued, so don't use them for reads.
- `process.env` secrets are read only in server-only data modules. `NEXT_PUBLIC_*` is shipped
  to the browser.

## Alternatives you may meet

### Feature-Sliced Design + Next.js

The official FSD guide keeps Next's `app/` at the project root as a thin routing layer and puts
FSD layers in `src/`. The FSD `app` and `pages` layers are renamed `_app` and `_pages` to avoid
the name clash. Route files only re-export:

```tsx
// app/example/page.tsx
export { ExamplePage as default, metadata } from "@/_pages/example";
```

Server-only parts of a slice are exposed through `index.server.ts`. It's worth it for large
teams already fluent in FSD. Otherwise it's heavy for small apps.

### `features/*` + thin routes

Feature modules (`src/features/<f>/{api,components,hooks,model,utils}`) hold all screen code,
and `app/` only imports a feature's view. Use this when one feature spans many routes. The
default `_components` approach stays simpler while each screen maps to roughly one route.
