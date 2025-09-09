using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Collections.Generic;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuController
{
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
            var deviceId = authInfo?.DeviceId;
            // 检查用户是否已认证
            if (!userId.HasValue)
            {
                return Unauthorized("User authentication required");
            }
            // 仅使用 userId-DeviceId 作为配置键，DeviceId 必须存在
            if (string.IsNullOrWhiteSpace(deviceId))
            {
                return BadRequest("DeviceId is required");
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
            // 使用复合键：userId-DeviceId
            var userKey = $"{userId.Value}-{deviceId}";
            var savedConfig = await _danmakuService.GetUserConfigAsync(userKey);

            var config = savedConfig ?? new DanmakuConfig();
            if (form != null && form.Count > 0)
            {
                DanmakuService.ApplyFormOverlayToConfig(config, form);
            }

            // 保存合并后的配置（直接存对象）
            await _danmakuService.SaveUserConfigAsync(userKey, config);

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
        var deviceId = authInfo?.DeviceId;
        // 构造配置：优先用户库中保存的配置，没有则使用默认
        DanmakuConfig config;
        await _danmakuService.InitializeDatabaseAsync();
        // 仅使用复合键 userId-DeviceId；缺少任一则使用默认配置
        if (userId.HasValue && !string.IsNullOrWhiteSpace(deviceId))
        {
            var userKey = $"{userId.Value}-{deviceId}";
            var saved = await _danmakuService.GetUserConfigAsync(userKey);
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
