# Hosted Report Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an ASP.NET Core app on Winhost that serves the existing React report behind Google login, gates each user's `analysis.json` / `user-context.json`, and accepts a pushed `analysis.json` from a local script.

**Architecture:** A single ASP.NET Core (.NET 8) app serves the static React build from `wwwroot` and exposes `/api/*` endpoints on the same origin. Session endpoints are gated by a Google-OAuth cookie; the push endpoint is gated by a per-user bearer token. Per-user data lives in `App_Data/<user>/` outside the web root and is reachable only through authenticated endpoints. The `analyze` pipeline is unchanged and stays local.

**Tech Stack:** ASP.NET Core 8 minimal APIs, `Microsoft.AspNetCore.Authentication.Google`, cookie auth, xUnit + `WebApplicationFactory` for tests, existing Vite/React report, a TypeScript push/pull script run with `tsx`.

**Source spec:** `docs/superpowers/specs/2026-05-18-hosted-report-design.md`

**Scope note:** This plan covers Phase 1 only (secured static report + push). The responsive CSS pass is deferred to the Phase 4 "Mobile & PWA" plan; the report still functions on mobile after Phase 1. Phases 2 (interactive CRUD) and 3 (browser AI) get their own plans.

---

## File Structure

**New — C# API (`api/` at repo root):**
- `api/PortfolioReport.sln` — solution file.
- `api/PortfolioReport.Api/PortfolioReport.Api.csproj` — the web app.
- `api/PortfolioReport.Api/Program.cs` — composition root; wires auth, static files, endpoints.
- `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs` — `AllowlistOptions` + `UserRecord` config types.
- `api/PortfolioReport.Api/Auth/CurrentUser.cs` — resolves the logged-in user key from claims.
- `api/PortfolioReport.Api/Auth/PushTokenResolver.cs` — resolves a bearer push token to a user key.
- `api/PortfolioReport.Api/Storage/UserDataStore.cs` — reads/writes `App_Data/<user>/*.json`.
- `api/PortfolioReport.Api/Endpoints/MeEndpoints.cs` — `GET /api/me`.
- `api/PortfolioReport.Api/Endpoints/AnalysisEndpoints.cs` — `GET`/`POST /api/analysis`.
- `api/PortfolioReport.Api/Endpoints/UserContextEndpoints.cs` — `GET /api/user-context`.
- `api/PortfolioReport.Api/Endpoints/AuthEndpoints.cs` — `/login`, `/logout`, `/access-denied`.
- `api/PortfolioReport.Api/appsettings.json` — config structure (no real secrets).

**New — C# tests (`api/PortfolioReport.Api.Tests/`):**
- `PortfolioReport.Api.Tests.csproj` — xUnit test project.
- `TestAuthHandler.cs` — fake auth scheme so endpoint tests can simulate a logged-in user.
- `ApiFactory.cs` — `WebApplicationFactory` configured with a temp data root + test auth.
- `AllowlistOptionsTests.cs`, `UserDataStoreTests.cs`, `MeEndpointsTests.cs`, `AnalysisEndpointsTests.cs`, `UserContextEndpointsTests.cs`, `SpaFallbackTests.cs`.

**Modified — React report:**
- `src/report/app/App.tsx:37-46` — fetch `/api/analysis` instead of `/analysis.json`; handle `401`.
- `src/report/app/vite.config.ts` — dev proxy `/api` → local API; drop the old middleware/publicDir.

**New — local tooling:**
- `scripts/publish.ts` — pull `user-context.json`, run `analyze`, push `analysis.json`.
- `scripts/build-api.ps1` — build the React app into `wwwroot`, then `dotnet publish`.
- `docs/runbooks/winhost-deploy.md` — deployment runbook.

**Modified — repo config:**
- `package.json` — add `publish` and `build:api` scripts.
- `.gitignore` — ignore build output, `App_Data/`, `appsettings.Production.json`.

---

## Task 1: Verify Winhost capabilities

This is a manual task with no code. It must complete before Task 2, because an unfavorable answer changes the runtime target.

**Files:** none.

- [ ] **Step 1: Contact Winhost support / check the control panel**

Confirm each of the following for the `bis-corp.com` Max plan. Record answers in `docs/runbooks/winhost-deploy.md` (created in Task 14; for now keep notes in the task tracker):

1. Which .NET / ASP.NET Core runtime versions are installed? (Target the newest LTS available; this plan assumes **.NET 8**.)
2. Can a new IIS site/application be created for the subdomain `finance.bis-corp.com`, with TLS?
3. Can the application write files to a folder **outside** the web root (e.g. an `App_Data` folder)?
4. Is outbound HTTPS allowed to `accounts.google.com` / `oauth2.googleapis.com` (Google OAuth) and later `api.anthropic.com`?
5. Is response buffering configurable / can streaming responses pass through? (Needed in Phase 3, not Phase 1 — confirm now to avoid surprises.)

- [ ] **Step 2: Decide the runtime target**

If .NET 8 is available, proceed with this plan unchanged. If only an older runtime is available, update the `TargetFramework` in Task 2 to match and note it. If file-write outside the web root is not allowed, note that `App_Data` must live inside the app directory but still be excluded from static serving (Task 11 already does this).

- [ ] **Step 3: Record findings**

Write the answers into the task tracker / a scratch note. No commit (the runbook file is created in Task 14).

---

## Task 2: Scaffold the ASP.NET Core API and test projects

**Files:**
- Create: `api/PortfolioReport.sln`
- Create: `api/PortfolioReport.Api/PortfolioReport.Api.csproj`
- Create: `api/PortfolioReport.Api/Program.cs`
- Create: `api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj`
- Modify: `.gitignore`

- [ ] **Step 1: Create the projects**

Run from the repo root:

```bash
mkdir api
dotnet new sln -o api -n PortfolioReport
dotnet new web -o api/PortfolioReport.Api -f net8.0
dotnet new xunit -o api/PortfolioReport.Api.Tests -f net8.0
dotnet sln api/PortfolioReport.sln add api/PortfolioReport.Api/PortfolioReport.Api.csproj
dotnet sln api/PortfolioReport.sln add api/PortfolioReport.Api.Tests/PortfolioReport.Api.Tests.csproj
dotnet add api/PortfolioReport.Api.Tests reference api/PortfolioReport.Api/PortfolioReport.Api.csproj
```

