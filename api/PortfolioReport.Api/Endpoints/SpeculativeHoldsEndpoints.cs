using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class SpeculativeHoldsEndpoints
{
    public static void MapSpeculativeHoldsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/speculative-holds", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var holds = ctx["speculative_holds"]?.AsArray() ?? new JsonArray();
            return Results.Content(holds.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/speculative-holds", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ticker = Json.Str(body?["ticker"]);
            if (string.IsNullOrWhiteSpace(ticker))
                return Results.BadRequest(new { error = "ticker is required" });

            var reason = Json.Str(body?["reason"]);
            JsonObject hold = null!;
            var existed = false;
            await store.MutateAsync(user, c =>
            {
                // Initialize the key when absent — pre-feature contexts lack it.
                var arr = c["speculative_holds"]?.AsArray();
                if (arr is null)
                {
                    arr = new JsonArray();
                    c["speculative_holds"] = arr;
                }

                var match = arr.OfType<JsonObject>()
                    .FirstOrDefault(h => Json.Str(h["ticker"]) == ticker);
                if (match is not null)
                {
                    existed = true;
                    hold = (JsonObject)match.DeepClone();
                    return;
                }

                hold = new JsonObject { ["ticker"] = ticker };
                if (!string.IsNullOrWhiteSpace(reason)) hold["reason"] = reason;
                hold["designated_at"] = ContextIds.Timestamp();
                arr.Add(hold.DeepClone());
            });

            return Results.Content(hold.ToJsonString(), "application/json",
                statusCode: existed ? StatusCodes.Status200OK : StatusCodes.Status201Created);
        }).RequireAuthorization("session");

        app.MapDelete("/api/speculative-holds/{ticker}", async (
            string ticker, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["speculative_holds"]?.AsArray();
                if (arr is null) return;
                for (var i = 0; i < arr.Count; i++)
                {
                    if (Json.Str(arr[i]?["ticker"]) == ticker)
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
