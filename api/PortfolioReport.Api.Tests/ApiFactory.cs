using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using PortfolioReport.Api.Storage;

/// <summary>
/// Boots the real app for integration tests. Each instance is fully
/// self-contained: a temp data root, a temp web root holding a minimal SPA
/// index, and the header-driven test auth scheme swapped in for Google. Nothing
/// here depends on a build having populated the source wwwroot/.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public string DataRoot { get; } =
        Path.Combine(Path.GetTempPath(), "api-" + Guid.NewGuid());

    private readonly string _webRoot =
        Path.Combine(Path.GetTempPath(), "api-wwwroot-" + Guid.NewGuid());

    public UserDataStore Store { get; }

    public StubHttpMessageHandler AnthropicStub { get; } = new();

    /// <summary>Test override for the Anthropic key (empty = simulate not configured).</summary>
    public string OverrideAnthropicKey { get; set; } = "sk-kevin-test";

    public ApiFactory()
    {
        Store = new UserDataStore(DataRoot);
        Directory.CreateDirectory(_webRoot);
        File.WriteAllText(
            Path.Combine(_webRoot, "index.html"),
            "<!doctype html><html><body><div id=\"root\"></div></body></html>");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseWebRoot(_webRoot);
        builder.UseSetting("Storage:DataRoot", DataRoot);
        builder.UseSetting("Google:ClientId", "test-client-id");
        builder.UseSetting("Google:ClientSecret", "test-client-secret");
        builder.UseSetting("Allowlist:Users:0:Email", "kbowsher@gmail.com");
        builder.UseSetting("Allowlist:Users:0:User", "kevin");
        builder.UseSetting("Allowlist:Users:0:PushToken", "tok-kevin");
        builder.UseSetting("Anthropic:ApiKey", OverrideAnthropicKey);

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

            services.AddHttpClient("anthropic")
                .ConfigurePrimaryHttpMessageHandler(() => AnthropicStub);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (Directory.Exists(DataRoot)) Directory.Delete(DataRoot, recursive: true);
        if (Directory.Exists(_webRoot)) Directory.Delete(_webRoot, recursive: true);
    }
}