- [ ] **Step 2: Add packages**

```bash
dotnet add api/PortfolioReport.Api package Microsoft.AspNetCore.Authentication.Google
dotnet add api/PortfolioReport.Api.Tests package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 3: Replace `Program.cs` with a minimal known-good baseline**

Overwrite `api/PortfolioReport.Api/Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/healthz", () => Results.Ok("ok"));

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
```

- [ ] **Step 4: Update `.gitignore`**

Append to `.gitignore`:

```gitignore
# .NET build output
[Bb]in/
[Oo]bj/

# Server data + deployed secrets (never commit)
api/PortfolioReport.Api/App_Data/
appsettings.Production.json
```

- [ ] **Step 5: Build and verify**

Run: `dotnet build api/PortfolioReport.sln`
Expected: `Build succeeded.` with 0 errors.

- [ ] **Step 6: Commit**

```bash
git add api .gitignore
git commit -m "chore: scaffold ASP.NET Core API and test projects"
```

---

## Task 3: Allowlist configuration and options binding

**Files:**
- Create: `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs`
- Create: `api/PortfolioReport.Api/appsettings.json` (overwrite the generated one)
- Test: `api/PortfolioReport.Api.Tests/AllowlistOptionsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/AllowlistOptionsTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using PortfolioReport.Api.Configuration;
using Xunit;

public class AllowlistOptionsTests
{
    [Fact]
    public void BindsUsersFromConfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Allowlist:Users:0:Email"] = "kbowsher@gmail.com",
                ["Allowlist:Users:0:User"] = "kevin",
                ["Allowlist:Users:0:PushToken"] = "tok-kevin",
            })
            .Build();

        var options = new AllowlistOptions();
        config.GetSection("Allowlist").Bind(options);

        Assert.Single(options.Users);
        Assert.Equal("kevin", options.Users[0].User);
    }

    [Fact]
    public void FindByEmailIsCaseInsensitive()
    {
        var options = new AllowlistOptions
        {
            Users = { new UserRecord { Email = "Kb@gmail.com", User = "kevin", PushToken = "t" } }
        };

        Assert.Equal("kevin", options.FindByEmail("kb@GMAIL.com")?.User);
        Assert.Null(options.FindByEmail("nobody@gmail.com"));
    }

    [Fact]
    public void FindByPushTokenMatchesExactly()
    {
        var options = new AllowlistOptions
        {
            Users = { new UserRecord { Email = "kb@gmail.com", User = "kevin", PushToken = "tok-kevin" } }
        };

        Assert.Equal("kevin", options.FindByPushToken("tok-kevin")?.User);
        Assert.Null(options.FindByPushToken("wrong"));
        Assert.Null(options.FindByPushToken(""));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AllowlistOptionsTests`
Expected: FAIL — `AllowlistOptions` / `UserRecord` do not exist (compile error).

- [ ] **Step 3: Implement the options types**

Create `api/PortfolioReport.Api/Configuration/AllowlistOptions.cs`:

```csharp
namespace PortfolioReport.Api.Configuration;

public sealed class UserRecord
{
    public string Email { get; set; } = "";
    public string User { get; set; } = "";
    public string PushToken { get; set; } = "";
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
}
```

- [ ] **Step 4: Create `appsettings.json` with the config structure**

Overwrite `api/PortfolioReport.Api/appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" }
  },
  "AllowedHosts": "*",
  "Storage": {
    "DataRoot": "App_Data"
  },
  "Google": {
    "ClientId": "",
    "ClientSecret": ""
  },
  "Allowlist": {
    "Users": [
      { "Email": "kbowsher@gmail.com", "User": "kevin", "PushToken": "" }
    ]
  }
}
```

Real secrets (`Google:ClientSecret`, each `PushToken`) are NOT committed — they are supplied per environment (see Task 14). Add the second user (`luke`) when their email is known.

- [ ] **Step 5: Register the options in `Program.cs`**

In `api/PortfolioReport.Api/Program.cs`, add after `var builder = WebApplication.CreateBuilder(args);`:

```csharp
builder.Services.Configure<PortfolioReport.Api.Configuration.AllowlistOptions>(
    builder.Configuration.GetSection(
        PortfolioReport.Api.Configuration.AllowlistOptions.SectionName));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AllowlistOptionsTests`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): allowlist configuration with email/push-token lookup"
```

---

## Task 4: UserDataStore — per-user file read/write

**Files:**
- Create: `api/PortfolioReport.Api/Storage/UserDataStore.cs`
- Test: `api/PortfolioReport.Api.Tests/UserDataStoreTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/UserDataStoreTests.cs`:

```csharp
using PortfolioReport.Api.Storage;
using Xunit;

public class UserDataStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "uds-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public async Task ReadReturnsNullWhenFileMissing()
    {
        var store = new UserDataStore(_root);
        Assert.Null(await store.ReadAsync("kevin", "analysis.json"));
    }

    [Fact]
    public async Task WriteThenReadRoundTrips()
    {
        var store = new UserDataStore(_root);
        await store.WriteAsync("kevin", "analysis.json", "{\"grade\":\"A\"}");

        Assert.Equal("{\"grade\":\"A\"}", await store.ReadAsync("kevin", "analysis.json"));
    }

    [Fact]
    public async Task WriteCreatesPerUserFolder()
    {
        var store = new UserDataStore(_root);
        await store.WriteAsync("luke", "analysis.json", "{}");

        Assert.True(File.Exists(Path.Combine(_root, "luke", "analysis.json")));
    }

    [Theory]
    [InlineData("../etc")]
    [InlineData("kevin/../luke")]
    [InlineData("")]
    public async Task RejectsUnsafeUserKeys(string badUser)
    {
        var store = new UserDataStore(_root);
        await Assert.ThrowsAsync<ArgumentException>(
            () => store.ReadAsync(badUser, "analysis.json"));
    }

    [Theory]
    [InlineData("../secrets.json")]
    [InlineData("sub/file.json")]
    public async Task RejectsUnsafeFileNames(string badFile)
    {
        var store = new UserDataStore(_root);
        await Assert.ThrowsAsync<ArgumentException>(
            () => store.ReadAsync("kevin", badFile));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserDataStoreTests`
Expected: FAIL — `UserDataStore` does not exist.

- [ ] **Step 3: Implement `UserDataStore`**

