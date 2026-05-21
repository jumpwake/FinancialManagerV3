using System.Net;
using Xunit;

public class AnalysisEndpointsTests
{
    [Fact]
    public async Task GetReturnsUnauthorizedWhenAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/analysis");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsNotFoundWhenNoAnalysisPushedYet()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/analysis");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task GetReturnsThisUsersAnalysisJson()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "analysis.json", "{\"portfolio_grade\":\"A\"}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "kevin");

        var res = await client.GetAsync("/api/analysis");
        res.EnsureSuccessStatusCode();

        Assert.Equal("application/json", res.Content.Headers.ContentType?.MediaType);
        Assert.Equal("{\"portfolio_grade\":\"A\"}", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetIsScopedToTheCallingUser()
    {
        using var factory = new ApiFactory();
        await factory.Store.WriteAsync("kevin", "analysis.json", "{\"who\":\"kevin\"}");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, "luke");

        var res = await client.GetAsync("/api/analysis");

        // luke has no file of their own and cannot see kevin's.
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task PostRejectsRequestWithNoPushToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task PostRejectsRequestWithWrongPushToken()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "wrong-token");

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task PostWithValidPushTokenWritesTheUsersAnalysis()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "tok-kevin");

        var res = await client.PostAsync("/api/analysis",
            new StringContent("{\"portfolio_grade\":\"B\"}",
                System.Text.Encoding.UTF8, "application/json"));
        res.EnsureSuccessStatusCode();

        Assert.Equal("{\"portfolio_grade\":\"B\"}",
            await factory.Store.ReadAsync("kevin", "analysis.json"));
    }

    [Fact]
    public async Task PostIsRateLimitedAfterTenRequestsInOneMinute()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "wrong-token");

        // Burst through the IP-partitioned window. Limit is 10/min. Using a
        // wrong token so the 401 path still counts (rate limiter runs before
        // the auth check). The 11th request should hit 429.
        HttpResponseMessage? last = null;
        for (var i = 0; i < 11; i++)
        {
            last = await client.PostAsync("/api/analysis",
                new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
            if (last.StatusCode == HttpStatusCode.TooManyRequests) break;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }
}
