using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MediaBrowser.Controller.Library;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Net;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Http;
using System.Runtime.InteropServices;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


[ApiController]
[Route("danmaku")]
public partial class DanmakuController : ControllerBase
{
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<DanmakuController> _logger;
    private readonly DanmakuService _danmakuService;
    private readonly IAuthorizationContext _authorizationContext;
    private readonly IApplicationPaths _paths;


    public DanmakuController(ILibraryManager libraryManager, ILogger<DanmakuController> logger, IApplicationPaths paths, HttpClient httpClient, ILogger<DanmakuService> serviceLogger, IAuthorizationContext authorizationContext)
    {
        _libraryManager = libraryManager;
        _logger = logger;
        _danmakuService = new DanmakuService(paths, libraryManager, httpClient, serviceLogger);
        _authorizationContext = authorizationContext;
        _paths = paths;
    }
}
