# Hosted Report Phase 2 — Interactive CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hosted report interactive — implement the `situations`, `notes`, and `profile` CRUD endpoints in the ASP.NET Core API so the existing React UI (situations list, profile drawer, notes) can read and write.

**Architecture:** The C# endpoints manipulate the user's `user-context.json` as a JSON *document* (`System.Text.Json.Nodes`), not strongly-typed models. The schema of record stays in the existing TypeScript Zod definition (`src/intake/parseUserContext.ts`); C# does only structural edits (append to an array, patch an object, set the profile). This avoids porting the polymorphic `PortfolioEffect` union and keeps the contract in one place. A `UserContextStore` (load → mutate → atomic write) mirrors the TypeScript `userContextStore.ts`. All endpoints are gated by the `"session"` policy and scoped to the caller's user folder. The React app already calls these endpoints, so it needs **no changes** — the features light up when the server answers.

**Tech Stack:** ASP.NET Core 8 minimal APIs, `System.Text.Json.Nodes` (`JsonObject`/`JsonArray`), xUnit + `ApiFactory` integration tests.

**Source spec:** `docs/superpowers/specs/2026-05-18-hosted-report-design.md` (Phase 2).

**Scope notes:**
- Chat is **not** in Phase 2 — it depends on the AI and is Phase 3 (`/api/ai` proxy + browser AI + chat-history persistence).
- This plan assumes the `fix/auth-landing-page` branch is merged to `main` (Phase 1 + auth fixes). Branch Phase 2 work from `main` after that merge.
- The endpoint contracts replicate the existing TypeScript handlers (`src/server/handlers/situations.ts`, `notes.ts`, `profile.ts`) so the React client — which already speaks them — keeps working unchanged.

---

## File Structure

**New — C# (`api/PortfolioReport.Api/`):**
- `Storage/ContextIds.cs` — generates entity ids (`sit_…`, `note_…`) and ISO timestamps.
- `Storage/Json.cs` — safe extraction helpers for `JsonNode`.
- `Storage/UserContextStore.cs` — loads/mutates/saves `user-context.json` as a `JsonObject`.
- `Endpoints/SituationsEndpoints.cs` — `GET`/`POST`/`PATCH`/`DELETE /api/situations`.
- `Endpoints/NotesEndpoints.cs` — `GET`/`POST`/`PATCH`/`DELETE /api/notes`.
- `Endpoints/ProfileEndpoints.cs` — `GET`/`PUT /api/profile`.

**New — C# tests (`api/PortfolioReport.Api.Tests/`):**
- `UserContextStoreTests.cs`, `SituationsEndpointsTests.cs`, `NotesEndpointsTests.cs`, `ProfileEndpointsTests.cs`.

**Modified:**
- `api/PortfolioReport.Api/Program.cs` — register `UserContextStore`; map the three endpoint groups.

**Unchanged:** the React app. It already calls `/api/situations`, `/api/profile`, `/api/notes`.

---

## Task 1: UserContextStore and helpers

**Files:**
- Create: `api/PortfolioReport.Api/Storage/ContextIds.cs`
- Create: `api/PortfolioReport.Api/Storage/Json.cs`
- Create: `api/PortfolioReport.Api/Storage/UserContextStore.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/UserContextStoreTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/UserContextStoreTests.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Storage;
using Xunit;

public class UserContextStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "ucs-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    private UserContextStore NewStore() => new(new UserDataStore(_root));

    [Fact]
    public async Task LoadReturnsEmptyV2ContextWhenNoFile()
    {
        var ctx = await NewStore().LoadAsync("kevin");

        Assert.Equal(2, (int)ctx["version"]!);
        Assert.Empty(ctx["situations"]!.AsArray());
        Assert.Empty(ctx["notes"]!.AsArray());
        Assert.Empty(ctx["chat_history"]!.AsArray());
        Assert.Null(ctx["profile"]);
    }

    [Fact]
    public async Task MutatePersistsAndRoundTrips()
    {
        var store = NewStore();
        await store.MutateAsync("kevin", c => c["situations"]!.AsArray().Add("x"));

        var reloaded = await store.LoadAsync("kevin");
        Assert.Single(reloaded["situations"]!.AsArray());
    }

    [Fact]
    public async Task MutateIsScopedPerUser()
    {
        var store = NewStore();
        await store.MutateAsync("kevin", c => c["notes"]!.AsArray().Add("k"));

        var luke = await store.LoadAsync("luke");
        Assert.Empty(luke["notes"]!.AsArray());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserContextStoreTests`
