
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{

    #region 列表配置 ParsedLists 与构建 // Pakku.Lists.cs
    // ======== 列表配置（将 4 个 JSON 列表解析后的结果集中到一个类） ========
    public sealed class ParsedLists
    {
        // forcelist: [{ pattern, replace }]
        public List<(string pattern, string replace)> ForceList { get; set; } = new();
        // whitelist: [{ isRegex, pattern }]
        public List<(bool isRegex, string pattern)> WhiteList { get; set; } = new();
        // blacklist: [{ isRegex, pattern }]
        public List<(bool isRegex, string pattern)> BlackList { get; set; } = new();
        // black_source_list: ["bilibili", "dandanplay", ...]
        public List<string> BlackSourceList { get; set; } = new();
    }

    // 从 DanmakuConfig 构造解析后的列表
    private static ParsedLists BuildParsedLists(DanmakuConfig c)
    {
        return new ParsedLists
        {
            ForceList = ParseForcelistFromJson(c.ForcelistJson),
            WhiteList = ParseWhitelistFromJson(c.WhitelistJson),
            BlackList = ParseBlacklistFromJson(c.BlacklistJson),
            BlackSourceList = ParseBlackSourceListFromJson(c.BlackSourceListJson),
        };
    }
    /// <summary>
    /// Pakku 配置编译缓存（运行时生成，不参与序列化）。
    /// 迁回为 Pakku 的内部类，避免泄露到命名空间层级。
    /// </summary>
    private sealed class CompiledCache
    {
        internal List<(Regex regex, string replace)>? FORCELIST_COMPILED;
        internal List<(bool isRegex, Regex? regex, string? plain)>? WHITELIST_COMPILED;
        internal List<(bool isRegex, Regex? regex, string? plain)>? BLACKLIST_COMPILED;
        // 用于避免不同配置相互污染的签名（当配置变化时触发重建）
        internal string? FORCELIST_SIG;
        internal string? WHITELIST_SIG;
        internal string? BLACKLIST_SIG;
    }
    // 运行时预编译缓存（从配置项中移除，改为 Pakku 级别的单例缓存）
    private static readonly CompiledCache RuntimeCache = new();
    #endregion




}
