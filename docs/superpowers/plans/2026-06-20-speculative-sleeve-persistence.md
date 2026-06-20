# Speculative Sleeve Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist `speculative_holds` on the authoritative C# API store and let the user add/remove holds directly from the report flags, so the speculative sleeve survives `publish` and is manageable from the hosted report.

**Architecture:** A new `/api/speculative-holds` endpoint set (GET/POST/DELETE) mirrors the existing `NotesEndpoints`, mutating `user-context.json` via `UserContextStore.MutateAsync` (structural JSON edits that preserve all other fields and initialize the key when absent). The React report mirrors its existing `liveSituations` pattern: a `liveSpeculativeHolds` state edited live from per-flag "add to sleeve" actions and a removable sleeve banner; flag muting is optimistic, while the score effect lands on the next publish.

**Tech Stack:** .NET 9 minimal-API (C#), xUnit (`PortfolioReport.Api.Tests`), React 18 + Vite (TypeScript), `System.Text.Json.Nodes` for structural edits.

## Global Constraints

- The C# store does **structural JSON edits only**; the schema of record stays in TypeScript (`src/intake/parseUserContext.ts`). New endpoints add/remove array elements and never reshape other fields.
- All new endpoints `RequireAuthorization("session")`, matching `NotesEndpoints`/`ProfileEndpoints`.
- `POST /api/speculative-holds` must **initialize `speculative_holds` if the key is absent** (`c["speculative_holds"] ??= new JsonArray()`) — pre-feature server blobs have no such key.
- `POST` is **idempotent by ticker** (exact-string match): a duplicate ticker is a no-op returning the existing hold.
- `designated_at` is server-stamped via `ContextIds.Timestamp()`.
- `speculative_sleeve_threshold` is never written by these endpoints and is **not** UI-editable (engine default `0.05`).
- The TypeScript engine and CLI are **unchanged** — they already consume `speculative_holds`.
- React UI is verified manually (typecheck + eyeball) per repo convention; the C# endpoints are covered by xUnit tests (TDD).
- All work happens on the existing `feat/speculative-sleeve-persistence` branch.

---

### Task 1: `/api/speculative-holds` endpoints (C#)

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/SpeculativeHoldsEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs` (register the endpoint group)
- Test: `api/PortfolioReport.Api.Tests/SpeculativeHoldsEndpointsTests.cs`

**Interfaces:**
- Consumes: `UserContextStore.LoadAsync(user)` / `MutateAsync(user, Action<JsonObject>)`; `CurrentUser.KeyOf(http.User)`; `Json.Str(JsonNode?)`; `ContextIds.Timestamp()`; test helpers `ApiFactory`, `TestAuthHandler.HeaderName`.
- Produces: HTTP routes `GET /api/speculative-holds`, `POST /api/speculative-holds` (`{ticker, reason?}`), `DELETE /api/speculative-holds/{ticker}`, and the extension method `IEndpointRouteBuilder.MapSpeculativeHoldsEndpoints()`.

- [ ] **Step 1: Write the failing tests**

Create `api/PortfolioReport.Api.Tests/SpeculativeHoldsEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class SpeculativeHoldsEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/speculative-holds");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/speculative-holds", new { reason = "no ticker" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesHoldInitializesKeyAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        // New user's stored context has no speculative_holds key; POST must create it.
        var post = await client.PostAsJsonAsync("/api/speculative-holds",
            new { ticker = "TSLA", reason = "Long-term personal hold" });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("TSLA", (string)created!["ticker"]!);
        Assert.Equal("Long-term personal hold", (string)created["reason"]!);
        Assert.NotNull(created["designated_at"]);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
        Assert.Equal("TSLA", (string)list![0]!["ticker"]!);
    }

    [Fact]
    public async Task PostOmitsReasonWhenNotProvided()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "NVDA" }))
            .Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal("NVDA", (string)created!["ticker"]!);
        Assert.False(created.ContainsKey("reason"));
    }

    [Fact]
    public async Task PostIsIdempotentForDuplicateTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });
        var second = await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA", reason = "dup" });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
    }

    [Fact]
    public async Task DeleteRemovesTheHold()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });

        var del = await client.DeleteAsync("/api/speculative-holds/TSLA");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/speculative-holds/NOPE");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task PostIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        using var kevin = SignedIn(factory, "kevin");
        using var luke = SignedIn(factory, "luke");

        await kevin.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });

        var lukeList = await (await luke.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(lukeList!);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj --filter "FullyQualifiedName~SpeculativeHoldsEndpointsTests"`
Expected: FAIL — the routes are unmapped, so `GET`/`POST`/`DELETE` hit the `MapFallback("/api/{*path}", () => Results.NotFound())` and return `404`; assertions like `Assert.Equal(Created, ...)` and `Assert.Single` fail.

- [ ] **Step 3: Implement the endpoints**

Create `api/PortfolioReport.Api/Endpoints/SpeculativeHoldsEndpoints.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class SpeculativeHoldsEndpoints
{
    public static void MapSpeculativeHoldsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/speculative-holds", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var holds = ctx["speculative_holds"]?.AsArray() ?? new JsonArray();
            return Results.Content(holds.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/speculative-holds", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ticker = Json.Str(body?["ticker"]);
            if (string.IsNullOrWhiteSpace(ticker))
                return Results.BadRequest(new { error = "ticker is required" });

            var reason = Json.Str(body?["reason"]);
            JsonObject hold = null!;
            var existed = false;
            await store.MutateAsync(user, c =>
            {
                // Initialize the key when absent — pre-feature contexts lack it.
                var arr = c["speculative_holds"]?.AsArray();
                if (arr is null)
                {
                    arr = new JsonArray();
                    c["speculative_holds"] = arr;
                }

                var match = arr.OfType<JsonObject>()
                    .FirstOrDefault(h => Json.Str(h["ticker"]) == ticker);
                if (match is not null)
                {
                    existed = true;
                    hold = (JsonObject)match.DeepClone();
                    return;
                }

                hold = new JsonObject { ["ticker"] = ticker };
                if (!string.IsNullOrWhiteSpace(reason)) hold["reason"] = reason;
                hold["designated_at"] = ContextIds.Timestamp();
                arr.Add(hold.DeepClone());
            });

            return Results.Content(hold.ToJsonString(), "application/json",
                statusCode: existed ? StatusCodes.Status200OK : StatusCodes.Status201Created);
        }).RequireAuthorization("session");

        app.MapDelete("/api/speculative-holds/{ticker}", async (
            string ticker, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["speculative_holds"]?.AsArray();
                if (arr is null) return;
                for (var i = 0; i < arr.Count; i++)
                {
                    if (Json.Str(arr[i]?["ticker"]) == ticker)
                    {
                        arr.RemoveAt(i);
                        removed = true;
                        return;
                    }
                }
            });

            return removed
                ? Results.NoContent()
                : Results.NotFound(new { error = "not found" });
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Register the endpoint group in `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, add the mapping call immediately after the `app.MapProfileEndpoints();` line (currently line 169):

```csharp
app.MapProfileEndpoints();
app.MapSpeculativeHoldsEndpoints();
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj --filter "FullyQualifiedName~SpeculativeHoldsEndpointsTests"`
Expected: PASS — all 9 tests green.

- [ ] **Step 6: Run the full API test suite (no regressions)**

Run: `dotnet test api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj`
Expected: PASS — the pre-existing suites plus the 9 new tests, no failures.

- [ ] **Step 7: Commit**

```bash
git add api/PortfolioReport.Api/Endpoints/SpeculativeHoldsEndpoints.cs api/PortfolioReport.Api/Program.cs api/PortfolioReport.Api.Tests/SpeculativeHoldsEndpointsTests.cs
git commit -m "feat(api): /api/speculative-holds GET/POST/DELETE endpoints"
```

---

### Task 2: Report UI — manage the sleeve from flags (React)

**Files:**
- Modify: `src/report/app/types.ts` (add `SpeculativeHold`)
- Modify: `src/report/app/App.tsx` (live state + load + add/remove handlers + pass props)
- Modify: `src/report/app/sections/Flags.tsx` (per-flag add action, optimistic mute, removable sleeve banner)

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/speculative-holds` from Task 1; existing `appPath()`; `data.portfolio.holdings[].asset_class` and `data.aggregates.speculative_sleeve_*` from the app mirror.
- Produces: `Flags` props `speculativeHolds?: SpeculativeHold[]`, `onAddHold?: (ticker: string, reason?: string) => void`, `onRemoveHold?: (ticker: string) => void`.

No automated test (React UI — manual verification per repo convention). The hard gate is `npx tsc --noEmit -p src/report/app/tsconfig.json` clean.

- [ ] **Step 1: Add the `SpeculativeHold` type to the app mirror**

In `src/report/app/types.ts`, add immediately after the `FlagSuppressionRef` interface (around line 183):

```typescript
export interface SpeculativeHold {
  ticker: string;
  reason?: string;
  designated_at: string;
}
```

- [ ] **Step 2: Add live state, loader, and handlers in `App.tsx`**

In `src/report/app/App.tsx`, add `SpeculativeHold` to the type import from `./types` (it already imports `Situation`, `ChatMessage`, `ChatScope`, etc. — add `SpeculativeHold` to that import list).

Add the state next to `liveSituations` (currently line 29):

```typescript
  const [liveSpeculativeHolds, setLiveSpeculativeHolds] = useState<SpeculativeHold[]>([]);
```

Add the loader right after `loadSituations` (currently ends at line 76):

```typescript
  const loadSpeculativeHolds = useCallback(async () => {
    try {
      const r = await fetch(appPath("/api/speculative-holds"));
      if (!r.ok) return;
      const list = (await r.json()) as SpeculativeHold[];
      setLiveSpeculativeHolds(list);
    } catch {
      // Network error — keep prior state.
    }
  }, []);
```

Call it in the authed-load effect (currently lines 88-94) and add it to the dependency array:

```typescript
  useEffect(() => {
    if (authed !== true) return;
    loadAnalysis();
    loadSituations();
    loadSpeculativeHolds();
    const id = setInterval(loadSituations, 5000);
    return () => clearInterval(id);
  }, [authed, loadAnalysis, loadSituations, loadSpeculativeHolds]);
```

Add the two handlers after `handleDelete` (currently ends at line 125):

```typescript
  const addSpeculativeHold = useCallback(
    async (ticker: string, reason?: string) => {
      try {
        const r = await fetch(appPath("/api/speculative-holds"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, reason }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await loadSpeculativeHolds();
      } catch (err) {
        console.warn("Failed to add speculative hold:", err);
      }
    },
    [loadSpeculativeHolds],
  );

  const removeSpeculativeHold = useCallback(
    async (ticker: string) => {
      try {
        await fetch(appPath(`/api/speculative-holds/${encodeURIComponent(ticker)}`), {
          method: "DELETE",
        });
        await loadSpeculativeHolds();
      } catch (err) {
        console.warn("Failed to remove speculative hold:", err);
      }
    },
    [loadSpeculativeHolds],
  );
```

- [ ] **Step 3: Pass the new props to `<Flags>`**

In `src/report/app/App.tsx`, replace the `<Flags ... />` element (currently line 300):

```tsx
          <Flags
            data={typedData}
            speculativeHolds={liveSpeculativeHolds}
            onAddHold={addSpeculativeHold}
            onRemoveHold={removeSpeculativeHold}
            onDiscuss={(k) => startDiscussion({ type: "flag", finding_key: k })}
          />
```

- [ ] **Step 4: Run the React typecheck to verify it fails**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: FAIL — `Flags` does not yet accept `speculativeHolds`/`onAddHold`/`onRemoveHold` (TS2322 on the new props).

- [ ] **Step 5: Update `Flags.tsx` — props, eligibility, optimistic mute, removable banner**

Replace the import line and `Props` interface at the top of `src/report/app/sections/Flags.tsx` (currently lines 1-8):

```tsx
import { AnalysisOutput, Flag, SpeculativeHold } from "../types";
import { COLORS } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

interface Props {
  data: AnalysisOutput;
  onDiscuss?: (finding_key: string) => void;
  speculativeHolds?: SpeculativeHold[];
  onAddHold?: (ticker: string, reason?: string) => void;
  onRemoveHold?: (ticker: string) => void;
}
```

Replace the component body (currently lines 10-53) — the function signature through the closing of the returned JSX:

```tsx
export default function Flags({ data, onDiscuss, speculativeHolds, onAddHold, onRemoveHold }: Props) {
  const flags = [...data.flags].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "red" ? -1 : 1;
  });

  if (flags.length === 0) {
    return (
      <div style={{
        background: "rgba(29, 158, 117, 0.08)",
        border: `1px solid ${COLORS.green}`,
        borderRadius: 6,
        padding: "14px 16px",
        fontSize: 13,
        color: COLORS.green,
        fontWeight: 500,
      }}>
        No critical flags this week.
      </div>
    );
  }

  const sleeveWeight = data.aggregates.speculative_sleeve_weight ?? 0;
  const publishedTickers = data.aggregates.speculative_sleeve_tickers ?? [];
  // Tickers the user has designated this session (optimistic, pre-publish).
  const liveTickers = (speculativeHolds ?? []).map((h) => h.ticker);
  const heldLive = new Set(liveTickers);
  // Banner shows the union of published sleeve tickers and live additions.
  const bannerTickers = Array.from(new Set([...publishedTickers, ...liveTickers]));
  // A flag is eligible for "add to sleeve" only if it names an individual stock.
  const stockTickers = new Set(
    data.portfolio.holdings
      .filter((h) => h.asset_class === "individual_stock")
      .map((h) => h.ticker),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {bannerTickers.length > 0 && (
        <div style={{
          fontSize: 12,
          color: "#888",
          padding: "6px 10px",
          border: "1px dashed #444",
          borderRadius: 6,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
        }}>
          <span>Speculative sleeve: {(sleeveWeight * 100).toFixed(1)}% (excluded from risk scoring)</span>
          {bannerTickers.map((t) => (
            <span key={t} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "monospace",
              background: "#222",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              padding: "1px 6px",
            }}>
              {t}
              {onRemoveHold && (
                <button
                  onClick={() => onRemoveHold(t)}
                  title={`Remove ${t} from speculative sleeve`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {flags.map((flag, i) => (
        <FlagRow
          key={`${flag.finding_key ?? "flag"}-${i}`}
          flag={flag}
          isHeldLive={heldLive.has(flag.ticker)}
          isEligible={stockTickers.has(flag.ticker)}
          onDiscuss={onDiscuss}
          onAddHold={onAddHold}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Update `FlagRow` — accept the new props, mute optimistically, add the action button**

Replace the `FlagRow` function signature and the first few lines (currently lines 55-72, from `function FlagRow(...)` through the opening `<div style={{` block's `opacity` line):

```tsx
function FlagRow({
  flag, isHeldLive, isEligible, onDiscuss, onAddHold,
}: {
  flag: Flag;
  isHeldLive: boolean;
  isEligible: boolean;
  onDiscuss?: (key: string) => void;
  onAddHold?: (ticker: string, reason?: string) => void;
}) {
  const isRed = flag.severity === "red";
  const isSuppressed = !!flag.suppressed_by;
  // Mute when published-suppressed OR designated live this session.
  const muted = isSuppressed || isHeldLive;
  const severityColor = isRed ? COLORS.red : COLORS.amber;
  const severityBg = isRed ? "rgba(226, 75, 74, 0.12)" : "rgba(186, 117, 23, 0.12)";
  const isMobile = useIsMobile();

  return (
    <div style={{
      background: muted ? "transparent" : COLORS.card,
      border: muted ? "1px dashed #555" : `1px solid ${COLORS.border}`,
      borderRadius: 6,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      opacity: muted ? 0.6 : 1,
    }}>
```

In the same `FlagRow`, replace the desktop button area (the `<div style={{ flex: 1 }} />` spacer through the desktop Discuss `{onDiscuss && !isMobile && (...)}` block, currently lines 105-123) so an "add to sleeve" button sits alongside Discuss:

```tsx
        <div style={{ flex: 1 }} />
        {isEligible && !muted && onAddHold && !isMobile && (
          <button
            onClick={() => onAddHold(flag.ticker)}
            title="Hold deliberately — add to speculative sleeve"
            style={{
              flexShrink: 0,
              fontSize: 12,
              padding: "2px 8px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: COLORS.text,
              cursor: "pointer",
            }}
          >
            ⊘ Hold deliberately
          </button>
        )}
        {onDiscuss && !isMobile && (
          <button
            onClick={() => onDiscuss(flag.finding_key)}
            title="Discuss in chat"
            style={{
              flexShrink: 0,
              fontSize: 12,
              padding: "2px 8px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 4,
              color: COLORS.text,
              cursor: "pointer",
            }}
          >
            💬 Discuss
          </button>
        )}
```

Replace the "Row 2" suppressed badge and the "Row 3 footer" suppression text (currently lines 129-155) so the badge and footer reflect both published and live-held states:

```tsx
        {muted && (
          <span style={{
            padding: "1px 5px",
            borderRadius: 3,
            background: "#1a3a2a",
            color: "#4ade80",
            fontSize: 10,
            fontWeight: 600,
            flexShrink: 0,
          }}>
            speculative
          </span>
        )}
      </div>

      {/* Row 3: body — own row, full card width */}
      <div style={{ fontSize: 13, color: "#bbb", lineHeight: 1.6, overflowWrap: "anywhere", minWidth: 0 }}>
        {flag.body}
      </div>

      {isSuppressed && flag.suppressed_by ? (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          {flag.suppressed_by.source === "speculative_hold"
            ? `Speculative-sleeve hold — excluded from scoring${flag.suppressed_by.body ? `: "${flag.suppressed_by.body}"` : ""}`
            : `Suppressed by your note: "${flag.suppressed_by.body}"`}
        </div>
      ) : isHeldLive ? (
        <div style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
          Speculative-sleeve hold — applies to scoring on the next report refresh.
        </div>
      ) : null}
```

Note: the original "Row 2" wrapper `<div>` (the title row containing `<span>{flag.title}</span>`) stays as-is; only its inner `{isSuppressed && (...)}` badge block is replaced by the `{muted && (...)}` badge above, and the body/footer blocks follow. Keep the existing mobile Discuss button block (currently lines 157-174) unchanged.

- [ ] **Step 7: Run the React typecheck to verify it passes**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: PASS — no errors.

- [ ] **Step 8: Run the root typecheck (unaffected)**

Run: `npx tsc --noEmit`
Expected: PASS — no errors (the engine/CLI are untouched).

- [ ] **Step 9: Manual eyeball (optional but recommended)**

Run: `npm run report` and confirm: an individual-stock flag (e.g. TSLA) shows a "⊘ Hold deliberately" button; clicking it mutes that ticker's flags and adds it to the dashed sleeve banner with an "×"; clicking "×" un-mutes. (Requires a signed-in session against a running API; if unavailable, the typecheck is the gate.)

- [ ] **Step 10: Commit**

```bash
git add src/report/app/types.ts src/report/app/App.tsx src/report/app/sections/Flags.tsx
git commit -m "feat(report): add/remove speculative holds from flags with optimistic mute"
```

---

## Final verification

- [ ] **.NET suite**

Run: `dotnet test api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj`
Expected: all tests pass (pre-existing + 9 new).

- [ ] **TypeScript typechecks**

Run: `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors in either.

- [ ] **TS unit suite (no regressions)**

Run: `npx vitest run`
Expected: same baseline as before this branch — the engine is untouched (the 5 pre-existing `normalize.test.ts` ENOENT failures for missing `data/SamplePortfolio/*.json` are unrelated and predate this work).

## Post-deploy seeding (manual, not a code task)

After deploying the API + report build, sign in to the hosted report and click "⊘ Hold deliberately" on the TSLA and NVDA flags. This writes them to the server's authoritative `user-context.json`. The next `publish:kevin` then pulls a seeded context, `analyze` exempts them, and the hosted report shows the sleeve durably. No migration script is required.

## Self-review (completed during planning)

**Spec coverage:**
- `GET/POST/DELETE /api/speculative-holds`, key-init-if-absent, dedup, server-stamped `designated_at`, `RequireAuthorization("session")`, registration in `Program.cs` → Task 1 + its tests.
- C# tests mirroring existing endpoint tests (empty GET, add, dedup, key-init, delete, 404, 401, user-scoping) → Task 1 Step 1.
- `SpeculativeHold` added to app mirror → Task 2 Step 1.
- `liveSpeculativeHolds` state + load + add/remove handlers mirroring `liveSituations` → Task 2 Steps 2-3.
- Per-flag "add to sleeve" on individual-stock flags; optimistic mute; removable sleeve banner; union of published + live tickers → Task 2 Steps 5-6.
- "Applies on next report refresh" footer (honest deferred-score model) → Task 2 Step 6.
- Threshold not UI-editable; engine/CLI untouched → respected (no tasks touch them).
- Seeding via UI, no script → Post-deploy seeding section.

**Placeholder scan:** none — every step has complete code/commands.

**Type consistency:** `MapSpeculativeHoldsEndpoints` defined (Task 1 Step 3) and called (Step 4). The `Flags` props `speculativeHolds`/`onAddHold`/`onRemoveHold` are defined in Task 2 Step 5 and passed in Step 3; `FlagRow`'s `isHeldLive`/`isEligible`/`onAddHold` (Step 6) match what `Flags` passes (Step 5). `SpeculativeHold` shape (`ticker`/`reason?`/`designated_at`) is identical across the C# POST body handling, the app mirror type, and the engine's existing `parseUserContext` schema.
