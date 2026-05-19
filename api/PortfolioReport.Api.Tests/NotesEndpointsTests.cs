using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class NotesEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    private static object SampleNote() => new
    {
        target = new { type = "flag", finding_key = "cash_drag" },
        body = "Holding this cash deliberately as a reserve.",
        suppress_flag = true,
    };

    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/notes");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTargetOrBody()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/notes", new { body = "no target" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesNoteAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var post = await client.PostAsJsonAsync("/api/notes", SampleNote());
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.StartsWith("note_", (string)created!["id"]!);
        Assert.True((bool)created["suppress_flag"]!);

        var list = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
    }

    [Fact]
    public async Task PatchUpdatesNoteFields()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/notes", SampleNote()))
            .Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var res = await client.PatchAsJsonAsync($"/api/notes/{id}", new { suppress_flag = false });
        res.EnsureSuccessStatusCode();
        var updated = await res.Content.ReadFromJsonAsync<JsonObject>();

        Assert.False((bool)updated!["suppress_flag"]!);
    }

    [Fact]
    public async Task DeleteRemovesTheNote()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/notes", SampleNote()))
            .Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var del = await client.DeleteAsync($"/api/notes/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/notes"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/notes/note_nope");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
