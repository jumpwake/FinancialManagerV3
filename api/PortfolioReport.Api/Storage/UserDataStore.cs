namespace PortfolioReport.Api.Storage;

/// <summary>
/// Reads and writes per-user JSON files under a data root. Both the user key
/// and the file name are validated so a request can never escape its folder.
/// </summary>
public sealed class UserDataStore
{
    private static readonly char[] PathSeparators = { '/', '\\' };
    private readonly string _root;

    public UserDataStore(string root)
    {
        _root = Path.GetFullPath(root);
    }

    public async Task<string?> ReadAsync(string user, string fileName)
    {
        var path = ResolvePath(user, fileName);
        if (!File.Exists(path)) return null;
        return await File.ReadAllTextAsync(path);
    }

    public async Task WriteAsync(string user, string fileName, string content)
    {
        var path = ResolvePath(user, fileName);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        // Write to a temp file then move, so a reader never sees a half-written file.
        var tmp = path + ".tmp";
        await File.WriteAllTextAsync(tmp, content);
        File.Move(tmp, path, overwrite: true);
    }

    private string ResolvePath(string user, string fileName)
    {
        if (string.IsNullOrWhiteSpace(user) ||
            user.IndexOfAny(PathSeparators) >= 0 || user.Contains(".."))
            throw new ArgumentException($"Invalid user key: '{user}'", nameof(user));

        if (string.IsNullOrWhiteSpace(fileName) ||
            fileName.IndexOfAny(PathSeparators) >= 0 || fileName.Contains(".."))
            throw new ArgumentException($"Invalid file name: '{fileName}'", nameof(fileName));

        return Path.Combine(_root, user, fileName);
    }
}
