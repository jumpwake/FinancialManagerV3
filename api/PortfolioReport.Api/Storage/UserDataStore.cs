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
        try
        {
            await File.WriteAllTextAsync(tmp, content);
            File.Move(tmp, path, overwrite: true);
        }
        catch
        {
            try { File.Delete(tmp); } catch { /* best-effort cleanup */ }
            throw;
        }
    }

    private string ResolvePath(string user, string fileName)
    {
        if (string.IsNullOrWhiteSpace(user) ||
            user.IndexOfAny(PathSeparators) >= 0 || user.Contains("..") || user.Contains(':'))
            throw new ArgumentException($"Invalid user key: '{user}'", nameof(user));

        if (string.IsNullOrWhiteSpace(fileName) ||
            fileName.IndexOfAny(PathSeparators) >= 0 || fileName.Contains("..") || fileName.Contains(':'))
            throw new ArgumentException($"Invalid file name: '{fileName}'", nameof(fileName));

        // Defense-in-depth: confirm the resolved path is genuinely inside _root,
        // even if some future syntactic trick slips past the checks above.
        var resolved = Path.GetFullPath(Path.Combine(_root, user, fileName));
        var prefix = _root + Path.DirectorySeparatorChar;
        if (!resolved.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException($"Resolved path escapes the data root: '{fileName}'");

        return resolved;
    }
}
