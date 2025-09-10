using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    #region 弹幕解析
    
    private static readonly Regex UID_SOURCE_RE = new(@"\[([^\]]+)\]", RegexOptions.Compiled);
    
    /// <summary>
    /// 解析标准弹幕 JSON (含 comments 数组) -> 返回 DanmuObject 列表。
    /// 单独抽取，便于未来支持不同原始格式（XML、ASS、其他站点结构等）。
    /// </summary>
    /// <param name="inputJson">原始 JSON 字符串（包含 comments 数组）</param>
    /// <param name="itemId">可选的项目ID</param>
    /// <returns>DanmuObject列表</returns>
    public async Task<List<Pakku.DanmuObject>> ParseStandardJsonAsync(string inputJson, Guid? itemId = null)
    {
        using var doc = JsonDocument.Parse(inputJson);
        var root = doc.RootElement;
        if (!root.TryGetProperty("comments", out var commentsEl) || commentsEl.ValueKind != JsonValueKind.Array)
            return new List<Pakku.DanmuObject>();

        var all = new List<Pakku.DanmuObject>();

        foreach (var e in commentsEl.EnumerateArray())
        {
            var dm = new Pakku.DanmuObject
            {
                cid = e.GetProperty("cid").GetInt64(),
                content = e.GetProperty("m").GetString() ?? string.Empty,
            };
            var p = e.GetProperty("p").GetString() ?? string.Empty;
            // p: "time,mode,color,[BiliBili]uid"
            var parts = p.Split(',', 4);
            if (parts.Length >= 1 && double.TryParse(parts[0], out var t)) dm.time_ms = t * 1000.0;
            if (parts.Length >= 2 && int.TryParse(parts[1], out var m)) dm.mode = m;
            if (parts.Length >= 3 && int.TryParse(parts[2], out var c)) dm.color = c;
            if (parts.Length >= 4)
            {
                dm.uid = parts[3];
                string source = "DanDanPlay"; // 默认来源
                if (!string.IsNullOrEmpty(dm.uid))
                {
                    var match = UID_SOURCE_RE.Match(dm.uid);
                    if (match.Success) source = match.Groups[1].Value;
                    dm.pool = source;
                }
            }
            all.Add(dm);
        }

        // 后处理：应用源偏移
        if (itemId.HasValue)
        {
            all = await ApplySourceShiftAsync(all, itemId.Value);
        }

        return all;
    }

    /// <summary>
    /// 根据数据库中的source_shift表应用时间偏移
    /// </summary>
    /// <param name="danmus">弹幕列表</param>
    /// <param name="itemId">项目ID</param>
    /// <returns>应用偏移后的弹幕列表</returns>
    private async Task<List<Pakku.DanmuObject>> ApplySourceShiftAsync(List<Pakku.DanmuObject> danmus, Guid itemId)
    {
        try
        {
            // 获取source_shift数据
            var sourceShiftData = await GetSourceShiftAsync(itemId.ToString());
            if (string.IsNullOrEmpty(sourceShiftData))
            {
                return danmus; // 没有偏移数据，直接返回
            }

            // 解析偏移数据
            var sourceShifts = JsonSerializer.Deserialize<List<SourceShiftItem>>(sourceShiftData);
            if (sourceShifts == null || !sourceShifts.Any())
            {
                return danmus;
            }

            // 创建偏移映射表
            var shiftMap = sourceShifts
                .Where(s => s.Shift != 0)
                .ToDictionary(s => s.SourceName, s => s.Shift, StringComparer.OrdinalIgnoreCase);

            if (!shiftMap.Any())
            {
                return danmus; // 没有非零偏移，直接返回
            }

            // 应用偏移并过滤负时间
            var result = new List<Pakku.DanmuObject>();
            int removedCount = 0;

            foreach (var danmu in danmus)
            {
                var sourceName = danmu.pool ?? string.Empty;
                
                if (shiftMap.TryGetValue(sourceName, out var shift))
                {
                    // 应用偏移
                    var newTimeMs = danmu.time_ms + shift;
                    
                    if (newTimeMs < 0)
                    {
                        // 时间为负数，抛弃这条弹幕
                        removedCount++;
                        continue;
                    }
                    
                    danmu.time_ms = newTimeMs;
                }
                
                result.Add(danmu);
            }

            if (removedCount > 0)
            {
                _logger.LogInformation("应用源偏移后移除了 {RemovedCount} 条负时间弹幕", removedCount);
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "应用源偏移时发生错误，使用原始弹幕数据");
            return danmus;
        }
    }
    
    #endregion
}
