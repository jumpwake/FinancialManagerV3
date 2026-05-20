# Hosted Report Phase 3 — Browser AI + Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light up chat in the hosted report. The AI logic (prompt building, tool definitions, schema) runs in the **browser** via the Anthropic TypeScript SDK; the ASP.NET Core API hosts a **thin proxy** at `/api/ai` that injects each user's Anthropic API key server-side and pipes the response (including SSE streams) back. Chat history persists via a `/api/chat` CRUD endpoint built on the Phase 2 `UserContextStore`. Situations can then be created naturally through the chat's tool-use proposals.

**Architecture:** The browser calls `/api/ai/v1/messages` exactly the way the Anthropic SDK speaks to `api.anthropic.com/v1/messages` — same path, same body shape. The proxy authenticates the session, validates a `max_tokens` cap, enforces a per-user rate limit, looks up *that user's* `AnthropicApiKey` from the allowlist, forwards the request with the real key attached, and streams the response back unbuffered. The browser SDK is configured with `baseURL: "/api/ai"`, a placeholder `apiKey`, and `dangerouslyAllowBrowser: true` — safe because the real key never reaches the browser. After each AI turn, the browser POSTs the new messages to `/api/chat` to persist them in `user-context.json#chat_history` via the `UserContextStore`. The existing `src/ai/chat.ts`, `pulseCheck.ts`, and `advisorPersona.ts` move into `src/report/app/ai/` so the browser can import them with no logic changes.

**Tech Stack:** ASP.NET Core 8 (`IHttpClientFactory`, `Microsoft.AspNetCore.RateLimiting`, `System.Text.Json.Nodes`), `@anthropic-ai/sdk` browser-side (already a repo dependency at `^0.95.0`), xUnit for proxy tests with a stubbed `HttpMessageHandler`.

**Source spec:** `docs/superpowers/specs/2026-05-18-hosted-report-design.md` (Phase 3).

