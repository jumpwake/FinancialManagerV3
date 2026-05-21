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

        app.MapPost("/api/analysis", async (
            HttpContext ctx, UserDataStore store, PushTokenResolver pushAuth) =>
        {
            var user = pushAuth.ResolveUser(ctx.Request);
            if (user is null) return Results.Unauthorized();

            using var reader = new StreamReader(ctx.Request.Body);
            var body = await reader.ReadToEndAsync();
            if (string.IsNullOrWhiteSpace(body))
                return Results.BadRequest(new { error = "empty body" });

            await store.WriteAsync(user, FileName, body);
            return Results.Ok(new { user, bytes = body.Length });
        }).RequireRateLimiting("push-token");
        // No RequireAuthorization: this endpoint authenticates via push token,
        // not the cookie session. The rate limiter partitions by IP so a
        // bogus-token caller can't brute-force or DoS the endpoint.
    }
}
