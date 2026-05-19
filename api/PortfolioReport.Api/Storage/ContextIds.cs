namespace PortfolioReport.Api.Storage;

/// <summary>Generates entity ids and timestamps for user-context entities.</summary>
public static class ContextIds
{
    /// <summary>e.g. "sit_2026-05-19_a1b2c3" — matches the TypeScript handlers' format.</summary>
    public static string NewId(string prefix) =>
        $"{prefix}_{DateTime.UtcNow:yyyy-MM-dd}_{Guid.NewGuid():N}"[..(prefix.Length + 18)];

    /// <summary>ISO-8601 UTC timestamp, e.g. "2026-05-19T15:30:00.123Z".</summary>
    public static string Timestamp() =>
        DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
}
