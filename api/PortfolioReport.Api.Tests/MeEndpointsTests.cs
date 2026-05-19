using System.Net;
using System.Net.Http.Json;
using Xunit;

public class MeEndpointsTests
{
    [Fact]
    public async Task ReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ReturnsUserKeyWhenAuthenticated()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/me");
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<MeResponse>();

        Assert.Equal("kevin", body!.User);
    }

    private sealed record MeResponse(string User);
}