Create `api/PortfolioReport.Api/Storage/UserDataStore.cs`:

```csharp
namespace PortfolioReport.Api.Storage;

/// <summary>
/// Reads and writes per-user JSON files under a data root. Both the user key
/// and the file name are validated so a request can never escape its folder.
/// </summary>
public sealed class UserDataStore
{
    private static readonly char[] PathSeparators = { '/', '\\' };
    private readonly string _root;

    public UserDataStore(string root)
    {
        _root = Path.GetFullPath(root);
    }

    public async Task<string?> ReadAsync(string user, string fileName)
    {
        var path = ResolvePath(user, fileName);
        if (!File.Exists(path)) return null;
        return await File.ReadAllTextAsync(path);
    }

    public async Task WriteAsync(string user, string fileName, string content)
    {
        var path = ResolvePath(user, fileName);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        // Write to a temp file then move, so a reader never sees a half-written file.
        var tmp = path + ".tmp";
        await File.WriteAllTextAsync(tmp, content);
        File.Move(tmp, path, overwrite: true);
    }

    private string ResolvePath(string user, string fileName)
    {
        if (string.IsNullOrWhiteSpace(user) ||
            user.IndexOfAny(PathSeparators) >= 0 || user.Contains(".."))
            throw new ArgumentException($"Invalid user key: '{user}'", nameof(user));

        if (string.IsNullOrWhiteSpace(fileName) ||
            fileName.IndexOfAny(PathSeparators) >= 0 || fileName.Contains(".."))
            throw new ArgumentException($"Invalid file name: '{fileName}'", nameof(fileName));

        return Path.Combine(_root, user, fileName);
    }
}
```

- [ ] **Step 4: Register `UserDataStore` in `Program.cs`**

In `Program.cs`, add after the `Configure<AllowlistOptions>` call:

```csharp
builder.Services.AddSingleton(_ =>
{
    var configured = builder.Configuration["Storage:DataRoot"] ?? "App_Data";
    var root = Path.IsPathRooted(configured)
        ? configured
        : Path.Combine(builder.Environment.ContentRootPath, configured);
    return new PortfolioReport.Api.Storage.UserDataStore(root);
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserDataStoreTests`
Expected: PASS — all cases.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): per-user file store with path-traversal guards"
```

---

## Task 5: Test auth scheme, ApiFactory, and CurrentUser resolver

This task adds the test harness (a fake auth scheme + a `WebApplicationFactory`) and the production `CurrentUser` helper that reads the user key from claims. No production endpoint uses it yet — Task 6 is the first.

**Files:**
- Create: `api/PortfolioReport.Api/Auth/CurrentUser.cs`
- Create: `api/PortfolioReport.Api.Tests/TestAuthHandler.cs`
- Create: `api/PortfolioReport.Api.Tests/ApiFactory.cs`

- [ ] **Step 1: Implement `CurrentUser`**

Create `api/PortfolioReport.Api/Auth/CurrentUser.cs`:

```csharp
using System.Security.Claims;

namespace PortfolioReport.Api.Auth;

/// <summary>
/// The "user" claim carries the short user key (folder name). It is added at
/// sign-in once the Google email has been matched against the allowlist.
/// </summary>
public static class CurrentUser
{
    public const string UserClaim = "user";

    public static string? KeyOf(ClaimsPrincipal principal) =>
        principal.FindFirst(UserClaim)?.Value;
}
```

- [ ] **Step 2: Implement the test auth handler**

Create `api/PortfolioReport.Api.Tests/TestAuthHandler.cs`:

```csharp
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Auth;

/// <summary>
/// Test-only auth scheme. A request authenticates as a user by sending the
/// header `X-Test-User: &lt;userkey&gt;`. No header => the request is anonymous.
/// </summary>
public sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "TestScheme";
    public const string HeaderName = "X-Test-User";

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(HeaderName, out var user) ||
            string.IsNullOrWhiteSpace(user))
            return Task.FromResult(AuthenticateResult.NoResult());

        var identity = new ClaimsIdentity(
            new[] { new Claim(CurrentUser.UserClaim, user.ToString()) },
            SchemeName);
        var ticket = new AuthenticationTicket(
            new ClaimsPrincipal(identity), SchemeName);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
```

- [ ] **Step 3: Implement `ApiFactory`**

Create `api/PortfolioReport.Api.Tests/ApiFactory.cs`:

```csharp
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using PortfolioReport.Api.Storage;

/// <summary>
/// Boots the real app for integration tests, but with a temp data root and the
/// test auth scheme swapped in for Google. Each instance gets its own folder.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public string DataRoot { get; } =
        Path.Combine(Path.GetTempPath(), "api-" + Guid.NewGuid());

    public UserDataStore Store => new(DataRoot);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Storage:DataRoot", DataRoot);

        builder.ConfigureTestServices(services =>
        {
            // Replace the real cookie/Google scheme with the header-driven test scheme.
            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    TestAuthHandler.SchemeName, _ => { });

            // The session policy requires an authenticated principal under the
            // test scheme; make it the policy used by RequireAuthorization().
            services.AddAuthorizationBuilder()
                .SetFallbackPolicy(null)
                .AddPolicy("session", p =>
                {
                    p.AddAuthenticationSchemes(TestAuthHandler.SchemeName);
                    p.RequireAuthenticatedUser();
                });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (Directory.Exists(DataRoot)) Directory.Delete(DataRoot, recursive: true);
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `dotnet build api/PortfolioReport.sln`
Expected: `Build succeeded.` (No tests reference these yet; Task 6 does.)

- [ ] **Step 5: Commit**

```bash
git add api
git commit -m "test(api): test auth scheme + WebApplicationFactory harness"
```

---

## Task 6: GET /api/me

Introduces the named `"session"` authorization policy in production and the first gated endpoint.

**Files:**
- Modify: `api/PortfolioReport.Api/Program.cs`
- Create: `api/PortfolioReport.Api/Endpoints/MeEndpoints.cs`
- Test: `api/PortfolioReport.Api.Tests/MeEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/MeEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Json;
using Xunit;

public class MeEndpointsTests
{
    [Fact]
    public async Task ReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ReturnsUserKeyWhenAuthenticated()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/me");
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<MeResponse>();

        Assert.Equal("kevin", body!.User);
    }

    private sealed record MeResponse(string User);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter MeEndpointsTests`
Expected: FAIL — `/api/me` returns 404.

- [ ] **Step 3: Implement the endpoint**

Create `api/PortfolioReport.Api/Endpoints/MeEndpoints.cs`:

```csharp
using PortfolioReport.Api.Auth;

namespace PortfolioReport.Api.Endpoints;

public static class MeEndpoints
{
    public static void MapMeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/me", (HttpContext ctx) =>
        {
            var user = CurrentUser.KeyOf(ctx.User);
            return user is null
                ? Results.Unauthorized()
                : Results.Ok(new { user });
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Wire auth, authorization, and the endpoint into `Program.cs`**

Replace the body of `api/PortfolioReport.Api/Program.cs` so it reads exactly:

```csharp
using Microsoft.AspNetCore.Authentication.Cookies;
using PortfolioReport.Api.Configuration;
using PortfolioReport.Api.Endpoints;
using PortfolioReport.Api.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<AllowlistOptions>(
    builder.Configuration.GetSection(AllowlistOptions.SectionName));

builder.Services.AddSingleton(_ =>
{
    var configured = builder.Configuration["Storage:DataRoot"] ?? "App_Data";
    var root = Path.IsPathRooted(configured)
        ? configured
        : Path.Combine(builder.Environment.ContentRootPath, configured);
    return new UserDataStore(root);
});

// Production auth uses a cookie. The Google challenge scheme is added in Task 10.
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.AccessDeniedPath = "/access-denied";
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("session", p =>
    {
        p.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme);
        p.RequireAuthenticatedUser();
    });

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/healthz", () => Results.Ok("ok"));
app.MapMeEndpoints();

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter MeEndpointsTests`
Expected: PASS — 2 tests. (`ApiFactory` overrides the `"session"` policy to use the test scheme.)

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): GET /api/me behind the session policy"
```

