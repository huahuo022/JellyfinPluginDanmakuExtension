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
public class DanmakuController : ControllerBase
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

    #region GET custom_js
    [HttpGet("custom_js")]
    [Produces("application/json")]
    public IActionResult GetCustomJs()
    {
        var list = _danmakuService.GetCustomJsEntriesForApiAsync().GetAwaiter().GetResult();
        var json = JsonSerializer.Serialize(list);
        return Content(json, "application/json", Encoding.UTF8);
    }
    #endregion

    #region GET search
    // 代理 dandan 搜索接口：/api/v2/search/anime?keyword=...
    [HttpGet("search")]
    [Produces("application/json")]
    public async Task<IActionResult> SearchAnime(
        [FromQuery(Name = "keyword")] string? keyword = null,
        [FromQuery(Name = "bangumi_id")] string? bangumiId = null)
    {
        try
        {
            var baseUrl = _danmakuService.GetBaseUrl();
            string? path = null;

            if (!string.IsNullOrWhiteSpace(bangumiId))
            {
                path = $"/api/v2/bangumi/{Uri.EscapeDataString(bangumiId)}";
            }
            else if (!string.IsNullOrWhiteSpace(keyword))
            {
                path = $"/api/v2/search/anime?keyword={Uri.EscapeDataString(keyword)}";
            }
            else
            {
                return BadRequest("keyword or bangumi_id is required");
            }

            var json = await _danmakuService.SendWithCacheAsync(HttpMethod.Get, baseUrl, path);
            return Content(json, "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching anime");
            return StatusCode(500, $"Error searching anime: {ex.Message}");
        }
    }
    #endregion

    #region GET/POST match_data
    // 1) GET: 传入 item_id，计算 preferredId 后，读取数据库中的 match_data 返回
    [HttpGet("match_data")]
    [Produces("application/json")]
    public async Task<IActionResult> GetMatchData([FromQuery(Name = "item_id")] Guid itemId)
    {
        try
        {
            if (itemId == Guid.Empty)
            {
                return BadRequest("item_id is required");
            }

            Guid preferredId = _danmakuService.GetPreferredContainerId(itemId);
            var md = await _danmakuService.GetMatchDataByPreferredIdAsync(preferredId);
            if (md.HasValue)
            {
                var obj = new
                {
                    exists = true,
                    preferred_id = preferredId,
                    animeId = md.Value.AnimeId,
                    offset = md.Value.Offset,
                    animeTitle = md.Value.AnimeTitle,
                    imageUrl = md.Value.ImageUrl
                };
                return Content(JsonSerializer.Serialize(obj), "application/json", Encoding.UTF8);
            }
            else
            {
                var obj = new { exists = false, preferred_id = preferredId };
                return Content(JsonSerializer.Serialize(obj), "application/json", Encoding.UTF8);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting match_data");
            return StatusCode(500, $"Error getting match_data: {ex.Message}");
        }
    }

    // 2) POST: 表单传入 itemId, animeId, offset, animeTitle, imageUrl，计算 preferredId 后保存到数据库
    [HttpPost("match_data")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> SaveMatchData()
    {
        try
        {
            var form = await Request.ReadFormAsync();
            string itemIdStr = form["itemId"].ToString();
            if (string.IsNullOrWhiteSpace(itemIdStr)) itemIdStr = form["item_id"].ToString();

            if (string.IsNullOrWhiteSpace(itemIdStr) || !Guid.TryParse(itemIdStr, out var itemId) || itemId == Guid.Empty)
            {
                return BadRequest("itemId is required and must be a valid GUID");
            }

            // offset（必填）
            string offsetStr = form["offset"].ToString();
            if (string.IsNullOrWhiteSpace(offsetStr) || !int.TryParse(offsetStr, out var offset))
            {
                return BadRequest("offset is required and must be an integer");
            }

            // animeId（可选：若未提供且仅更新 offset，则需已有记录）
            string animeIdStr = form["animeId"].ToString();
            if (string.IsNullOrWhiteSpace(animeIdStr)) animeIdStr = form["anime_id"].ToString();
            bool hasAnimeId = long.TryParse(animeIdStr, out var animeId) && animeId > 0;

            // 可选字段
            string? animeTitle = form.ContainsKey("animeTitle") ? form["animeTitle"].ToString() : null;
            if (string.IsNullOrWhiteSpace(animeTitle) && form.ContainsKey("anime_title")) animeTitle = form["anime_title"].ToString();
            string? imageUrl = form.ContainsKey("imageUrl") ? form["imageUrl"].ToString() : null;
            if (string.IsNullOrWhiteSpace(imageUrl) && form.ContainsKey("image_url")) imageUrl = form["image_url"].ToString();

            var preferredId = _danmakuService.GetPreferredContainerId(itemId);

            if (!hasAnimeId)
            {
                // 仅更新 offset：需要已存在的记录，用其余旧值
                var md = await _danmakuService.GetMatchDataByPreferredIdAsync(preferredId);
                if (!md.HasValue)
                {
                    return BadRequest("animeId is required unless updating existing match_data with offset only");
                }
                animeId = md.Value.AnimeId;
                if (string.IsNullOrWhiteSpace(animeTitle)) animeTitle = md.Value.AnimeTitle;
                if (string.IsNullOrWhiteSpace(imageUrl)) imageUrl = md.Value.ImageUrl;
            }

            await _danmakuService.SaveMatchDataAsync(preferredId, animeId, animeTitle, imageUrl, offset);

            return Ok(new { saved = true, preferred_id = preferredId, animeId, offset, animeTitle, imageUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving match_data");
            return StatusCode(500, $"Error saving match_data: {ex.Message}");
        }
    }
    #endregion

    #region GET font endpoints
    // 列出服务器上可用（系统安装）的字体文件名清单
    [HttpGet("font/get_all")]
    [Produces("application/json")]
    public IActionResult GetAllFonts()
    {
        try
        {
            var files = EnumerateSystemFontFiles();
            // 以文件名去重（同名取其一）
            var list = files
                .GroupBy(p => Path.GetFileName(p), StringComparer.OrdinalIgnoreCase)
                .Select(g =>
                {
                    var fullPath = g.First();
                    var fi = new FileInfo(fullPath);
                    var name = Path.GetFileName(fullPath);
                    return new
                    {
                        name,
                        size = fi.Exists ? fi.Length : 0,
                        ext = Path.GetExtension(name),
                        // 供前端直接访问的相对路径
                        url = $"/danmaku/font/{Uri.EscapeDataString(name)}"
                    };
                })
                .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return Content(JsonSerializer.Serialize(list), "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error listing system fonts");
            return StatusCode(500, $"Error listing fonts: {ex.Message}");
        }
    }

    // 提供字体文件下载（按文件名匹配，限制后缀，防止路径穿越）
    [HttpGet("font/{fileName}")]
    public IActionResult GetFontFile([FromRoute] string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return BadRequest("fileName is required");
            }

            // 禁止路径分隔符，避免目录穿越
            if (fileName.Contains('/') || fileName.Contains('\\'))
            {
                return BadRequest("Invalid file name");
            }

            var allowed = GetAllowedFontExtensions();
            var ext = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(ext) || !allowed.Contains(ext))
            {
                return BadRequest("Unsupported font extension");
            }

            var ct = GetContentTypeForFont(ext);
            var candidates = EnumerateSystemFontFiles();
            var match = candidates.FirstOrDefault(p => string.Equals(Path.GetFileName(p), fileName, StringComparison.OrdinalIgnoreCase));
            if (match == null || !System.IO.File.Exists(match))
            {
                return NotFound();
            }

            var stream = new FileStream(match, FileMode.Open, FileAccess.Read, FileShare.Read);
            return File(stream, ct, enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error serving font file {File}", fileName);
            return StatusCode(500, $"Error serving font: {ex.Message}");
        }
    }

    // 枚举系统字体目录中的所有字体文件（跨平台）
    private IEnumerable<string> EnumerateSystemFontFiles()
    {
        var dirs = GetSystemFontDirectories();
        var allowed = GetAllowedFontExtensions();
        var results = new List<string>();

        foreach (var d in dirs)
        {
            try
            {
                if (Directory.Exists(d))
                {
                    var files = Directory.EnumerateFiles(d, "*", SearchOption.AllDirectories)
                        .Where(f => allowed.Contains(Path.GetExtension(f)));
                    results.AddRange(files);
                }
            }
            catch
            {
                // 忽略不可访问目录
            }
        }

        return results;
    }

    private static HashSet<string> GetAllowedFontExtensions()
    {
        return new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".woff2", ".woff", ".ttf", ".otf"
        };
    }

    private static string GetContentTypeForFont(string ext)
    {
        return ext.ToLowerInvariant() switch
        {
            ".woff2" => "font/woff2",
            ".woff" => "font/woff",
            ".ttf" => "font/ttf",
            ".otf" => "font/otf",
            _ => "application/octet-stream"
        };
    }

    private IEnumerable<string> GetSystemFontDirectories()
    {
        var list = new List<string>();
        // Jellyfin 数据目录下的 fonts（最优先，若存在）
        try
        {
            if (!string.IsNullOrWhiteSpace(_paths?.DataPath))
            {
                list.Add(Path.Combine(_paths.DataPath, "fonts"));
            }
        }
        catch { }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            list.Add(@"C:\\Windows\\Fonts");
            // Windows ProgramData 下的 Jellyfin 目录
            try
            {
                var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
                if (!string.IsNullOrEmpty(programData))
                {
                    list.Add(Path.Combine(programData, "Jellyfin", "Server", "fonts"));
                    list.Add(Path.Combine(programData, "Jellyfin", "fonts"));
                }
            }
            catch { }
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            list.Add("/usr/share/fonts");
            list.Add("/usr/local/share/fonts");
            list.Add("/usr/share/fonts/truetype");
            list.Add("/usr/share/fonts/opentype");
            // Jellyfin 常见容器挂载目录
            list.Add("/config/fonts");
            // Jellyfin Linux 常见数据目录
            list.Add("/var/lib/jellyfin/fonts");
            list.Add("/var/lib/jellyfin/data/fonts");
            // 少数配置将字体置于 etc（并不标准，但兼容）
            list.Add("/etc/jellyfin/fonts");
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(home))
            {
                list.Add(Path.Combine(home, ".fonts"));
                list.Add(Path.Combine(home, ".local", "share", "fonts"));
            }
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            list.Add("/System/Library/Fonts");
            list.Add("/Library/Fonts");
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(home))
            {
                list.Add(Path.Combine(home, "Library", "Fonts"));
            }
            // Jellyfin macOS 数据目录（通过 DataPath 已添加），此处再兜底几处常见装载位
            list.Add("/usr/local/var/jellyfin/fonts");
            list.Add("/opt/homebrew/var/jellyfin/fonts");
        }

        return list;
    }
    #endregion


    #region POST js_cache
    [HttpPost("js_cache")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> JsCache()
    {
        try
        {
            var form = await Request.ReadFormAsync();
            var urlBase64 = form["url_base64"].ToString();
            var method = form["method"].ToString().ToLowerInvariant();

            if (string.IsNullOrWhiteSpace(urlBase64))
            {
                return BadRequest("url_base64 is required");
            }
            if (method != "download" && method != "delete" && method != "check")
            {
                return BadRequest("method must be 'download', 'delete' or 'check'");
            }

            await _danmakuService.InitializeDatabaseAsync();

            if (method == "download")
            {
                // 解码 URL
                string url;
                try
                {
                    var urlBytes = Convert.FromBase64String(urlBase64);
                    url = Encoding.UTF8.GetString(urlBytes);
                }
                catch
                {
                    return BadRequest("url_base64 is invalid");
                }

                // 下载并保存为 base64
                var download = await _danmakuService.DownloadJsToBase64Async(url);
                var now = DateTime.UtcNow;
                await _danmakuService.UpsertJsNetCacheAsync(urlBase64, download.JsBase64, now);
                return Ok(new { exists = true, base64_length = download.Base64Length, updated_at = now });
            }
            else if (method == "delete")
            {
                var rows = await _danmakuService.DeleteJsNetCacheByUrlBase64Async(urlBase64);
                return Ok(new { deleted = rows });
            }
            else // check
            {
                var cache = await _danmakuService.GetJsNetCacheByUrlBase64Async(urlBase64);
                if (cache.HasValue)
                {
                    var jsb64 = cache.Value.JsBase64 ?? string.Empty;
                    var length = jsb64.Length;
                    var updatedAt = cache.Value.UpdatedAt;
                    return Ok(new { exists = true, base64_length = length, updated_at = updatedAt });
                }
                return Ok(new { exists = false });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling js_cache");
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }
    #endregion

    #region GET custom_js_combined
    [HttpGet("custom_js_combined")]
    [Produces("application/javascript")]
    public IActionResult GetCustomJsCombined()
    {
        // 直接读取已生成的合并文件，不重新查库合成
        var content = _danmakuService.ReadCustomJsFile();
        return Content(content ?? string.Empty, "application/javascript", Encoding.UTF8);
    }
    #endregion

    #region POST custom_js
    [HttpPost("custom_js")]
    // [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> SaveCustomJs()
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync();

        try
        {
            // 尝试解析为 JSON 数组 [{ index, data_type, data_base64, name }]
            var entries = System.Text.Json.JsonSerializer.Deserialize<List<CustomJsEntryDto>>(body);
            if (entries == null)
            {
                return BadRequest("Invalid JSON payload");
            }

            var saved = await _danmakuService.SaveCustomJsEntriesAsync(entries);

            // 保存后尝试重建合成 JS 文件（供注入使用）
            try
            {
                var combined = await _danmakuService.BuildCombinedCustomJsAsync();
                _danmakuService.SaveCustomJsFile(combined);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to build/save combined custom js");
            }

            return Ok(new { saved });
        }
        catch (System.Text.Json.JsonException)
        {
            return BadRequest("Invalid JSON format");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving custom js entries");
            return StatusCode(500, $"Error saving entries: {ex.Message}");
        }
    }
    #endregion

    #region POST update_index_html

    [HttpPost("update_index_html")]
    [Authorize(Policy = "RequiresElevation")]
    public IActionResult UpdateIndexHtml()
    {
        var plugin = Plugin.Instance;
        if (plugin == null)
        {
            return StatusCode(500, "plugin not ready");
        }

        try
        {
            var cfg = plugin.Configuration;
            _danmakuService.UpdateIndexHtml(cfg, cfg.EnableInjection);
            return NoContent();
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error updating index.html: {ex.Message}");
        }
    }
    #endregion

    #region GET db_info
    [HttpGet("db_info")]
    public async Task<IActionResult> GetDatabaseInfo()
    {
        try
        {
            // 获取缓存统计信息
            await _danmakuService.InitializeDatabaseAsync();
            var (hitCount, missCount) = await _danmakuService.GetCacheStatsAsync();
            var cacheCount = await _danmakuService.GetCacheCountAsync();
            var totalRequests = hitCount + missCount;
            var hitRate = totalRequests > 0 ? (double)hitCount / totalRequests * 100 : 0;

            // 获取数据库文件大小
            long dbSize = 0;
            var dbPath = _danmakuService.GetDatabasePath();
            if (System.IO.File.Exists(dbPath))
            {
                var fileInfo = new FileInfo(dbPath);
                dbSize = fileInfo.Length;
            }

            var result = new
            {
                CacheStats = new
                {
                    HitCount = hitCount,
                    MissCount = missCount,
                    TotalRequests = totalRequests,
                    HitRate = Math.Round(hitRate, 2),
                    CacheCount = cacheCount,
                    DatabaseSize = dbSize
                }
            };

            var json = JsonSerializer.Serialize(result);
            return Content(json, "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error getting database info: {ex.Message}");
        }
    }
    #endregion

    #region GET set_id
    // 设置 ProviderIds["danmaku"] 的端点
    [HttpGet("set_id")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> SetDanmakuId([FromQuery(Name = "item_id")] Guid itemId, [FromQuery(Name = "danmaku_id")] string danmakuId)
    {
        if (itemId == Guid.Empty)
        {
            return BadRequest("item_id is required");
        }
        if (string.IsNullOrWhiteSpace(danmakuId))
        {
            return BadRequest("danmaku_id is required");
        }

        var item = _libraryManager.GetItemById(itemId);
        if (item == null)
        {
            return NotFound($"Item {itemId} not found");
        }

        var dict = item.ProviderIds ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        dict["danmaku"] = danmakuId;
        item.ProviderIds = dict;

        await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, CancellationToken.None);

        return NoContent();
    }
    #endregion

    #region GET get_id
    // 获取 ProviderIds["danmaku"] 的端点
    [HttpGet("get_id")]
    [Produces("text/plain")]
    public IActionResult GetDanmakuId([FromQuery(Name = "item_id")] Guid itemId)
    {
        if (itemId == Guid.Empty)
        {
            return BadRequest("item_id is required");
        }

        var item = _libraryManager.GetItemById(itemId);
        if (item == null)
        {
            return NotFound($"Item {itemId} not found");
        }

        var dict = item.ProviderIds;
        string? val = null;
        if (dict != null)
        {
            // 忽略大小写查找 key = "danmaku"
            foreach (var kv in dict)
            {
                if (string.Equals(kv.Key, "danmaku", StringComparison.OrdinalIgnoreCase))
                {
                    val = kv.Value;
                    break;
                }
            }
        }

        var result = string.IsNullOrWhiteSpace(val) ? "0" : val;
        return Content(result, "text/plain", Encoding.UTF8);
    }
    #endregion

    #region POST comment
    [HttpPost("comment")]
    public async Task<IActionResult> PostCommentConfig(
        [FromQuery(Name = "item_id")] Guid? itemId = null,                    // 可选：Jellyfin 媒体项 ID
        [FromQuery(Name = "danmaku_id")] string? danmakuId = null)            // 可选：弹幕 ID（直接指定）
    {
        try
        {
            var authInfo = await _authorizationContext.GetAuthorizationInfo(Request);
            var userId = authInfo?.UserId;
            // 检查用户是否已认证
            if (!userId.HasValue)
            {
                return Unauthorized("User authentication required");
            }

            // 读取表单；当载荷为空或不是表单时，使用默认配置以保证可正常初始化
            Microsoft.AspNetCore.Http.IFormCollection? form = null;
            try
            {
                if (Request.HasFormContentType)
                {
                    form = await Request.ReadFormAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to read form payload, fallback to default config");
            }

            // 先读取数据库中的完整配置；为空则使用默认，再用表单键进行覆盖（若提供）
            await _danmakuService.InitializeDatabaseAsync();
            var userIdString = userId.Value.ToString();
            var savedConfig = await _danmakuService.GetUserConfigAsync(userIdString);

            var config = savedConfig ?? new DanmakuConfig();
            if (form != null && form.Count > 0)
            {
                DanmakuService.ApplyFormOverlayToConfig(config, form);
            }

            // 保存合并后的配置（直接存对象）
            await _danmakuService.SaveUserConfigAsync(userIdString, config);

            // 基础响应对象
            var response = new { saved = true, user_id = userId };

            // 如果提供了 itemId 或 danmakuId，则同时返回弹幕数据
            if (itemId.HasValue || !string.IsNullOrWhiteSpace(danmakuId))
            {
                var danmakuResult = await _danmakuService.GetDanmakuContentAsync(itemId, danmakuId, config);

                // 如果获取弹幕时出现错误，仍然返回配置保存成功的响应，但加上错误信息
                if (!danmakuResult.Success)
                {
                    return Ok(new
                    {
                        saved = true,
                        user_id = userId,
                        danmaku_error = "Failed to fetch danmaku data after saving config"
                    });
                }

                // 配置保存成功且弹幕获取成功，返回弹幕数据
                return Content(danmakuResult.Content!, "application/json", Encoding.UTF8);
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving user config");
            return StatusCode(500, $"Error saving config: {ex.Message}");
        }
    }
    #endregion

    #region GET comment
    // 获取弹幕评论的端点
    [HttpGet("comment")]
    public async Task<IActionResult> GetComment(
        [FromQuery(Name = "item_id")] Guid? itemId,                           // Jellyfin 媒体项 ID
        [FromQuery(Name = "danmaku_id")] string? danmakuId                      // 弹幕 ID（直接指定）
        )
    {
        // 获取用户ID，用于读取用户配置
        var authInfo = await _authorizationContext.GetAuthorizationInfo(Request);
        var userId = authInfo?.UserId;
        // 构造配置：优先用户库中保存的配置，没有则使用默认
        DanmakuConfig config;
        await _danmakuService.InitializeDatabaseAsync();
        if (userId.HasValue)
        {
            var saved = await _danmakuService.GetUserConfigAsync(userId.Value.ToString());
            config = saved ?? new DanmakuConfig();
        }
        else
        {
            config = new DanmakuConfig();
        }

        // 处理额外查询参数 (除 item_id, danmaku_id 之外) 作为覆盖配置的键值
        if (Request?.Query != null && Request.Query.Count > 0)
        {
            var overrideDict = new Dictionary<string, Microsoft.Extensions.Primitives.StringValues>(StringComparer.OrdinalIgnoreCase);
            foreach (var kv in Request.Query)
            {
                var key = kv.Key;
                if (string.Equals(key, "item_id", StringComparison.OrdinalIgnoreCase) || string.Equals(key, "danmaku_id", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (kv.Value.Count > 0)
                {
                    overrideDict[key] = kv.Value;
                }
            }
            if (overrideDict.Count > 0)
            {
                // 构造临时 FormCollection 复用现有覆盖逻辑
                var tempForm = new FormCollection(overrideDict);
                DanmakuService.ApplyFormOverlayToConfig(config, tempForm);
            }
        }

        // 调用 DanmakuService 方法获取弹幕内容
        var result = await _danmakuService.GetDanmakuContentAsync(itemId, danmakuId, config);

        // 如果获取失败，返回相应的错误状态
        if (!result.Success)
        {
            return StatusCode(result.StatusCode ?? 500, result.ErrorMessage);
        }

        return Content(result.Content!, "application/json", Encoding.UTF8);
    }
    #endregion

    #region GET cache_stats
    [HttpGet("cache_stats")]
    public async Task<IActionResult> GetCacheStats()
    {
        try
        {
            // 初始化数据库以确保统计表存在
            await _danmakuService.InitializeDatabaseAsync();

            var (hitCount, missCount) = await _danmakuService.GetCacheStatsAsync();
            var totalRequests = hitCount + missCount;
            var hitRate = totalRequests > 0 ? (double)hitCount / totalRequests * 100 : 0;

            var result = new
            {
                HitCount = hitCount,
                MissCount = missCount,
                TotalRequests = totalRequests,
                HitRate = Math.Round(hitRate, 2)
            };

            return Content(JsonSerializer.Serialize(result), "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            return StatusCode(500, $"Error getting cache stats: {ex.Message}");
        }
    }
    #endregion

    #region POST reset_cachedb
    // 重置缓存数据库的端点
    [HttpPost("reset_cachedb")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> ResetCacheDatabase()
    {
        try
        {
            var deletedRows = await _danmakuService.ResetCacheDatabase();
            return Ok($"Cache database has been reset successfully. {deletedRows} cache entries cleared.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting cache database");
            return StatusCode(500, $"Error resetting cache database: {ex.Message}");
        }
    }
    #endregion

    #region GET plugin_id
    [HttpGet("plugin_id")]
    [Produces("application/json")]
    public IActionResult GetPluginId()
    {
        try
        {
            var pluginId = Plugin.Instance?.Id.ToString();
            if (string.IsNullOrEmpty(pluginId))
            {
                return StatusCode(500, "Plugin instance not available");
            }

            return Ok(new { pluginId = pluginId });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting plugin ID");
            return StatusCode(500, $"Error getting plugin ID: {ex.Message}");
        }
    }
    #endregion

    #region GET is_lib_enabled
    [HttpGet("is_lib_enabled")]
    [Produces("application/json")]
    public IActionResult IsLibraryEnabled([FromQuery(Name = "itemId")] Guid itemId)
    {
        try
        {
            if (itemId == Guid.Empty)
            {
                return BadRequest("itemId is required");
            }

            var item = _libraryManager.GetItemById(itemId);
            if (item == null)
            {
                return NotFound($"Item {itemId} not found");
            }

            // 读取配置中的启用库列表
            var enabledIds = Plugin.Instance?.Configuration?.EnabledLibraryIds ?? new List<string>();
            var enabledGuids = new HashSet<Guid>(
                enabledIds.Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                          .Where(g => g != Guid.Empty)
            );

            // 空配置视为全部禁用，与 Providers 行为保持一致
            if (enabledGuids.Count == 0)
            {
                return Ok(new { enabled = false });
            }

            // 获取该条目所属的媒体库（集合文件夹）
            var folders = _libraryManager.GetCollectionFolders(item);
            var enabled = folders.Any(f => enabledGuids.Contains(f.Id));

            return Ok(new { enabled });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking is_lib_enabled");
            return StatusCode(500, $"Error: {ex.Message}");
        }
    }
    #endregion
}
