using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System.Net.Http;
using System.Globalization;
using System.Xml.Linq;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 占位：加载额外弹幕源（外部文件 / URL 等），当前未实现，返回空列表。
    /// 后续可基于 itemId 与配置中的开关，读取 ext_source 中启用且类型为 file/url 的源，解析为 Pakku.DanmuObject 集合。
    /// </summary>
    /// <param name="itemId">媒体项 ID</param>
    /// <param name="config">弹幕配置</param>
    /// <returns>额外弹幕列表（当前为空）</returns>
    public async Task<ParsedDanmakuResult> LoadExtraDanmakuAsync(Guid? itemId, DanmakuConfig config)
    {
        var result = new ParsedDanmakuResult();

        if (itemId == null || itemId == Guid.Empty) return result;

        string? mediaPath = null;
        try
        {
            var item = _libraryManager.GetItemById(itemId.Value);
            mediaPath = item?.Path;
        }
        catch { }
        if (string.IsNullOrWhiteSpace(mediaPath) || !File.Exists(mediaPath)) return result;

        var dir = Path.GetDirectoryName(mediaPath);
        var nameWithoutExt = Path.GetFileNameWithoutExtension(mediaPath);
        if (string.IsNullOrWhiteSpace(dir) || string.IsNullOrWhiteSpace(nameWithoutExt) || !Directory.Exists(dir)) return result;

        var originalFull = mediaPath; // 原媒体文件全路径
        var prefix = Path.Combine(dir, nameWithoutExt) + "."; // 用于匹配的前缀: 目录 + 文件名无扩展 + '.'

        // 扫描目录，获取所有以 prefix 开头且不是原媒体文件的文件
        IEnumerable<string> candidateFiles;
        try
        {
            candidateFiles = Directory.EnumerateFiles(dir)
                .Where(p => p.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && !string.Equals(p, originalFull, StringComparison.OrdinalIgnoreCase));
        }
        catch { return result; }

        // 解析候选文件得到 sourceName (prefix 之后的部分)
        var fileSourcesFound = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var f in candidateFiles)
        {
            try
            {
                var remainder = f.Substring(prefix.Length); // 允许包含多级点与扩展
                if (string.IsNullOrWhiteSpace(remainder)) continue;
                // remainder 作为 sourceName
                if (!fileSourcesFound.ContainsKey(remainder))
                {
                    fileSourcesFound[remainder] = f;
                }
            }
            catch { }
        }

        // 获取数据库中 ext_source 列表
        List<ExtSourceItem> dbItems = new();
        try
        {
            var json = await GetExtSourceAsync(itemId.Value.ToString());
            if (!string.IsNullOrWhiteSpace(json))
            {
                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                dbItems = JsonSerializer.Deserialize<List<ExtSourceItem>>(json, opts) ?? new List<ExtSourceItem>();
            }
        }
        catch { }

        var dbFileItems = dbItems.Where(i => string.Equals(i.Type, "file", StringComparison.OrdinalIgnoreCase)).ToList();
        var dbFileNames = new HashSet<string>(dbFileItems.Select(i => i.SourceName), StringComparer.Ordinal);

        // 1. 新增：文件系统存在，数据库没有
        foreach (var kv in fileSourcesFound)
        {
            if (!dbFileNames.Contains(kv.Key))
            {
                try
                {
                    await UpdateExtSourceAsync(itemId.Value.ToString(), kv.Key, "file", kv.Value, true);
                }
                catch { }
            }
        }

        // 2. 删除：数据库存在，文件系统不存在
        var fsNames = new HashSet<string>(fileSourcesFound.Keys, StringComparer.Ordinal);
        foreach (var dbItem in dbFileItems)
        {
            if (!fsNames.Contains(dbItem.SourceName))
            {
                try
                {
                    // 删除：传入 source 为空字符串
                    await UpdateExtSourceAsync(itemId.Value.ToString(), dbItem.SourceName, string.Empty, string.Empty, false);
                }
                catch { }
            }
        }
        // --- 重新获取一次最新 ext_source（确保刚才的增删同步） ---
        List<ExtSourceItem> latestItems = dbItems;
        try
        {
            var refreshJson = await GetExtSourceAsync(itemId.Value.ToString());
            if (!string.IsNullOrWhiteSpace(refreshJson))
            {
                var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                latestItems = JsonSerializer.Deserialize<List<ExtSourceItem>>(refreshJson, opts) ?? dbItems;
            }
        }
        catch { }

        // --- 解析：file 类型 ---
        var latestFileItems = latestItems.Where(i => i.Enable && string.Equals(i.Type, "file", StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var fi in latestFileItems)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(fi.Source)) continue;
                if (!File.Exists(fi.Source)) continue;
                var parsed = await ParseFileDanmakuAsync(fi.Source, fi.SourceName);
                if (parsed != null && parsed.Count > 0) result.Danmus.AddRange(parsed);
            }
            catch { /* 占位：忽略单个文件解析错误 */ }
        }

        // --- 解析：url 类型 ---
        var latestUrlItems = latestItems.Where(i => i.Enable && string.Equals(i.Type, "url", StringComparison.OrdinalIgnoreCase)).ToList();
        foreach (var ui in latestUrlItems)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(ui.Source)) continue;
                var parsed = await ParseUrlDanmakuAsync(ui.Source, ui.SourceName);
                if (parsed != null && parsed.Count > 0) result.Danmus.AddRange(parsed);
            }
            catch { /* 占位：忽略单个 URL 解析错误 */ }
        }

        // 统计来源（仅 file/url 已启用项）
        try
        {
            var stats = result.Danmus
                .GroupBy(d => d.pool ?? string.Empty)
                .Select(g => new Pakku.SourceStatItem
                {
                    source_name = g.Key,
                    count = g.Count(),
                    type = latestItems.FirstOrDefault(i => string.Equals(i.SourceName, g.Key, StringComparison.OrdinalIgnoreCase))?.Type ?? string.Empty,
                    source = latestItems.FirstOrDefault(i => string.Equals(i.SourceName, g.Key, StringComparison.OrdinalIgnoreCase))?.Source ?? string.Empty,
                    enable = true,
                    shift = 0
                })
                .ToList();
            result.SourceStats.AddRange(stats);
        }
        catch { }

        return result;
    }
}