---

## Task 7: GET /api/analysis

**Files:**
- Modify: `api/PortfolioReport.Api/Program.cs` (add `app.MapAnalysisEndpoints();`)
- Create: `api/PortfolioReport.Api/Endpoints/AnalysisEndpoints.cs`
- Test: `api/PortfolioReport.Api.Tests/AnalysisEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/AnalysisEndpointsTests.cs`:

```csharp
using System.Net;
using Xunit;

public class AnalysisEndpointsTests
{
    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/analysis");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsNotFoundWhenNoAnalysisPushedYet()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/analysis");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsThisUsersAnalysisJson()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "analysis.json", "{\"portfolio_grade\":\"A\"}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/analysis");
        res.EnsureSuccessStatusCode();

        Assert.Equal("application/json", res.Content.Headers.ContentType?.MediaType);
        Assert.Equal("{\"portfolio_grade\":\"A\"}", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "analysis.json", "{\"who\":\"kevin\"}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "luke");

        var res = await client.GetAsync("/api/analysis");

        // luke has no file of their own and cannot see kevin's.
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AnalysisEndpointsTests`
Expected: FAIL — `/api/analysis` returns 404 for every case (endpoint missing).

- [ ] **Step 3: Implement the endpoint**

Create `api/PortfolioReport.Api/Endpoints/AnalysisEndpoints.cs`:

```csharp
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class AnalysisEndpoints
{
    public const string FileName = "analysis.json";

    public static void MapAnalysisEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/analysis", async (HttpContext ctx, UserDataStore store) =>
        {
            var user = CurrentUser.KeyOf(ctx.User);
            if (user is null) return Results.Unauthorized();

            var json = await store.ReadAsync(user, FileName);
            return json is null
                ? Results.NotFound()
                : Results.Content(json, "application/json");
        }).RequireAuthorization("session");
    }
}
```

- [ ] **Step 4: Wire it into `Program.cs`**

In `Program.cs`, add directly below `app.MapMeEndpoints();`:

```csharp
app.MapAnalysisEndpoints();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AnalysisEndpointsTests`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add api
git commit -m "feat(api): GET /api/analysis serves the user's gated analysis.json"
```

---

## Task 8: POST /api/analysis — push-token authenticated

**Files:**
- Create: `api/PortfolioReport.Api/Auth/PushTokenResolver.cs`
- Modify: `api/PortfolioReport.Api/Endpoints/AnalysisEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs` (register `PushTokenResolver`)
- Test: `api/PortfolioReport.Api.Tests/AnalysisEndpointsTests.cs` (add cases)

- [ ] **Step 1: Write the failing tests**

Append these methods inside the `AnalysisEndpointsTests` class in `api/PortfolioReport.Api.Tests/AnalysisEndpointsTests.cs`:

```csharp
    [Fact]
    public async Task PostRejectsRequestWithNoPushToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task PostRejectsRequestWithWrongPushToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "wrong-token");

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task PostWithValidPushTokenWritesTheUsersAnalysis()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "tok-kevin");

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{\"portfolio_grade\":\"B\"}",
                System.Text.Encoding.UTF8, "application/json"));
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"portfolio_grade\":\"B\"}",
            await factory.Store.ReadAsync("kevin", "analysis.json"));
    }
```

These reference a push token `tok-kevin`. Make the test config provide it: add this override inside `ApiFactory.ConfigureWebHost`, before `ConfigureTestServices`:

```csharp
        builder.UseSetting("Allowlist:Users:0:Email", "kbowsher@gmail.com");
        builder.UseSetting("Allowlist:Users:0:User", "kevin");
        builder.UseSetting("Allowlist:Users:0:PushToken", "tok-kevin");
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AnalysisEndpointsTests`
Expected: FAIL — the 3 new `Post*` tests fail (POST returns 404; endpoint missing).

- [ ] **Step 3: Implement `PushTokenResolver`**

Create `api/PortfolioReport.Api/Auth/PushTokenResolver.cs`:

```csharp
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Configuration;

namespace PortfolioReport.Api.Auth;

/// <summary>
/// Resolves a bearer push token (used by the headless local publish script) to
/// a user key. Returns null when the header is missing or the token is unknown.
/// </summary>
public sealed class PushTokenResolver
{
    private readonly AllowlistOptions _allowlist;

    public PushTokenResolver(IOptions<AllowlistOptions> allowlist)
    {
        _allowlist = allowlist.Value;
    }

