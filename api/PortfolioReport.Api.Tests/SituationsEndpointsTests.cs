using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class SituationsEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/situations");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.GetAsync("/api/situations");
        res.EnsureSuccessStatusCode();
        var arr = await res.Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTitleOrIntent()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/situations", new { intent = "x" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesSituationAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var post = await client.PostAsJsonAsync("/api/situations",
            new { title = "Deploy cash", intent = "Move idle cash into bonds" });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.StartsWith("sit_", (string)created!["id"]!);
        Assert.Equal("open", (string)created["status"]!);

        var list = await (await client.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
        Assert.Equal("Deploy cash", (string)list![0]!["title"]!);
    }

    [Fact]
    public async Task PostIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        using var kevin = SignedIn(factory, "kevin");
        using var luke = SignedIn(factory, "luke");

        await kevin.PostAsJsonAsync("/api/situations", new { title = "t", intent = "i" });

        var lukeList = await (await luke.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(lukeList!);
    }

    [Fact]
    public async Task PatchUpdatesFieldsAndSetsClosedAtWhenClosed()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/situations",
            new { title = "t", intent = "i" })).Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var res = await client.PatchAsJsonAsync($"/api/situations/{id}",
            new { status = "closed", closure_reason = "completed" });
        res.EnsureSuccessStatusCode();
        var updated = await res.Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal("closed", (string)updated!["status"]!);
        Assert.Equal("completed", (string)updated["closure_reason"]!);
        Assert.NotNull(updated["closed_at"]);
        Assert.NotNull(updated!["updated_at"]);
    }

    [Fact]
    public async Task PatchReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PatchAsJsonAsync("/api/situations/sit_nope",
            new { status = "closed" });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task DeleteRemovesTheSituation()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/situations",
            new { title = "t", intent = "i" })).Content.ReadFromJsonAsync<JsonObject>();
        var id = (string)created!["id"]!;

        var del = await client.DeleteAsync($"/api/situations/{id}");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/situations"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownId()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/situations/sit_nope");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