Expected: FAIL — `UserContextStore` does not exist (compile error).

- [ ] **Step 3: Implement `ContextIds`**

Create `api/PortfolioReport.Api/Storage/ContextIds.cs`:

```csharp
namespace PortfolioReport.Api.Storage;

/// <summary>Generates entity ids and timestamps for user-context entities.</summary>
public static class ContextIds
{
    /// <summary>e.g. "sit_2026-05-19_a1b2c3" — matches the TypeScript handlers' format.</summary>
    public static string NewId(string prefix) =>
        $"{prefix}_{DateTime.UtcNow:yyyy-MM-dd}_{Guid.NewGuid():N}"[..(prefix.Length + 18)];

    /// <summary>ISO-8601 UTC timestamp, e.g. "2026-05-19T15:30:00.123Z".</summary>
    public static string Timestamp() =>
        DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
}
```

(`[..(prefix.Length + 18)]` keeps `prefix_` + the 10-char date + `_` + the first 6 hex chars of the GUID.)

- [ ] **Step 4: Implement `Json`**

Create `api/PortfolioReport.Api/Storage/Json.cs`:

```csharp
using System.Text.Json.Nodes;

namespace PortfolioReport.Api.Storage;

/// <summary>Null-safe extraction helpers for loosely-typed JSON request bodies.</summary>
public static class Json
{
    /// <summary>The string value of a node, or null if it is missing or not a string.</summary>
    public static string? Str(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    /// <summary>The bool value of a node, or the fallback if it is missing or not a bool.</summary>
    public static bool Bool(JsonNode? node, bool fallback) =>
        node is JsonValue v && v.TryGetValue<bool>(out var b) ? b : fallback;
}
```

- [ ] **Step 5: Implement `UserContextStore`**

Create `api/PortfolioReport.Api/Storage/UserContextStore.cs`:

```csharp
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PortfolioReport.Api.Storage;

/// <summary>
/// Reads and mutates a user's user-context.json as a JSON document. The schema
/// of record lives in TypeScript (src/intake/parseUserContext.ts); this class
/// only does structural edits, so the contract stays defined in one place.
/// </summary>
public sealed class UserContextStore
{
    public const string FileName = "user-context.json";

    // Matches emptyUserContext() in src/intake/parseUserContext.ts.
    private const string EmptyContext =
        "{\"version\":2,\"profile\":null,\"situations\":[],\"notes\":[],\"chat_history\":[]}";

    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    private readonly UserDataStore _files;

    public UserContextStore(UserDataStore files) => _files = files;

    /// <summary>Loads the user's context as a mutable JSON object.</summary>
    public async Task<JsonObject> LoadAsync(string user)
    {
        var raw = await _files.ReadAsync(user, FileName) ?? EmptyContext;
        return JsonNode.Parse(raw) as JsonObject
            ?? throw new InvalidOperationException("user-context.json is not a JSON object.");
    }

    /// <summary>Loads, applies the mutation, then atomically writes the result back.</summary>
    public async Task<JsonObject> MutateAsync(string user, Action<JsonObject> mutate)
    {
        var ctx = await LoadAsync(user);
        mutate(ctx);
        await _files.WriteAsync(user, FileName, ctx.ToJsonString(Indented));
        return ctx;
    }
}
```

