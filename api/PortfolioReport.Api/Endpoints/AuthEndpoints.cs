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
