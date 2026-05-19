using PortfolioReport.Api.Storage;
using Xunit;

public class UserDataStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "uds-" + Guid.NewGuid());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public async Task ReadReturnsNullWhenFileMissing()
    {
        var store = new UserDataStore(_root);
        Assert.Null(await store.ReadAsync("kevin", "analysis.json"));
    }

    [Fact]
    public async Task WriteThenReadRoundTrips()
    {
        var store = new UserDataStore(_root);
        await store.WriteAsync("kevin", "analysis.json", "{\"grade\":\"A\"}");

        Assert.Equal("{\"grade\":\"A\"}", await store.ReadAsync("kevin", "analysis.json"));
    }

    [Fact]
    public async Task WriteCreatesPerUserFolder()
    {
        var store = new UserDataStore(_root);
        await store.WriteAsync("luke", "analysis.json", "{}");

        Assert.True(File.Exists(Path.Combine(_root, "luke", "analysis.json")));
    }

    [Theory]
    [InlineData("../etc")]
    [InlineData("kevin/../luke")]
    [InlineData("")]
    public async Task RejectsUnsafeUserKeys(string badUser)
    {
        var store = new UserDataStore(_root);
        await Assert.ThrowsAsync<ArgumentException>(
            () => store.ReadAsync(badUser, "analysis.json"));
    }

    [Theory]
    [InlineData("../secrets.json")]
    [InlineData("sub/file.json")]
    [InlineData("C:evil.json")]
    public async Task RejectsUnsafeFileNames(string badFile)
    {
        var store = new UserDataStore(_root);
        await Assert.ThrowsAsync<ArgumentException>(
            () => store.ReadAsync("kevin", badFile));
    }

    [Fact]
    public async Task WriteAsyncRejectsUnsafeFileNames()
    {
        var store = new UserDataStore(_root);
        await Assert.ThrowsAsync<ArgumentException>(
            () => store.WriteAsync("kevin", "../evil.json", "{}"));
    }
}
