
using System.Text.Json;
using System.Text.Json.Serialization;
using MediaBrowser.Model.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

/// <summary>
/// DanmakuService 的匹配相关逻辑（占位文件）。
/// </summary>
public partial class DanmakuService
{
    /// <summary>
    /// 优先级：Season 的 ProviderIds["Bangumi"] -> Series 的 ProviderIds["Bangumi"] -> 自身的 ProviderIds
    /// </summary>
    private string? ResolveBangumiId(Guid itemId)
    {
        try
        {
            var item = _libraryManager.GetItemById(itemId) as BaseItem;
            if (item == null)
            {
                return null;
            }

            // 尝试从 Season
            Guid? seasonId = null;
            Guid? seriesId = null;

            switch (item)
            {
                case Episode ep:
                    if (ep.SeasonId != Guid.Empty) seasonId = ep.SeasonId;
                    if (ep.SeriesId != Guid.Empty) seriesId = ep.SeriesId;
                    break;
                case Season season:
                    seasonId = season.Id;
                    if (season.SeriesId != Guid.Empty) seriesId = season.SeriesId;
                    break;
                case Series series:
                    seriesId = series.Id;
                    break;
                default:
                    // 其他类型：不强求 Season/Series，直接走自身兜底
                    break;
            }

            if (seasonId.HasValue && seasonId.Value != Guid.Empty)
            {
                if (_libraryManager.GetItemById(seasonId.Value) is BaseItem seasonItem)
                {
                    var val = GetProviderIdIgnoreCase(seasonItem, "Bangumi");
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        return val;
                    }
                }
            }

            if (seriesId.HasValue && seriesId.Value != Guid.Empty)
            {
                if (_libraryManager.GetItemById(seriesId.Value) is BaseItem seriesItem)
                {
                    var val = GetProviderIdIgnoreCase(seriesItem, "Bangumi");
                    if (!string.IsNullOrWhiteSpace(val))
                    {
                        return val;
                    }
                }
            }

            // 自身兜底
            return GetProviderIdIgnoreCase(item, "Bangumi");
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// 忽略大小写读取 ProviderIds 中的键值。
    /// </summary>
    private static string? GetProviderIdIgnoreCase(IHasProviderIds item, string key)
    {
        try
        {
            var dict = item.ProviderIds;
            if (dict == null || dict.Count == 0)
            {
                return null;
            }
            foreach (var kv in dict)
            {
                if (string.Equals(kv.Key, key, StringComparison.OrdinalIgnoreCase))
                {
                    return kv.Value;
                }
            }
        }
        catch { }
        return null;
    }

    /// <summary>
    /// 传入 itemId，解析 bangumi_id 后计算 offset；失败返回 0。
    /// </summary>
    public async Task<int> TryGetBangumiOffsetForItemAsync(Guid itemId)
    {
        // 解析 bangumi_id
        var bangumiId = ResolveBangumiId(itemId);
        if (string.IsNullOrWhiteSpace(bangumiId)) return 0;

        try
        {
            var baseUrl = "https://api.bgm.tv";
            var path = "/v0/episodes";
            var query = new Dictionary<string, string>
            {
                ["subject_id"] = bangumiId!,
                ["limit"] = "100",
                ["offset"] = "0"
            };

            var text = await SendWithCacheAsync(HttpMethod.Get, baseUrl, path, query, null, null);
            if (string.IsNullOrWhiteSpace(text)) return 0;

            using var doc = JsonDocument.Parse(text);
            if (!doc.RootElement.TryGetProperty("data", out var dataEl) || dataEl.ValueKind != JsonValueKind.Array)
            {
                return 0;
            }

            var counts = new Dictionary<int, int>();
            foreach (var it in dataEl.EnumerateArray())
            {
                int ep = 0, sort = 0;
                if (it.ValueKind == JsonValueKind.Object)
                {
                    if (it.TryGetProperty("ep", out var epEl)) ep = ToIntSafe(epEl);
                    if (it.TryGetProperty("sort", out var sortEl)) sort = ToIntSafe(sortEl);
                }
                var diff = sort - ep;
                if (counts.TryGetValue(diff, out var c)) counts[diff] = c + 1; else counts[diff] = 1;
            }

            if (counts.Count == 0) return 0;
            var mode = counts.OrderByDescending(kv => kv.Value).First().Key;
            return mode;
        }
        catch
        {
            return 0;
        }
    }

    /// <summary>
    /// 传入 itemId，返回优先 ID（Season > Series > Self）。
    /// </summary>
    public Guid GetPreferredContainerId(Guid itemId)
    {
        Guid preferredId = itemId;
        try
        {
            if (_libraryManager.GetItemById(itemId) is BaseItem baseItem)
            {
                Guid seasonId = Guid.Empty;
                Guid seriesId = Guid.Empty;
                switch (baseItem)
                {
                    case Episode ep:
                        seasonId = ep.SeasonId;
                        seriesId = ep.SeriesId;
                        break;
                    case Season season:
                        seasonId = season.Id;
                        seriesId = season.SeriesId;
                        break;
                    case Series series:
                        seriesId = series.Id;
                        break;
                }
                if (seasonId != Guid.Empty) preferredId = seasonId;
                else if (seriesId != Guid.Empty) preferredId = seriesId;
            }
        }
        catch { preferredId = itemId; }
        return preferredId;
    }

    private static int ToIntSafe(JsonElement el)
    {
        try
        {
            switch (el.ValueKind)
            {
                case JsonValueKind.Number:
                    if (el.TryGetInt32(out var i)) return i;
                    if (el.TryGetInt64(out var l))
                    {
                        if (l < int.MinValue) return int.MinValue;
                        if (l > int.MaxValue) return int.MaxValue;
                        return (int)l;
                    }
                    if (el.TryGetDouble(out var d))
                    {
                        if (d < int.MinValue) return int.MinValue;
                        if (d > int.MaxValue) return int.MaxValue;
                        return (int)Math.Round(d);
                    }
                    break;
                case JsonValueKind.String:
                    var s = el.GetString();
                    if (int.TryParse(s, out var si)) return si;
                    if (long.TryParse(s, out var sl))
                    {
                        if (sl < int.MinValue) return int.MinValue;
                        if (sl > int.MaxValue) return int.MaxValue;
                        return (int)sl;
                    }
                    if (double.TryParse(s, out var sd))
                    {
                        if (sd < int.MinValue) return int.MinValue;
                        if (sd > int.MaxValue) return int.MaxValue;
                        return (int)Math.Round(sd);
                    }
                    break;
            }
        }
        catch { }
        return 0;
    }

    /// <summary>
    /// 自动进行网络搜索以尝试获取指定条目的匹配结果。
    /// 返回第一个匹配对象（resp.Matches[0]），未匹配则返回 null。
    /// </summary>
    /// <param name="itemId">媒体项 ID</param>
    /// <returns>第一个匹配对象；若未匹配到则返回 null。</returns>
    public async Task<MatchResultV2?> TryAutoMatchDanmakuIdAsync(Guid itemId)
    {
        // 构建请求体
        var mediaInfo = GetMediaMatchInfo(itemId);
        if (mediaInfo == null)
        {
            return null;
        }

        var baseUrl = GetBaseUrl();
        var path = "/api/v2/match";
        var body = JsonSerializer.Serialize(mediaInfo);

        string? text;
        try
        {
            text = await SendWithCacheAsync(HttpMethod.Post, baseUrl, path, null, body, "application/json");
        }
        catch
        {
            return null;
        }

        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        // 解析返回：若 isMatched 为 true，直接返回第一个匹配；
        // 若 isMatched 不为 true，但存在候选 matches，则先临时返回第一个（后续再优化策略）。
        try
        {
            var resp = JsonSerializer.Deserialize<MatchResponseV2>(text);
            if (resp != null && resp.Success && resp.ErrorCode == 0 && resp.Matches != null && resp.Matches.Count > 0)
            {
                // TODO: 当 IsMatched 为 false 时，加入更精细的候选选择逻辑（相似度/文件名清洗/用户确认）
                return resp.Matches[0];
            }
        }
        catch
        {
            // 忽略解析错误并返回 null
        }

        return null;
    }

    private sealed class MatchResponseV2
    {
        [JsonPropertyName("errorCode")] public int ErrorCode { get; set; }
        [JsonPropertyName("success")] public bool Success { get; set; }
        [JsonPropertyName("errorMessage")] public string? ErrorMessage { get; set; }
        [JsonPropertyName("isMatched")] public bool IsMatched { get; set; }
        [JsonPropertyName("matches")] public List<MatchResultV2>? Matches { get; set; }
    }

    public sealed class MatchResultV2
    {
        [JsonPropertyName("episodeId")] public long EpisodeId { get; set; }
        [JsonPropertyName("animeId")] public long AnimeId { get; set; }
        [JsonPropertyName("animeTitle")] public string? AnimeTitle { get; set; }
        [JsonPropertyName("episodeTitle")] public string? EpisodeTitle { get; set; }
        [JsonPropertyName("type")] public string? Type { get; set; }
        [JsonPropertyName("typeDescription")] public string? TypeDescription { get; set; }
        [JsonPropertyName("shift")] public int Shift { get; set; }
        [JsonPropertyName("imageUrl")] public string? ImageUrl { get; set; }
    }
}
