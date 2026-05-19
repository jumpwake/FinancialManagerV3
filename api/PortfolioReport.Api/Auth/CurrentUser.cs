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