public partial class DanmakuService
{
    /// <summary>
    /// 占位：解析本地文件弹幕，后续可根据扩展名(xml/json/ass)选择不同解析器。
    /// </summary>
    private async Task<List<Pakku.DanmuObject>> ParseFileDanmakuAsync(string path, string sourceName)
    {
        var list = new List<Pakku.DanmuObject>();
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return list;
        // 仅尝试 xml
        try
        {
            // 快速读取（假设编码 UTF-8 / UTF-16 由 .NET 自动检测）
            string text = await File.ReadAllTextAsync(path);
            if (string.IsNullOrWhiteSpace(text)) return list;
            // 简单判断是否 XML
            if (!text.Contains("<d ")) return list;
            list = ParseDanmakuXmlString(text, sourceName);
        }
        catch { /* 占位：解析失败返回空列表 */ }
        return list;
    }

    /// <summary>
    /// 占位：解析远程 URL 弹幕，后续可实现缓存与格式自动识别。
    /// </summary>
    private async Task<List<Pakku.DanmuObject>> ParseUrlDanmakuAsync(string url, string sourceName)
    {
        var result = new List<Pakku.DanmuObject>();
        if (string.IsNullOrWhiteSpace(url)) return result;

        // 仅处理 B 站 url：/video/BVxxxx、/bangumi/play/ep123、/bangumi/play/ss123
        // 解析出 cid 后，通过 DM XML 接口获取 XML，再复用解析器
        try
        {
            var (kind, ident) = DetectBilibiliUrl(url);
            if (kind == null || ident == null) return result; // 暂不支持其它来源

            // 1) 解析 cid
            long cid = await ResolveBilibiliCidAsync(kind!, ident!, url);
            if (cid <= 0) return result;

            // 2) 拉取 XML
            const string baseUrl = "https://api.bilibili.com";
            const string path = "/x/v1/dm/list.so";
            var xml = await SendWithCacheAsync(HttpMethod.Get, baseUrl, path,
                new Dictionary<string, string> { ["oid"] = cid.ToString() }, null, null,
                requestCustomizer: req => AddBiliHeaders(req, url, isXml: true));



            if (string.IsNullOrWhiteSpace(xml) || xml.IndexOf("<d ", StringComparison.OrdinalIgnoreCase) < 0)
                return result;

            // 3) 解析 XML -> 弹幕对象
            result = ParseDanmakuXmlString(xml, sourceName);
        }
        catch (Exception ex)
        {
            try { _logger?.LogWarning(ex, "ParseUrlDanmakuAsync 处理失败: {Url}", url); } catch { }
        }

        return result;
    }

