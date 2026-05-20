using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class ChatEndpoints
{
    public static void MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/chat", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var history = ctx["chat_history"]?.AsArray() ?? new JsonArray();
            return Results.Content(history.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        // Body is an array of messages to append in order.
        app.MapPost("/api/chat", async (
            HttpContext http, UserContextStore store, JsonArray? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body must be a JSON array of messages" });

            await store.MutateAsync(user, c =>
            {
                var history = c["chat_history"]!.AsArray();
                foreach (var msg in body)
                    history.Add(msg?.DeepClone());
            });
            return Results.NoContent();
        }).RequireAuthorization("session");
    }
}
