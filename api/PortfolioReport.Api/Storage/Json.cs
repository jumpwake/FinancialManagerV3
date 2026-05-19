using System.Text.Json.Nodes;

namespace PortfolioReport.Api.Storage;

/// <summary>Null-safe extraction helpers for loosely-typed JSON request bodies.</summary>
public static class Json
{
    /// <summary>The string value of a node, or null if it is missing or not a string.</summary>
    public static string? Str(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;

    /// <summary>The bool value of a node, or the fallback if it is missing or not a bool.</summary>
    public static bool Bool(JsonNode? node, bool fallback) =>
        node is JsonValue v && v.TryGetValue<bool>(out var b) ? b : fallback;
}
