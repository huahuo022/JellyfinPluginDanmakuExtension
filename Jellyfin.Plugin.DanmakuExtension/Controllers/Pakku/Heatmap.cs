using System.Text.Json;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{

    #region 热力图 // Pakku.Heatmap.cs
    // ======== 热力图数据生成 ========
    private const int HEATMAP_INTERVAL_SECONDS = 5; // 固定时间段间隔（秒）

    private static void GenerateHeatmapData(string mode, List<DanmuObjectRepresentative> representatives, List<DanmuObject> originalDanmus, Stats stats)
    {
        var intervalSeconds = HEATMAP_INTERVAL_SECONDS;
        var densityByTimeSlot = new Dictionary<int, (double totalDensity, int count)>();
        bool useOriginal = string.Equals(mode, "original", StringComparison.OrdinalIgnoreCase);
        IEnumerable<DanmuObject> source = useOriginal ? originalDanmus : representatives;
        foreach (var dm in source)
        {
            int timeSlot = (int)(dm.time_ms / 1000 / intervalSeconds);
            var density = DispVal(dm);
            if (!densityByTimeSlot.TryGetValue(timeSlot, out var current)) current = (0, 0);
            densityByTimeSlot[timeSlot] = (current.totalDensity + density, current.count + 1);
        }

        // 转换为最终的热力图数据
        var heatmapData = new Dictionary<int, HeatmapData>();
        foreach (var kvp in densityByTimeSlot)
        {
            var timeSlot = kvp.Key;
            var (totalDensity, count) = kvp.Value;

            heatmapData[timeSlot] = new HeatmapData
            {
                start_time_seconds = timeSlot * intervalSeconds,
                end_time_seconds = (timeSlot + 1) * intervalSeconds,
                average_density = count > 0 ? totalDensity / count : 0
            };
        }

        stats.heatmap_data = heatmapData;
    }



    #endregion
}
