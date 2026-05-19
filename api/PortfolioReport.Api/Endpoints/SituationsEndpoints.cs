using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class SituationsEndpoints
{
    public static void MapSituationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/situations", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var situations = ctx["situations"]?.AsArray() ?? new JsonArray();
            return Results.Content(situations.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/situations", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var title = (Json.Str(body?["title"]) ?? "").Trim();
            var intent = (Json.Str(body?["intent"]) ?? "").Trim();
            if (title.Length == 0 || intent.Length == 0)
                return Results.BadRequest(new { error = "title and intent are required" });

            var now = ContextIds.Timestamp();
            var situation = new JsonObject
            {
                ["id"] = ContextIds.NewId("sit"),
                ["title"] = title,
                ["intent"] = intent,
                ["status"] = "open",
                ["target_date"] = body!["target_date"]?.DeepClone(),
                ["related_findings"] = body["related_findings"]?.DeepClone() ?? new JsonArray(),
                ["portfolio_effects"] = body["portfolio_effects"]?.DeepClone() ?? new JsonArray(),
                ["verdict_history"] = new JsonArray(),
                ["created_at"] = now,
                ["updated_at"] = now,
                ["closed_at"] = null,
                ["closure_reason"] = null,
            };
            await store.MutateAsync(user,
                c => c["situations"]!.AsArray().Add(situation.DeepClone()));

            // Serialize via Utf8JsonWriter to avoid JsonNode TypeInfoResolver issues in .NET 8.
            using var ms = new MemoryStream();
            using (var writer = new Utf8JsonWriter(ms))
            {
                situation.WriteTo(writer);
            }
            var json = Encoding.UTF8.GetString(ms.ToArray());
            return Results.Content(json, "application/json", statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization("session");
    }
}
