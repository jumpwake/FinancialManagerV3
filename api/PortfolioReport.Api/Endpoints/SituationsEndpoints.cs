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

        app.MapPatch("/api/situations/{id}", async (
            string id, HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body required" });

            JsonObject? updated = null;
            await store.MutateAsync(user, c =>
            {
                var match = c["situations"]!.AsArray().OfType<JsonObject>()
                    .FirstOrDefault(s => Json.Str(s["id"]) == id);
                if (match is null) return;

                foreach (var kv in body)
                {
                    if (kv.Key is "id" or "created_at") continue;  // server-owned, never overwritten
                    match[kv.Key] = kv.Value?.DeepClone();
                }
                match["updated_at"] = ContextIds.Timestamp();
                if (Json.Str(match["status"]) == "closed" && match["closed_at"] is null)
                    match["closed_at"] = ContextIds.Timestamp();

                updated = (JsonObject)match.DeepClone();
            });
            if (updated is null)
                return Results.NotFound(new { error = "not found" });

            // Serialize via ToJsonString() to avoid JsonNode TypeInfoResolver issues in .NET 8.
            return Results.Content(updated.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapDelete("/api/situations/{id}", async (
            string id, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["situations"]!.AsArray();
                for (var i = 0; i < arr.Count; i++)
                {
                    if (Json.Str(arr[i]?["id"]) == id)
                    {
                        arr.RemoveAt(i);
                        removed = true;
                        return;
                    }
                }
            });
            return removed
                ? Results.NoContent()
                : Results.NotFound(new { error = "not found" });
        }).RequireAuthorization("session");
    }
}
