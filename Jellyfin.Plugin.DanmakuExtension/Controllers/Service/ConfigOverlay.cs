using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    // ===== 映射表定义 =====
    private sealed record FieldMap(
        string JsonKey,
        string PropertyName,
        Type DataType,
        Action<DanmakuConfig, string> Setter,
        Func<DanmakuConfig, object?> Getter
    );

    // 统一的字段映射表（便于双向转换与减少重复代码）
    private static readonly FieldMap[] s_fieldMaps = new[]
    {
        // string 类
        new FieldMap("chConvert", nameof(DanmakuConfig.ChConvert), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.ChConvert = v; }, c=>c.ChConvert),
        new FieldMap("withRelated", nameof(DanmakuConfig.WithRelated), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.WithRelated = v; }, c=>c.WithRelated),
        new FieldMap("font_family", nameof(DanmakuConfig.FontFamily), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.FontFamily = v; }, c=>c.FontFamily),
        new FieldMap("force_list", nameof(DanmakuConfig.ForcelistJson), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.ForcelistJson = v; }, c=>c.ForcelistJson),
        new FieldMap("white_list", nameof(DanmakuConfig.WhitelistJson), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.WhitelistJson = v; }, c=>c.WhitelistJson),
        new FieldMap("black_list", nameof(DanmakuConfig.BlacklistJson), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.BlacklistJson = v; }, c=>c.BlacklistJson),
        new FieldMap("black_source_list", nameof(DanmakuConfig.BlackSourceListJson), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.BlackSourceListJson = v; }, c=>c.BlackSourceListJson),
        new FieldMap("enable_heatmap", nameof(DanmakuConfig.EnableHeatmap), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.EnableHeatmap = v; }, c=>c.EnableHeatmap),
        new FieldMap("mark_style", nameof(DanmakuConfig.MarkStyle), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.MarkStyle = v; }, c=>c.MarkStyle),


        // int / double / bool
        new FieldMap("font_size", nameof(DanmakuConfig.FontSize), typeof(int), (c,v)=>{ if(int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x)) c.FontSize = x; }, c=>c.FontSize),
        new FieldMap("opacity", nameof(DanmakuConfig.Opacity), typeof(int), (c,v)=>{ if(int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x)) c.Opacity = x; }, c=>c.Opacity),
        new FieldMap("speed", nameof(DanmakuConfig.Speed), typeof(int), (c,v)=>{ if(int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x)) c.Speed = x; }, c=>c.Speed),
        new FieldMap("display_top_pct", nameof(DanmakuConfig.DisplayTopPct), typeof(int), (c,v)=>{ if(int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x)) c.DisplayTopPct = x; }, c=>c.DisplayTopPct),
        new FieldMap("display_bottom_pct", nameof(DanmakuConfig.DisplayBottomPct), typeof(int), (c,v)=>{ if(int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out var x)) c.DisplayBottomPct = x; }, c=>c.DisplayBottomPct),
        new FieldMap("enable_combine", nameof(DanmakuConfig.EnableCombine), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.EnableCombine = x; }, c=>c.EnableCombine),
        new FieldMap("threshold_seconds", nameof(DanmakuConfig.ThresholdSeconds), typeof(double), (c,v)=>{ if(double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out var x)) c.ThresholdSeconds = x; }, c=>c.ThresholdSeconds),
        new FieldMap("max_distance", nameof(DanmakuConfig.MaxDistance), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.MaxDistance = x; }, c=>c.MaxDistance),
        new FieldMap("max_cosine", nameof(DanmakuConfig.MaxCosine), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.MaxCosine = x; }, c=>c.MaxCosine),
        new FieldMap("use_pinyin", nameof(DanmakuConfig.UsePinyin), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.UsePinyin = x; }, c=>c.UsePinyin),
        new FieldMap("cross_mode", nameof(DanmakuConfig.CrossMode), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.CrossMode = x; }, c=>c.CrossMode),
        new FieldMap("trim_ending", nameof(DanmakuConfig.TrimEnding), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.TrimEnding = x; }, c=>c.TrimEnding),
        new FieldMap("trim_space", nameof(DanmakuConfig.TrimSpace), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.TrimSpace = x; }, c=>c.TrimSpace),
        new FieldMap("trim_width", nameof(DanmakuConfig.TrimWidth), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.TrimWidth = x; }, c=>c.TrimWidth),
        new FieldMap("mark_threshold", nameof(DanmakuConfig.MarkThreshold), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.MarkThreshold = x; }, c=>c.MarkThreshold),
        new FieldMap("mode_elevation", nameof(DanmakuConfig.ModeElevation), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.ModeElevation = x; }, c=>c.ModeElevation),
        new FieldMap("enlarge", nameof(DanmakuConfig.Enlarge), typeof(bool), (c,v)=>{ if(bool.TryParse(v, out var x)) c.Enlarge = x; }, c=>c.Enlarge),
        new FieldMap("scroll_threshold", nameof(DanmakuConfig.ScrollThreshold), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.ScrollThreshold = x; }, c=>c.ScrollThreshold),
        new FieldMap("shrink_threshold", nameof(DanmakuConfig.ShrinkThreshold), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.ShrinkThreshold = x; }, c=>c.ShrinkThreshold),
        new FieldMap("drop_threshold", nameof(DanmakuConfig.DropThreshold), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.DropThreshold = x; }, c=>c.DropThreshold),
        new FieldMap("max_chunk_size", nameof(DanmakuConfig.MaxChunkSize), typeof(int), (c,v)=>{ if(int.TryParse(v, out var x)) c.MaxChunkSize = x; }, c=>c.MaxChunkSize),
        new FieldMap("heatmap_style", nameof(DanmakuConfig.HeatmapStyle), typeof(string), (c,v)=>{ if(!string.IsNullOrEmpty(v)) c.HeatmapStyle = v; }, c=>c.HeatmapStyle),
    };

    /// <summary>
    /// 统一使用映射表应用表单覆盖
    /// </summary>
    public static void ApplyFormOverlayToConfig(DanmakuConfig config, IFormCollection form)
    {
        foreach (var map in s_fieldMaps)
        {
            if (!form.TryGetValue(map.JsonKey, out var raw)) continue;
            var val = raw.ToString();
            if (string.IsNullOrEmpty(val)) continue;
            map.Setter(config, val);
        }
    }

    /// <summary>
    /// 生成配置的 JSON 字段 -> 值 字典（用于前端回显或导出）
    /// </summary>
    public static Dictionary<string, object?> ExportConfigToDictionary(DanmakuConfig config)
    {
        var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var map in s_fieldMaps)
        {
            dict[map.JsonKey] = map.Getter(config);
        }
        return dict;
    }

    /// <summary>
    /// 获取映射表（调试/文档用途）
    /// </summary>
    public static IEnumerable<object> GetConfigFieldMappings()
    {
        foreach (var m in s_fieldMaps)
        {
            yield return new { json = m.JsonKey, property = m.PropertyName, type = m.DataType.Name };
        }
    }
}