    // ---- 共享：XML -> DanmuObject 解析器（Bili XML 格式） ----
    private List<Pakku.DanmuObject> ParseDanmakuXmlString(string xmlText, string sourceName)
    {
        var list = new List<Pakku.DanmuObject>();
        if (string.IsNullOrWhiteSpace(xmlText)) return list;
        try
        {
            var xdoc = XDocument.Parse(xmlText, LoadOptions.PreserveWhitespace);
            // 直接选取所有名为 d 的元素（忽略命名空间）
            foreach (var d in xdoc.Descendants().Where(e => e.Name.LocalName.Equals("d", StringComparison.OrdinalIgnoreCase)))
            {
                var pAttr = (string?)d.Attribute("p") ?? string.Empty;
                if (string.IsNullOrWhiteSpace(pAttr)) continue;

                var content = d.Value ?? string.Empty;
                var parts = pAttr.Split(',');

                double timeMs = 0; int mode = 1; int colorInt = 0xFFFFFF; string uid = string.Empty; int fontSize = 0;
                try { if (parts.Length > 0) { double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var t); timeMs = t * 1000.0; } } catch { }
                try { if (parts.Length > 1) { int.TryParse(parts[1], out mode); } } catch { }
                try { if (parts.Length > 2) { int.TryParse(parts[2], out fontSize); } } catch { }
                try { if (parts.Length > 3) { int.TryParse(parts[3], out colorInt); } } catch { }
                try { if (parts.Length > 6) { uid = parts[6]; } } catch { }

                if (timeMs < 0) timeMs = 0;
                if (colorInt < 0 || colorInt > 0xFFFFFF) colorInt = 0xFFFFFF;

                list.Add(new Pakku.DanmuObject
                {
                    cid = 0,
                    time_ms = timeMs,
                    mode = mode,
                    color = colorInt,
                    uid = uid ?? string.Empty,
                    content = System.Net.WebUtility.HtmlDecode(content ?? string.Empty),
                    fontsize = fontSize,
                    pool = sourceName ?? string.Empty,
                    mark_count = new List<double> { timeMs }
                });
            }
        }
        catch { }
        return list;
    }

    // 为 Bilibili 请求添加常见头，减少 412
    private static void AddBiliHeaders(HttpRequestMessage req, string referer, bool isXml = false)
    {
        var refToUse = string.IsNullOrWhiteSpace(referer) ? "https://www.bilibili.com" : referer;
        try { req.Headers.Remove("User-Agent"); } catch { }
        req.Headers.TryAddWithoutValidation("User-Agent", BiliUserAgent);
        try { req.Headers.Remove("Referer"); } catch { }
        req.Headers.TryAddWithoutValidation("Referer", refToUse);
        // 严格对齐 dm_utils：仅 UA + Referer，避免额外头导致 412
    }

    // ---- 共享：B 站 URL 解析与 CID 解析 ----
    private static readonly System.Text.RegularExpressions.Regex BvRegex = new(@"/video/(BV[0-9A-Za-z]{10})", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);
    private static readonly System.Text.RegularExpressions.Regex EpRegex = new(@"/bangumi/play/ep(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);
    private static readonly System.Text.RegularExpressions.Regex SsRegex = new(@"/bangumi/play/ss(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.Compiled);
    private const string BiliUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    private static (string? kind, string? ident) DetectBilibiliUrl(string url)
    {
        var u = url?.Trim() ?? string.Empty;
        if (string.IsNullOrEmpty(u)) return (null, null);
        var mEp = EpRegex.Match(u); if (mEp.Success) return ("ep", mEp.Groups[1].Value);
        var mSs = SsRegex.Match(u); if (mSs.Success) return ("ss", mSs.Groups[1].Value);
        var mBv = BvRegex.Match(u); if (mBv.Success) return ("bv", mBv.Groups[1].Value);
        return (null, null);
    }

    private async Task<long> ResolveBilibiliCidAsync(string kind, string ident, string refererUrl)
    {
        const string baseUrl = "https://api.bilibili.com";
        if (string.Equals(kind, "bv", StringComparison.OrdinalIgnoreCase))
        {
            var json = await SendWithCacheAsync(HttpMethod.Get, baseUrl, "/x/web-interface/view",
                new Dictionary<string, string> { ["bvid"] = ident }, null, null,
                requestCustomizer: req => AddBiliHeaders(req, refererUrl));
            if (string.IsNullOrWhiteSpace(json)) return 0;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("code", out var codeEl) && codeEl.GetInt32() != 0) return 0;
                if (!root.TryGetProperty("data", out var dataEl)) return 0;
                if (!dataEl.TryGetProperty("pages", out var pagesEl) || pagesEl.ValueKind != JsonValueKind.Array || pagesEl.GetArrayLength() == 0) return 0;
                var first = pagesEl[0];
                if (first.TryGetProperty("cid", out var cidEl) && cidEl.TryGetInt64(out var cidVal)) return cidVal;
            }
            catch { }
            return 0;
        }
        else if (string.Equals(kind, "ep", StringComparison.OrdinalIgnoreCase))
        {
            var json = await SendWithCacheAsync(HttpMethod.Get, baseUrl, "/pgc/view/web/season",
                new Dictionary<string, string> { ["ep_id"] = ident }, null, null,
                requestCustomizer: req => AddBiliHeaders(req, refererUrl));
            if (string.IsNullOrWhiteSpace(json)) return 0;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("code", out var codeEl) && codeEl.ValueKind == JsonValueKind.Number && codeEl.GetInt32() != 0) return 0;
                JsonElement dataEl = default;
                if (!root.TryGetProperty("result", out dataEl))
                {
                    root.TryGetProperty("data", out dataEl);
                }
                if (dataEl.ValueKind == JsonValueKind.Undefined || dataEl.ValueKind == JsonValueKind.Null) return 0;
                if (!dataEl.TryGetProperty("episodes", out var epsEl) || epsEl.ValueKind != JsonValueKind.Array) return 0;
                foreach (var ep in epsEl.EnumerateArray())
                {
                    if (ep.TryGetProperty("id", out var idEl) && idEl.TryGetInt64(out var epId) && epId.ToString() == ident)
                    {
                        if (ep.TryGetProperty("cid", out var cidEl) && cidEl.TryGetInt64(out var cidVal)) return cidVal;
                    }
                }
            }
            catch { }
            return 0;
        }
        else if (string.Equals(kind, "ss", StringComparison.OrdinalIgnoreCase))
        {
            var json = await SendWithCacheAsync(HttpMethod.Get, baseUrl, "/pgc/view/web/season",
                new Dictionary<string, string> { ["season_id"] = ident }, null, null,
                requestCustomizer: req => AddBiliHeaders(req, refererUrl));
            if (string.IsNullOrWhiteSpace(json)) return 0;
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("code", out var codeEl) && codeEl.ValueKind == JsonValueKind.Number && codeEl.GetInt32() != 0) return 0;
                JsonElement dataEl = default;
                if (!root.TryGetProperty("result", out dataEl))
                {
                    root.TryGetProperty("data", out dataEl);
                }
                if (dataEl.ValueKind == JsonValueKind.Undefined || dataEl.ValueKind == JsonValueKind.Null) return 0;
                if (!dataEl.TryGetProperty("episodes", out var epsEl) || epsEl.ValueKind != JsonValueKind.Array || epsEl.GetArrayLength() == 0) return 0;
                var first = epsEl[0];
                if (first.TryGetProperty("cid", out var cidEl) && cidEl.TryGetInt64(out var cidVal)) return cidVal;
            }
            catch { }
            return 0;
        }

        return 0;
    }
}
