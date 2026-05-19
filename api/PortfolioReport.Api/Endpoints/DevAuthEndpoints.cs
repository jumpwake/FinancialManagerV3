using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Configuration;

namespace PortfolioReport.Api.Endpoints;

/// <summary>
/// Development-only login bypass. Issues the same auth cookie a real Google
/// sign-in would, for a chosen allowlist user, without contacting Google.
/// Program.cs only calls MapDevAuthEndpoints when the environment is
/// Development, so this route does not exist in any other deployment.
/// </summary>
public static class DevAuthEndpoints
{
    public static void MapDevAuthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/dev-login", async (
            HttpContext ctx, string? user, IOptions<AllowlistOptions> allowlist) =>
        {
            var record = allowlist.Value.Users.FirstOrDefault(u => u.User == user);
            if (record is null)
            {
                var known = string.Join(", ", allowlist.Value.Users.Select(u => u.User));
                return Results.BadRequest(
                    $"Unknown dev user '{user}'. Known users: {known}.");
            }

            // Same cookie shape a real Google sign-in produces: a "user" claim
            // carrying the short user key.
            var identity = new ClaimsIdentity(
                new[] { new Claim(CurrentUser.UserClaim, record.User) },
                CookieAuthenticationDefaults.AuthenticationScheme);
            await ctx.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(identity));
            return Results.Redirect("/");
        });
    }
}
