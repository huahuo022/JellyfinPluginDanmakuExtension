using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.IO;
using System.Linq;
using System.Text.Json;

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

        // --- 占位解析：file 类型 ---
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

        // --- 占位解析：url 类型 ---
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
                    enable = true
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

            using var sr = new StringReader(text);
            var settings = new System.Xml.XmlReaderSettings { IgnoreComments = true, IgnoreWhitespace = true, DtdProcessing = System.Xml.DtdProcessing.Ignore };
            using var reader = System.Xml.XmlReader.Create(sr, settings);
            while (reader.Read())
            {
                if (reader.NodeType != System.Xml.XmlNodeType.Element) continue;
                if (!string.Equals(reader.Name, "d", StringComparison.OrdinalIgnoreCase)) continue;
                // 读取 p 属性
                var pAttr = reader.GetAttribute("p") ?? string.Empty;
                // d 标签文本
                string content = string.Empty;
                try { content = reader.ReadInnerXml(); } catch { }
                if (string.IsNullOrWhiteSpace(pAttr)) continue;
                var parts = pAttr.Split(',');
                // p 格式: time,mode,fontSize,color,sendTime,type,uid,???  (给出的示例: p="0.305,1,25,16777215,1757350090,0,3608710c,1931551569099253504")
                // index:0 time(s) -> ms |1 mode |2 fontsize |3 color(int) |6 uid
                double timeMs = 0;
                int mode = 1;
                int colorInt = 0xFFFFFF;
                string uid = string.Empty;
                int fontSize = 0;
                try { if (parts.Length > 0) { double.TryParse(parts[0], out var t); timeMs = t * 1000.0; } } catch { }
                try { if (parts.Length > 1) { int.TryParse(parts[1], out mode); } } catch { }
                try { if (parts.Length > 2) { int.TryParse(parts[2], out fontSize); } } catch { }
                try { if (parts.Length > 3) { int.TryParse(parts[3], out colorInt); } } catch { }
                try { if (parts.Length > 6) { uid = parts[6]; } } catch { }

                if (timeMs < 0) timeMs = 0;
                // 颜色转换：确保在 0x000000 - 0xFFFFFF 范围
                if (colorInt < 0) colorInt = 0xFFFFFF;
                if (colorInt > 0xFFFFFF) colorInt = 0xFFFFFF;

                // 生成对象
                var obj = new Pakku.DanmuObject
                {
                    cid = 0, // 无单独 cid，保持 0
                    time_ms = timeMs,
                    mode = mode,
                    color = colorInt,
                    uid = uid ?? string.Empty,
                    content = System.Net.WebUtility.HtmlDecode(content ?? string.Empty),
                    fontsize = fontSize,
                    pool = sourceName ?? string.Empty,
                    mark_count = new List<double> { timeMs }
                };
                list.Add(obj);
            }
        }
        catch { /* 占位：解析失败返回空列表 */ }
        return list;
    }

    /// <summary>
    /// 占位：解析远程 URL 弹幕，后续可实现缓存与格式自动识别。
    /// </summary>
    private async Task<List<Pakku.DanmuObject>> ParseUrlDanmakuAsync(string url, string sourceName)
    {
        await Task.CompletedTask; // 占位保持异步接口
        return new List<Pakku.DanmuObject>();
    }
}
