
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 使用 Pakku 算法处理弹幕（直接接收 DanmakuConfig）
    /// </summary>
    public string ProcessDanmakuWithPakku(List<Pakku.DanmuObject> all, DanmakuConfig cfg, string? episodeTitle = null, string danmakuId = "0")
    {
        try
        {
            // 调用 Pakku 处理方法并统计执行时间
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var (representatives, stats) = Pakku.ProcessFromTestJsonWithStats(all, cfg);
            stopwatch.Stop();
            var pakku_ms = (int)stopwatch.ElapsedMilliseconds;

            // 构建响应数据结构
            var response = new
            {   
                episodeTitle = episodeTitle,
                episodeId = danmakuId,
                count = representatives.Count,
                original_total = stats.original_total,
                removed_count = stats.original_total - representatives.Count,
                source_stats = stats.source_stats,
                merge_counts = new
                {
                    identical = stats.merged_identical,
                    edit_distance = stats.merged_edit_distance,
                    pinyin = stats.merged_pinyin,
                    vector = stats.merged_vector

                },
                rule_counts = new
                {
                    whitelist = stats.whitelist_count,
                    blacklist = stats.blacklist_count,
                    forcelist = stats.forcelist_count
                },
                pakku_time = pakku_ms + "ms",
                settings = ExportConfigToDictionary(cfg),
                heatmap_data = stats.heatmap_data,
                comments = FormatComments(representatives,cfg.FontFamily,cfg.MarkStyle,cfg.MarkThreshold)
            };

            return System.Text.Json.JsonSerializer.Serialize(response, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "使用 Pakku 处理弹幕时发生错误");
            throw;
        }
    }

}
