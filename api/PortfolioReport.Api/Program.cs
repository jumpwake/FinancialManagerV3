var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<PortfolioReport.Api.Configuration.AllowlistOptions>(
    builder.Configuration.GetSection(
        PortfolioReport.Api.Configuration.AllowlistOptions.SectionName));

builder.Services.AddSingleton(_ =>
{
    var configured = builder.Configuration["Storage:DataRoot"] ?? "App_Data";
    var root = Path.IsPathRooted(configured)
        ? configured
        : Path.Combine(builder.Environment.ContentRootPath, configured);
    return new PortfolioReport.Api.Storage.UserDataStore(root);
});

var app = builder.Build();

app.MapGet("/healthz", () => Results.Ok("ok"));

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
