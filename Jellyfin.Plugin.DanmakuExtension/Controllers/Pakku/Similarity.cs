

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region 相似度计算 // Pakku.Similarity.cs

    // ======== 相似度检测 ========
    private enum MergeReason { None, Identical, EditDistance, Pinyin, Vector }

    private static MergeReason CompareWithIr(Ir curIr, List<Ir> candidate, DanmakuConfig cfg)
    {
        // 与候选簇的“最近加入的一条”进行比对（近似度最高）
        var q = candidate[^1];

        var pCache = curIr.cache;

        // 先在整个簇内进行“严格相同”检测（不受 CrossMode 限制）
        foreach (var ir in candidate)
        {
            if (pCache.Original.SequenceEqual(ir.cache.Original)) return MergeReason.Identical;
        }

        // 非完全相同再考虑 CrossMode 限制
        if (!cfg.CrossMode && curIr.obj.mode != q.obj.mode) return MergeReason.None;

        var qCache = q.cache;

        uint lenSum = (uint)(pCache.Original.Count + qCache.Original.Count);

        // 编辑距离
        int editDis = 0;
        bool calcEdit = Math.Abs(pCache.StringContainerLen - qCache.StringContainerLen) <= cfg.MaxDistance;
        if (calcEdit)
        {
            editDis = EditDistance(pCache.StringCounts, qCache.StringCounts);
            bool ok = lenSum < Math.Max(1, cfg.MaxDistance * 2)
                ? editDis < cfg.MaxDistance * lenSum / Math.Max(1, cfg.MaxDistance * 2)
                : editDis <= cfg.MaxDistance;
            if (ok) return MergeReason.EditDistance;
        }

        // 拼音距离
        if (cfg.UsePinyin && Math.Abs(pCache.PinyinContainerLen - qCache.PinyinContainerLen) <= cfg.MaxDistance)
        {
            int pyDis = EditDistance(pCache.PinyinCounts, qCache.PinyinCounts);
            bool ok = lenSum < Math.Max(1, cfg.MaxDistance * 2)
                ? pyDis < cfg.MaxDistance * lenSum / Math.Max(1, cfg.MaxDistance * 2)
                : pyDis <= cfg.MaxDistance;
            if (ok) return MergeReason.Pinyin;
        }

        // 余弦
        if (cfg.MaxCosine <= 100 && !(calcEdit && editDis >= lenSum))
        {
            int cosine = (int)(100 * CosineDistance(pCache.GramCounts, qCache.GramCounts));
            if (cosine >= cfg.MaxCosine) return MergeReason.Vector;
        }

        return MergeReason.None;
    }



    private static int EditDistance(Dictionary<ushort, int> p, Dictionary<ushort, int> q)
    {
        // 遍历较小集合并直接查询另一个字典，避免构造临时 keys 集合
        int ans = 0;
        if (p == null || q == null) return ans;

        // 遍历 p 的键并计算差值
        foreach (var kv in p)
        {
            int qv = q.GetValueOrDefault(kv.Key, 0);
            ans += Math.Abs(kv.Value - qv);
        }
        // 对 q 中在 p 中不存在的键，加上其值（因为 abs(0 - v) = v）
        if (q.Count > p.Count)
        {
            foreach (var kv in q)
            {
                if (!p.ContainsKey(kv.Key)) ans += Math.Abs(kv.Value);
            }
        }
        else if (q.Count <= p.Count)
        {
            foreach (var kv in q)
            {
                if (!p.ContainsKey(kv.Key)) ans += Math.Abs(kv.Value);
            }
        }

        return ans;
    }

    private static float CosineDistance(Dictionary<uint, int> p, Dictionary<uint, int> q)
    {
        // 遍历较小的向量计算点积；分别计算各自的平方和，避免合并 keys
        if (p == null || q == null || p.Count == 0 || q.Count == 0) return 0f;

        long dot = 0;
        // 遍历较小字典以减少哈希查找
        if (p.Count <= q.Count)
        {
            foreach (var kv in p)
            {
                int a = kv.Value;
                int b = q.GetValueOrDefault(kv.Key, 0);
                dot += (long)a * b;
            }
        }
        else
        {
            foreach (var kv in q)
            {
                int b = kv.Value;
                int a = p.GetValueOrDefault(kv.Key, 0);
                dot += (long)a * b;
            }
        }

        long yy = 0, zz = 0;
        foreach (var kv in p) yy += (long)kv.Value * kv.Value;
        foreach (var kv in q) zz += (long)kv.Value * kv.Value;

        if (yy == 0 || zz == 0) return 0f;

        double res = (double)dot * (double)dot / ((double)yy * (double)zz);
        return (float)res;
    }
    #endregion

}
