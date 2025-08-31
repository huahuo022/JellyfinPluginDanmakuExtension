using Microsoft.Extensions.DependencyInjection;
using Jellyfin.Plugin.DanmakuExtension.Controllers;

namespace Jellyfin.Plugin.DanmakuExtension;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddDanmakuExtensionServices(this IServiceCollection services)
    {
        services.AddScoped<DanmakuService>();
        return services;
    }
}
