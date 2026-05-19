using Microsoft.Extensions.Configuration;
using PortfolioReport.Api.Configuration;
using Xunit;

public class AllowlistOptionsTests
{
    [Fact]
    public void BindsUsersFromConfiguration()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Allowlist:Users:0:Email"] = "kbowsher@gmail.com",
                ["Allowlist:Users:0:User"] = "kevin",
                ["Allowlist:Users:0:PushToken"] = "tok-kevin",
            })
            .Build();

        var options = new AllowlistOptions();
        config.GetSection("Allowlist").Bind(options);

        Assert.Single(options.Users);
        Assert.Equal("kevin", options.Users[0].User);
    }

    [Fact]
    public void FindByEmailIsCaseInsensitive()
    {
        var options = new AllowlistOptions
        {
            Users = { new UserRecord { Email = "Kb@gmail.com", User = "kevin", PushToken = "t" } }
        };

        Assert.Equal("kevin", options.FindByEmail("kb@GMAIL.com")?.User);
        Assert.Null(options.FindByEmail("nobody@gmail.com"));
    }

    [Fact]
    public void FindByPushTokenMatchesExactly()
    {
        var options = new AllowlistOptions
        {
            Users = { new UserRecord { Email = "kb@gmail.com", User = "kevin", PushToken = "tok-kevin" } }
        };

        Assert.Equal("kevin", options.FindByPushToken("tok-kevin")?.User);
        Assert.Null(options.FindByPushToken("wrong"));
        Assert.Null(options.FindByPushToken(""));
    }
}
