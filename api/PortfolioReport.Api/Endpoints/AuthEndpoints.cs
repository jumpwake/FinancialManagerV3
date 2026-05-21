using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;

namespace PortfolioReport.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        // Kicks off the Google sign-in, returning to the SPA root afterward.
        // RedirectUri must include the runtime PathBase, otherwise the OAuth
        // completion sends the user to the IIS site root ("/") instead of the
        // app root ("/finance/") in production. PathBase is empty in dev so
        // the dev redirect stays "/" as before.
        app.MapGet("/login", (HttpContext ctx) =>
            Results.Challenge(
                new AuthenticationProperties { RedirectUri = AppRoot(ctx) },
                new[] { GoogleDefaults.AuthenticationScheme }));

        app.MapGet("/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.Redirect(AppRoot(ctx));
        });

        app.MapGet("/access-denied", () =>
            Results.Content(
                "<h1>Access denied</h1><p>This Google account is not authorized for this report.</p>",
                "text/html"));
    }

    // The SPA root path, accounting for the PathBase set by UsePathBase /
    // ANCM. Dev → "/", prod → "/finance/".
    private static string AppRoot(HttpContext ctx)
    {
        var basePath = ctx.Request.PathBase.HasValue ? ctx.Request.PathBase.Value! : "";
        return basePath.EndsWith('/') ? basePath : basePath + "/";
    }
}
