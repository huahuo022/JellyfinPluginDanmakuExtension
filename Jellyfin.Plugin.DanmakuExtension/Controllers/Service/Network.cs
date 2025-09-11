using System.Web;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Linq;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 通用：带缓存的 HTTP 请求。以 method+baseUrl+path+排序后的query+body 生成 MD5 cache_key（不含请求头），
    /// 命中则返回缓存；未命中发起请求，若成功且为 JSON 则写入缓存。
    /// 若 baseUrl 为 https://api.dandanplay.net 则自动生成并附加 dandanplay 认证请求头。
    /// </summary>
    public async Task<string> SendWithCacheAsync(
        HttpMethod method,
        string baseUrl,
        string path,
        IDictionary<string, string>? queryParams = null,
        string? bodyString = null,
        string? contentType = null,
        Action<HttpRequestMessage>? requestCustomizer = null)
    {
        // 规范化并构造 URL
        var fullUrl = BuildUrl(baseUrl, path, queryParams);

        // 计算 cache_key：method|baseUrl|path|k1=v1&k2=v2|body
        var serializedQuery = SerializeQuery(queryParams);
        var normalizedBase = (baseUrl ?? string.Empty).TrimEnd('/');
        var keyMaterial = string.Join("|", new[]
        {
            method.Method,
            normalizedBase,
            path ?? string.Empty,
            serializedQuery,
            bodyString ?? string.Empty
        });
        var cacheKey = ComputeMd5Lower(keyMaterial);

        // 若目标为 dandanplay 官方域名，预解析凭据以决定是否强制最小缓存时间
        string? resolvedAppId = null;
        string? resolvedAppSecret = null;
        bool usedEmbeddedSecrets = false;
        if (!string.IsNullOrWhiteSpace(normalizedBase) &&
            normalizedBase.Equals("https://api.dandanplay.net", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var cfg2_pre = Plugin.Instance?.Configuration as PluginConfiguration;
                resolvedAppId = cfg2_pre?.DandanplayAppId;
                resolvedAppSecret = cfg2_pre?.DandanplayAppSecret;
                if (string.IsNullOrWhiteSpace(resolvedAppId)) resolvedAppId = Environment.GetEnvironmentVariable("DANDANPLAY_APP_ID");
                if (string.IsNullOrWhiteSpace(resolvedAppSecret)) resolvedAppSecret = Environment.GetEnvironmentVariable("DANDANPLAY_APP_SECRET");

                if (string.IsNullOrWhiteSpace(resolvedAppId) || string.IsNullOrWhiteSpace(resolvedAppSecret))
                {
                    var secPre = LoadEmbeddedDandanplaySecrets();
                    if (secPre != null)
                    {
                        if (string.IsNullOrWhiteSpace(resolvedAppId)) resolvedAppId = secPre.AppId;
                        if (string.IsNullOrWhiteSpace(resolvedAppSecret)) resolvedAppSecret = secPre.AppSecret;
                        usedEmbeddedSecrets = true;
                    }
                }
            }
            catch { /* 解析失败时不影响后续逻辑，稍后会在发送前抛出更明确的错误 */ }
        }

        // 先查缓存（若使用内置密钥，则强制最小缓存 30 分钟）
        var cached = await GetFromCache(cacheKey, usedEmbeddedSecrets ? 30 : (int?)null);
        if (cached != null)
        {
            await IncrementCacheHitAsync();
            _logger.LogInformation("Cache HIT: {Path} {Query}", path, serializedQuery);
            return cached;
        }

        await IncrementCacheMissAsync();

    using var req = new HttpRequestMessage(method, fullUrl);
        if (!string.IsNullOrEmpty(bodyString))
        {
            req.Content = new StringContent(bodyString, Encoding.UTF8, contentType ?? "application/json");
        }
    // 请求端也声明可接受常见压缩编码
    try { req.Headers.Remove("Accept-Encoding"); } catch { }
    req.Headers.TryAddWithoutValidation("Accept-Encoding", "br, gzip, deflate");
        // 若为官方域名，则在此统一生成 dandanplay 所需认证请求头
        try
        {
            if (!string.IsNullOrWhiteSpace(normalizedBase) &&
                normalizedBase.Equals("https://api.dandanplay.net", StringComparison.OrdinalIgnoreCase))
            {
                // 若尚未预解析（或解析为空），在此确保已解析，否则抛错
                if (string.IsNullOrWhiteSpace(resolvedAppId) || string.IsNullOrWhiteSpace(resolvedAppSecret))
                {
                    var cfg2 = Plugin.Instance?.Configuration as PluginConfiguration;
                    resolvedAppId = cfg2?.DandanplayAppId;
                    resolvedAppSecret = cfg2?.DandanplayAppSecret;
                    if (string.IsNullOrWhiteSpace(resolvedAppId)) resolvedAppId = Environment.GetEnvironmentVariable("DANDANPLAY_APP_ID");
                    if (string.IsNullOrWhiteSpace(resolvedAppSecret)) resolvedAppSecret = Environment.GetEnvironmentVariable("DANDANPLAY_APP_SECRET");
                    if (string.IsNullOrWhiteSpace(resolvedAppId) || string.IsNullOrWhiteSpace(resolvedAppSecret))
                    {
                        try
                        {
                            var sec = LoadEmbeddedDandanplaySecrets();
                            if (sec != null)
                            {
                                if (string.IsNullOrWhiteSpace(resolvedAppId)) resolvedAppId = sec.AppId;
                                if (string.IsNullOrWhiteSpace(resolvedAppSecret)) resolvedAppSecret = sec.AppSecret;
                            }
                        }
                        catch (Exception ex2)
                        {
                            _logger.LogWarning(ex2, "读取 dandanplay 嵌入密钥失败");
                        }
                    }
                }

                if (string.IsNullOrWhiteSpace(resolvedAppId) || string.IsNullOrWhiteSpace(resolvedAppSecret))
                {
                    const string msg = "未设置 dandanplay AppId/AppSecret（请设置环境变量 DANDANPLAY_APP_ID / DANDANPLAY_APP_SECRET），api.dandanplay.net 不加请求头无法访问";
                    _logger.LogError(msg);
                    throw new InvalidOperationException(msg);
                }

                var headers2 = GenerateDandanHeadersForUrl(resolvedAppId!, resolvedAppSecret!, fullUrl);
                foreach (var kv in headers2)
                {
                    req.Headers.TryAddWithoutValidation(kv.Key, kv.Value);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "自动生成 dandanplay 请求头失败");
            throw;
        }
        // 允许调用方进行额外自定义（若有），可覆盖默认行为
        requestCustomizer?.Invoke(req);

    // 自动跟随重定向（最多5次），重定向后改用 GET
        var currentResponse = await _httpClient.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);
        try
        {
            int redirectCount = 0;
            while ((int)currentResponse.StatusCode >= 300 && (int)currentResponse.StatusCode < 400 && currentResponse.Headers.Location != null && redirectCount < 5)
            {
                var redirectUrl = currentResponse.Headers.Location.IsAbsoluteUri
                    ? currentResponse.Headers.Location.ToString()
                    : new Uri(new Uri(fullUrl), currentResponse.Headers.Location).ToString();
                _logger.LogInformation("HTTP {Status}, redirect to {Url}", (int)currentResponse.StatusCode, redirectUrl);
                currentResponse.Dispose();
                using var rNext = new HttpRequestMessage(HttpMethod.Get, redirectUrl);
                currentResponse = await _httpClient.SendAsync(rNext, HttpCompletionOption.ResponseHeadersRead);
                redirectCount++;
            }

            currentResponse.EnsureSuccessStatusCode();

            // 读取原始字节并按 Content-Encoding 解压
            var rawBytes = await currentResponse.Content.ReadAsByteArrayAsync();
            byte[] decodedBytes = rawBytes;
            try
            {
                var encodings = currentResponse.Content.Headers.ContentEncoding?.ToArray() ?? Array.Empty<string>();
                if (encodings.Length > 0)
                {
                    // 处理链式编码，按添加顺序逆序解压（一般只有一个）
                    for (int i = encodings.Length - 1; i >= 0; i--)
                    {
                        var enc = (encodings[i] ?? string.Empty).Trim().ToLowerInvariant();
                        using var ms = new MemoryStream(decodedBytes);
                        MemoryStream outMs = new MemoryStream();
                        if (enc == "br")
                        {
                            using var br = new BrotliStream(ms, CompressionMode.Decompress, leaveOpen: false);
                            br.CopyTo(outMs);
                            decodedBytes = outMs.ToArray();
                        }
                        else if (enc == "gzip")
                        {
                            using var gz = new GZipStream(ms, CompressionMode.Decompress, leaveOpen: false);
                            gz.CopyTo(outMs);
                            decodedBytes = outMs.ToArray();
                        }
                        else if (enc == "deflate")
                        {
                            using var df = new DeflateStream(ms, CompressionMode.Decompress, leaveOpen: false);
                            df.CopyTo(outMs);
                            decodedBytes = outMs.ToArray();
                        }
                        else
                        {
                            // 未识别的编码，停止进一步处理
                            break;
                        }
                    }
                }
                else
                {
                    // 无 header 时，尝试按魔数侦测 gzip
                    if (decodedBytes.Length >= 2 && decodedBytes[0] == 0x1F && decodedBytes[1] == 0x8B)
                    {
                        using var ms = new MemoryStream(decodedBytes);
                        using var gz = new GZipStream(ms, CompressionMode.Decompress, leaveOpen: false);
                        using var outMs = new MemoryStream();
                        gz.CopyTo(outMs);
                        decodedBytes = outMs.ToArray();
                    }
                }
            }
            catch
            {
                // 解压失败时退回原始字节
                decodedBytes = rawBytes;
            }

            // 选择编码（优先使用 Content-Type 中的 charset，其次 BOM，最后 UTF-8）
            Encoding encoding = Encoding.UTF8;
            try
            {
                var charset = currentResponse.Content.Headers.ContentType?.CharSet;
                if (!string.IsNullOrWhiteSpace(charset))
                {
                    encoding = Encoding.GetEncoding(charset!);
                }
                else if (decodedBytes.Length >= 3 && decodedBytes[0] == 0xEF && decodedBytes[1] == 0xBB && decodedBytes[2] == 0xBF)
                {
                    encoding = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
                }
                else if (decodedBytes.Length >= 2)
                {
                    if (decodedBytes[0] == 0xFF && decodedBytes[1] == 0xFE)
                        encoding = Encoding.Unicode; // UTF-16 LE
                    else if (decodedBytes[0] == 0xFE && decodedBytes[1] == 0xFF)
                        encoding = Encoding.BigEndianUnicode; // UTF-16 BE
                }
            }
            catch { }

            var text = encoding.GetString(decodedBytes);
            if (IsJsonResponse(currentResponse, text) || IsXmlResponse(currentResponse, text))
            {
                await SaveDanmakuToCache(cacheKey, text);
            }
            return text;
        }
        finally
        {
            currentResponse.Dispose();
        }
    }

    private static string BuildUrl(string baseUrl, string path, IDictionary<string, string>? query)
    {
        var ub = new UriBuilder($"{baseUrl.TrimEnd('/')}/{path.TrimStart('/')}");
        if (query != null && query.Count > 0)
        {
            var qs = string.Join("&", query
                .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                .Select(kv => $"{HttpUtility.UrlEncode(kv.Key)}={HttpUtility.UrlEncode(kv.Value)}"));
            ub.Query = qs;
        }
        return ub.Uri.ToString();
    }

    private static string SerializeQuery(IDictionary<string, string>? query)
    {
        if (query == null || query.Count == 0) return string.Empty;
        return string.Join("&", query
            .OrderBy(kv => kv.Key, StringComparer.Ordinal)
            .Select(kv => $"{kv.Key}={kv.Value}"));
    }

    private static string ComputeMd5Lower(string s)
    {
        var bytes = Encoding.UTF8.GetBytes(s);
        var hash = MD5.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static bool IsJsonResponse(HttpResponseMessage resp, string body)
    {
        try
        {
            var ct = resp.Content.Headers.ContentType?.MediaType ?? string.Empty;
            if (!string.IsNullOrEmpty(ct) && ct.IndexOf("json", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;
        }
        catch { }
        // 容错：简单判断文本开头
        var t = body?.TrimStart();
        return !string.IsNullOrEmpty(t) && (t!.StartsWith("{") || t!.StartsWith("["));
    }

    private static bool IsXmlResponse(HttpResponseMessage resp, string body)
    {
        try
        {
            var ct = resp.Content.Headers.ContentType?.MediaType ?? string.Empty;
            if (!string.IsNullOrEmpty(ct) && ct.IndexOf("xml", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;
        }
        catch { }
        var t = body?.TrimStart();
        if (string.IsNullOrEmpty(t)) return false;
        // 排除明显的 HTML 页（避免把拦截页缓存）
        var tLower = t.Length > 64 ? t.Substring(0, 64).ToLowerInvariant() : t.ToLowerInvariant();
        if (tLower.StartsWith("<!doctype html") || tLower.StartsWith("<html")) return false;
        return t.StartsWith("<");
    }

    /// <summary>
    /// 生成 dandanplay API 所需的请求头。
    /// 需要的头：X-AppId, X-Signature, X-Timestamp。
    /// 签名算法：base64(sha256(AppId + Timestamp + Path + AppSecret))。
    /// 注意：Path 仅为路径部分（不含域名、查询参数），例如：/api/v2/comment/123450001。
    /// </summary>
    /// <param name="appId">应用 ID</param>
    /// <param name="appSecret">应用密钥</param>
    /// <param name="path">API 路径（不含域名与查询参数）</param>
    /// <param name="timestamp">可选的 Unix 时间戳（秒）；若不提供将使用当前 UTC 时间</param>
    /// <returns>包含所需头的字典</returns>
    public Dictionary<string, string> GenerateDandanHeaders(string appId, string appSecret, string path, long? timestamp = null)
    {
        var ts = timestamp ?? DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = GenerateDandanSignature(appId, ts, path, appSecret);
        return new Dictionary<string, string>
        {
            ["X-AppId"] = appId,
            ["X-Signature"] = signature,
            ["X-Timestamp"] = ts.ToString()
        };
    }

    /// <summary>
    /// 从完整 URL 生成 dandanplay API 所需请求头（自动提取 Path，忽略查询参数）。
    /// </summary>
    /// <param name="appId">应用 ID</param>
    /// <param name="appSecret">应用密钥</param>
    /// <param name="apiUrl">完整 API URL</param>
    /// <param name="timestamp">可选的 Unix 时间戳（秒）</param>
    /// <returns>包含所需头的字典</returns>
    public Dictionary<string, string> GenerateDandanHeadersForUrl(string appId, string appSecret, string apiUrl, long? timestamp = null)
    {
        var uri = new Uri(apiUrl);
        var path = uri.AbsolutePath; // 仅路径部分
        return GenerateDandanHeaders(appId, appSecret, path, timestamp);
    }

    /// <summary>
    /// 生成签名：base64(sha256(AppId + Timestamp + Path + AppSecret))
    /// </summary>
    private static string GenerateDandanSignature(string appId, long timestamp, string path, string appSecret)
    {
        var data = appId + timestamp + path + appSecret;
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(data));
        return Convert.ToBase64String(hash);
    }

    public string GetBaseUrl()
    {
        var cfg = Plugin.Instance?.Configuration as PluginConfiguration;
        var proxyBase = cfg?.DandanplayProxyBaseUrl;
        var serverBase = cfg?.DandanplayServerBaseUrl;
        var baseUrl = !string.IsNullOrWhiteSpace(proxyBase)
            ? proxyBase!
            : !string.IsNullOrWhiteSpace(serverBase)
                ? serverBase!
                : "https://api.dandanplay.net";
        return baseUrl.TrimEnd('/');
    }

    // 密钥数据结构
    private sealed class DandanplaySecrets
    {
        public string? AppId { get; set; }
        public string? AppSecret { get; set; }
    }

    private DandanplaySecrets? LoadEmbeddedDandanplaySecrets()
    {
        var asm = Assembly.GetExecutingAssembly();
        // 示例资源名：Jellyfin.Plugin.DanmakuExtension.Controllers.Service.dandanplay.secret.embedded.json
        var resName = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("Controllers.Service.dandanplay.secret.embedded.json", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrEmpty(resName)) return null;

        using var stream = asm.GetManifestResourceStream(resName);
        if (stream == null) return null;
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var json = reader.ReadToEnd();
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        string? Read(string name)
            => root.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

        static string? Decode(string? enc)
        {
            if (string.IsNullOrWhiteSpace(enc)) return null;
            var reversed = new string(enc!.Reverse().ToArray());
            try
            {
                var bytes = Convert.FromBase64String(reversed);
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return null;
            }
        }

        var id = Decode(Read("appIdEnc"));
        var secret = Decode(Read("appSecretEnc"));
        if (string.IsNullOrWhiteSpace(id) && string.IsNullOrWhiteSpace(secret)) return null;
        return new DandanplaySecrets { AppId = id, AppSecret = secret };
    }
}