- [ ] **Step 6: Register `UserContextStore` in `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, immediately after the `AddSingleton<...PushTokenResolver>()` line, add:

```csharp
builder.Services.AddSingleton<PortfolioReport.Api.Storage.UserContextStore>();
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserContextStoreTests`
Expected: PASS — 3 tests.

- [ ] **Step 8: Commit**

```bash
git add api
git commit -m "feat(api): UserContextStore — JSON-document load/mutate/save for user-context"
```

---

## Task 2: Situations — GET and POST

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/SituationsEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/SituationsEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/SituationsEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class SituationsEndpointsTests
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

        var res = await client.GetAsync("/api/situations");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.GetAsync("/api/situations");
        res.EnsureSuccessStatusCode();
        var arr = await res.Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTitleOrIntent()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/situations", new { intent = "x" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesSituationAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var post = await client.PostAsJsonAsync("/api/situations",
            new { title = "Deploy cash", intent = "Move idle cash into bonds" });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.StartsWith("sit_", (string)created!["id"]!);
        Assert.Equal("open", (string)created["status"]!);

        var list = await (await client.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
        Assert.Equal("Deploy cash", (string)list![0]!["title"]!);
    }

    [Fact]
    public async Task PostIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        using var kevin = SignedIn(factory, "kevin");
        using var luke = SignedIn(factory, "luke");

        await kevin.PostAsJsonAsync("/api/situations", new { title = "t", intent = "i" });

        var lukeList = await (await luke.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(lukeList!);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SituationsEndpointsTests`
Expected: FAIL — `/api/situations` returns 404 (no endpoint).

- [ ] **Step 3: Implement the GET and POST handlers**

Create `api/PortfolioReport.Api/Endpoints/SituationsEndpoints.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class SituationsEndpoints
{
    public static void MapSituationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/situations", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var situations = ctx["situations"]?.AsArray() ?? new JsonArray();
            return Results.Content(situations.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/situations", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var title = (Json.Str(body?["title"]) ?? "").Trim();
            var intent = (Json.Str(body?["intent"]) ?? "").Trim();
            if (title.Length == 0 || intent.Length == 0)
                return Results.BadRequest(new { error = "title and intent are required" });

            var now = ContextIds.Timestamp();
            var situation = new JsonObject
            {
                ["id"] = ContextIds.NewId("sit"),
                ["title"] = title,
                ["intent"] = intent,
                ["status"] = "open",
                ["target_date"] = body!["target_date"]?.DeepClone(),
                ["related_findings"] = body["related_findings"]?.DeepClone() ?? new JsonArray(),
                ["portfolio_effects"] = body["portfolio_effects"]?.DeepClone() ?? new JsonArray(),
                ["verdict_history"] = new JsonArray(),
                ["created_at"] = now,
                ["updated_at"] = now,
                ["closed_at"] = null,
                ["closure_reason"] = null,
            };
            await store.MutateAsync(user,
                c => c["situations"]!.AsArray().Add(situation.DeepClone()));
            return Results.Json(situation, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Wire it into `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, directly below `app.MapUserContextEndpoints();`, add:

