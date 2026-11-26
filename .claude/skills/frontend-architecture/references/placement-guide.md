# Placement guide: "I have X, where does it go?"

A lookup table for the placement algorithm in `SKILL.md` §1, followed by before/after examples.
Paths use the generic layout. A project profile (for example `devdigest.md`) maps them to real
folders.

## Lookup table

| I have… | Used by | Goes in |
|---------|---------|---------|
| A sub-component | one parent component | `Parent/_components/Child/` |
| A sub-component | one route | `app/<route>/_components/Child/` |
| A component | ≥2 routes or features | `components/<purpose>/` (shared UI, props in / events out) |
| A design-system primitive (Button, Modal) | everyone | the UI kit / `components/ui/`, never inside a feature |
| A lookup map, option list, limit | one component | `Component/constants.ts` |
| A constant | one route | `app/<route>/constants.ts` next to `page.tsx` |
| An app-wide constant or env-derived setting | many features | `config/` (or the API client module for `API_BASE`) |
| A union type derived from a constant | wherever the constant lives | next to the constant: `type Tab = (typeof TABS)[number]` |
| A pure formatter or mapper | one component | `Component/helpers.ts` (+ `helpers.test.ts`) |
| A pure function | across features, app-agnostic | `utils/<purpose>.ts` or `lib/<purpose>.ts` (one purpose per file) |
| A domain rule (blocking? visible? cost?) | ≥2 screens of one domain | the domain's model module (`features/<d>/model/` or `lib/<domain>.ts`) |
| A stateful hook | one component | `Component/useThing.ts` |
| A server-state hook (query/mutation) | anywhere | the domain's data module, next to its request function and keys |
| A domain-agnostic hook (`useDebounce`) | many | `hooks/` (shared) |
| An API client instance, `QueryClient`, providers | app | `lib/` |
| A context provider | a subtree | a client component wrapping `{children}`, rendered in the nearest layout that covers its consumers |
| Style objects / class maps | one component | `Component/styles.ts` (or a colocated CSS module) |
| A test | the module it tests | next to it: `X.test.tsx`. E2E tests go in the e2e package/root |
| Translated UI text | anywhere | the i18n message catalog. Code holds only the key |
| Types for an API contract | client + server | the shared contract package or generated types. Never redeclared in UI |

## Before / after

### 1. Domain logic inside JSX

```tsx
// ❌ the rule lives in the view, untestable without rendering, duplicated elsewhere
export function FindingsHeader({ findings }: Props) {
  const blockers = findings.filter(
    (f) => f.severity === "CRITICAL" && f.status !== "dismissed",
  ).length;
  return <Badge>{blockers > 0 ? `${blockers} blocking` : "Clear"}</Badge>;
}
```

```ts
// ✅ model/findings.ts: pure, unit-tested, shared by every screen that needs it
export function countBlockers(findings: Finding[]): number {
  return findings.filter((f) => f.severity === "CRITICAL" && f.status !== "dismissed").length;
}
```

```tsx
// ✅ the view only wires and renders
export function FindingsHeader({ findings }: Props) {
  const blockers = countBlockers(findings);
  return <Badge>{blockers > 0 ? t("blocking", { count: blockers }) : t("clear")}</Badge>;
}
```

### 2. Fetching inside a component

```tsx
// ❌ URL, key and fetch are inline; every other screen re-invents them
const { data } = useQuery({
  queryKey: ["agent", id],
  queryFn: () => fetch(`http://localhost:3001/agents/${id}`).then((r) => r.json()),
});
```

```ts
// ✅ data module for the domain: one definition per endpoint
export const agentKeys = {
  all: ["agents"] as const,
  detail: (id: string) => [...agentKeys.all, id] as const,
};

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => api.get<Agent>(`/agents/${id}`),
  });
}
```

### 3. Premature shared module

```
❌ components/shared/StatusPill/   ← created for a single screen "because we might reuse it"
✅ app/agents/_components/AgentCard/_components/StatusPill/
   …moved to components/status-pill/ when the PR list needed it too (in the same change
   that added the second use, updating both imports).
```

### 4. Junk-drawer utils

```
❌ utils/index.ts        (formatCost, githubUrl, sleep, cn, parseDiff, …: 40 exports)
✅ lib/format-cost.ts  lib/github-urls.ts  lib/model-label.ts   (one purpose each, tests beside them)
```

### 5. Reaching into internals

```ts
// ❌ couples you to another component's private structure
import { formatRange } from "@/components/diff-viewer/helpers";

// ✅ if you really need it, it has been reused: promote it and import the shared module
import { formatRange } from "@/lib/diff-range";
```

### 6. Variant branching in JSX

```tsx
// ❌ nested ternaries per provider spread across components
{provider === "openai" ? <OpenAIIcon /> : provider === "anthropic" ? <AnthropicIcon /> : <Generic />}
```

```ts
// ✅ constants.ts: one map, typed against the contract union
export const PROVIDER_ICON = {
  openai: OpenAIIcon,
  anthropic: AnthropicIcon,
} satisfies Partial<Record<Provider, ComponentType>>;
```
