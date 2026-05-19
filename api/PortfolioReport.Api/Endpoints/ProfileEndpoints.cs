using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class ProfileEndpoints
{
    private static readonly string[] RiskTolerances =
    {
        "conservative", "moderately_conservative", "moderate",
        "moderately_aggressive", "aggressive",
    };

    public static void MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/profile", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            // ctx["profile"] is JSON null for a new user — serialize it as "null".
            return Results.Content(
                ctx["profile"]?.ToJsonString() ?? "null", "application/json");
        }).RequireAuthorization("session");

        app.MapPut("/api/profile", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var age = body?["age"] is JsonValue v && v.TryGetValue<int>(out var a) ? a : -1;
            var risk = Json.Str(body?["risk_tolerance"]);
            if (age < 18 || age > 100)
                return Results.BadRequest(new { error = "age must be a whole number 18-100" });
            if (risk is null || !RiskTolerances.Contains(risk))
                return Results.BadRequest(new { error = "invalid risk_tolerance" });

            var profile = new JsonObject { ["age"] = age, ["risk_tolerance"] = risk };
            await store.MutateAsync(user, c => c["profile"] = profile.DeepClone());
            return Results.Content(profile.ToJsonString(), "application/json");
        }).RequireAuthorization("session");
    }
}
