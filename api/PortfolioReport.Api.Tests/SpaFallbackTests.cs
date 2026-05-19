using System.Net;
using Xunit;

public class SpaFallbackTests
{
    [Fact]
    public async Task RootServesTheSpaIndex()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/");
        res.EnsureSuccessStatusCode();

        Assert.Contains("text/html", res.Content.Headers.ContentType?.ToString());
        Assert.Contains("id=\"root\"", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownClientRouteFallsBackToTheSpaIndex()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/some/client/route");
        res.EnsureSuccessStatusCode();

        Assert.Contains("id=\"root\"", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownApiRouteDoesNotFallBackToTheSpa()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }
}
