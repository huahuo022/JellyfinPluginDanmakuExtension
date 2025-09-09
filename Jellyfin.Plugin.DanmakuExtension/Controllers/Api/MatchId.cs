using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuController
{
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

    #region GET del_match
    // 删除指定 item_id 对应 preferredId 的匹配记录
    [HttpGet("del_match")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> DeleteMatch([FromQuery(Name = "item_id")] Guid itemId)
    {
        try
        {
            if (itemId == Guid.Empty)
            {
                return BadRequest("item_id is required");
            }

            var preferredId = _danmakuService.GetPreferredContainerId(itemId);
            var rows = await _danmakuService.DeleteMatchDataByPreferredIdAsync(preferredId);
            // 尝试清除该条目上的 ProviderIds["danmaku"]
            var providerRemoved = false;
            try
            {
                var item = _libraryManager.GetItemById(itemId);
                var dict = item?.ProviderIds;
                if (item != null && dict != null && dict.Count > 0)
                {
                    string? keyToRemove = null;
                    foreach (var kv in dict)
                    {
                        if (string.Equals(kv.Key, "danmaku", StringComparison.OrdinalIgnoreCase))
                        {
                            keyToRemove = kv.Key;
                            break;
                        }
                    }

                    if (keyToRemove != null)
                    {
                        dict.Remove(keyToRemove);
                        item.ProviderIds = dict;
                        await item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, CancellationToken.None);
                        providerRemoved = true;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to remove ProviderIds[danmaku] for item {ItemId}", itemId);
            }

            return Ok(new { deleted = rows, preferred_id = preferredId, provider_id_removed = providerRemoved });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting match_data for item {ItemId}", itemId);
            return StatusCode(500, $"Error deleting match_data: {ex.Message}");
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

    
}
