

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region combine 聚类 // Pakku.Combine.cs
    // ======== combine（聚类） ========
    private sealed record Ir(DanmuObject obj, string str, int idx, string sim_reason, Cacheline cache);

    private static DanmuClusterOutput DoCombine(DanmuChunk<DanmuObject> chunk, DanmuChunk<DanmuObject> nextChunk, DanmakuConfig cfg, ParsedLists lists)
    {
        var ret = new DanmuClusterOutput();
        var danmus = ObjToIr(chunk.objs, cfg, lists, ret.stats, ret);
        var danmusNext = ObjToIr(nextChunk.objs, cfg, lists, null, ret);

        var THRESHOLD_MS = cfg.ThresholdSeconds * 1000.0;
        var nearby = new LinkedList<List<Ir>>(); // 每个元素是一个候选簇，First=最旧, Last=最近

        void ApplyCluster(List<Ir> irs)
        {
            if (irs.Count == 1)
            {
                ret.clusters.Add(new DanmuCluster
                {
                    peers = new List<DanmuObject> { irs[0].obj },
                    desc = new(),
                    chosen_str = irs[0].obj.content, // 单条用原文
                });
            }
            else
            {
                var cnts = new Dictionary<string, int>();
                int mostCnt = 0;
                var mostTexts = new List<string>();
                foreach (var ir in irs)
                {
                    var s = ir.str;
                    var c = 1 + (cnts.TryGetValue(s, out var v) ? v : 0);
                    cnts[s] = c;
                    if (c > mostCnt) { mostCnt = c; mostTexts = new() { s }; }
                    else if (c == mostCnt) { mostTexts.Add(s); }
                }
                string chosen = SelectMedianLength(mostTexts);
                ret.clusters.Add(new DanmuCluster
                {
                    peers = irs.Select(x => x.obj).ToList(),
                    desc = mostCnt > 1 ? new() { $"采用了出现 {mostCnt} 次的文本" } : new(),
                    chosen_str = chosen,
                });
            }
        }

        // 主段
        foreach (var dm in danmus)
        {
            while (true)
            {
                var firstNode = nearby.First;
                if (firstNode == null || dm.obj.time_ms - firstNode.Value[0].obj.time_ms <= THRESHOLD_MS) break;
                ApplyCluster(firstNode.Value);
                nearby.RemoveFirst();
            }

            // 找到可加入的最近簇
            bool joined = false;
            var node = nearby.Last;
            while (node != null)
            {
                var cand = node.Value;
                var reason = CompareWithIr(dm, cand, cfg);
                if (reason != MergeReason.None)
                {
                    cand.Add(dm with { sim_reason = "SIM" });
                    // 记录原因（统计在 ret.stats 中）
                    if (reason == MergeReason.Identical) ret.stats.merged_identical++;
                    else if (reason == MergeReason.EditDistance) ret.stats.merged_edit_distance++;
                    else if (reason == MergeReason.Pinyin) ret.stats.merged_pinyin++;
                    else if (reason == MergeReason.Vector) ret.stats.merged_vector++;
                    joined = true;
                    break;
                }
                node = node.Previous;
            }

            if (!joined)
            {
                nearby.AddLast(new List<Ir> { dm });
            }
        }

        // 边界与 next 段（index 锁定：只允许加入现有簇，不新建）
        foreach (var dm in danmusNext)
        {
            while (true)
            {
                var firstNode = nearby.First;
                if (firstNode == null) break;
                if (dm.obj.time_ms - firstNode.Value[0].obj.time_ms <= THRESHOLD_MS) break;
                ApplyCluster(firstNode.Value);
                nearby.RemoveFirst();
            }

            bool joined = false;
            var node = nearby.Last;
            while (node != null)
            {
                var cand = node.Value;
                var reason = CompareWithIr(dm, cand, cfg);
                if (reason != MergeReason.None)
                {
                    cand.Add(dm with { sim_reason = "SIM" });
                    if (reason == MergeReason.Identical) ret.stats.merged_identical++;
                    else if (reason == MergeReason.EditDistance) ret.stats.merged_edit_distance++;
                    else if (reason == MergeReason.Pinyin) ret.stats.merged_pinyin++;
                    else if (reason == MergeReason.Vector) ret.stats.merged_vector++;
                    joined = true; break;
                }
                node = node.Previous;
            }
            if (joined) continue;
            // 锁定状态：不新建
        }

        // 收尾
        while (nearby.First != null) { ApplyCluster(nearby.First.Value); nearby.RemoveFirst(); }
        return ret;
    }

    private static List<Ir> ObjToIr(List<DanmuObject> objs, DanmakuConfig cfg, ParsedLists lists, Stats? stats, DanmuClusterOutput ret)
    {
        var whitelisted = CompileWhitelist(lists);
        var blacklisted = CompileBlacklist(lists);
        var rs = new List<Ir>(objs.Count);
        for (int idx = 0; idx < objs.Count; idx++)
        {
            var o = objs[idx];

            // 过滤类型（字幕池/特效/代码/BAS 等）——本数据无 pool/mode 7/8/9 额外语义，可按需要扩展
            if (o.mode == 7) { if (stats != null) stats.ignored_type++; var cacheIgn = BuildCacheline(o.content, o.mode, idx, cfg); rs.Add(MakeIgnCluster(idx, o, cacheIgn, ret, "已忽略特殊弹幕")); continue; }
            if (o.mode == 8) { if (stats != null) stats.ignored_type++; var cacheIgn = BuildCacheline(o.content, o.mode, idx, cfg); rs.Add(MakeIgnCluster(idx, o, cacheIgn, ret, "代码弹幕")); continue; }
            if (o.mode == 9) { if (stats != null) stats.ignored_type++; var cacheIgn = BuildCacheline(o.content, o.mode, idx, cfg); rs.Add(MakeIgnCluster(idx, o, cacheIgn, ret, "BAS弹幕")); continue; }

            var dispStr = TrimDisp(o.mode == 7 && o.content.StartsWith("[") ? ExtractSpecial(o.content) : o.content);

            if (whitelisted(dispStr))
            {
                if (stats != null) { stats.whitelist_count++; }
                var cacheIgn = BuildCacheline(dispStr, o.mode, idx, cfg);
                rs.Add(MakeIgnCluster(idx, o, cacheIgn, ret, "命中白名单"));
                continue;
            }

            var matched = o.mode is not (8 or 9) ? blacklisted(dispStr) : null;
            if (matched != null)
            {
                if (stats != null) { stats.blacklist_count++; }
                ret.deleted_chunk.Add(new DanmuObjectDeleted
                {
                    cid = o.cid,
                    time_ms = o.time_ms,
                    mode = o.mode,
                    color = o.color,
                    uid = o.uid,
                    content = o.content,
                    pakku = new PakkuDeleted { deleted_reason = "命中黑名单：" + matched }
                });
                continue;
            }

            var (taolu, detaolued) = DeTaolu(cfg, lists, dispStr);
            if (taolu)
            {
                if (stats != null)
                {
                    stats.num_taolu_matched++;
                    stats.forcelist_count++;
                }
            }

            var cache = BuildCacheline(detaolued, o.mode, idx, cfg);
            rs.Add(new Ir(o, detaolued, idx, "ORIG", cache));
        }
        return rs.Where(x => x != null).ToList();
    }



    private const int HashMod = 1007;
    private const int PinyinBase = 0xE000;

    private static Cacheline BuildCacheline(string text, int mode, int idx, DanmakuConfig cfg)
    {
        var c = new Cacheline();
        foreach (char ch in text)
        {
            ushort u = ch;
            c.Original.Add(u);
            c.StringCounts[u] = c.StringCounts.GetValueOrDefault(u, 0) + 1;
        }
        c.StringContainerLen = c.Original.Count;

        if (cfg.UsePinyin)
        {
            foreach (var u in c.Original)
            {
                if (PinyinDict.TryGetValue(u, out var py))
                {
                    if (py.Item1 != 0) { ushort k = (ushort)(PinyinBase + py.Item1); c.PinyinCounts[k] = c.PinyinCounts.GetValueOrDefault(k, 0) + 1; }
                    if (py.Item2 != 0) { ushort k = (ushort)(PinyinBase + py.Item2); c.PinyinCounts[k] = c.PinyinCounts.GetValueOrDefault(k, 0) + 1; }
                }
                else
                {
                    ushort x = u;
                    if (x >= 'A' && x <= 'Z') x = (ushort)(x + ('a' - 'A'));
                    c.PinyinCounts[x] = c.PinyinCounts.GetValueOrDefault(x, 0) + 1;
                }
            }
        }
        c.PinyinContainerLen = c.PinyinCounts.Sum(kv => kv.Value);

    if (cfg.MaxCosine <= 100 && c.Original.Count > 0)
        {
            uint last = (uint)(c.Original[^1] % HashMod);
            foreach (var u in c.Original)
            {
                uint cur = (uint)(u % HashMod);
                uint key = last * (uint)HashMod + cur;
                c.GramCounts[key] = c.GramCounts.GetValueOrDefault(key, 0) + 1;
                last = cur;
            }
        }

        return c;
    }

    private static Ir MakeIgnCluster(int idx, DanmuObject obj, Cacheline cache, DanmuClusterOutput ret, string desc)
    {
        // 与 pakku 一致：忽略类直接形成“单簇”，chosen_str 用原文
        ret.clusters.Add(new DanmuCluster
        {
            peers = new() { obj },
            desc = new() { desc },
            chosen_str = obj.content,
        });
        return new Ir(obj, obj.content, idx, "IGN", cache);
    }

    #endregion



}
