using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class SpeculativeHoldsEndpointsTests
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

        var res = await client.GetAsync("/api/speculative-holds");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostRejectsMissingTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/speculative-holds", new { reason = "no ticker" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostCreatesHoldInitializesKeyAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        // New user's stored context has no speculative_holds key; POST must create it.
        var post = await client.PostAsJsonAsync("/api/speculative-holds",
            new { ticker = "TSLA", reason = "Long-term personal hold" });
        Assert.Equal(HttpStatusCode.Created, post.StatusCode);
        var created = await post.Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal("TSLA", (string)created!["ticker"]!);
        Assert.Equal("Long-term personal hold", (string)created["reason"]!);
        Assert.NotNull(created["designated_at"]);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
        Assert.Equal("TSLA", (string)list![0]!["ticker"]!);
    }

    [Fact]
    public async Task PostOmitsReasonWhenNotProvided()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var created = await (await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "NVDA" }))
            .Content.ReadFromJsonAsync<JsonObject>();

        Assert.Equal("NVDA", (string)created!["ticker"]!);
        Assert.False(created.ContainsKey("reason"));
    }

    [Fact]
    public async Task PostIsIdempotentForDuplicateTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });
        var second = await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA", reason = "dup" });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Single(list!);
    }

    [Fact]
    public async Task DeleteRemovesTheHold()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        await client.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });

        var del = await client.DeleteAsync("/api/speculative-holds/TSLA");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);

        var list = await (await client.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(list!);
    }

    [Fact]
    public async Task DeleteReturnsNotFoundForUnknownTicker()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.DeleteAsync("/api/speculative-holds/NOPE");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task PostIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        using var kevin = SignedIn(factory, "kevin");
        using var luke = SignedIn(factory, "luke");

        await kevin.PostAsJsonAsync("/api/speculative-holds", new { ticker = "TSLA" });

        var lukeList = await (await luke.GetAsync("/api/speculative-holds"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(lukeList!);
    }
}
