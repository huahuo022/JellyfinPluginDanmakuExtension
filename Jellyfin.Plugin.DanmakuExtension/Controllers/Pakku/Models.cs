
namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{



    #region 数据模型 // Pakku.Models.cs
    // ======== 数据类型 ========
    public class DanmuObject
    {
        public long cid { get; set; }
        public double time_ms { get; set; }
        public int mode { get; set; } // 1滚动/5顶部/4底部/7特效/8代码/9BAS 等
        public int color { get; set; }
        public string uid { get; set; } = string.Empty;
        public string content { get; set; } = string.Empty;

        // 显示相关（post 阶段使用）
        public int fontsize { get; set; } = 0;
        public int weight { get; set; } = 0;
        public string pool { get; set; } = string.Empty; // 表示字幕源

        // 合并标记：改为记录簇内所有原始弹幕的 time_ms 列表；普通弹幕默认为仅包含自身 time_ms
        public List<double> mark_count { get; set; } = new();

        public Extra extra { get; set; } = new();
        public PakkuMeta pakku { get; set; } = new();
    }

    public sealed class Extra
    {
        public string proto_animation { get; set; } = ""; // 特效占位
    }

    public sealed class PakkuMeta
    {
        public string sim_reason { get; set; } = string.Empty; // 合并理由
        public string disp_str { get; set; } = string.Empty;    // 规范化显示串
        public List<string> desc { get; set; } = new();         // 说明
        public List<DanmuObject> peers { get; set; } = new();   // 所属簇（post 阶段）
    }

    public sealed class DanmuObjectDeleted : DanmuObject
    {
        public new PakkuDeleted pakku { get; set; } = new();
    }

    public sealed class PakkuDeleted
    {
        public string deleted_reason { get; set; } = string.Empty;
    }

    public sealed class DanmuChunk<T>
    {
        public List<T> objs { get; set; } = new();
        public Dictionary<string, object> extra { get; set; } = new();
    }

    public sealed class DanmuCluster
    {
        public List<DanmuObject> peers { get; set; } = new();
        public List<string> desc { get; set; } = new();
        public string chosen_str { get; set; } = string.Empty;
    }

    public sealed class DanmuClusterOutput
    {
        public List<DanmuCluster> clusters { get; set; } = new();
        public Stats stats { get; set; } = new();
        public List<DanmuObjectDeleted> deleted_chunk { get; set; } = new();
    }


    private sealed class Cacheline
    {
        public List<ushort> Original = new();
        public Dictionary<ushort, int> StringCounts = new();
        public Dictionary<ushort, int> PinyinCounts = new();
        public Dictionary<uint, int> GramCounts = new();
        public int StringContainerLen; public int PinyinContainerLen;
    }



    public sealed class DanmuObjectRepresentative : DanmuObject { }

    public sealed class HeatmapData
    {
        public int start_time_seconds { get; set; }           // 开始时间（秒）
        public int end_time_seconds { get; set; }             // 结束时间（秒）
        public double average_density { get; set; } = 0;      // 平均密度值
    }

    public sealed class Stats
    {
        // 仅保留需要的三个列表命中统计与四类合并原因统计，其它旧的 list 相关统计字段已精简移除
        public int ignored_type { get; set; } = 0; // 非名单类（类型过滤）暂时保留，可用于后续需要
        public int whitelist_count { get; set; } = 0;       // 命中白名单次数
        public int blacklist_count { get; set; } = 0;       // 命中黑名单次数
        public int forcelist_count { get; set; } = 0;       // 命中替换名单次数

        public int num_taolu_matched { get; set; } = 0;
        public int modified_enlarge { get; set; } = 0;
        public int modified_shrink { get; set; } = 0;
        public int modified_scroll { get; set; } = 0;
        public double num_max_dispval { get; set; } = 0;
        public int num_onscreen_danmu { get; set; } = 0;
        public int deleted_dispval { get; set; } = 0;

        // 合并原因计数
        public int merged_identical { get; set; } = 0;        // 内容相同
        public int merged_edit_distance { get; set; } = 0;    // 编辑距离近似
        public int merged_pinyin { get; set; } = 0;           // 拼音近似
        public int merged_vector { get; set; } = 0;           // 词频向量近似（余弦）

        // 解析后有效弹幕总数（已应用来源黑名单过滤后的数量）
        public int original_total { get; set; } = 0;


        // 热力图数据
        public Dictionary<int, HeatmapData> heatmap_data { get; set; } = new();
    }
    #endregion

    public sealed class SourceStatItem
    {
        public string source_name { get; set; } = string.Empty;
        public int count { get; set; } = 0;
        public string type { get; set; } = string.Empty;   // 预留（可与 ext_source 的类型对应）
        public string source { get; set; } = string.Empty; // 预留（可与 ext_source 的路径/URL 对应）
        public bool enable { get; set; } = true;           // 预留（可与 ext_source 的启用状态对应）
    }


}
