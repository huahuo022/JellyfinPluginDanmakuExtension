

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 将 Pakku 的 representatives 列表格式化为前端所需的评论数组（强类型，简单直观）
    /// </summary>
    public static List<DanmakuCommentDto> FormatComments(
        IEnumerable<Pakku.DanmuObjectRepresentative> representatives,
        string fontFamily = "sans-serif",
        string markStyle = "sub_low",
        int markThreshold = 1)
        => representatives.Select(rep =>
        {
            // 根据 markStyle 和 markThreshold 在后端修改文本内容，前端不再需要单独的 Mark 字段
            var text = BuildTextWithMark(rep.content, rep.mark_count, markStyle, markThreshold);

            return new DanmakuCommentDto
            {
                Time = rep.time_ms / 1000.0,
                Text = text,
                Mode = MapMode(rep.mode),
                Style = BuildStyle(rep, fontFamily),
                Mark = rep.mark_count,
                Cid = rep.cid
            };
        }).ToList();

    private static string MapMode(int mode)
        => mode switch
        {
            5 => "top",
            4 => "bottom",
            _ => "rtl"
        };

    private static DanmakuStyle? BuildStyle(Pakku.DanmuObjectRepresentative rep, string fontFamily)
    {
        // 颜色：rep.color 是 int（通常 ARGB 或 BGR？），现假设为 0xRRGGBB
        var hex = rep.color;
        // 过滤无意义颜色（0 → 省略 style）
        // 需要输出 strokeStyle / lineWidth 默认值，因此即便颜色与字体都为空也要给一个 style 对象
        if (hex == 0 && rep.fontsize <= 0)
        {
            return new DanmakuStyle
            {
                // FillStyle 留空表示使用前端默认文本色
                StrokeStyle = "#000",
                LineWidth = 2
            };
        }

        string? colorStr = null;
        if (hex != 0)
        {
            colorStr = "#" + (hex & 0xFFFFFF).ToString("X6");
        }

        string? fontStr = null;
        if (rep.fontsize > 0)
        {
            // 使用传入的 fontFamily
            fontStr = $"{rep.fontsize}px {fontFamily}";
        }

        return new DanmakuStyle
        {
            FillStyle = colorStr,
            Font = fontStr,
            StrokeStyle = "#000",
            LineWidth = 2
        };
    }

    // 将 mark 根据样式拼接到文本上（只有当 markCount > markThreshold 时才修改）
    // 可选的 markStyle: "off", "sub_low", "sub_pre", "multiply"
    // 说明与假设：
    // - 当 markStyle == "off" 时不做任何修改。
    // - 当 "sub_low" 时在文本尾部追加下标数字（使用 Unicode 下标字符）。
    // - 当 "sub_pre" 时在文本前置入下标数字。
    // - 当 "multiply" 时在文本尾部追加一个乘号表示法，如 " ×N"。
    // 这些行为是在后端进行的简单、低风险实现；如果需要更复杂的格式（如 HTML 或富文本），
    // 可以在后续改为输出结构化字段并让前端渲染。
    private static string BuildTextWithMark(string? content, int markCount, string markStyle, int markThreshold)
    {
        var text = content ?? string.Empty;

        if (markStyle == null) markStyle = "off";
        if (markCount <= markThreshold || string.Equals(markStyle, "off", StringComparison.OrdinalIgnoreCase))
        {
            return text;
        }

        switch (markStyle)
        {
            case "sub_low":
            {
                var sub = ToSubscriptNumber(markCount);
                // 在尾部追加下标数字并用下标括号包裹，例如 "评论内容₍₃₎"
                return text + '\u208D' + sub + '\u208E';
            }
            case "sub_pre":
            {
                var sub = ToSubscriptNumber(markCount);
                // 在前置入下标数字并用下标括号包裹，例如 "₍₃₎评论内容"
                return '\u208D' + sub + '\u208E' + text;
            }
            case "multiply":
            {
                // 使用简单的乘号表示法，形如 "文本 ×3"
                return text + " ×" + markCount.ToString();
            }
            default:
                return text;
        }
    }

    // 将整数转为 Unicode 下标字符串（仅支持 0-9 和负号）
    private static string ToSubscriptNumber(int n)
    {
        // Unicode 下标数字映射
        const string digits = "₀₁₂₃₄₅₆₇₈₉";
        if (n == 0) return digits[0].ToString();

        var sb = new System.Text.StringBuilder();
        if (n < 0)
        {
            sb.Append('₋'); // 下标负号（U+208B）
            n = -n;
        }

        // 将数字按位转换为下标字符（高位在前）
        var s = n.ToString();
        foreach (var ch in s)
        {
            if (ch >= '0' && ch <= '9')
            {
                sb.Append(digits[ch - '0']);
            }
            else
            {
                sb.Append(ch);
            }
        }

        return sb.ToString();
    }
}
