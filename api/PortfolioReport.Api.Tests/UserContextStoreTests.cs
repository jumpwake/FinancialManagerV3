using System.Text.Json.Nodes;
using PortfolioReport.Api.Storage;
using Xunit;

public class UserContextStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "ucs-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    private UserContextStore NewStore() => new(new UserDataStore(_root));

    [Fact]
    public async Task LoadReturnsEmptyV2ContextWhenNoFile()
    {
        var ctx = await NewStore().LoadAsync("kevin");

        Assert.Equal(2, (int)ctx["version"]!);
        Assert.Empty(ctx["situations"]!.AsArray());
        Assert.Empty(ctx["notes"]!.AsArray());
        Assert.Empty(ctx["chat_history"]!.AsArray());
        Assert.Null(ctx["profile"]);
    }

    [Fact]
    public async Task MutatePersistsAndRoundTrips()
    {
        var store = NewStore();
        await store.MutateAsync("kevin", c => c["situations"]!.AsArray().Add("x"));

        var reloaded = await store.LoadAsync("kevin");
        Assert.Single(reloaded["situations"]!.AsArray());
    }

    [Fact]
    public async Task MutateIsScopedPerUser()
    {
        var store = NewStore();
        await store.MutateAsync("kevin", c => c["notes"]!.AsArray().Add("k"));

        var luke = await store.LoadAsync("luke");
        Assert.Empty(luke["notes"]!.AsArray());
    }

    [Fact]
    public async Task ConcurrentMutationsDoNotLoseUpdates()
    {
        var store = NewStore();
        const int N = 20;

        var tasks = Enumerable.Range(0, N)
            .Select(i => store.MutateAsync("kevin",
                c => c["situations"]!.AsArray().Add($"m{i}")))
            .ToArray();
        await Task.WhenAll(tasks);

        var reloaded = await store.LoadAsync("kevin");
        Assert.Equal(N, reloaded["situations"]!.AsArray().Count);
    }
}
