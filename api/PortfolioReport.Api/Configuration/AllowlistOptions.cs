namespace PortfolioReport.Api.Configuration;

public sealed class UserRecord
{
    public string Email { get; set; } = "";
    public string User { get; set; } = "";
    public string PushToken { get; set; } = "";
}

public sealed class AllowlistOptions
{
    public const string SectionName = "Allowlist";

    public List<UserRecord> Users { get; set; } = new();

    public UserRecord? FindByEmail(string? email) =>
        string.IsNullOrWhiteSpace(email)
            ? null
            : Users.FirstOrDefault(u =>
                string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase));

    public UserRecord? FindByPushToken(string? token) =>
        string.IsNullOrEmpty(token)
            ? null
            : Users.FirstOrDefault(u => u.PushToken == token);
}
