using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class UserContextEndpoints
{
    public const string FileName = "user-context.json";

    // Returned when a user has no stored context yet. Must include "version":2 —
    // the intake schema (src/intake/parseUserContext.ts) requires z.literal(2).
    private const string EmptyContext =
        "{\"version\":2,\"situations\":[],\"notes\":[],\"chat_history\":[],\"profile\":null}";

    public static void MapUserContextEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/user-context", async (
            HttpContext ctx, UserDataStore store, PushTokenResolver pushAuth) =>
        {
            // Cookie session first, then fall back to a push token.
            var user = CurrentUser.KeyOf(ctx.User) ?? pushAuth.ResolveUser(ctx.Request);
            if (user is null) return Results.Unauthorized();

            var json = await store.ReadAsync(user, FileName) ?? EmptyContext;
            return Results.Content(json, "application/json");
        });
        // No RequireAuthorization: this endpoint accepts two auth mechanisms and
        // checks them itself.
    }
}
