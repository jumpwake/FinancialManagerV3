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