    public string? ResolveUser(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        const string prefix = "Bearer ";
        if (!header.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return null;

        var token = header[prefix.Length..].Trim();
        return _allowlist.FindByPushToken(token)?.User;
    }
}
```

- [ ] **Step 4: Register `PushTokenResolver` in `Program.cs`**

In `Program.cs`, add after the `AddSingleton(...UserDataStore...)` registration:

```csharp
builder.Services.AddSingleton<PortfolioReport.Api.Auth.PushTokenResolver>();
```

- [ ] **Step 5: Add the POST handler to `AnalysisEndpoints.cs`**

In `api/PortfolioReport.Api/Endpoints/AnalysisEndpoints.cs`, add `using PortfolioReport.Api.Configuration;` is not needed; add this inside `MapAnalysisEndpoints`, after the existing `MapGet` block:

```csharp
        app.MapPost("/api/analysis", async (
            HttpContext ctx, UserDataStore store, PushTokenResolver pushAuth) =>
        {
            var user = pushAuth.ResolveUser(ctx.Request);
            if (user is null) return Results.Unauthorized();

            using var reader = new StreamReader(ctx.Request.Body);
            var body = await reader.ReadToEndAsync();
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "empty body" });

            await store.WriteAsync(user, FileName, body);
            return Results.Ok(new { user, bytes = body.Length });
        });
        // No RequireAuthorization: this endpoint authenticates via push token,
        // not the cookie session.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter AnalysisEndpointsTests`
Expected: PASS — 7 tests (4 from Task 7 + 3 new).

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): POST /api/analysis accepts a push-token-authenticated upload"
```

---

## Task 9: GET /api/user-context

Accepts **either** a cookie session **or** a push token (the local script pulls it before running `analyze`).

**Files:**
- Create: `api/PortfolioReport.Api/Endpoints/UserContextEndpoints.cs`
- Modify: `api/PortfolioReport.Api/Program.cs` (add `app.MapUserContextEndpoints();`)
- Test: `api/PortfolioReport.Api.Tests/UserContextEndpointsTests.cs`

- [ ] **Step 1: Write the failing test**

Create `api/PortfolioReport.Api.Tests/UserContextEndpointsTests.cs`:

```csharp
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Xunit;

public class UserContextEndpointsTests
{
    [Fact]
    public async Task ReturnsUnauthorizedWithNeitherSessionNorToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/user-context");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ReturnsEmptyDefaultWhenNoFileYet()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadAsStringAsync();

        // A fresh user gets a valid empty context, not a 404.
        Assert.Contains("\"situations\"", body);
        Assert.Contains("\"notes\"", body);
        Assert.Contains("\"chat_history\"", body);
    }

    [Fact]
    public async Task ReturnsStoredContextForSessionUser()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "user-context.json", "{\"profile\":{\"x\":1}}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"profile\":{\"x\":1}}", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ReturnsStoredContextForPushTokenCaller()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "user-context.json", "{\"profile\":{\"x\":2}}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", "tok-kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"profile\":{\"x\":2}}", await res.Content.ReadAsStringAsync());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserContextEndpointsTests`
Expected: FAIL — `/api/user-context` returns 404.

- [ ] **Step 3: Implement the endpoint**

Create `api/PortfolioReport.Api/Endpoints/UserContextEndpoints.cs`:

```csharp
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class UserContextEndpoints
{
    public const string FileName = "user-context.json";

    // Returned when a user has no stored context yet — matches the shape the
    // report and the local analyze step expect.
    private const string EmptyContext =
        "{\"situations\":[],\"notes\":[],\"chat_history\":[],\"profile\":null}";

    public static void MapUserContextEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/user-context", async (
            HttpContext ctx, UserDataStore store, PushTokenResolver pushAuth) =>
        {
            // Cookie session first, then fall back to a push token.
            var user = CurrentUser.KeyOf(ctx.User) ?? pushAuth.ResolveUser(ctx.Request);
            if (user is null) return Results.Unauthorized();

            var json = await store.ReadAsync(user, FileName) ?? EmptyContext;
            return Results.Content(json, "application/json");
        });
        // No RequireAuthorization: this endpoint accepts two auth mechanisms and
        // checks them itself.
    }
}
```

- [ ] **Step 4: Wire it into `Program.cs`**

In `Program.cs`, add directly below `app.MapAnalysisEndpoints();`:

```csharp
app.MapUserContextEndpoints();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter UserContextEndpointsTests`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the whole API test suite**

Run: `dotnet test api/PortfolioReport.sln`
Expected: PASS — all tests from Tasks 3–9.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): GET /api/user-context via session or push token"
```

---

## Task 10: Google OAuth + login/logout + allowlist enforcement

The Google round-trip cannot be unit-tested, so this task is configure-and-manually-verify. It does not change endpoint behavior under the test scheme, so the existing tests stay green.

**Files:**
- Modify: `api/PortfolioReport.Api/Program.cs`
- Create: `api/PortfolioReport.Api/Endpoints/AuthEndpoints.cs`

- [ ] **Step 1: Create a Google OAuth client**

In the Google Cloud Console: create (or reuse) a project, configure the OAuth consent screen (External, add each allowlisted email as a test user), and create an **OAuth 2.0 Client ID** of type "Web application". Add authorized redirect URIs:
- `https://localhost:7xxx/signin-google` (the dev HTTPS port — see `launchSettings.json`)
- `https://finance.bis-corp.com/signin-google`

Record the Client ID and Client Secret for Step 4.

- [ ] **Step 2: Add the Google authentication scheme to `Program.cs`**

In `Program.cs`, replace the `AddAuthentication(...).AddCookie(...)` block with:

```csharp
builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = Microsoft.AspNetCore.Authentication.Google.GoogleDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.AccessDeniedPath = "/access-denied";
    })
    .AddGoogle(options =>
    {
        options.ClientId = builder.Configuration["Google:ClientId"] ?? "";
        options.ClientSecret = builder.Configuration["Google:ClientSecret"] ?? "";
        options.Events.OnCreatingTicket = context =>
        {
            // Match the Google email against the allowlist. Reject unknown
            // accounts; for known ones, attach the short user key as a claim.
            var allowlist = context.HttpContext.RequestServices
                .GetRequiredService<Microsoft.Extensions.Options.IOptions<AllowlistOptions>>().Value;
            var email = context.Identity?.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;
            var record = allowlist.FindByEmail(email);
            if (record is null)
            {
                context.Fail("Email is not on the allowlist.");
                return Task.CompletedTask;
            }
            context.Identity!.AddClaim(
                new System.Security.Claims.Claim(PortfolioReport.Api.Auth.CurrentUser.UserClaim, record.User));
            return Task.CompletedTask;
        };
    });
```

