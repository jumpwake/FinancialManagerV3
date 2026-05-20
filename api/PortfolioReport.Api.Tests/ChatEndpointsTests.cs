using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class ChatEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    private static object SampleMessage(string role, string text) => new
    {
        id = "msg_" + Guid.NewGuid().ToString("N")[..8],
        role,
        content = text,
        scope = new { type = "global" },
        created_at = DateTime.UtcNow.ToString("o"),
    };

    [Fact]
    public async Task GetRejectsAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/chat");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsEmptyArrayForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var arr = await (await client.GetAsync("/api/chat"))
            .Content.ReadFromJsonAsync<JsonArray>();

        Assert.Empty(arr!);
    }

    [Fact]
    public async Task PostAppendsMessagesAndGetReturnsThem()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var append = new[] { SampleMessage("user", "what's my grade?"), SampleMessage("assistant", "B") };
        var post = await client.PostAsJsonAsync("/api/chat", append);
        Assert.Equal(HttpStatusCode.NoContent, post.StatusCode);

        var list = await (await client.GetAsync("/api/chat"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Equal(2, list!.Count);
        Assert.Equal("user", (string)list[0]!["role"]!);
        Assert.Equal("assistant", (string)list[1]!["role"]!);
    }

    [Fact]
    public async Task PostRejectsNonArrayBody()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/chat",
            new { not_an_array = true });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PostIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        using var kevin = SignedIn(factory, "kevin");
        using var luke = SignedIn(factory, "luke");

        await kevin.PostAsJsonAsync("/api/chat",
            new[] { SampleMessage("user", "kevin's msg") });

        var lukeList = await (await luke.GetAsync("/api/chat"))
            .Content.ReadFromJsonAsync<JsonArray>();
        Assert.Empty(lukeList!);
    }
}
