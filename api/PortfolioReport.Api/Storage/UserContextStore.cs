using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PortfolioReport.Api.Storage;

/// <summary>
/// Reads and mutates a user's user-context.json as a JSON document. The schema
/// of record lives in TypeScript (src/intake/parseUserContext.ts); this class
/// only does structural edits, so the contract stays defined in one place.
/// </summary>
public sealed class UserContextStore
{
    public const string FileName = "user-context.json";

    // Matches emptyUserContext() in src/intake/parseUserContext.ts.
    private const string EmptyContext =
        "{\"version\":2,\"profile\":null,\"situations\":[],\"notes\":[],\"chat_history\":[]}";

    private static readonly JsonWriterOptions IndentedWriter = new() { Indented = true };

    private readonly UserDataStore _files;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    public UserContextStore(UserDataStore files) => _files = files;

    /// <summary>Loads the user's context as a mutable JSON object.</summary>
    public async Task<JsonObject> LoadAsync(string user)
    {
        var raw = await _files.ReadAsync(user, FileName) ?? EmptyContext;
        return JsonNode.Parse(raw) as JsonObject
            ?? throw new InvalidOperationException("user-context.json is not a JSON object.");
    }

    /// <summary>
    /// Loads, applies the mutation, then atomically writes the result back.
    /// Serialized per user — concurrent calls for the same user run one at a
    /// time, so no mutation is lost. Different users do not contend.
    /// </summary>
    public async Task<JsonObject> MutateAsync(string user, Action<JsonObject> mutate)
    {
        var gate = _locks.GetOrAdd(user, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync();
        try
        {
            var ctx = await LoadAsync(user);
            mutate(ctx);
            await _files.WriteAsync(user, FileName, Serialize(ctx));
            return ctx;
        }
        finally
        {
            gate.Release();
        }
    }

    /// <summary>Serializes a JsonObject to an indented string via Utf8JsonWriter.</summary>
    private static string Serialize(JsonObject obj)
    {
        using var ms = new System.IO.MemoryStream();
        using (var writer = new Utf8JsonWriter(ms, IndentedWriter))
        {
            obj.WriteTo(writer);
        }
        return Encoding.UTF8.GetString(ms.ToArray());
    }
}