**Scope notes:**
- Per-user Anthropic API keys (matches the spec's "User record"). Each entry in `appsettings.json` `Allowlist.Users[i]` gains an `AnthropicApiKey` field. Keys live in the (private) committed config per the repo owner's decision.
- This plan branches from `main` after Phase 2 is merged (it is — `main` is at `43eaeb4`).
- "PulseCheck per Situation" — the spec says one Anthropic call per open Situation. To keep AI spend predictable, this plan exposes pulse-check as an on-demand action (button per situation in the UI), not an automatic background trigger. Automatic refresh can be a Phase 3.5 follow-on.

---

## File Structure

**New — C# server:**
- `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs` — `POST /api/ai/v1/messages` proxy.
- `api/PortfolioReport.Api/Endpoints/ChatEndpoints.cs` — `GET`/`POST /api/chat` chat-history persistence.

**Modified — C# server:**
- `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs` — add `AnthropicApiKey` to `UserRecord`; add `FindByUser(string)` lookup.
- `api/PortfolioReport.Api/appsettings.json` — add `AnthropicApiKey` field to each allowlist entry (placeholder for the committed version).
- `api/PortfolioReport.Api/Program.cs` — register `IHttpClientFactory`, the rate limiter, the two new endpoint groups.

**New — C# tests:**
- `api/PortfolioReport.Api.Tests/AiProxyEndpointsTests.cs` — uses a stub `HttpMessageHandler` (registered via `IHttpClientFactory`) to assert the proxy forwards correctly, injects the key, enforces the cap, and rate-limits.
- `api/PortfolioReport.Api.Tests/ChatEndpointsTests.cs` — GET history / POST appends.

**Moved — TypeScript:**
- `src/ai/chat.ts` → `src/report/app/ai/chat.ts`.
- `src/ai/pulseCheck.ts` → `src/report/app/ai/pulseCheck.ts`.
- `src/ai/advisorPersona.ts` → `src/report/app/ai/advisorPersona.ts`.
- `src/ai/chat.prompt.test.ts` → `src/report/app/ai/chat.prompt.test.ts` (with snapshots).
- `src/ai/pulseCheck.prompt.test.ts` → `src/report/app/ai/pulseCheck.prompt.test.ts` (with snapshots).
- `src/ai/__snapshots__/` → `src/report/app/ai/__snapshots__/`.

**Stays in `src/ai/`** (still used by the local `analyze` pipeline):
- `narratives.ts`, `tacticalAdvisor.ts` and their prompt tests/snapshots.

**Modified — React:**
- `src/report/app/sidebar/useChat.ts` — full rewrite to use the Anthropic SDK against `/api/ai` and persist via `/api/chat`.
- `src/report/app/sections/OpenSituations.tsx` — add a "Refresh verdict" button per situation that calls browser-side `pulseCheck` and PATCHes the result onto the situation.
- `src/report/app/types.ts` (mirror) — confirm the mirror covers the types `chat.ts`/`pulseCheck.ts` use.

**Deleted — dead server-side TS:**
- `src/server/handlers/chat.ts`, `situations.ts`, `notes.ts`, `profile.ts` — all reimplemented in C# (Phase 1 + 2). The chat handler is the last one needed.
- `src/server/userContextStore.ts` — only ever used by those handlers.
- `src/server/vitePlugin.ts` — not referenced by `vite.config.ts` since Phase 1 Task 12.

---

## Task 1: AllowlistOptions — per-user Anthropic key + FindByUser

**Files:**
- Modify: `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs`
- Modify: `api/PortfolioReport.Api/appsettings.json`
- Test: `api/PortfolioReport.Api.Tests/AllowlistOptionsTests.cs` (extend)

- [ ] **Step 1: Write the failing tests**

In `api/PortfolioReport.Api.Tests/AllowlistOptionsTests.cs`, add these tests inside the existing class:

```csharp
    [Fact]
    public void FindByUserReturnsMatchingRecord()
    {
        var options = new AllowlistOptions
        {
            Users =
            {
                new UserRecord { Email = "a@x", User = "alice", PushToken = "t", AnthropicApiKey = "sk-A" },
                new UserRecord { Email = "b@x", User = "bob",   PushToken = "u", AnthropicApiKey = "sk-B" },
            }
        };

        Assert.Equal("sk-A", options.FindByUser("alice")?.AnthropicApiKey);
        Assert.Equal("sk-B", options.FindByUser("bob")?.AnthropicApiKey);
        Assert.Null(options.FindByUser("nobody"));
    }

    [Fact]
    public void UserRecordAnthropicApiKeyDefaultsToEmpty()
    {
        var r = new UserRecord();
        Assert.Equal("", r.AnthropicApiKey);
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AllowlistOptionsTests`
Expected: FAIL — `AnthropicApiKey` and `FindByUser` don't exist (compile error).

- [ ] **Step 3: Add the field and lookup**

In `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs`, add `AnthropicApiKey` to `UserRecord` and `FindByUser` to `AllowlistOptions`. The full updated file:

```csharp
namespace PortfolioReport.Api.Configuration;

public sealed class UserRecord
{
    public string Email { get; set; } = "";
    public string User { get; set; } = "";
    public string PushToken { get; set; } = "";
    public string AnthropicApiKey { get; set; } = "";
}

public sealed class AllowlistOptions
{
    public const string SectionName = "Allowlist";

    public List<UserRecord> Users { get; set; } = new();

    public UserRecord? FindByEmail(string? email) =>
        string.IsNullOrWhiteSpace(email)
            ? null
            : Users.FirstOrDefault(u =>
                string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));

    public UserRecord? FindByPushToken(string? token) =>
        string.IsNullOrEmpty(token)
            ? null
            : Users.FirstOrDefault(u => u.PushToken == token);

    public UserRecord? FindByUser(string? user) =>
        string.IsNullOrEmpty(user)
            ? null
            : Users.FirstOrDefault(u => u.User == user);
}
```

- [ ] **Step 4: Update `appsettings.json` to declare the new field**

In `api/PortfolioReport.Api/appsettings.json`, add `"AnthropicApiKey"` to each allowlist user. Use empty placeholders in the committed copy — the repo owner replaces them locally:

```json
  "Allowlist": {
    "Users": [
      { "Email": "kbowsher@gmail.com",     "User": "kevin", "PushToken": "1234", "AnthropicApiKey": "" },
      { "Email": "lukebowsher05@gmail.com","User": "luke",  "PushToken": "5678", "AnthropicApiKey": "" }
    ]
  }
```

(Keep whatever live `Google` and other values are already in the file — only the allowlist objects change.)

- [ ] **Step 5: Run tests to verify pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AllowlistOptionsTests`
Expected: PASS — 5 tests (the 3 existing + 2 new).

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): per-user AnthropicApiKey in allowlist + FindByUser lookup"
```

---

## Task 2: /api/ai proxy — forward + stream

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/AiProxyEndpointsTests.cs`
- Test helper: `api/PortfolioReport.Api.Tests/StubHttpMessageHandler.cs`

- [ ] **Step 1: Create the test stub for upstream Anthropic**

Create `api/PortfolioReport.Api.Tests/StubHttpMessageHandler.cs`:

```csharp
using System.Net;

/// <summary>
/// Stand-in for api.anthropic.com. Tests configure a response (or a producer
/// function) and inspect the captured request afterwards.
/// </summary>
public sealed class StubHttpMessageHandler : HttpMessageHandler
{
    public HttpRequestMessage? CapturedRequest { get; private set; }
    public string? CapturedRequestBody { get; private set; }
    public Func<HttpRequestMessage, HttpResponseMessage> Responder { get; set; } =
        _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":\"msg_stub\"}", System.Text.Encoding.UTF8, "application/json"),
        };

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request, CancellationToken cancellationToken)
    {
        CapturedRequest = request;
        if (request.Content is not null)
            CapturedRequestBody = await request.Content.ReadAsStringAsync(cancellationToken);
        return Responder(request);
    }
}
```

- [ ] **Step 2: Wire the stub into `ApiFactory`**

In `api/PortfolioReport.Api.Tests/ApiFactory.cs`, expose the stub and register it as the handler for the `"anthropic"` named client. Add a public property and replace the named-client registration inside `ConfigureTestServices`:

```csharp
    public StubHttpMessageHandler AnthropicStub { get; } = new();
