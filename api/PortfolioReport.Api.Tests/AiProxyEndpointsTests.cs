using System.Net;
using System.Net.Http.Json;
using Xunit;

public class AiProxyEndpointsTests
{
    private static HttpClient SignedIn(ApiFactory f, string user)
    {
        var client = f.CreateClient();
        client.DefaultRequestHeaders.Add(TestAuthHandler.HeaderName, user);
        return client;
    }

    [Fact]
    public async Task RejectsAnonymous()
    {
        using var factory = new ApiFactory();
        using var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-opus-4-8", max_tokens = 100, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task ForwardsBodyAndInjectsTheUsersAnthropicKey()
    {
        using var factory = new ApiFactory();
        factory.AnthropicStub.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":\"msg_x\"}",
                System.Text.Encoding.UTF8, "application/json"),
        };
        using var client = SignedIn(factory, "kevin");

        var requestBody = new
        {
            model = "claude-opus-4-8",
            max_tokens = 100,
            messages = new[] { new { role = "user", content = "hi" } },
        };
        var res = await client.PostAsJsonAsync("/api/ai/v1/messages", requestBody);
        res.EnsureSuccessStatusCode();

        Assert.NotNull(factory.AnthropicStub.CapturedRequest);
        Assert.Equal("https://api.anthropic.com/v1/messages",
            factory.AnthropicStub.CapturedRequest!.RequestUri!.ToString());
        Assert.Equal("sk-kevin-test",
            factory.AnthropicStub.CapturedRequest!.Headers.GetValues("x-api-key").Single());
        Assert.Contains("\"max_tokens\":100", factory.AnthropicStub.CapturedRequestBody);
    }

    [Fact]
    public async Task PassesUpstreamBodyThrough()
    {
        using var factory = new ApiFactory();
        factory.AnthropicStub.Responder = _ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"id\":\"msg_y\",\"role\":\"assistant\"}",
                System.Text.Encoding.UTF8, "application/json"),
        };
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-opus-4-8", max_tokens = 50, messages = Array.Empty<object>() });

        var body = await res.Content.ReadAsStringAsync();
        Assert.Contains("\"id\":\"msg_y\"", body);
        Assert.Contains("\"role\":\"assistant\"", body);
    }

    [Fact]
    public async Task ReturnsBadGatewayWhenAnthropicKeyMissing()
    {
        using var factory = new ApiFactory();
        factory.OverrideAnthropicKey = "";
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-opus-4-8", max_tokens = 50, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
    }

    [Fact]
    public async Task ForwardsUpstreamErrorStatusAndBody()
    {
        using var factory = new ApiFactory();
        factory.AnthropicStub.Responder = _ => new HttpResponseMessage(HttpStatusCode.TooManyRequests)
        {
            Content = new StringContent("{\"error\":{\"type\":\"rate_limit_error\"}}",
                System.Text.Encoding.UTF8, "application/json"),
        };
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-opus-4-8", max_tokens = 50, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.TooManyRequests, res.StatusCode);
        Assert.Contains("rate_limit_error", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task RejectsRequestsExceedingMaxTokensCap()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        var res = await client.PostAsJsonAsync("/api/ai/v1/messages",
            new { model = "claude-opus-4-8", max_tokens = 50000, messages = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task SixtyFirstRequestInOneMinuteIsRateLimited()
    {
        using var factory = new ApiFactory();
        using var client = SignedIn(factory, "kevin");

        // Burst through the per-user window. The limit is 60/min.
        HttpResponseMessage? last = null;
        for (var i = 0; i < 61; i++)
        {
            last = await client.PostAsJsonAsync("/api/ai/v1/messages",
                new { model = "claude-opus-4-8", max_tokens = 10, messages = Array.Empty<object>() });
            if (last.StatusCode == HttpStatusCode.TooManyRequests) break;
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
    }
}
