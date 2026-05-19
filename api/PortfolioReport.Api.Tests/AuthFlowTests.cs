using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Xunit;

/// <summary>
/// Exercises the REAL auth pipeline (cookie + Google schemes), unlike ApiFactory
/// which swaps in a header-driven test scheme. Dummy Google credentials satisfy
/// GoogleOptions validation at startup; the Google scheme is never invoked here.
/// </summary>
public class AuthFlowTests
{
    private sealed class RealPipelineFactory : WebApplicationFactory<Program>
    {
        private readonly string _environment;
        public RealPipelineFactory(string environment) => _environment = environment;

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(_environment);
            builder.UseSetting("Google:ClientId", "test-client-id");
            builder.UseSetting("Google:ClientSecret", "test-client-secret");
            builder.UseSetting("Storage:DataRoot",
                Path.Combine(Path.GetTempPath(), "authflow-" + Guid.NewGuid()));
            // Self-contained allowlist for these tests — independent of the
            // committed appsettings.json. The dev-login tests reference "luke".
            builder.UseSetting("Allowlist:Users:0:Email", "kbowsher@gmail.com");
            builder.UseSetting("Allowlist:Users:0:User", "kevin");
            builder.UseSetting("Allowlist:Users:0:PushToken", "");
            builder.UseSetting("Allowlist:Users:1:Email", "lukebowsher05@gmail.com");
            builder.UseSetting("Allowlist:Users:1:User", "luke");
            builder.UseSetting("Allowlist:Users:1:PushToken", "");
        }
    }

    private static HttpClient NoRedirectClient(WebApplicationFactory<Program> factory) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task UnauthenticatedApiRequestReturns401NotRedirect()
    {
        using var factory = new RealPipelineFactory("Development");
        using var client = NoRedirectClient(factory);

        var res = await client.GetAsync("/api/me");

        // Must be a clean 401 the SPA can branch on — NOT a 302 to /login, which
        // a browser fetch() would silently follow into Google and CORS-fail.
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task DevLoginSignsInTheChosenUser()
    {
        using var factory = new RealPipelineFactory("Development");
        using var client = NoRedirectClient(factory);

        var login = await client.GetAsync("/dev-login?user=luke");
        Assert.Equal(HttpStatusCode.Redirect, login.StatusCode);

        // The auth cookie set by /dev-login is carried by the client.
        var me = await client.GetAsync("/api/me");
        me.EnsureSuccessStatusCode();
        var body = await me.Content.ReadFromJsonAsync<MeBody>();
        Assert.Equal("luke", body!.User);
    }

    [Fact]
    public async Task DevLoginRejectsUnknownUser()
    {
        using var factory = new RealPipelineFactory("Development");
        using var client = NoRedirectClient(factory);

        var res = await client.GetAsync("/dev-login?user=nobody");

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task DevLoginDoesNothingInProduction()
    {
        using var factory = new RealPipelineFactory("Production");
        using var client = NoRedirectClient(factory);

        // In Production the /dev-login route is not mapped, so the request falls
        // through to the SPA fallback and signs nobody in.
        await client.GetAsync("/dev-login?user=luke");

        var me = await client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);
    }

    [Fact]
    public async Task ConfigReportsDevLoginInDevelopment()
    {
        using var factory = new RealPipelineFactory("Development");
        using var client = NoRedirectClient(factory);

        var res = await client.GetAsync("/api/config");
        res.EnsureSuccessStatusCode();
        var cfg = await res.Content.ReadFromJsonAsync<ConfigBody>();

        Assert.True(cfg!.DevLogin);
        Assert.Contains("kevin", cfg.DevUsers);
    }

    [Fact]
    public async Task ConfigHidesDevLoginInProduction()
    {
        using var factory = new RealPipelineFactory("Production");
        using var client = NoRedirectClient(factory);

        var res = await client.GetAsync("/api/config");
        res.EnsureSuccessStatusCode();
        var cfg = await res.Content.ReadFromJsonAsync<ConfigBody>();

        Assert.False(cfg!.DevLogin);
        Assert.Empty(cfg.DevUsers);
    }

    private sealed record MeBody(string User);
    private sealed record ConfigBody(bool DevLogin, string[] DevUsers);
}
