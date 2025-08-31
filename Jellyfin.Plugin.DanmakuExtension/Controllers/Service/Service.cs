
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Library;

using Microsoft.Extensions.Logging;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    #region 字段和构造函数
    private readonly IApplicationPaths _paths;
    private readonly ILibraryManager _libraryManager;
    private readonly HttpClient _httpClient;
    private readonly ILogger<DanmakuService> _logger;

    private const string DefaultJsContent = "";

    public DanmakuService(IApplicationPaths paths, ILibraryManager libraryManager, HttpClient httpClient, ILogger<DanmakuService> logger)
    {
        _paths = paths;
        _libraryManager = libraryManager;
        _httpClient = httpClient;
        _logger = logger;
    }
    #endregion
}
