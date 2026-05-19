using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Xunit;

public class ProfileEndpointsTests
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

        var res = await client.GetAsync("/api/profile");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsNullForNewUser()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.GetAsync("/api/profile");
        res.EnsureSuccessStatusCode();

        Assert.Equal("null", (await res.Content.ReadAsStringAsync()).Trim());
    }

    [Fact]
    public async Task PutRejectsOutOfRangeAge()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PutAsJsonAsync("/api/profile",
            new { age = 5, risk_tolerance = "moderate" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PutRejectsUnknownRiskTolerance()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PutAsJsonAsync("/api/profile",
            new { age = 40, risk_tolerance = "yolo" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task PutSavesProfileAndGetReturnsIt()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var put = await client.PutAsJsonAsync("/api/profile",
            new { age = 52, risk_tolerance = "moderately_aggressive" });
        put.EnsureSuccessStatusCode();

        var profile = await (await client.GetAsync("/api/profile"))
            .Content.ReadFromJsonAsync<JsonObject>();
        Assert.Equal(52, (int)profile!["age"]!);
        Assert.Equal("moderately_aggressive", (string)profile["risk_tolerance"]!);
    }
}
