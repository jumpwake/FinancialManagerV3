var builder = WebApplication.CreateBuilder(args);

var app = builder.Build();

app.MapGet("/healthz", () => Results.Ok("ok"));

app.Run();

// Exposed so the test project's WebApplicationFactory<Program> can reference it.
public partial class Program { }