```

Inside `builder.ConfigureTestServices`, add at the end:

```csharp
            services.AddHttpClient("anthropic")
                .ConfigurePrimaryHttpMessageHandler(() => AnthropicStub);
```

(`AddHttpClient` may or may not already be present in production code — adding it in test services is harmless because Task 2 Step 5 below also adds it in `Program.cs`.)

- [ ] **Step 3: Write the failing tests**

Create `api/PortfolioReport.Api.Tests/AiProxyEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Xunit;

public class AiProxyEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    [Fact]
    public async Task RejectsAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-sonnet-4-6", max_tokens = 100, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ForwardsBodyAndInjectsTheUsersAnthropicKey()
    {
        using var factory = new ApiFactory();
        // The default ApiFactory allowlist user is kevin; give kevin a key.
        factory.AnthropicStub.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":\"msg_x\"}",
                System.Text.Encoding.UTF8, "application/json"),
        };
        using var client = SignedIn(factory, "kevin");

        var requestBody = new
        {
            model = "claude-sonnet-4-6",
            max_tokens = 100,
            messages = new[] { new { role = "user", content = "hi" } },
        };
        var res = await client.PostAsJsonAsync("/api/ai/v1/messages", requestBody);
        res.EnsureSuccessStatusCode();

        Assert.NotNull(factory.AnthropicStub.CapturedRequest);
        Assert.Equal("https://api.anthropic.com/v1/messages",
            factory.AnthropicStub.CapturedRequest!.RequestUri!.ToString());
        // The kevin allowlist entry's AnthropicApiKey was set by ApiFactory in Step 4 below.
        Assert.Equal("sk-kevin-test",
            factory.AnthropicStub.CapturedRequest!.Headers.GetValues("x-api-key").Single());
        Assert.Contains("\"max_tokens\":100", factory.AnthropicStub.CapturedRequestBody);
    }

    [Fact]
    public async Task PassesUpstreamBodyThrough()
    {
        using var factory = new ApiFactory();
        factory.AnthropicStub.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":\"msg_y\",\"role\":\"assistant\"}",
                System.Text.Encoding.UTF8, "application/json"),
        };
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-sonnet-4-6", max_tokens = 50, messages = Array.Empty<object>() });

        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("\"id\":\"msg_y\"", body);
        Assert.Contains("\"role\":\"assistant\"", body);
    }

    [Fact]
    public async Task ReturnsBadGatewayWhenUserHasNoAnthropicKey()
    {
        using var factory = new ApiFactory();
        factory.OverrideAnthropicKeyForKevin = "";  // see ApiFactory hook below
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-sonnet-4-6", max_tokens = 50, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
    }
}
```

- [ ] **Step 4: Give the test factory a key for kevin (and an override hook)**

In `api/PortfolioReport.Api.Tests/ApiFactory.cs`, alongside the existing `Allowlist:Users:0:*` `UseSetting` calls, add a key for kevin and an override property:

```csharp
    /// <summary>Test override for kevin's Anthropic key (empty = simulate not configured).</summary>
    public string OverrideAnthropicKeyForKevin { get; set; } = "sk-kevin-test";
```

And inside `ConfigureWebHost`, add (alongside the other `UseSetting`s for the allowlist):

```csharp
        builder.UseSetting("Allowlist:Users:0:AnthropicApiKey", OverrideAnthropicKeyForKevin);
```

- [ ] **Step 5: Run to verify failure**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AiProxyEndpointsTests`
Expected: FAIL — `/api/ai/v1/messages` returns 404 (endpoint missing).

- [ ] **Step 6: Implement the proxy**

Create `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs`:

```csharp
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Configuration;

namespace PortfolioReport.Api.Endpoints;

public static class AiProxyEndpoints
{
    private const string UpstreamUrl = "https://api.anthropic.com/v1/messages";
    private const string AnthropicVersionHeader = "anthropic-version";
    private const string AnthropicVersion = "2023-06-01";

    public static void MapAiProxyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/ai/v1/messages", async (
            HttpContext http,
            IHttpClientFactory hcf,
            IOptions<AllowlistOptions> allowlist) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var record = allowlist.Value.FindByUser(user);
            var key = record?.AnthropicApiKey;
            if (string.IsNullOrEmpty(key))
                return Results.StatusCode(StatusCodes.Status502BadGateway);

            // Buffer the incoming body so we can forward it.
            using var reader = new StreamReader(http.Request.Body);
            var body = await reader.ReadToEndAsync();

            var upstreamReq = new HttpRequestMessage(HttpMethod.Post, UpstreamUrl);
            upstreamReq.Headers.Add("x-api-key", key);
            upstreamReq.Headers.Add(AnthropicVersionHeader, AnthropicVersion);
            upstreamReq.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

            var client = hcf.CreateClient("anthropic");
            var upstreamRes = await client.SendAsync(
                upstreamReq,
                HttpCompletionOption.ResponseHeadersRead,
                http.RequestAborted);

            // Mirror upstream status + content type, then stream the body through.
            http.Response.StatusCode = (int)upstreamRes.StatusCode;
            if (upstreamRes.Content.Headers.ContentType is { } ct)
                http.Response.ContentType = ct.ToString();

            await using var upstream = await upstreamRes.Content.ReadAsStreamAsync(http.RequestAborted);
            await upstream.CopyToAsync(http.Response.Body, http.RequestAborted);
            return Results.Empty;
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 7: Register HttpClient + the endpoint in `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, in the service registrations (after the `UserContextStore` line is a good spot), add:

