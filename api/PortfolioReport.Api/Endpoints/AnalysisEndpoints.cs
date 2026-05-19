using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class AnalysisEndpoints
{
    public const string FileName = "analysis.json";

    public static void MapAnalysisEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/analysis", async (HttpContext ctx, UserDataStore store) =>
        {
            var user = CurrentUser.KeyOf(ctx.User);
            if (user is null) return Results.Unauthorized();

            var json = await store.ReadAsync(user, FileName);
            return json is null
                ? Results.NotFound()
                : Results.Content(json, "application/json");
        }).RequireAuthorization("session");
    }
}
