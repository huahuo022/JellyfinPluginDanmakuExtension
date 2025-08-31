
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    public string GetIndexHtmlPath() => string.IsNullOrWhiteSpace(_paths.WebPath) ? string.Empty : Path.Combine(_paths.WebPath, "index.html");

    public static string BuildScriptTag(string scriptUrl) => $"<script src=\"{scriptUrl}\" type=\"module\" defer></script>";

    public static string RemoveAllScriptTagsForPath(string html, string scriptRelativePath)
    {
        if (string.IsNullOrEmpty(html) || string.IsNullOrEmpty(scriptRelativePath))
            return html;

    var scriptPattern = $@"<script[^>]*src\s*=\s*[""']{Regex.Escape(scriptRelativePath)}(\?[^""']*)?\s*[""'][^>]*>.*?</script>";
        return Regex.Replace(html, scriptPattern, "", RegexOptions.IgnoreCase | RegexOptions.Singleline);
    }

    public void UpdateIndexHtml(PluginConfiguration cfg, bool enableInjection)
    {
        var indexPath = GetIndexHtmlPath();
        if (string.IsNullOrWhiteSpace(indexPath) || !System.IO.File.Exists(indexPath))
            return;

        var html = System.IO.File.ReadAllText(indexPath, Encoding.UTF8);
        var originalHtml = html;
        html = RemoveAllScriptTagsForPath(html, cfg.ScriptRelativePath);

        if (enableInjection)
        {
            EnsureCustomJsExists();
            var scriptTag = BuildScriptTag(cfg.ScriptRelativePath);
            html = html.Replace("</head>", scriptTag + "</head>");
        }

        if (!string.Equals(originalHtml, html, StringComparison.Ordinal))
        {
            System.IO.File.WriteAllText(indexPath, html, Encoding.UTF8);
        }
    }

    public void EnsureCustomJsExists()
    {
        try
        {
            var jsPath = GetCustomJsPath();
            if (!string.IsNullOrWhiteSpace(jsPath) && !System.IO.File.Exists(jsPath))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(jsPath)!);
                System.IO.File.WriteAllText(jsPath, DefaultJsContent, Encoding.UTF8);
            }
        }
        catch { /* Ignore file creation errors */ }
    }

    // HTML和JS文件操作（含 custom_js 聚合）
    private static string SafeBase64Decode(string? base64)
    {
        if (string.IsNullOrWhiteSpace(base64)) return string.Empty;
        try
        {
            var bytes = Convert.FromBase64String(base64);
            return Encoding.UTF8.GetString(bytes);
        }
        catch
        {
            return string.Empty;
        }
    }

    /// <summary>
    /// 读取 custom_js_entries 表并合成最终的自定义 JS 内容。
    /// 规则（已简化）：
    /// - data_type == 'url' 时，将解码后的 data_base64 当作 URL，以 `import '{url}';` 形式加入。
    /// - 其他类型（默认 'js'），解码 data_base64 后作为内联 JS 直接拼接。
    /// 片段之间用一个换行符连接。
    /// </summary>
    public async Task<string> BuildCombinedCustomJsAsync()
    {
        await InitializeDatabaseAsync();

        using var connection = await OpenConnectionAsync();

    var sql = @"SELECT ""index"", data_type, name, data_base64 FROM custom_js_entries ORDER BY ""index"" ASC";
        using var cmd = new SqliteCommand(sql, connection);
        using var reader = await cmd.ExecuteReaderAsync();

        var parts = new List<string>();
        while (await reader.ReadAsync())
        {
            var dataType = (reader.IsDBNull(1) ? "js" : reader.GetString(1)).Trim().ToLowerInvariant();
            var dataB64 = reader.IsDBNull(3) ? null : reader.GetString(3);

            string piece = string.Empty;
            var decoded = SafeBase64Decode(dataB64);
            if (!string.IsNullOrWhiteSpace(decoded))
            {
                if (dataType == "url")
                {
                    // 优先尝试从 js_net_cache 读取并内联
                    var cached = await GetJsNetCacheByUrlBase64Async(dataB64!);
                    if (cached.HasValue)
                    {
                        var inlineJs = SafeBase64Decode(cached.Value.JsBase64);
                        if (!string.IsNullOrWhiteSpace(inlineJs))
                        {
                            piece = inlineJs;
                        }
                    }

                    // 如果未命中缓存或内容为空，回退为 import 该 URL
                    if (string.IsNullOrWhiteSpace(piece))
                    {
                        piece = $"import '{decoded}';";
                    }
                }
                else
                {
                    piece = decoded;
                }
            }

            if (!string.IsNullOrEmpty(piece))
            {
                parts.Add(piece);
            }
        }

        return string.Join("\n", parts);
    }

    public string ReadCustomJsFile()
    {
        var path = GetCustomJsPath();

        if (string.IsNullOrWhiteSpace(path) || !System.IO.File.Exists(path))
        {
            return DefaultJsContent;
        }

        var text = System.IO.File.ReadAllText(path, Encoding.UTF8);
        if (string.IsNullOrWhiteSpace(text))
        {
            return DefaultJsContent;
        }

        return text;
    }

    /// <summary>
    /// 查询 custom_js_entries 表并组装 API 模型。
    /// 规则：
    /// - 仅返回 data_base64（已合并），前端依 data_type 判定是 URL 还是 JS
    /// </summary>
    public async Task<List<CustomJsEntryApiModel>> GetCustomJsEntriesForApiAsync()
    {
        await InitializeDatabaseAsync();

        using var connection = await OpenConnectionAsync();

        var list = new List<CustomJsEntryApiModel>();
    var sql = @"SELECT ""index"", data_type, name, data_base64, updated_at FROM custom_js_entries ORDER BY ""index"" ASC";
        using var cmd = new SqliteCommand(sql, connection);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var index = reader.IsDBNull(0) ? 0 : reader.GetInt32(0);
            var dataType = (reader.IsDBNull(1) ? "js" : reader.GetString(1)).Trim().ToLowerInvariant();
            var name = reader.IsDBNull(2) ? string.Empty : reader.GetString(2) ?? string.Empty;
            var dataB64 = reader.IsDBNull(3) ? string.Empty : reader.GetString(3) ?? string.Empty;
            var updatedAt = reader.IsDBNull(4) ? DateTime.MinValue : reader.GetDateTime(4);

            var api = new CustomJsEntryApiModel
            {
                Index = index,
                DataType = dataType,
                DataBase64 = dataB64,
                Name = name,
                UpdatedAt = updatedAt
            };
            list.Add(api);
        }

        return list;
    }

    public void SaveCustomJsFile(string content)
    {
        var path = GetCustomJsPath();
        if (string.IsNullOrWhiteSpace(path))
        {
            throw new InvalidOperationException("WebPath is unavailable; cannot save custom.js");
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        System.IO.File.WriteAllText(path, content ?? string.Empty, Encoding.UTF8);
    }
}
