using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Xunit;

public class UserContextEndpointsTests
{
    [Fact]
    public async Task ReturnsUnauthorizedWithNeitherSessionNorToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/user-context");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ReturnsEmptyDefaultWhenNoFileYet()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadAsStringAsync();

        // A fresh user gets a valid empty context, not a 404.
        Assert.Contains("\"situations\"", body);
        Assert.Contains("\"notes\"", body);
        Assert.Contains("\"chat_history\"", body);
    }

    [Fact]
    public async Task ReturnsStoredContextForSessionUser()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "user-context.json", "{\"profile\":{\"x\":1}}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"profile\":{\"x\":1}}", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ReturnsStoredContextForPushTokenCaller()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "user-context.json", "{\"profile\":{\"x\":2}}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", "tok-kevin");

        var res = await client.GetAsync("/api/user-context");
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"profile\":{\"x\":2}}", await res.Content.ReadAsStringAsync());
    }
}
