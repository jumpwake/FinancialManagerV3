using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Storage;

/// <summary>
/// Boots the real app for integration tests, but with a temp data root and the
/// test auth scheme swapped in for Google. Each instance gets its own folder.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public string DataRoot { get; } =
        Path.Combine(Path.GetTempPath(), "api-" + Guid.NewGuid());

    public UserDataStore Store { get; }

    public ApiFactory()
    {
        Store = new UserDataStore(DataRoot);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Storage:DataRoot", DataRoot);
        builder.UseSetting("Allowlist:Users:0:Email", "kbowsher@gmail.com");
        builder.UseSetting("Allowlist:Users:0:User", "kevin");
        builder.UseSetting("Allowlist:Users:0:PushToken", "tok-kevin");

        builder.ConfigureTestServices(services =>
        {
            // Remove the Google OAuth options validator so empty ClientId/ClientSecret
            // don't cause 500s in tests (the Google scheme is never invoked in tests).
            var googleValidators = services
                .Where(d => d.ServiceType == typeof(IValidateOptions<GoogleOptions>))
                .ToList();
            foreach (var d in googleValidators) services.Remove(d);

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
