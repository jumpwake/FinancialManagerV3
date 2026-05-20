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
builder.Services.AddSingleton<PortfolioReport.Api.Auth.PushTokenResolver>();
builder.Services.AddSingleton<PortfolioReport.Api.Storage.UserContextStore>();
builder.Services.AddHttpClient("anthropic");

builder.Services.AddAuthentication(options =>
    {
        options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = Microsoft.AspNetCore.Authentication.Google.GoogleDefaults.AuthenticationScheme;
    })
    .AddCookie(options =>
    {
        options.LoginPath = "/login";
        options.AccessDeniedPath = "/access-denied";
        // For /api/* requests, return a bare status code the SPA's fetch() can
        // branch on, instead of a 302 redirect. A browser fetch silently follows
        // a redirect — it would chase the /login -> Google hop and fail with an
        // opaque CORS error instead of letting the SPA show its landing page.
        options.Events.OnRedirectToLogin = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }
            ctx.Response.Redirect(ctx.RedirectUri);
            return Task.CompletedTask;
        };
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

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("session", p =>
    {
        p.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme);
        p.RequireAuthenticatedUser();
    });

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/healthz", () => Results.Ok("ok"));

// Unauthenticated: tells the SPA landing page whether the dev-login bypass is
// available (Development only) and which users it offers.
app.MapGet("/api/config", (
    IWebHostEnvironment env,
    Microsoft.Extensions.Options.IOptions<AllowlistOptions> allowlist) =>
{
    var dev = env.IsDevelopment();
    return Results.Ok(new
    {
        devLogin = dev,
        devUsers = dev
            ? allowlist.Value.Users.Select(u => u.User).ToArray()
            : Array.Empty<string>(),
    });
});
app.MapMeEndpoints();
app.MapAnalysisEndpoints();
app.MapUserContextEndpoints();
app.MapSituationsEndpoints();
app.MapNotesEndpoints();
app.MapProfileEndpoints();
app.MapAiProxyEndpoints();
app.MapAuthEndpoints();

// Dev-only sign-in bypass — never mapped outside the Development environment.
if (app.Environment.IsDevelopment())
{
    app.MapDevAuthEndpoints();
}

// Unknown /api/* routes return 404 rather than falling back to the SPA.
app.MapFallback("/api/{*path}", () => Results.NotFound());

// Any non-API, non-file GET falls back to the SPA so client-side routing works.
app.MapFallbackToFile("index.html");

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
