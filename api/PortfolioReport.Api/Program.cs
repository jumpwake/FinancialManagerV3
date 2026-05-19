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
