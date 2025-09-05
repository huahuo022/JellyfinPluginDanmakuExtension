using Microsoft.AspNetCore.Http;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

/// <summary>
/// 弹幕配置类，包含所有弹幕相关的配置参数
/// </summary>
public class DanmakuConfig
{
    // dandan 配置
    public string ChConvert { get; set; } = "0";
    public string WithRelated { get; set; } = "true";

    // 显示配置
    public int FontSize { get; set; } = 25;
    public string FontFamily { get; set; } = "sans-serif";
    public int Opacity { get; set; } = 70;
    public int Speed { get; set; } = 144;
    public int DisplayTopPct { get; set; } = 0;
    public int DisplayBottomPct { get; set; } = 100;

    // 合并配置
    public bool EnableCombine { get; set; } = true;
    public double ThresholdSeconds { get; set; } = 15.0;
    public int MaxDistance { get; set; } = 3;
    public int MaxCosine { get; set; } = 40;
    public bool UsePinyin { get; set; } = true;
    public bool CrossMode { get; set; } = true;
    public bool TrimEnding { get; set; } = true;
    public bool TrimSpace { get; set; } = true;
    public bool TrimWidth { get; set; } = true;
    public string HeatmapStyle { get; set; } =
        "{\"lineWidth\":1,\"lineColor\":\"#3498db\",\"gradientColorStart\":\"rgba(52, 152, 219, 0.08)\",\"gradientColorEnd\":\"rgba(52, 152, 219, 0.25)\"}";
    public string MarkStyle { get; set; } = "sub_low";
    public int MarkThreshold { get; set; } = 1;
    public bool ModeElevation { get; set; } = true;
    public bool Enlarge { get; set; } = true;
    public int ScrollThreshold { get; set; } = 0;
    public int ShrinkThreshold { get; set; } = 0;
    public int DropThreshold { get; set; } = 0;
    public int MaxChunkSize { get; set; } = 1000;

    // 热力图配置: off | combined(基于代表弹幕) | original(基于原始弹幕)
    public string EnableHeatmap { get; set; } = "combined";
    public int HeatmapInterval { get; set; } = 5;

    // 列表配置 (JSON 格式)
    public string ForcelistJson { get; set; } = "";
    public string WhitelistJson { get; set; } = "";
    public string BlacklistJson { get; set; } = "";
    // 来源黑名单（JSON 数组字符串），例如: ["bilibili", "dandanplay"]
    public string BlackSourceListJson { get; set; } = "";


}

/// <summary>
/// API 返回的弹幕评论项 DTO（保持与现有 JSON 字段一致）
/// </summary>
public class DanmakuCommentDto
{
    // JS 前端最小契约：time(秒) + text
    [JsonPropertyName("time")] public double Time { get; set; }
    [JsonPropertyName("text")] public string Text { get; set; } = string.Empty;

    // 聚合簇大小（旧 mark_count），紧跟文本，方便前端遍历时相邻读取
    [JsonPropertyName("mark")] public int Mark { get; set; } = 1;

    // 模式：rtl / top / bottom / ltr(预留)。数值模式已映射
    [JsonPropertyName("mode")] public string Mode { get; set; } = "rtl";

    // 样式：与 js_danmaku.md style 直接对接（可为空省去冗余）
    [JsonPropertyName("style")] public DanmakuStyle? Style { get; set; }

    // 仍保留 cid（便于调试 / 去重 / 锚点），不在核心最小集内
    [JsonPropertyName("cid")] public long Cid { get; set; }
}

public class DanmakuStyle
{
    // 对应 canvas 2D context 的属性名
    [JsonPropertyName("fillStyle")] public string? FillStyle { get; set; }
    [JsonPropertyName("font")] public string? Font { get; set; }
    [JsonPropertyName("strokeStyle")] public string? StrokeStyle { get; set; } = "#000";
    [JsonPropertyName("lineWidth")] public int? LineWidth { get; set; } = 2;
}

/// <summary>
/// 自定义注入条目 DTO（用于保存到数据库）
/// </summary>
public class CustomJsEntryDto
{
    [JsonPropertyName("index")]
    public int Index { get; set; }
    [JsonPropertyName("data_type")]
    public string? DataType { get; set; }
    [JsonPropertyName("data_base64")]
    public string? DataBase64 { get; set; }
    [JsonPropertyName("name")]
    public string? Name { get; set; }
}

/// <summary>
/// API 返回模型：用于 /danmaku/custom_js GET
/// </summary>
public class CustomJsEntryApiModel
{
    [JsonPropertyName("index")]
    public int Index { get; set; }

    [JsonPropertyName("data_type")]
    public string DataType { get; set; } = "js";

    [JsonPropertyName("data_base64")]
    public string DataBase64 { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("updated_at")]
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// 弹幕获取结果
/// </summary>
public class DanmakuResult
{
    public bool Success { get; set; }
    public string? Content { get; set; }
    public string? ErrorMessage { get; set; }
    public int? StatusCode { get; set; }
}

/// <summary>
/// 弹幕匹配请求 DTO
/// </summary>
public class MediaMatchRequest
{
    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;
    [JsonPropertyName("fileHash")]
    public string FileHash { get; set; } = string.Empty;
    [JsonPropertyName("fileSize")]
    public long FileSize { get; set; }
    [JsonPropertyName("videoDuration")]
    public int VideoDuration { get; set; }
    [JsonPropertyName("matchMode")]
    public string MatchMode { get; set; } = "hashAndFileName";
}
