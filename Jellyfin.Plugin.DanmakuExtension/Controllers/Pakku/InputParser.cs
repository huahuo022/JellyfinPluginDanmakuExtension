using System.Text.Json;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class Pakku
{
    /// <summary>
    /// 解析标准弹幕 JSON (含 comments 数组) -> 返回 DanmuObject 列表与来源统计。
    /// 单独抽取，便于未来支持不同原始格式（XML、ASS、其他站点结构等）。
    /// </summary>
    /// <param name="inputJson">原始 JSON 字符串（包含 comments 数组）</param>
    /// <param name="lists">已构建的名单列表（用于来源黑名单过滤）</param>
    /// <returns>allDanmus</returns>
    internal static List<DanmuObject> ParseStandardJson(string inputJson)
    {
        using var doc = JsonDocument.Parse(inputJson);
        var root = doc.RootElement;
        if (!root.TryGetProperty("comments", out var commentsEl) || commentsEl.ValueKind != JsonValueKind.Array)
            return new List<DanmuObject>();

        var all = new List<DanmuObject>();

        foreach (var e in commentsEl.EnumerateArray())
        {
            var dm = new DanmuObject
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

    return all ;
    }
}