(`OnCreatingTicket` calling `context.Fail(...)` causes the cookie sign-in to be abandoned; the user lands on `AccessDeniedPath`.)

- [ ] **Step 3: Implement the auth endpoints**

Create `api/PortfolioReport.Api/Endpoints/AuthEndpoints.cs`:

```csharp
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;

namespace PortfolioReport.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // Kicks off the Google sign-in, returning to the SPA root afterward.
        app.MapGet("/login", () =>
            Results.Challenge(
                new AuthenticationProperties { RedirectUri = "/" },
                new[] { GoogleDefaults.AuthenticationScheme }));

        app.MapGet("/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Redirect("/");
        });

        app.MapGet("/access-denied", () =>
            Results.Content(
                "<h1>Access denied</h1><p>This Google account is not authorized for this report.</p>",
                "text/html"));
    }
}
```

- [ ] **Step 4: Wire endpoints in and supply secrets**

In `Program.cs`, add directly below `app.MapUserContextEndpoints();`:

```csharp
app.MapAuthEndpoints();
```

Store the Google secrets for local dev with user-secrets (run from `api/PortfolioReport.Api`):

```bash
dotnet user-secrets init
dotnet user-secrets set "Google:ClientId" "<your-client-id>"
dotnet user-secrets set "Google:ClientSecret" "<your-client-secret>"
```

- [ ] **Step 5: Verify existing tests still pass**

Run: `dotnet test api/PortfolioReport.sln`
Expected: PASS — all tests still green (test scheme is unaffected by Google config).

- [ ] **Step 6: Manually verify the OAuth round-trip**

Run: `dotnet run --project api/PortfolioReport.Api`. Then:
1. Visit `https://localhost:<port>/api/me` → expect `401`.
2. Visit `https://localhost:<port>/login` → Google sign-in. Sign in with an **allowlisted** account → redirected to `/`.
3. Visit `/api/me` again → expect `200` with `{"user":"kevin"}`.
4. `/logout` → `/api/me` returns `401` again.
5. Sign in with a **non-allowlisted** Google account → expect the `/access-denied` page.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): Google OAuth login with allowlist enforcement"
```

---

## Task 11: Serve the React SPA from wwwroot with SPA fallback

**Files:**
- Modify: `api/PortfolioReport.Api/Program.cs`
- Create: `api/PortfolioReport.Api/wwwroot/index.html` (placeholder, replaced by the real build in Task 14)
- Test: `api/PortfolioReport.Api.Tests/SpaFallbackTests.cs`

- [ ] **Step 1: Add a placeholder `wwwroot/index.html`**

Create `api/PortfolioReport.Api/wwwroot/index.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><title>Portfolio Report</title></head>
<body><div id="root">placeholder — replaced by the Vite build</div></body></html>
```

- [ ] **Step 2: Write the failing test**

Create `api/PortfolioReport.Api.Tests/SpaFallbackTests.cs`:

```csharp
using System.Net;
using Xunit;

public class SpaFallbackTests
{
    [Fact]
    public async Task RootServesTheSpaIndex()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/");
        res.EnsureSuccessStatusCode();

