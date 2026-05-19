using PortfolioReport.Api.Auth;

namespace PortfolioReport.Api.Endpoints;

public static class MeEndpoints
{
    public static void MapMeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/me", (HttpContext ctx) =>
        {
            var user = CurrentUser.KeyOf(ctx.User);
            return user is null
                ? Results.Unauthorized()
                : Results.Ok(new { user });
        }).RequireAuthorization("session");
    }
}
