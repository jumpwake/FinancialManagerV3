using System.Text.Json.Nodes;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Storage;

namespace PortfolioReport.Api.Endpoints;

public static class NotesEndpoints
{
    public static void MapNotesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/notes", async (HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var ctx = await store.LoadAsync(user);
            var notes = ctx["notes"]?.AsArray() ?? new JsonArray();
            return Results.Content(notes.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapPost("/api/notes", async (
            HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var target = body?["target"] as JsonObject;
            var noteBody = Json.Str(body?["body"]);
            if (target is null || string.IsNullOrEmpty(noteBody))
                return Results.BadRequest(new { error = "target and body are required" });

            var note = new JsonObject
            {
                ["id"] = ContextIds.NewId("note"),
                ["target"] = target.DeepClone(),
                ["body"] = noteBody,
                ["suppress_flag"] = Json.Bool(body!["suppress_flag"], false),
                ["created_at"] = ContextIds.Timestamp(),
            };
            await store.MutateAsync(user, c => c["notes"]!.AsArray().Add(note.DeepClone()));
            // Serialize via ToJsonString() — resolver-free path; consistent with SituationsEndpoints.
            return Results.Content(note.ToJsonString(), "application/json",
                statusCode: StatusCodes.Status201Created);
        }).RequireAuthorization("session");

        app.MapPatch("/api/notes/{id}", async (
            string id, HttpContext http, UserContextStore store, JsonObject? body) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();
            if (body is null) return Results.BadRequest(new { error = "body required" });

            JsonObject? updated = null;
            await store.MutateAsync(user, c =>
            {
                var match = c["notes"]!.AsArray().OfType<JsonObject>()
                    .FirstOrDefault(n => Json.Str(n["id"]) == id);
                if (match is null) return;
                foreach (var kv in body)
                {
                    if (kv.Key is "id" or "created_at") continue;  // server-owned
                    match[kv.Key] = kv.Value?.DeepClone();
                }
                updated = (JsonObject)match.DeepClone();
            });
            return updated is null
                ? Results.NotFound(new { error = "not found" })
                : Results.Content(updated.ToJsonString(), "application/json");
        }).RequireAuthorization("session");

        app.MapDelete("/api/notes/{id}", async (
            string id, HttpContext http, UserContextStore store) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var removed = false;
            await store.MutateAsync(user, c =>
            {
                var arr = c["notes"]!.AsArray();
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