        Assert.Contains("text/html", res.Content.Headers.ContentType?.ToString());
        Assert.Contains("id=\"root\"", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownClientRouteFallsBackToTheSpaIndex()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/some/client/route");
        res.EnsureSuccessStatusCode();

        Assert.Contains("id=\"root\"", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownApiRouteDoesNotFallBackToTheSpa()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SpaFallbackTests`
Expected: FAIL — `/` returns 404 (no static file serving wired).

- [ ] **Step 4: Wire static files + SPA fallback in `Program.cs`**

In `Program.cs`, after `app.UseAuthorization();` add:

```csharp
app.UseDefaultFiles();
app.UseStaticFiles();
```

Then, after `app.MapAuthEndpoints();` (the last endpoint mapping) and before `app.Run();`, add:

```csharp
// Any non-API, non-file GET falls back to the SPA so client-side routing works.
app.MapFallbackToFile("index.html");
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `dotnet test api/PortfolioReport.Api.Tests --filter SpaFallbackTests`
Expected: PASS — 3 tests. The third passes because `/api/*` is matched by endpoint routing (returns 404) and never reaches the fallback.

- [ ] **Step 6: Run the whole suite**

Run: `dotnet test api/PortfolioReport.sln`
Expected: PASS — all tests.

- [ ] **Step 7: Commit**

```bash
git add api
git commit -m "feat(api): serve the React SPA from wwwroot with client-route fallback"
```

---

## Task 12: React report — fetch /api/analysis and handle 401

**Files:**
- Modify: `src/report/app/App.tsx:37-46`
- Modify: `src/report/app/vite.config.ts`

- [ ] **Step 1: Point `loadAnalysis` at the gated endpoint**

In `src/report/app/App.tsx`, replace the `loadAnalysis` callback (currently lines 37–46) with:

```tsx
  const loadAnalysis = useCallback(async () => {
    try {
      const r = await fetch("/api/analysis");
      if (r.status === 401) {
        // Not signed in — hand off to the server's Google login.
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as AnalysisOutput;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);
```

- [ ] **Step 2: Update the error hint copy**

In `src/report/app/App.tsx`, in the `if (error)` block, replace the hint `<div>` (the one mentioning `npm run analyze` / `output/analysis.json`) with:

```tsx
        <div style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }}>
          No analysis has been published yet. Run <code>npm run publish</code> locally to
          analyze and upload your portfolio.
        </div>
```

- [ ] **Step 3: Update `vite.config.ts` for the new dev model**

Overwrite `src/report/app/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev model: the ASP.NET Core API runs separately (dotnet run). Vite serves the
// React app with HMR and proxies /api and the auth routes to that API, so the
// browser sees a single origin — matching production.
const API_TARGET = process.env.API_TARGET ?? "http://localhost:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/login": { target: API_TARGET, changeOrigin: true },
      "/logout": { target: API_TARGET, changeOrigin: true },
      "/access-denied": { target: API_TARGET, changeOrigin: true },
      "/signin-google": { target: API_TARGET, changeOrigin: true },
    },
  },
});
```

(This drops the old `userContextPlugin` middleware and `publicDir` analysis trick. `src/server/vitePlugin.ts` and `src/server/handlers/*` are now dead for production; leave them in place — Phase 2 reimplements that behavior in C# and they can be removed then.)

- [ ] **Step 4: Verify the React app type-checks**

Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Manually verify against the running API**

In one terminal: `dotnet run --project api/PortfolioReport.Api` (note its HTTP port; set `API_TARGET` if not 5000). In another: `npx vite src/report/app`. Then:
1. Open `http://localhost:5173` while signed out → the app should redirect the browser to `/login` (Google).
2. Sign in with an allowlisted account.
3. With no analysis pushed yet, the app shows the "No analysis has been published yet" hint.

- [ ] **Step 6: Commit**

```bash
git add src/report/app/App.tsx src/report/app/vite.config.ts
git commit -m "feat(report): load analysis from gated /api/analysis; dev proxy to the API"
```

---

## Task 13: Local push/pull script

A `tsx` script that pulls the latest `user-context.json`, runs the existing `analyze` pipeline, and pushes the resulting `analysis.json`.

**Files:**
- Create: `scripts/publish.ts`
- Modify: `package.json` (add the `publish` script)

- [ ] **Step 1: Inspect how `analyze` resolves paths**

Read `src/index.ts` and `src/loadEnv.ts` (already in the repo). Confirm: `analyze` selects the user via `--user <name>`, loads `.env`/`.env.<user>`, and reads/writes paths from `OUTPUT_FILE` / `USER_CONTEXT_FILE` env vars. The publish script reuses that exact mechanism by shelling out to `tsx src/index.ts --user <name>`.

- [ ] **Step 2: Write the publish script**

Create `scripts/publish.ts`:

```ts
/**
 * Local publish flow: pull the server's user-context.json, run the analyze
 * pipeline, then push the resulting analysis.json back to the server.
 *
 * Usage:  npm run publish -- --user kevin
 *
 * Env (from .env / .env.<user>):
 *   PUBLISH_API_BASE   e.g. https://finance.bis-corp.com
 *   PUBLISH_PUSH_TOKEN the user's push token
 *   USER_CONTEXT_FILE  local path analyze reads the profile from
 *   OUTPUT_FILE        local path analyze writes analysis.json to
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadEnv } from "../src/loadEnv";

const { user } = loadEnv();
if (!user) {
  console.error("publish: pass --user <name> (e.g. npm run publish -- --user kevin)");
  process.exit(1);
}

const base = required("PUBLISH_API_BASE");
const token = required("PUBLISH_PUSH_TOKEN");
const contextFile = path.resolve(required("USER_CONTEXT_FILE"));
const outputFile = path.resolve(required("OUTPUT_FILE"));

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`publish: ${name} is not set (check .env.${user})`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  // 1. Pull the authoritative user-context.json so analyze sees the latest profile.
  console.log(`publish: pulling user-context for ${user}...`);
  const pull = await fetch(`${base}/api/user-context`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!pull.ok) throw new Error(`pull failed: HTTP ${pull.status}`);
  fs.mkdirSync(path.dirname(contextFile), { recursive: true });
  fs.writeFileSync(contextFile, await pull.text());

  // 2. Run the existing analyze pipeline for this user.
  console.log("publish: running analyze...");
  const analyze = spawnSync(
    "npx",
    ["tsx", "src/index.ts", "--user", user!],
    { stdio: "inherit", shell: true },
  );
  if (analyze.status !== 0) throw new Error(`analyze exited ${analyze.status}`);

  // 3. Push the freshly written analysis.json.
  console.log("publish: pushing analysis.json...");
  const analysisJson = fs.readFileSync(outputFile, "utf-8");
  const push = await fetch(`${base}/api/analysis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: analysisJson,
  });
  if (!push.ok) throw new Error(`push failed: HTTP ${push.status}`);
  console.log(`publish: done — ${await push.text()}`);
}

main().catch((err) => {
  console.error("publish failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the `publish` script to `package.json`**

In `package.json`, add to the `"scripts"` block:

```json
    "publish": "tsx scripts/publish.ts",
```

- [ ] **Step 4: Add the new env keys to the example env**

The repo uses `.env` / `.env.<user>` (not committed). Document the two new keys by adding them to whatever env example the repo keeps (or note them in the runbook in Task 14). Each user's `.env.<user>` needs:

```
PUBLISH_API_BASE=https://finance.bis-corp.com
PUBLISH_PUSH_TOKEN=<that user's push token>
```

- [ ] **Step 5: Manually verify end to end against the local API**

With the API running locally (`dotnet run --project api/PortfolioReport.Api`) and `.env.kevin` pointing `PUBLISH_API_BASE` at the local API URL with a matching push token in the API's user-secrets/appsettings:

Run: `npm run publish -- --user kevin`
Expected: prints "pulling", "running analyze", "pushing", "done"; afterward `GET /api/analysis` (signed in as kevin) returns the new analysis.

- [ ] **Step 6: Commit**

```bash
git add scripts/publish.ts package.json
git commit -m "feat(scripts): local publish flow — pull context, analyze, push analysis"
```

---

## Task 14: Build script and Winhost deployment runbook

**Files:**
- Create: `scripts/build-api.ps1`
- Create: `docs/runbooks/winhost-deploy.md`
- Modify: `package.json` (add `build:api` script)

- [ ] **Step 1: Write the build script**

Create `scripts/build-api.ps1`:

```powershell
# Builds the React report into the API's wwwroot, then publishes the .NET app.
# Output: api/PortfolioReport.Api/bin/Release/net8.0/publish/
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$wwwroot = Join-Path $repo "api/PortfolioReport.Api/wwwroot"

Write-Host "1/3  Building the React report..."
npx vite build (Join-Path $repo "src/report/app") --outDir $wwwroot --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

Write-Host "2/3  Publishing the .NET app..."
dotnet publish (Join-Path $repo "api/PortfolioReport.Api/PortfolioReport.Api.csproj") `
  -c Release
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }

Write-Host "3/3  Done. Deploy the contents of:"
Write-Host "     api/PortfolioReport.Api/bin/Release/net8.0/publish/"
```

- [ ] **Step 2: Add the `build:api` script to `package.json`**

In `package.json`, add to `"scripts"`:

```json
    "build:api": "powershell -ExecutionPolicy Bypass -File scripts/build-api.ps1",
```

- [ ] **Step 3: Run the build to verify it produces a publish folder**

Run: `npm run build:api`
Expected: completes with "Done."; `api/PortfolioReport.Api/bin/Release/net8.0/publish/` contains `PortfolioReport.Api.dll`, a `wwwroot/` with hashed JS/CSS, and `web.config`.

- [ ] **Step 4: Write the deployment runbook**

Create `docs/runbooks/winhost-deploy.md`:

```markdown
# Winhost Deployment Runbook — Hosted Report

## Prerequisites (verified in Task 1)
- ASP.NET Core 8 runtime available on the Winhost plan.
- An IIS site/app for `finance.bis-corp.com` with TLS.
- The app may write to an `App_Data` folder.

## One-time setup
1. In the Winhost control panel, create the `finance.bis-corp.com` subdomain
   and its IIS application; enable TLS.
2. In Google Cloud Console, add `https://finance.bis-corp.com/signin-google`
   as an authorized redirect URI on the OAuth client.
3. Provide production config. Either deploy an `appsettings.Production.json`
   (NOT in git) or set environment variables on the IIS app:
   - `Google__ClientId`, `Google__ClientSecret`
   - `Allowlist__Users__0__Email`, `__0__User`, `__0__PushToken`
     (repeat the index for each user)
   - `Storage__DataRoot` — absolute path to the App_Data folder if it must
     live outside the site root.
4. Generate a strong random push token per user; put it in both the server
   config above and that user's local `.env.<user>` as `PUBLISH_PUSH_TOKEN`.

## Each deployment
1. Locally: `npm run build:api`.
2. Upload the contents of `api/PortfolioReport.Api/bin/Release/net8.0/publish/`
   to the IIS application folder (Web Deploy or FTP).
3. Do NOT overwrite `App_Data/` — it holds live user data.
4. Recycle the IIS app pool.

## Smoke test after deploy
- `https://finance.bis-corp.com/healthz` → `ok`.
- `https://finance.bis-corp.com/` signed out → redirects to Google login.
- Sign in with an allowlisted account → report loads (or shows the
  "no analysis published" hint).
- Run `npm run publish -- --user <name>` locally → report shows the analysis.

## Backups
- `App_Data/<user>/user-context.json` is the only server-authoritative data.
  Copy `App_Data/` on a schedule. `analysis.json` is re-pushable from local.
```

- [ ] **Step 5: Verify the runbook references are accurate**

Re-read `docs/runbooks/winhost-deploy.md` against Tasks 10–13: the redirect URI, the env-var names (`Google__ClientId` etc.), the publish path, and the `publish` script name must all match. Fix any mismatch.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-api.ps1 package.json docs/runbooks/winhost-deploy.md
git commit -m "chore: API build script and Winhost deployment runbook"
```

---

## Task 15: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the entire C# test suite**

Run: `dotnet test api/PortfolioReport.sln`
Expected: PASS — every test from Tasks 3–11.

- [ ] **Step 2: Run the existing TypeScript test suite**

Run: `npm test`
Expected: PASS — the 174 engine/intake tests are unaffected by this phase.

- [ ] **Step 3: Type-check both TypeScript projects**

Run: `npx tsc --noEmit`
Run: `npx tsc --noEmit -p src/report/app/tsconfig.json`
Expected: no errors in either.

- [ ] **Step 4: Full local smoke test**

1. `dotnet run --project api/PortfolioReport.Api` (note the port).
2. `npx vite src/report/app` in another terminal.
3. Browser → `http://localhost:5173` → redirected to Google login.
4. Sign in (allowlisted) → "no analysis published" hint.
5. `npm run publish -- --user kevin` (env pointed at the local API).
6. Reload the report → the analysis renders.
7. `/logout` → reload → redirected to login again.

- [ ] **Step 5: Confirm no secrets were committed**

Run: `git log -p --all -- api/PortfolioReport.Api/appsettings.json`
Expected: the committed `appsettings.json` has empty `Google` and `PushToken` values. Confirm no `appsettings.Production.json`, `.env`, or user-secrets file is tracked.

- [ ] **Step 6: Final commit if anything was fixed**

```bash
git add -A
git commit -m "test: Phase 1 full verification pass"
```

(Skip if Steps 1–5 produced no changes.)

---

## Plan Self-Review

**Spec coverage** (against `2026-05-18-hosted-report-design.md`):
- Single ASP.NET Core app, one origin, serves SPA + `/api/*` — Tasks 2, 6–11. ✓
- Google OAuth + cookie session + allowlist — Task 10. ✓
- `GET /api/me` — Task 6. ✓
- `GET /api/analysis` (gated), `POST /api/analysis` (push token) — Tasks 7, 8. ✓
- `GET /api/user-context` (session or push token) — Task 9. ✓
- `App_Data/<user>/` outside web root, path-traversal-safe — Task 4. ✓
- Local pull → analyze → push flow, `user-context.json` read-only locally — Task 13. ✓
- React app loads from `/api/analysis`, handles 401 — Task 12. ✓
- Build pipeline + Winhost deployment — Task 14. ✓
- Winhost open items verified — Task 1. ✓
- Out of Phase 1 scope (own plans): CRUD endpoints, `/api/ai` proxy, browser AI, PWA, responsive CSS pass. Stated in the header. ✓

**Placeholder scan:** no "TBD"/"TODO"/"handle edge cases". Task 11's `wwwroot/index.html` is an intentional, labeled placeholder replaced by the real build in Task 14.

**Type/name consistency:** `AllowlistOptions`/`UserRecord` (Task 3) used in Tasks 8, 10. `UserDataStore.ReadAsync`/`WriteAsync` (Task 4) used in Tasks 7–9. `CurrentUser.UserClaim`/`KeyOf` (Task 5) used in Tasks 6, 9, 10. `PushTokenResolver.ResolveUser` (Task 8) used in Task 9. The `"session"` policy is defined in `Program.cs` (Task 6) and overridden in `ApiFactory` (Task 5) — consistent. Endpoint extension method names (`MapMeEndpoints`, `MapAnalysisEndpoints`, `MapUserContextEndpoints`, `MapAuthEndpoints`) match their `Program.cs` call sites.
