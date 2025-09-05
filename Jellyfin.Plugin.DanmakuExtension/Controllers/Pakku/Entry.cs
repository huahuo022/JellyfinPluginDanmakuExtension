
using System.Text.Json;
using System.Runtime.InteropServices;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region 入口与调度 // Pakku.Entry.cs
    internal static (List<DanmuObjectRepresentative> reps, Stats stats) ProcessFromTestJsonWithStats(List<DanmuObject> all, DanmakuConfig? cfg = null)
    {
        cfg ??= new DanmakuConfig();

        var clusterMap = new Dictionary<int, List<DanmuCluster>>();
        var repsOut = new Dictionary<int, DanmuChunk<DanmuObjectRepresentative>>();
        var stats = new Stats();

        var lists = BuildParsedLists(cfg);
        // 解析输入（已抽象到独立方法，便于未来多格式扩展）

        // var all = ParseStandardJson(inputData);


        var sourceStats = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        sourceStats.EnsureCapacity(all.Count);

        // 若配置了来源黑名单，则在统计同时过滤 all
        HashSet<string>? blackSourceSet = null;
        List<DanmuObject>? filteredAll = null;
        if (lists.BlackSourceList != null && lists.BlackSourceList.Count > 0)
        {
            blackSourceSet = new HashSet<string>(lists.BlackSourceList, StringComparer.OrdinalIgnoreCase);
            filteredAll = new List<DanmuObject>(all.Count);
        }

        foreach (var dm in all)
        {
            var key = string.IsNullOrEmpty(dm.pool) ? "unknown" : dm.pool;
            // 统计（基于未删减数据）
            ref int count = ref CollectionsMarshal.GetValueRefOrAddDefault(sourceStats, key, out bool exists);
            if (exists) count++;
            else count = 1;

            // 过滤（仅当配置了黑名单时执行）
            if (filteredAll != null)
            {
                if (blackSourceSet == null || !blackSourceSet.Contains(key))
                {
                    filteredAll.Add(dm);
                }
            }
        }

        if (filteredAll != null) all = filteredAll;

        if (!cfg.EnableCombine)
        {
            // 不启用合并，直接输出
            var reps = all.Select(o => new DanmuObjectRepresentative
            {
                cid = o.cid,
                content = o.content,
                time_ms = o.time_ms,
                mode = o.mode,
                fontsize = cfg.FontSize, // 使用配置的默认字号
                color = o.color,
                mark_count = 0 // 不进行合并，标记数为 0
            }).ToList();

            stats.original_total = all.Count;
            stats.source_stats = sourceStats;

            // 生成热力图数据（根据配置: off | combined | original）
            GenerateHeatmapData(cfg, reps, all, stats);


            return (reps, stats);
        }

        // 切块（按时间排序，每块 MAX_CHUNK_SIZE）
        var sorted = all.OrderBy(x => x.time_ms).ToList();
        var chunks = new List<DanmuChunk<DanmuObject>>();
        for (int i = 0; i < sorted.Count; i += cfg.MaxChunkSize)
        {
            chunks.Add(new DanmuChunk<DanmuObject> { objs = sorted.Skip(i).Take(cfg.MaxChunkSize).ToList() });
        }

        // 顺序“调度”：对每段调用 combine，然后 post
        for (int seg = 0; seg < chunks.Count; seg++)
        {
            var chunk = chunks[seg];
            var next = (seg + 1 < chunks.Count) ? chunks[seg + 1] : new DanmuChunk<DanmuObject>();
            double maxNextTime = chunk.objs.Count > 0 ? chunk.objs[^1].time_ms + cfg.ThresholdSeconds * 1000 : 0;
            var nextFiltered = new DanmuChunk<DanmuObject>
            {
                objs = next.objs.Where(o => o.time_ms < maxNextTime).ToList(),
                extra = next.extra
            };

            var res = DoCombine(chunk, nextFiltered, cfg, lists);
            // 存入 cluster
            clusterMap[seg] = res.clusters;
            // 汇总段内统计到全局 stats
            stats.merged_identical += res.stats.merged_identical;
            stats.merged_edit_distance += res.stats.merged_edit_distance;
            stats.merged_pinyin += res.stats.merged_pinyin;
            stats.merged_vector += res.stats.merged_vector;
            // stats.ignored_type += res.stats.ignored_type;
            stats.whitelist_count += res.stats.whitelist_count;
            stats.blacklist_count += res.stats.blacklist_count;
            stats.forcelist_count += res.stats.forcelist_count;

            // 生成 post 结果（需要上一段 cluster 用于密度预热）
            var prevClusters = seg == 0 ? new List<DanmuCluster>() : clusterMap.GetValueOrDefault(seg - 1, new List<DanmuCluster>());
            var reps = PostCombine(res.clusters, prevClusters, chunk, cfg, stats, res.deleted_chunk);
            repsOut[seg] = reps;
        }

        // 合并输出
        var finalList = new List<DanmuObjectRepresentative>();
        foreach (var seg in Enumerable.Range(0, chunks.Count))
        {
            if (repsOut.TryGetValue(seg, out var chunkRep))
                finalList.AddRange(chunkRep.objs);
        }

        // 将弹幕来源统计与原始总条数添加到 stats 中
        stats.source_stats = sourceStats;
        stats.original_total = all.Count;

        // 生成热力图数据（根据配置: off | combined | original）
        GenerateHeatmapData(cfg, finalList, all, stats);


        return (finalList, stats);
    }

    #endregion

}
