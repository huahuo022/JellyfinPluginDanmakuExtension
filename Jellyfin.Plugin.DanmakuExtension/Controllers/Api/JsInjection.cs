using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.IO;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuController
{
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
    [Authorize(Policy = "RequiresElevation")]
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
}