```csharp
app.MapSituationsEndpoints();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SituationsEndpointsTests`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): GET and POST /api/situations"
```

---

## Task 3: Situations — PATCH and DELETE

**Files:**
- Modify: `api/PortfolioReport.Api/Endpoints/SituationsEndpoints.cs`
- Test: `api/PortfolioReport.Api.Tests/SituationsEndpointsTests.cs` (add cases)

- [ ] **Step 1: Write the failing tests**

Append these methods inside the `SituationsEndpointsTests` class:

```csharp
    [Fact]
    public async Task PatchUpdatesFieldsAndSetsClosedAtWhenClosed()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/situations",
            new { title = "t", intent = "i" })).Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var res = await client.PatchAsJsonAsync($"/api/situations/{id}",
            new { status = "closed", closure_reason = "completed" });
        res.EnsureSuccessStatusCode();
        var updated = await res.Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal("closed", (string)updated!["status"]!);
        Assert.Equal("completed", (string)updated["closure_reason"]!);
        Assert.NotNull(updated["closed_at"]);
    }

    [Fact]
    public async Task PatchReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PatchAsJsonAsync("/api/situations/sit_nope",
            new { status = "closed" });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task DeleteRemovesTheSituation()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/situations",
            new { title = "t", intent = "i" })).Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var del = await client.DeleteAsync($"/api/situations/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/situations/sit_nope");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SituationsEndpointsTests`
Expected: FAIL — the 4 new tests fail (PATCH/DELETE return 404 — no endpoint).

- [ ] **Step 3: Add the PATCH and DELETE handlers**

In `api/PortfolioReport.Api/Endpoints/SituationsEndpoints.cs`, add inside `MapSituationsEndpoints`, after the `MapPost` block:

```csharp
        app.MapPatch("/api/situations/{id}", async (
            string id, HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body required" });

            JsonObject? updated = null;
            await store.MutateAsync(user, c =>
            {
                var match = c["situations"]!.AsArray().OfType<JsonObject>()
                    .FirstOrDefault(s => Json.Str(s["id"]) == id);
                if (match is null) return;

                foreach (var kv in body)
                {
                    if (kv.Key == "id") continue;  // the id is server-owned
                    match[kv.Key] = kv.Value?.DeepClone();
                }
                match["updated_at"] = ContextIds.Timestamp();
                if (Json.Str(match["status"]) == "closed" && match["closed_at"] is null)
                    match["closed_at"] = ContextIds.Timestamp();

                updated = (JsonObject)match.DeepClone();
            });
            return updated is null
                ? Results.NotFound(new { error = "not found" })
                : Results.Json(updated);
        }).RequireAuthorization("session");

        app.MapDelete("/api/situations/{id}", async (
            string id, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["situations"]!.AsArray();
                for (var i = 0; i < arr.Count; i++)
                {
                    if (Json.Str(arr[i]?["id"]) == id)
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SituationsEndpointsTests`
Expected: PASS — 9 tests (5 from Task 2 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add api
git commit -m "feat(api): PATCH and DELETE /api/situations/{id}"
```

---

## Task 4: Notes — GET, POST, PATCH, DELETE

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/NotesEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/NotesEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/NotesEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class NotesEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    private static object SampleNote() => new
    {
        target = new { type = "flag", finding_key = "cash_drag" },
        body = "Holding this cash deliberately as a reserve.",
        suppress_flag = true,
    };

    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/notes");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTargetOrBody()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/notes", new { body = "no target" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesNoteAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var post = await client.PostAsJsonAsync("/api/notes", SampleNote());
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.StartsWith("note_", (string)created!["id"]!);
        Assert.True((bool)created["suppress_flag"]!);

        var list = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
    }

    [Fact]
    public async Task PatchUpdatesNoteFields()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/notes", SampleNote()))
            .Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var res = await client.PatchAsJsonAsync($"/api/notes/{id}", new { suppress_flag = false });
        res.EnsureSuccessStatusCode();
        var updated = await res.Content.ReadFromJsonAsync<JsonObject>();

        Assert.False((bool)updated!["suppress_flag"]!);
    }

    [Fact]
    public async Task DeleteRemovesTheNote()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/notes", SampleNote()))
            .Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var del = await client.DeleteAsync($"/api/notes/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/notes/note_nope");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter NotesEndpointsTests`
Expected: FAIL — `/api/notes` returns 404.

- [ ] **Step 3: Implement the handlers**

Create `api/PortfolioReport.Api/Endpoints/NotesEndpoints.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class NotesEndpoints
{
    public static void MapNotesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/notes", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var notes = ctx["notes"]?.AsArray() ?? new JsonArray();
            return Results.Content(notes.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/notes", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var target = body?["target"] as JsonObject;
            var noteBody = Json.Str(body?["body"]);
            if (target is null || string.IsNullOrEmpty(noteBody))
                return Results.BadRequest(new { error = "target and body are required" });

            var note = new JsonObject
            {
                ["id"] = ContextIds.NewId("note"),
                ["target"] = target.DeepClone(),
                ["body"] = noteBody,
                ["suppress_flag"] = Json.Bool(body!["suppress_flag"], false),
                ["created_at"] = ContextIds.Timestamp(),
            };
            await store.MutateAsync(user, c => c["notes"]!.AsArray().Add(note.DeepClone()));
            return Results.Json(note, statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization("session");

        app.MapPatch("/api/notes/{id}", async (
            string id, HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body required" });

            JsonObject? updated = null;
            await store.MutateAsync(user, c =>
            {
                var match = c["notes"]!.AsArray().OfType<JsonObject>()
                    .FirstOrDefault(n => Json.Str(n["id"]) == id);
                if (match is null) return;
                foreach (var kv in body)
                {
                    if (kv.Key == "id") continue;
                    match[kv.Key] = kv.Value?.DeepClone();
                }
                updated = (JsonObject)match.DeepClone();
            });
            return updated is null
                ? Results.NotFound(new { error = "not found" })
                : Results.Json(updated);
        }).RequireAuthorization("session");

        app.MapDelete("/api/notes/{id}", async (
            string id, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["notes"]!.AsArray();
                for (var i = 0; i < arr.Count; i++)
                {
                    if (Json.Str(arr[i]?["id"]) == id)
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

- [ ] **Step 4: Wire it into `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, directly below `app.MapSituationsEndpoints();`, add:

```csharp
app.MapNotesEndpoints();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter NotesEndpointsTests`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): situations-style CRUD for /api/notes"
```

---

## Task 5: Profile — GET and PUT

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/ProfileEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs`
- Test: `api/PortfolioReport.Api.Tests/ProfileEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/ProfileEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class ProfileEndpointsTests
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

        var res = await client.GetAsync("/api/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsNullForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.GetAsync("/api/profile");
        res.EnsureSuccessStatusCode();

        Assert.Equal("null", (await res.Content.ReadAsStringAsync()).Trim());
    }

    [Fact]
    public async Task PutRejectsOutOfRangeAge()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PutAsJsonAsync("/api/profile",
            new { age = 5, risk_tolerance = "moderate" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PutRejectsUnknownRiskTolerance()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PutAsJsonAsync("/api/profile",
            new { age = 40, risk_tolerance = "yolo" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PutSavesProfileAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var put = await client.PutAsJsonAsync("/api/profile",
            new { age = 52, risk_tolerance = "moderately_aggressive" });
        put.EnsureSuccessStatusCode();

        var profile = await (await client.GetAsync("/api/profile"))
            .Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(52, (int)profile!["age"]!);
        Assert.Equal("moderately_aggressive", (string)profile["risk_tolerance"]!);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter ProfileEndpointsTests`
Expected: FAIL — `/api/profile` returns 404.

- [ ] **Step 3: Implement the handlers**

Create `api/PortfolioReport.Api/Endpoints/ProfileEndpoints.cs`:

```csharp
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] RiskTolerances =
    {
        "conservative", "moderately_conservative", "moderate",
        "moderately_aggressive", "aggressive",
    };

    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/profile", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            // ctx["profile"] is JSON null for a new user — serialize it as "null".
            return Results.Content(
                ctx["profile"]?.ToJsonString() ?? "null", "application/json");
        }).RequireAuthorization("session");

        app.MapPut("/api/profile", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var age = body?["age"] is JsonValue v && v.TryGetValue<int>(out var a) ? a : -1;
            var risk = Json.Str(body?["risk_tolerance"]);
            if (age < 18 || age > 100)
                return Results.BadRequest(new { error = "age must be a whole number 18-100" });
            if (risk is null || !RiskTolerances.Contains(risk))
                return Results.BadRequest(new { error = "invalid risk_tolerance" });

            var profile = new JsonObject { ["age"] = age, ["risk_tolerance"] = risk };
            await store.MutateAsync(user, c => c["profile"] = profile.DeepClone());
            return Results.Json(profile);
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Wire it into `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, directly below `app.MapNotesEndpoints();`, add:

```csharp
app.MapProfileEndpoints();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter ProfileEndpointsTests`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): GET and PUT /api/profile"
```

---

## Task 6: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the entire C# test suite**

Run: `dotnet test api/PortfolioReport.sln`
Expected: PASS — every test (Phase 1 + Phase 2: ~57 — 35 prior + 9 situations + 7 notes + 5 profile + 3 store, minus none).

- [ ] **Step 2: Run the TypeScript test suite**

Run: `npm test`
Expected: PASS — the engine/intake vitest suite is unaffected by this phase.

- [ ] **Step 3: Type-check both TypeScript projects**

Run: `npx tsc --noEmit`
Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors. (No TypeScript changed in this phase, but confirm nothing regressed.)

- [ ] **Step 4: Manual smoke test (human)**

Run `npm run serve`, open `http://localhost:5000`, sign in (real Google or a dev-login button), then verify:
- The Open Situations section no longer relies on the `analysis.json` fallback — creating a situation via a "Track move" button persists and survives a refresh.
- The Profile drawer (👤 icon) loads, and **Save** now succeeds (no `HTTP 404`).
- The browser network tab no longer shows `404` for `/api/situations` or `/api/profile`.
- `/api/notes` returns `200 []` instead of `404`.

- [ ] **Step 5: Confirm `user-context.json` is schema-valid**

After creating a situation and saving a profile via the UI, run a publish for that user:
`npm run publish:kevin` (or `:luke`). It pulls `user-context.json` and runs it through `parseUserContext` (the Zod schema). A successful publish proves the C# writes are schema-valid for the local pipeline.

- [ ] **Step 6: Commit if anything was fixed**

If Steps 1-3 surfaced a trivial fix, commit it with `git commit -m "test: Phase 2 verification pass"`. Otherwise create no commit.

---

## Plan Self-Review

**Spec coverage** (against `2026-05-18-hosted-report-design.md`, Phase 2):
- `situations` GET/POST/PATCH/DELETE — Tasks 2, 3. ✓
- `notes` GET/POST/PATCH/DELETE — Task 4. ✓
- `profile` GET/PUT — Task 5. ✓
- Operates on server-authoritative `user-context.json`, scoped per user — Task 1 (`UserContextStore`), all endpoints use `CurrentUser.KeyOf`. ✓
- `chat` history persistence — deliberately deferred to Phase 3 (stated in Scope notes; chat is meaningless without the AI). ✓
- Gated by the `"session"` policy — every endpoint has `.RequireAuthorization("session")`. ✓

**Placeholder scan:** no "TBD"/"TODO"/vague steps; every code step shows complete code.

**Type/name consistency:** `UserContextStore.LoadAsync`/`MutateAsync` (Task 1) used by Tasks 2-5. `ContextIds.NewId`/`Timestamp` (Task 1) used by Tasks 2, 4. `Json.Str`/`Json.Bool` (Task 1) used by Tasks 2-5. Endpoint extension methods (`MapSituationsEndpoints`, `MapNotesEndpoints`, `MapProfileEndpoints`) match their `Program.cs` call sites. `CurrentUser.KeyOf` and the `"session"` policy are Phase 1 carryovers, used consistently.

**Note on validation depth:** the endpoints do shape-level validation (required fields, profile ranges) matching the TypeScript handlers' Zod checks. They do not re-validate the full nested schema (e.g. `portfolio_effects` shapes) — those pass through from a trusted same-origin React client, and the authoritative schema check happens in `parseUserContext` when the local pipeline consumes the file. This matches the design's "C# does minimal structural edits" principle.
