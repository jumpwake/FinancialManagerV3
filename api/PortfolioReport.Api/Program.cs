var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<PortfolioReport.Api.Configuration.AllowlistOptions>(
    builder.Configuration.GetSection(
        PortfolioReport.Api.Configuration.AllowlistOptions.SectionName));

var app = builder.Build();

app.MapGet("/healthz", () => Results.Ok("ok"));

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
