using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 获取弹幕内容的方法，可供控制器方法复用
    /// </summary>
    /// <param name="itemId">媒体项 ID</param>
    /// <param name="danmakuId">弹幕 ID</param>
    /// <param name="config">弹幕配置（已合并好的最终配置）</param>
    /// <returns>弹幕获取结果</returns>
    public async Task<DanmakuResult> GetDanmakuContentAsync(
        Guid? itemId,
        string? danmakuId,
        DanmakuConfig config)
    {
        string? matchedEpisodeTitle = null; // 用于记录匹配到的 episodeTitle（若有）
        // 如果没有提供 danmaku_id，则从 item_id 获取
        if (string.IsNullOrWhiteSpace(danmakuId))
        {
            if (itemId == null || itemId == Guid.Empty)
            {
                // 使用空数据走完整处理流程并返回内容
                _logger?.LogError("GetDanmakuContent: missing itemId and danmakuId, returning empty content");
                return BuildEmptyContentResult(config, matchedEpisodeTitle);
            }

            var item = _libraryManager.GetItemById(itemId.Value);
            if (item == null)
            {
                // 使用空数据走完整处理流程并返回内容
                _logger?.LogError("GetDanmakuContent: item {ItemId} not found, returning empty content", itemId);
                return BuildEmptyContentResult(config, matchedEpisodeTitle);
            }

            // 检查该itemId的ProviderIds["danmaku"]是否为空
            danmakuId = item.ProviderIds?.GetValueOrDefault("danmaku");
            if (string.IsNullOrWhiteSpace(danmakuId))
            {
                // 新增：优先尝试从数据库已有的匹配数据获取 animeId 与 offset，再请求番剧信息
                try
                {
                    var preferredId = GetPreferredContainerId(itemId.Value);
                    var matchData = await GetMatchDataByPreferredIdAsync(preferredId);
                    if (matchData != null && matchData.Value.AnimeId > 0)
                    {
                        string baseUrl = GetBaseUrl();
                        var bangumiPath = $"/api/v2/bangumi/{matchData.Value.AnimeId}";
                        var text = await SendWithCacheAsync(HttpMethod.Get, baseUrl, bangumiPath, null, null, null, requestCustomizer: null);
                        // 解析返回，检查["bangumi"]["episodes"]是否存在且为数组（仅检查存在性，具体使用留待后续）
                        try
                        {
                            using var doc = System.Text.Json.JsonDocument.Parse(text);
                            if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
                                doc.RootElement.TryGetProperty("bangumi", out var bangumiEl) &&
                                bangumiEl.ValueKind == System.Text.Json.JsonValueKind.Object &&
                                bangumiEl.TryGetProperty("episodes", out var epsEl) &&
                                epsEl.ValueKind == System.Text.Json.JsonValueKind.Array)
                            {
                                // 使用 Jellyfin item 的 IndexNumber 与保存的 offset 计算目标集数
                                int? indexNumber = null;
                                try
                                {
                                    if (item is MediaBrowser.Controller.Entities.BaseItem bi)
                                    {
                                        indexNumber = bi.IndexNumber;
                                    }
                                }
                                catch { }

                                if (indexNumber.HasValue)
                                {
                                    var targetNo = indexNumber.Value - matchData.Value.Offset;
                                    if (targetNo > 0)
                                    {
                                        foreach (var ep in epsEl.EnumerateArray())
                                        {
                                            if (ep.ValueKind != System.Text.Json.JsonValueKind.Object) continue;

                                            // 读取 episodeNumber（可能为字符串），尽量转换为 int
                                            int epNo = 0;
                                            if (ep.TryGetProperty("episodeNumber", out var noEl))
                                            {
                                                try
                                                {
                                                    if (noEl.ValueKind == System.Text.Json.JsonValueKind.Number)
                                                    {
                                                        if (noEl.TryGetInt32(out var n)) epNo = n;
                                                    }
                                                    else if (noEl.ValueKind == System.Text.Json.JsonValueKind.String)
                                                    {
                                                        var s = noEl.GetString();
                                                        if (!string.IsNullOrWhiteSpace(s) && int.TryParse(s, out var n)) epNo = n;
                                                    }
                                                }
                                                catch { }
                                            }

                                            if (epNo != targetNo) continue;

                                            // 读取 episodeId 与 episodeTitle
                                            long epId = 0;
                                            string? epTitle = null;
                                            if (ep.TryGetProperty("episodeId", out var idEl))
                                            {
                                                if (idEl.ValueKind == System.Text.Json.JsonValueKind.Number)
                                                {
                                                    idEl.TryGetInt64(out epId);
                                                }
                                                else if (idEl.ValueKind == System.Text.Json.JsonValueKind.String)
                                                {
                                                    var s = idEl.GetString();
                                                    if (!string.IsNullOrWhiteSpace(s) && long.TryParse(s, out var lid)) epId = lid;
                                                }
                                            }
                                            if (ep.TryGetProperty("episodeTitle", out var titleEl))
                                            {
                                                try
                                                {
                                                    if (titleEl.ValueKind == System.Text.Json.JsonValueKind.String)
                                                    {
                                                        epTitle = titleEl.GetString();
                                                    }
                                                }
                                                catch { }
                                            }

                                            if (epId > 0)
                                            {
                                                danmakuId = epId.ToString();
                                                matchedEpisodeTitle = epTitle;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        catch { /* 忽略解析异常，后续继续走自动匹配 */ }
                    }
                }
                catch { /* 忽略 DB/网络异常，继续自动匹配 */ }




                // 若仍未取得 danmakuId，再尝试自动网络匹配（需检查该库是否启用自动匹配）
                if (string.IsNullOrWhiteSpace(danmakuId))
                {
                    bool autoMatchEnabledForLibrary = false;
                    try
                    {
                        var enabledIds = Jellyfin.Plugin.DanmakuExtension.Plugin.Instance?.Configuration?.EnabledLibraryIds;
                        if (enabledIds != null && enabledIds.Count > 0)
                        {
                            var enabledGuids = new HashSet<Guid>(
                                enabledIds.Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                                          .Where(g => g != Guid.Empty));

                            if (enabledGuids.Count > 0)
                            {
                                // 复用已获取的 item，并使用 _libraryManager.GetCollectionFolders 与其他位置保持一致
                                var folders = _libraryManager.GetCollectionFolders(item);
                                foreach (var folder in folders)
                                {
                                    if (enabledGuids.Contains(folder.Id))
                                    {
                                        autoMatchEnabledForLibrary = true;
                                        break;
                                    }
                                }
                                try { _logger?.LogDebug("AutoMatch check: item {ItemId} folders=[{Folders}] enabled=[{Enabled}] result={Result}", itemId, string.Join(",", folders.Select(f => f.Id)), string.Join(",", enabledGuids), autoMatchEnabledForLibrary); } catch { }
                            }
                        }
                    }
                    catch { /* 忽略异常，视为未启用自动匹配 */ }

                    if (!autoMatchEnabledForLibrary)
                    {
                        // 未启用自动匹配：使用空数据走流程
                        _logger?.LogError("GetDanmakuContent: auto-match disabled for library, returning empty content (itemId={ItemId})", itemId);
                        return BuildEmptyContentResult(config, matchedEpisodeTitle);
                    }

                    var match = await TryAutoMatchDanmakuIdAsync(itemId.Value);
                    var autoMatchedId = match != null && match.EpisodeId > 0 ? match.EpisodeId.ToString() : null;
                    if (string.IsNullOrWhiteSpace(autoMatchedId))
                    {
                        // 自动匹配失败：使用空数据走流程
                        _logger?.LogError("GetDanmakuContent: auto-match failed for item {ItemId}, returning empty content", itemId);
                        return BuildEmptyContentResult(config, matchedEpisodeTitle);
                    }

                    danmakuId = autoMatchedId;
                    matchedEpisodeTitle = match!.EpisodeTitle;
                    // 将匹配到的数据持久化写回数据库
                    try
                    {
                        var preferredId = GetPreferredContainerId(itemId.Value);
                        var offset = await TryGetBangumiOffsetForItemAsync(itemId.Value);
                        await SaveMatchDataAsync(
                            preferredId,
                            match!.AnimeId,
                            match!.AnimeTitle,
                            match!.ImageUrl,
                            offset
                        );
                    }
                    catch (Exception ex)
                    {
                        // 持久化失败不影响主流程
                        System.Console.WriteLine($"Save match_data failed: {ex.Message}");
                    }
                }
            }
        }

        // 直接使用传入的配置


        string content;
        try
        {
            string baseUrl = GetBaseUrl();
            var path = $"/api/v2/comment/{danmakuId}";
            content = await SendWithCacheAsync(HttpMethod.Get, baseUrl, path, new Dictionary<string, string>
            {
                ["chConvert"] = config.ChConvert,
                ["withRelated"] = config.WithRelated
            }, null, null, requestCustomizer: null);
        }
        catch (HttpRequestException ex)
        {
            // 拉取弹幕失败：使用空数据走流程
            _logger?.LogError(ex, "GetDanmakuContent: fetch comments failed for danmakuId={DanmakuId}, returning empty content", danmakuId);
            return BuildEmptyContentResult(config, matchedEpisodeTitle);
        }
        catch (Exception ex)
        {
            // 其它异常：使用空数据走流程
            _logger?.LogError(ex, "GetDanmakuContent: unexpected error, returning empty content (danmakuId={DanmakuId})", danmakuId);
            return BuildEmptyContentResult(config, matchedEpisodeTitle);
        }




        // 若未能在此前步骤确定标题，尝试通过 danmakuId 反查：
        // 规则：去掉 danmakuId 的后 4 位得到 AnimeId，请求 /api/v2/bangumi/{AnimeId}，
        // 在返回的 bangumi.episodes 中用 episodeId 精确匹配，取该项的 episodeTitle。
        if (string.IsNullOrWhiteSpace(matchedEpisodeTitle) && !string.IsNullOrWhiteSpace(danmakuId))
        {
            try
            {
                var idStr = danmakuId.Trim();
                if (idStr.Length > 4)
                {
                    // 解析 danmakuId 为 long 以便精确比较（容错字符串类型）
                    long danmakuIdLong = 0;
                    long.TryParse(idStr, out danmakuIdLong);

                    var animeIdStr = idStr.Substring(0, idStr.Length - 4);
                    string baseUrl2 = GetBaseUrl();
                    var bangumiPath2 = $"/api/v2/bangumi/{animeIdStr}";
                    var text2 = await SendWithCacheAsync(HttpMethod.Get, baseUrl2, bangumiPath2, null, null, null, requestCustomizer: null);

                    using var doc2 = System.Text.Json.JsonDocument.Parse(text2);
                    if (doc2.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
                        doc2.RootElement.TryGetProperty("bangumi", out var b2) &&
                        b2.ValueKind == System.Text.Json.JsonValueKind.Object &&
                        b2.TryGetProperty("episodes", out var eps2) &&
                        eps2.ValueKind == System.Text.Json.JsonValueKind.Array)
                    {
                        foreach (var ep in eps2.EnumerateArray())
                        {
                            if (ep.ValueKind != System.Text.Json.JsonValueKind.Object) continue;

                            long epId2 = 0;
                            if (ep.TryGetProperty("episodeId", out var idEl2))
                            {
                                if (idEl2.ValueKind == System.Text.Json.JsonValueKind.Number)
                                {
                                    idEl2.TryGetInt64(out epId2);
                                }
                                else if (idEl2.ValueKind == System.Text.Json.JsonValueKind.String)
                                {
                                    var s2 = idEl2.GetString();
                                    if (!string.IsNullOrWhiteSpace(s2) && long.TryParse(s2, out var lid2)) epId2 = lid2;
                                }
                            }

                            if (danmakuIdLong != 0 && epId2 == danmakuIdLong ||
                                (danmakuIdLong == 0 && idStr.Equals(epId2.ToString(), StringComparison.Ordinal)))
                            {
                                if (ep.TryGetProperty("episodeTitle", out var titleEl2) && titleEl2.ValueKind == System.Text.Json.JsonValueKind.String)
                                {
                                    matchedEpisodeTitle = titleEl2.GetString();
                                }
                                break;
                            }
                        }
                    }
                }
            }
            catch { /* 容错：反查失败不影响主流程 */ }
        }

        // 解析 listJson 并处理弹幕
        List<Pakku.DanmuObject> all = await ParseStandardJsonAsync(content, itemId);
        content = ProcessDanmakuWithPakku(all, config, matchedEpisodeTitle, danmakuId);

        return new DanmakuResult
        {
            Success = true,
            Content = content
        };
    }

    private DanmakuResult BuildEmptyContentResult(DanmakuConfig config, string? episodeTitle)
    {
        var empty = new List<Pakku.DanmuObject>();
        var content = ProcessDanmakuWithPakku(empty, config, episodeTitle, "0");
        return new DanmakuResult
        {
            Success = true,
            Content = content
        };
    }
}
