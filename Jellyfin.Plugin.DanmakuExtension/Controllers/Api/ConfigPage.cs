using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

// 面向插件配置页面前端的端点集合（不含 search）
public partial class DanmakuController
{
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
