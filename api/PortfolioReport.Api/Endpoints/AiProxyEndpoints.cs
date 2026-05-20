using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using PortfolioReport.Api.Auth;
using PortfolioReport.Api.Configuration;

namespace PortfolioReport.Api.Endpoints;

public static class AiProxyEndpoints
{
    private const string UpstreamUrl = "https://api.anthropic.com/v1/messages";
    private const string AnthropicVersionHeader = "anthropic-version";
    private const string AnthropicVersion = "2023-06-01";
    public const int MaxTokensCap = 16_000;

    public static void MapAiProxyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/ai/v1/messages", async (
            HttpContext http,
            IHttpClientFactory hcf,
            IOptions<AllowlistOptions> allowlist) =>
        {
            var user = CurrentUser.KeyOf(http.User);
            if (user is null) return Results.Unauthorized();

            var record = allowlist.Value.FindByUser(user);
            var key = record?.AnthropicApiKey;
            if (string.IsNullOrEmpty(key))
                return Results.StatusCode(StatusCodes.Status502BadGateway);

            using var reader = new StreamReader(http.Request.Body);
            var body = await reader.ReadToEndAsync();

            // Cap max_tokens to prevent an authenticated user from running up the bill.
            try
            {
                var parsed = System.Text.Json.Nodes.JsonNode.Parse(body) as System.Text.Json.Nodes.JsonObject;
                if (parsed?["max_tokens"] is System.Text.Json.Nodes.JsonValue v
                    && v.TryGetValue<int>(out var mt) && mt > MaxTokensCap)
                {
                    return Results.BadRequest(new { error = $"max_tokens {mt} exceeds cap {MaxTokensCap}" });
                }
            }
            catch (System.Text.Json.JsonException)
            {
                return Results.BadRequest(new { error = "request body is not valid JSON" });
            }

            var upstreamReq = new HttpRequestMessage(HttpMethod.Post, UpstreamUrl);
            upstreamReq.Headers.Add("x-api-key", key);
            upstreamReq.Headers.Add(AnthropicVersionHeader, AnthropicVersion);
            upstreamReq.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");

            var client = hcf.CreateClient("anthropic");
            using var upstreamRes = await client.SendAsync(
                upstreamReq,
                HttpCompletionOption.ResponseHeadersRead,
                http.RequestAborted);

            http.Response.StatusCode = (int)upstreamRes.StatusCode;
            if (upstreamRes.Content.Headers.ContentType is { } ct)
                http.Response.ContentType = ct.ToString();

            http.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

            await using var upstream = await upstreamRes.Content.ReadAsStreamAsync(http.RequestAborted);
            await upstream.CopyToAsync(http.Response.Body, http.RequestAborted);
            return Results.Empty;
        }).RequireAuthorization("session").RequireRateLimiting("ai-per-user");
    }
}
