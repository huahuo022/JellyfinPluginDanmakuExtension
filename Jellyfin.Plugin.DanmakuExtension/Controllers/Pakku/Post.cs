
namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region post_combine 后处理 // Pakku.Post.cs
    // ======== 后处理 ========
    private static DanmuChunk<DanmuObjectRepresentative> PostCombine(
        List<DanmuCluster> inputClusters,
        List<DanmuCluster> prevClusters,
    DanmuChunk<DanmuObject> inputChunk,
    DanmakuConfig cfg,
        Stats stats,
        List<DanmuObjectDeleted> deleted
    )
    {
        // 初始代表弹幕列表（按簇生成）
        var outDanmus = new List<DanmuObjectRepresentative>();

        // 将每个簇转换为代表弹幕
        foreach (var c in inputClusters)
        {
            if (c.peers.Count == 0) continue;
            // 代表取 peers[0] 的时间/模式作为基础
            var rep = new DanmuObjectRepresentative
            {
                cid = c.peers[0].cid,
                time_ms = c.peers[0].time_ms,
                mode = c.peers[0].mode,
                color = c.peers[0].color,
                uid = c.peers[0].uid,
                fontsize = c.peers[0].fontsize,
                weight = c.peers.Max(p => p.weight),
                content = c.chosen_str,
                extra = new Extra { proto_animation = c.peers[0].extra.proto_animation },
                pakku = new PakkuMeta { desc = new List<string>(c.desc), peers = c.peers }
            };

            // 模式提升：底部(4)或顶部(5)优先
            if (cfg.ModeElevation)
            {
                int maxMode = rep.mode;
                foreach (var p in c.peers)
                {
                    if (p.mode == 4) { maxMode = 4; break; }
                    if (p.mode == 5 && maxMode != 4) maxMode = 5;
                }
                rep.mode = maxMode;
            }

            // 放大（按簇大小）
            rep.fontsize = Math.Max(10, rep.fontsize > 0 ? rep.fontsize : cfg.FontSize);
            if (cfg.Enlarge)
            {
                double rate = CalcEnlargeRate(c.peers.Count);
                int newSize = (int)Math.Ceiling(rep.fontsize * rate);
                if (rate > 1.001) { rep.fontsize = newSize; rep.pakku.desc.Add($"已放大 {rate:F2} 倍：合并数量为 {c.peers.Count}"); stats.modified_enlarge++; }
            }

            // 记录合并次数，交由前端渲染；不再在后端插入标记文本
            rep.mark_count = c.peers.Count;
            rep.pakku.disp_str = TrimDisp(rep.content);

            // 静态顶/底弹幕过宽时转换为滚动
            if (cfg.ScrollThreshold > 0 && (rep.mode == 4 || rep.mode == 5))
            {
                double width = ApproxTextWidth(rep.pakku.disp_str, rep.fontsize);
                if (width > cfg.ScrollThreshold)
                {
                    string prefix = rep.mode == 4 ? "↓" : "↑";
                    rep.mode = 1;
                    rep.content = prefix + rep.content;
                    rep.pakku.disp_str = prefix + rep.pakku.disp_str;
                    rep.pakku.desc.Add($"转换为滚动弹幕：宽度为 {width:F0} px");
                    stats.modified_scroll++;
                }
            }

            outDanmus.Add(rep);
        }

        // 屏幕密度：预热（使用上一段的代表）
        double onscreen = 0;
        var subtractQueue = new Queue<(double expire, double dv)>();
        var needDisp = cfg.ShrinkThreshold > 0 || cfg.DropThreshold > 0 || cfg.ScrollThreshold > 0;
        if (needDisp)
        {
            foreach (var c in prevClusters)
            {
                if (c.peers.Count == 0) continue;
                var rep = new DanmuObjectRepresentative { content = c.chosen_str, fontsize = c.peers[0].fontsize, mode = c.peers[0].mode, time_ms = c.peers[0].time_ms };
                double dv0 = DispVal(rep);
                onscreen += dv0;
                subtractQueue.Enqueue((rep.time_ms + DISPVAL_TIME_THRESHOLD, dv0));
            }
        }

        // 按时间处理代表，进行 drop/shrink/scroll 等
        // 注意：需要构建保留列表，命中 drop 的不应出现在最终输出
        var keptDanmus = new List<DanmuObjectRepresentative>(outDanmus.Count);
        foreach (var dm in outDanmus.OrderBy(x => x.time_ms))
        {
            if (needDisp)
            {
                // 更新密度值（过期减去）
                while (subtractQueue.Count > 0 && dm.time_ms > subtractQueue.Peek().expire)
                {
                    var item = subtractQueue.Dequeue();
                    onscreen -= item.dv;
                }

                // 计算当前弹幕贡献
                double dv = DispVal(dm);
                // 判定丢弃
                if (cfg.DropThreshold > 0 && onscreen > cfg.DropThreshold)
                {
                    stats.deleted_dispval++;
                    // 记录删除（与 pakku 一致输出格式）
                    deleted.Add(new DanmuObjectDeleted
                    {
                        cid = dm.cid,
                        time_ms = dm.time_ms,
                        mode = dm.mode,
                        color = dm.color,
                        uid = dm.uid,
                        content = dm.content,
                        pakku = new PakkuDeleted { deleted_reason = "弹幕密度" }
                    });
                    continue; // 丢弃该条（不加入 kept）
                }

                // 入场并记录过期
                onscreen += dv;
                subtractQueue.Enqueue((dm.time_ms + DISPVAL_TIME_THRESHOLD, dv));

                // 判定缩小
                if (cfg.ShrinkThreshold > 0 && onscreen > cfg.ShrinkThreshold)
                {
                    double rate = Math.Min(Math.Pow(onscreen, DISPVAL_POWER) / Math.Max(1, dv), SHRINK_MAX_RATE);
                    if (rate > 1.001)
                    {
                        dm.fontsize = (int)Math.Max(10, dm.fontsize / rate);
                        dm.pakku.desc.Add($"已缩小 {rate:F2} 倍：原弹幕密度为 {onscreen:F1}");
                        stats.modified_shrink++;
                    }
                }

                stats.num_max_dispval = Math.Max(stats.num_max_dispval, onscreen);
            }

            // 未命中 drop 的保留到输出
            keptDanmus.Add(dm);
        }

        stats.num_onscreen_danmu += keptDanmus.Count;
        return new DanmuChunk<DanmuObjectRepresentative> { objs = keptDanmus, extra = inputChunk.extra };
    }
    #endregion



}
