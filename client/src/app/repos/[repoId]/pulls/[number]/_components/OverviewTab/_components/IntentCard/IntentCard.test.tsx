import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentResponse } from "@devdigest/shared";
import intent from "../../../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

const HEAD = "f00ba12deadbeef";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Intent = NonNullable<PrIntentResponse["intent"]>;
const record = (over: Partial<Intent> = {}): Intent => ({
  pr_id: "pr-1",
  intent: "Add rate limiting to the comments endpoint.",
  in_scope: ["comments route rate limit", "429 error body"],
  out_of_scope: ["auth changes"],
  mode: "author_description",
  confidence: "high",
  sources: [
    { kind: "title", ref: "title", chars: 10, truncated: false },
    { kind: "issue", ref: "#42", chars: 100, truncated: false },
    { kind: "files", ref: "12", chars: 100, truncated: false },
  ],
  missing_context: [],
  model: "deepseek/deepseek-v4-flash",
  head_sha: HEAD,
  ...over,
});
const response = (i: Intent | null, over: Partial<PrIntentResponse> = {}): PrIntentResponse => ({
  intent: i,
  current_head_sha: HEAD,
  stale: false,
  ...over,
});

const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  statusText: status < 400 ? "OK" : "Error",
  json: async () => body,
});

/** fetch stub routed by "METHOD /path"; a handler may return a promise to hold the call open. */
function stubFetch(routes: Record<string, () => unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
      calls.push(key);
      const h = routes[key];
      if (!h) throw new Error(`unexpected request ${key}`);
      return h();
    }),
  );
  return calls;
}

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ intent }}>
        <IntentCard prId="pr-1" headSha={HEAD} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const GET = "GET /pulls/pr-1/intent";
const POST = "POST /pulls/pr-1/intent/derive";

describe("IntentCard", () => {
  it("not derived → Derive click → deriving → derived with scope lists, sources and Re-derive", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    stubFetch({
      [GET]: () => json(200, response(null)),
      [POST]: async () => {
        await held;
        return json(200, response(record()));
      },
    });
    renderCard();

    expect(await screen.findByText(/No intent yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));

    const deriving = await screen.findByRole("button", { name: /Deriving/ });
    expect(deriving).toBeDisabled();
    expect(screen.getByText(/Reading title, description/)).toBeInTheDocument();

    release();
    expect(await screen.findByText(/Add rate limiting to the comments endpoint/)).toBeInTheDocument();
    expect(screen.getByText("HIGH confidence")).toBeInTheDocument();
    expect(screen.getByText("comments route rate limit")).toBeInTheDocument();
    expect(screen.getByText("auth changes")).toBeInTheDocument();
    expect(screen.getByText(/issue #42/)).toBeInTheDocument();
    expect(screen.getByText(/12 files/)).toBeInTheDocument();
    expect(screen.getByText("model: deepseek-v4-flash")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-derive" })).toBeEnabled();
    expect(screen.queryByText(/Inferred from changes/)).not.toBeInTheDocument();
  });

  it("stale: banner with both short shas, STALE badge, review note and Re-derive", async () => {
    stubFetch({ [GET]: () => json(200, response(record({ head_sha: "a1b2c3d9999" }), { stale: true })) });
    renderCard();

    expect(await screen.findByText("STALE")).toBeInTheDocument();
    expect(
      screen.getByText(/Derived at a1b2c3d, PR head is now f00ba12\. Re-derive to update\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reviews use it for context only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-derive" })).toBeInTheDocument();
  });

  it("inferred from changes: shows the badge, the banner text and the low-confidence hint", async () => {
    stubFetch({
      [GET]: () => json(200, response(record({ mode: "inferred_from_changes", confidence: "low" }))),
    });
    renderCard();

    expect(
      await screen.findByText("Inferred from changes, no author description. Check that this matches the PR."),
    ).toBeInTheDocument();
    expect(screen.getByText("Inferred from changes")).toBeInTheDocument();
    expect(screen.getByText("LOW confidence")).toBeInTheDocument();
    expect(screen.getByText(/out-of-scope filtering is off for reviews/)).toBeInTheDocument();
  });

  it("missing context: lists each ref with its reason", async () => {
    stubFetch({
      [GET]: () =>
        json(
          200,
          response(
            record({
              confidence: "medium",
              missing_context: [
                { ref: "https://linear.app/acme/issue/ACM-12", reason: "host_not_allowlisted" },
                { ref: "#77", reason: "not_found" },
                { ref: "docs/plans/old.md", reason: "not_present_at_head" },
              ],
            }),
          ),
        ),
    });
    renderCard();

    expect(await screen.findByText(/Missing context \(confidence lowered\)/)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(
      expect.arrayContaining([
        "https://linear.app/acme/issue/ACM-12 — host not allowlisted",
        "#77 — not found or no access",
        "docs/plans/old.md — not present at head",
      ]),
    );
  });

  it("error: shows the API message with Retry; Retry derives again and recovers", async () => {
    let attempt = 0;
    const calls = stubFetch({
      [GET]: () => json(200, response(null)),
      [POST]: () =>
        ++attempt === 1
          ? json(502, { error: { code: "external_service_error", message: "Model unavailable" } })
          : json(200, response(record())),
    });
    renderCard();

    fireEvent.click(await screen.findByRole("button", { name: "Derive intent" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Could not derive intent: Model unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/Add rate limiting to the comments endpoint/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls.filter((c) => c === POST)).toHaveLength(2);
  });
});