```csharp
builder.Services.AddHttpClient("anthropic");
```

In the endpoint maps (after `app.MapProfileEndpoints();`), add:

```csharp
app.MapAiProxyEndpoints();
```

- [ ] **Step 8: Run tests to verify pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AiProxyEndpointsTests`
Expected: PASS — 4 tests.

- [ ] **Step 9: Commit**

```bash
git add api
git commit -m "feat(api): /api/ai proxy forwards to Anthropic, injects per-user key"
```

---

## Task 3: /api/ai — max_tokens cap + per-user rate limit

**Files:**
- Modify: `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/AiProxyEndpointsTests.cs` (extend)

- [ ] **Step 1: Append failing tests**

Add these methods to `AiProxyEndpointsTests`:

```csharp
    [Fact]
    public async Task RejectsRequestsExceedingMaxTokensCap()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-sonnet-4-6", max_tokens = 50000, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task SixtyFirstRequestInOneMinuteIsRateLimited()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        // Burst through the per-user window. The limit is 60/min.
        HttpResponseMessage? last = null;
        for (var i = 0; i < 61; i++)
        {
            last = await client.PostAsJsonAsync("/api/ai/v1/messages",
                new { model = "claude-sonnet-4-6", max_tokens = 10, messages = Array.Empty<object>() });
            if (last.StatusCode == HttpStatusCode.TooManyRequests) break;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AiProxyEndpointsTests`
Expected: FAIL — both new tests fail (no cap, no limiter).

- [ ] **Step 3: Add the max_tokens cap inline in the proxy**

In `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs`, define a constant at the top of the class:

```csharp
    public const int MaxTokensCap = 16_000;
```

In the handler, right after reading the body and before constructing the upstream request, add the validation:

```csharp
            // Cap max_tokens to prevent an authenticated user from running up the bill.
            try
            {
                var parsed = System.Text.Json.Nodes.JsonNode.Parse(body) as System.Text.Json.Nodes.JsonObject;
                if (parsed?["max_tokens"] is System.Text.Json.Nodes.JsonValue v
                    && v.TryGetValue<int>(out var mt) && mt > MaxTokensCap)
                {
                    return Results.BadRequest(new { error = $"max_tokens {mt} exceeds cap {MaxTokensCap}" });
                }
            }
            catch (System.Text.Json.JsonException)
            {
                return Results.BadRequest(new { error = "request body is not valid JSON" });
            }
```

- [ ] **Step 4: Register the rate limiter in `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, before `var app = builder.Build();`, add the rate-limiter configuration:

```csharp
builder.Services.AddRateLimiter(opts =>
{
    opts.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    opts.AddPolicy("ai-per-user", http =>
        Microsoft.AspNetCore.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: PortfolioReport.Api.Auth.CurrentUser.KeyOf(http.User) ?? "anonymous",
            factory: _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});
```

After `app.UseAuthorization();`, add:

```csharp
app.UseRateLimiter();
```

- [ ] **Step 5: Apply the rate-limit policy to the proxy endpoint**

In `api/PortfolioReport.Api/Endpoints/AiProxyEndpoints.cs`, chain `.RequireRateLimiting("ai-per-user")` after the existing `.RequireAuthorization("session")` call. The fluent chain becomes:

```csharp
        }).RequireAuthorization("session").RequireRateLimiting("ai-per-user");
```

- [ ] **Step 6: Run tests to verify pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AiProxyEndpointsTests`
Expected: PASS — 6 tests (4 from Task 2 + 2 new). The rate-limiter window in tests resets between tests because each test creates its own factory + isolated process state... actually the rate limiter's partition state is per-process; with one factory per test, each test gets a fresh `WebApplication` and a fresh limiter dictionary. Verify this is true; if not, add a `[CollectionDefinition]` to serialize the tests or expose a reset on the limiter.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): /api/ai max_tokens cap (16000) + per-user 60/min rate limit"
```

---

## Task 4: /api/chat — history GET + POST

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/ChatEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/ChatEndpointsTests.cs`

- [ ] **Step 1: Write the failing tests**

Create `api/PortfolioReport.Api.Tests/ChatEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class ChatEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    private static object SampleMessage(string role, string text) => new
    {
        id = "msg_" + Guid.NewGuid().ToString("N")[..8],
        role,
        content = text,
        scope = new { type = "global" },
        created_at = DateTime.UtcNow.ToString("o"),
    };

    [Fact]
    public async Task GetRejectsAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/chat");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/chat"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostAppendsMessagesAndGetReturnsThem()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var append = new[] { SampleMessage("user", "what's my grade?"), SampleMessage("assistant", "B") };
        var post = await client.PostAsJsonAsync("/api/chat", append);
        Assert.Equal(HttpStatusCode.NoContent, post.StatusCode);

        var list = await (await client.GetAsync("/api/chat"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Equal(2, list!.Count);
        Assert.Equal("user", (string)list[0]!["role"]!);
        Assert.Equal("assistant", (string)list[1]!["role"]!);
    }

    [Fact]
    public async Task PostRejectsNonArrayBody()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/chat",
            new { not_an_array = true });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter ChatEndpointsTests`
Expected: FAIL — `/api/chat` returns 404.

- [ ] **Step 3: Implement the handlers**

Create `api/PortfolioReport.Api/Endpoints/ChatEndpoints.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class ChatEndpoints
{
    public static void MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/chat", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var history = ctx["chat_history"]?.AsArray() ?? new JsonArray();
            return Results.Content(history.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        // Body is an array of messages to append in order.
        app.MapPost("/api/chat", async (
            HttpContext http, UserContextStore store, JsonArray? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body must be a JSON array of messages" });

            await store.MutateAsync(user, c =>
            {
                var history = c["chat_history"]!.AsArray();
                foreach (var msg in body)
                    history.Add(msg?.DeepClone());
            });
            return Results.NoContent();
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Wire it into `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, after `app.MapProfileEndpoints();`, add:

```csharp
app.MapChatEndpoints();
```

- [ ] **Step 5: Run tests to verify pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter ChatEndpointsTests`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): /api/chat GET history + POST append messages"
```

---

## Task 5: Move chat/pulseCheck/advisorPersona into the React app

**Files:**
- Move: `src/ai/chat.ts` → `src/report/app/ai/chat.ts`
- Move: `src/ai/pulseCheck.ts` → `src/report/app/ai/pulseCheck.ts`
- Move: `src/ai/advisorPersona.ts` → `src/report/app/ai/advisorPersona.ts`
- Move: `src/ai/chat.prompt.test.ts` → `src/report/app/ai/chat.prompt.test.ts`
- Move: `src/ai/pulseCheck.prompt.test.ts` → `src/report/app/ai/pulseCheck.prompt.test.ts`
- Move: `src/ai/__snapshots__/chat.prompt.test.ts.snap` → `src/report/app/ai/__snapshots__/chat.prompt.test.ts.snap`
- Move: `src/ai/__snapshots__/pulseCheck.prompt.test.ts.snap` → `src/report/app/ai/__snapshots__/pulseCheck.prompt.test.ts.snap` (if it exists)
- Modify: import paths in the moved files (the relative imports change: `"../types"` → `"../types"` is unchanged from `src/ai/` to `src/report/app/ai/` if both ascend the same depth — verify; in this case both `../types` resolve from `src/ai/` to `src/types.ts` and from `src/report/app/ai/` to `src/report/app/types.ts`; the React app has its own mirror, so the import works without code change).

- [ ] **Step 1: Create the new directory and move the files**

```bash
mkdir -p src/report/app/ai/__snapshots__
git mv src/ai/chat.ts                            src/report/app/ai/chat.ts
git mv src/ai/pulseCheck.ts                      src/report/app/ai/pulseCheck.ts
git mv src/ai/advisorPersona.ts                  src/report/app/ai/advisorPersona.ts
git mv src/ai/chat.prompt.test.ts                src/report/app/ai/chat.prompt.test.ts
git mv src/ai/pulseCheck.prompt.test.ts          src/report/app/ai/pulseCheck.prompt.test.ts
git mv src/ai/__snapshots__/chat.prompt.test.ts.snap        src/report/app/ai/__snapshots__/chat.prompt.test.ts.snap
git mv src/ai/__snapshots__/pulseCheck.prompt.test.ts.snap  src/report/app/ai/__snapshots__/pulseCheck.prompt.test.ts.snap
```

(If `pulseCheck.prompt.test.ts.snap` does not exist, skip that line — `git mv` would error on a missing source.)

- [ ] **Step 2: Confirm the relative imports still resolve**

Both files use `import type ... from "../types"`. In the new location `src/report/app/ai/chat.ts`, `../types` resolves to `src/report/app/types.ts` (the React app's types mirror). Verify the mirror has every type `chat.ts` and `pulseCheck.ts` import. From `chat.ts`'s imports — `ChatMessage`, `ChatScope`, `Situation`, `Note`. From `pulseCheck.ts` — `Situation`, `PulseVerdict`, `Portfolio`, `MacroContext`, `Flag`, `MacroSnapshot`.

Open `src/report/app/types.ts` and confirm these symbols are exported. If any are missing, copy the matching `export interface ... { ... }` blocks from `src/types.ts` (the root canonical) into `src/report/app/types.ts`.

- [ ] **Step 3: Verify both TypeScript projects still type-check**

Run: `npx tsc --noEmit`
Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors. If any "cannot find module" appears, fix the import (most likely the React app's `tsconfig.json` excludes `src/ai/` — confirm the new location is in its `include` and that any stale path mappings are cleaned).

- [ ] **Step 4: Verify vitest still picks up the moved tests**

Run: `npm test`
Expected: the moved prompt tests run from their new path and pass. Snapshot files are at the new co-located `__snapshots__/`, so they match unchanged.

If vitest fails to find tests at the new location, add `src/report/app/**/*.test.ts(x)` to the vitest test pattern (in `vitest.config.ts` or `package.json` — whichever the repo uses).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ai): move chat/pulseCheck/advisorPersona into the React app

These now run browser-side via the /api/ai proxy. narratives.ts and
tacticalAdvisor.ts stay in src/ai/ — they still run locally as part of
the analyze pipeline."
```

---

## Task 6: Rewrite useChat — Anthropic SDK via /api/ai + history persistence

**Files:**
- Modify: `src/report/app/sidebar/useChat.ts` (full rewrite)

- [ ] **Step 1: Rewrite the hook**

Replace the entire contents of `src/report/app/sidebar/useChat.ts` with:

```ts
import { useCallback, useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import type { ChatScope, ChatMessage, ChatToolCall } from "../types";
import {
  CHAT_SYSTEM_PROMPT,
  CHAT_TOOLS,
  renderChatInput,
  type ChatInputContext,
} from "../ai/chat";

export interface UseChatResult {
  send: (message: string, scope: ChatScope, context: Omit<ChatInputContext, "user_message" | "scope" | "history">) => Promise<void>;
  history: ChatMessage[];
  pendingAssistantText: string;
  pendingToolUse: { tool: string; payload: Record<string, unknown> } | null;
  streaming: boolean;
  resetPending: () => void;
}

const client = new Anthropic({
  baseURL: "/api/ai",
  apiKey: "browser-placeholder",       // real key injected server-side by /api/ai
  dangerouslyAllowBrowser: true,       // safe — we only talk to our own proxy
});

function makeMsgId(): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `msg_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

async function persist(messages: ChatMessage[]): Promise<void> {
  await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
}

export function useChat(initialHistory: ChatMessage[] = []): UseChatResult {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [pendingAssistantText, setPendingAssistantText] = useState("");
  const [pendingToolUse, setPendingToolUse] =
    useState<{ tool: string; payload: Record<string, unknown> } | null>(null);
  const [streaming, setStreaming] = useState(false);

  const resetPending = useCallback(() => {
    setPendingAssistantText("");
    setPendingToolUse(null);
  }, []);

  const send = useCallback(
    async (message: string, scope: ChatScope, ctx: Omit<ChatInputContext, "user_message" | "scope" | "history">) => {
      setStreaming(true);
      setPendingAssistantText("");
      setPendingToolUse(null);

      const userMsg: ChatMessage = {
        id: makeMsgId(),
        role: "user",
        content: message,
        scope,
        created_at: new Date().toISOString(),
      };
      setHistory((h) => [...h, userMsg]);

      const userContent = renderChatInput({
        user_message: message,
        scope,
        history,
        ...ctx,
      });

      let assistantText = "";
      let toolUse: { tool: string; payload: Record<string, unknown> } | null = null;

      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: CHAT_SYSTEM_PROMPT,
          tools: CHAT_TOOLS as never,
          messages: [{ role: "user", content: userContent }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            assistantText += event.delta.text;
            setPendingAssistantText(assistantText);
          }
        }
        const final = await stream.finalMessage();
        for (const block of final.content) {
          if (block.type === "tool_use") {
            toolUse = { tool: block.name, payload: block.input as Record<string, unknown> };
            setPendingToolUse(toolUse);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assistantText += `\n[error: ${msg}]`;
        setPendingAssistantText(assistantText);
      }

      const assistantMsg: ChatMessage = {
        id: makeMsgId(),
        role: "assistant",
        content: assistantText,
        scope,
        created_at: new Date().toISOString(),
        ...(toolUse
          ? { tool_call: { ...toolUse, status: "proposed" as const } as ChatToolCall }
          : {}),
      };
      setHistory((h) => [...h, assistantMsg]);

      await persist([userMsg, assistantMsg]).catch(() => {/* non-fatal */});

      setPendingAssistantText("");
      setPendingToolUse(null);
      setStreaming(false);
    },
    [history],
  );

  return { send, history, pendingAssistantText, pendingToolUse, streaming, resetPending };
}
```

- [ ] **Step 2: Adjust callers**

`useChat`'s `send` signature now requires the AI context (analysis, situations, notes — what `renderChatInput` needs). Locate every call site of `send`:

Run: `npx grep -rn "\.send(" src/report/app/sidebar` (or `grep -rn`).

The Sidebar calls `send(message, scope)` — update those callers to also pass the context object. Typically `<Sidebar>` will receive an `analysis`, `situations`, and `notes` prop (from `App.tsx`) and forward them. Inspect `src/report/app/sidebar/Sidebar.tsx` and modify the `send` call to:

```ts
send(message, scope, { analysis, situations, notes });
```

Pass `analysis`, `situations`, `notes` props from `App.tsx` into `<Sidebar>` (App.tsx already holds these in state).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors. Fix any prop-typing or import errors as they appear.

- [ ] **Step 4: Manual smoke** (browser)

Run `npm run serve`, open `:5000`, sign in, open the chat, send "what's my grade?". Expect: streaming text appears, response persists across a refresh (because POST /api/chat appended it).

- [ ] **Step 5: Commit**

```bash
git add src/report
git commit -m "feat(report): chat runs in the browser via /api/ai; persists via /api/chat"
```

---

## Task 7: Browser-side pulseCheck — refresh-verdict button per situation

**Files:**
- Modify: `src/report/app/sections/OpenSituations.tsx`

- [ ] **Step 1: Inspect what OpenSituations renders today**

Read `src/report/app/sections/OpenSituations.tsx`. Confirm it lists open situations and already exposes per-situation actions (Discuss / Resolve / Delete).

- [ ] **Step 2: Add a Refresh-verdict button and handler**

Add an import:

```tsx
import Anthropic from "@anthropic-ai/sdk";
import { runPulseCheck, type PulseInput } from "../ai/pulseCheck";
```

And the same `client` constant as `useChat` uses (or import a shared `aiClient` from `../ai/client.ts` — see "tidy" note below). Inline copy is fine for now:

```tsx
const aiClient = new Anthropic({
  baseURL: "/api/ai",
  apiKey: "browser-placeholder",
  dangerouslyAllowBrowser: true,
});
```

Inside the component, add a refresh handler that runs pulseCheck and PATCHes the result onto the situation's `verdict_history`:

```tsx
const [pulsing, setPulsing] = useState<Set<string>>(new Set());

async function refreshVerdict(sit: Situation, ctx: { macro: MacroContext; portfolio: Portfolio; related_flags: Flag[] }) {
  if (pulsing.has(sit.id)) return;
  setPulsing(p => new Set(p).add(sit.id));
  try {
    const verdict = await runPulseCheck(
      { situation: sit, macro: ctx.macro, portfolio: ctx.portfolio, related_flags: ctx.related_flags },
      aiClient,
    );
    // Append the new verdict to verdict_history via the situations PATCH.
    const next = [...sit.verdict_history, verdict];
    await fetch(`/api/situations/${encodeURIComponent(sit.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict_history: next }),
    });
    // The 5s situations poll in App.tsx will pick up the change.
  } finally {
    setPulsing(p => { const n = new Set(p); n.delete(sit.id); return n; });
  }
}
```

For each open situation in the render, add a button next to Discuss / Resolve:

```tsx
<button
  type="button"
  disabled={pulsing.has(sit.id)}
  onClick={() => refreshVerdict(sit, { macro, portfolio, related_flags })}
>
  {pulsing.has(sit.id) ? "Checking…" : "Refresh verdict"}
</button>
```

Pass `macro`, `portfolio`, and the relevant `related_flags` (filtered by `sit.related_findings`) as props from `App.tsx` into `<OpenSituations>`. App.tsx already holds `typedData` — derive `macro = typedData.macro`, `portfolio = typedData.portfolio`, and `related_flags = typedData.flags.filter(f => sit.related_findings.includes(f.finding_key))`.

- [ ] **Step 3: Adjust `runPulseCheck` to take a client argument**

Currently `pulseCheck.ts`'s `runPulseCheck` constructs `new Anthropic()` internally. For browser use, accept the client as a parameter. In `src/report/app/ai/pulseCheck.ts`, change the signature:

```ts
export async function runPulseCheck(input: PulseInput, client: Anthropic): Promise<PulseVerdict> {
  // remove: const client = new Anthropic();
  ...
}
```

This breaks the local `analyze` pipeline (which currently calls `runPulseCheck(input)` without a client). However, the analyze pipeline never actually called `runPulseCheck` — it's a hosted-only feature triggered after analyze. Confirm by `grep -rn "runPulseCheck" src/` (excluding the React-app dir). If there are zero callers outside `src/report/app/`, this change is safe.

- [ ] **Step 4: Type-check + manual smoke**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors.

`npm run serve`, sign in, open a situation, click **Refresh verdict** — a new entry should appear in the situation's `verdict_history` after a couple of seconds.

- [ ] **Step 5: Commit**

```bash
git add src/report/app
git commit -m "feat(report): per-situation Refresh verdict button (browser pulseCheck)"
```

---

## Task 8: Remove dead server-side TS code

**Files:**
- Delete: `src/server/handlers/chat.ts`
- Delete: `src/server/handlers/situations.ts`
- Delete: `src/server/handlers/notes.ts`
- Delete: `src/server/handlers/profile.ts`
- Delete: `src/server/userContextStore.ts`
- Delete: `src/server/userContextStore.test.ts` (if it still references the deleted store)
- Delete: `src/server/vitePlugin.ts`
- Delete: `src/server/` (if now empty)

- [ ] **Step 1: Confirm nothing imports the targets**

For each file you intend to delete, search for any importer:

```bash
grep -rn "src/server/handlers/chat" src/ scripts/
grep -rn "src/server/handlers/situations" src/ scripts/
grep -rn "src/server/handlers/notes" src/ scripts/
grep -rn "src/server/handlers/profile" src/ scripts/
grep -rn "src/server/userContextStore" src/ scripts/
grep -rn "src/server/vitePlugin" src/ scripts/
```

Expected: zero hits outside the files being deleted (vite.config.ts was already updated in Phase 1 Task 12; the handlers are unused since Phase 1 + 2). If any importer remains, stop and report.

- [ ] **Step 2: Delete the files**

```bash
git rm src/server/handlers/chat.ts \
       src/server/handlers/situations.ts \
       src/server/handlers/notes.ts \
       src/server/handlers/profile.ts \
       src/server/userContextStore.ts \
       src/server/vitePlugin.ts

# Conditionally:
[ -f src/server/userContextStore.test.ts ] && git rm src/server/userContextStore.test.ts
```

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit`
Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Run: `npm test`
Run: `dotnet test api/PortfolioReport.sln`
Expected: all green. If any reference to the deleted modules surfaces, fix it (most likely a stale test).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead server-side TS handlers (replaced by C# API)"
```

---

## Task 9: Full verification pass

**Files:** none.

- [ ] **Step 1: C# tests** — `dotnet test api/PortfolioReport.sln` → all pass.
- [ ] **Step 2: Vitest** — `npm test` → engine/intake + the moved prompt tests pass.
- [ ] **Step 3: tsc** — both `npx tsc --noEmit` and `npx tsc --noEmit -p src/report/app/tsconfig.json` → no errors.
- [ ] **Step 4: Manual smoke** — `npm run serve`, `:5000`, sign in, then:
  - **Chat works**: send a message, see the streamed reply.
  - **Tool proposal**: ask the AI to track a situation; the proposal card appears; confirming it creates the situation (via `POST /api/situations`).
  - **Chat history persists** across a refresh.
  - **Refresh verdict** on an open situation appends a new entry to its `verdict_history`.
  - **Network tab** — no `/api/*` 404s for the report's normal calls.
- [ ] **Step 5: Confirm no secrets slipped** — `git status --short` shows no unintentional stages; `git ls-files api/` has no `bin/`, `obj/`, `App_Data/`, `wwwroot/` content tracked.
- [ ] **Step 6: Commit only if you fixed something.**

---

## Plan Self-Review

**Spec coverage** (against `2026-05-18-hosted-report-design.md`, Phase 3):
- `/api/ai` thin proxy — Tasks 2, 3. ✓
- Per-user Anthropic API key — Task 1. ✓
- Rate limit + max_tokens cap — Task 3. ✓
- Browser-side `chat.ts` / `pulseCheck.ts` / `advisorPersona.ts` — Task 5. ✓
- Rewritten `useChat` using the Anthropic SDK against `/api/ai` — Task 6. ✓
- Chat-history persistence (`/api/chat`) — Task 4 (server), Task 6 (browser writes). ✓
- pulseCheck triggerable from the UI — Task 7. ✓
- Cleanup of obsolete Vite-middleware code — Task 8. ✓

**Placeholder scan:** no "TBD"/"TODO"; every step has complete code or an exact command. Task 5 Step 2 contingently "if X then Y" (the React types mirror may already contain everything) — that's a verify-then-act instruction, not a placeholder.

**Type/name consistency:** `AllowlistOptions.FindByUser` (Task 1) used by Task 2. `UserContextStore` (Phase 2) used by Tasks 4, 7. `CurrentUser.KeyOf` used by Tasks 2, 4. `MapAiProxyEndpoints` / `MapChatEndpoints` match `Program.cs` call sites. `ChatInputContext` from `chat.ts` matches the parameter shape `useChat.send` builds. The browser `Anthropic` client config (`baseURL`/`apiKey`/`dangerouslyAllowBrowser`) is identical in `useChat` and `OpenSituations` (Task 7 also notes a possible future tidy to extract a shared `aiClient`).

**Open follow-ups (not in this plan):**
- Automatic pulse-check on situation load (vs the manual button this plan ships).
- Per-user rate limit storage that survives process restart (currently in-memory).
- A small client wrapper that hides `dangerouslyAllowBrowser` / `baseURL` / placeholder key behind a single import (refactor candidate after Phase 3 is in).
