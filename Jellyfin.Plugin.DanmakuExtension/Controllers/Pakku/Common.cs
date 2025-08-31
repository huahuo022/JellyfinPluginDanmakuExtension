using System.Text.Json;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class Pakku
{
    #region 辅助函数 // Pakku.Common.cs

    private static string ExtractSpecial(string text)
    {
        try { return JsonSerializer.Deserialize<string[]>(text)?[4] ?? text; } catch { return text; }
    }

    private static string TrimDisp(string text) => TRIM_DISP_RE.Replace(text, string.Empty).Trim();

    // 不再插入计数标记文本，改由前端依据 mark_count 渲染

    private static readonly HashSet<char> SMALL_CHARS = BuildSmallChars();
    private static HashSet<char> BuildSmallChars()
    {
        var s = new HashSet<char>("₍₀₁₂₃₄₅₆₇₈₉₎⁰¹²³⁴⁵⁶⁷⁸⁹↓↑");
        for (int x = 0x20; x <= 0x7e; x++) s.Add((char)x);
        return s;
    }

    private static int CountSmallChars(string s)
    {
        int ret = 0; foreach (var c in s) if (SMALL_CHARS.Contains(c)) ret++; return ret;
    }

    private static double DispVal(DanmuObject d)
    {
        // 近似：基于显示文本长度与小字符比例、字号
        string s = d.pakku.disp_str.Length > 0 ? d.pakku.disp_str : d.content;
        int n = s.Length;
        int small = CountSmallChars(s);
        double baseV = n == 0 ? 0 : (n - small * 0.5);
        return Math.Max(0, baseV) * Math.Max(10, d.fontsize) / 20.0;
    }

    private static double CalcEnlargeRate(int count) => count <= 5 ? 1.0 : Math.Log(count) / Math.Log(5);

    private static double ApproxTextWidth(string text, int size)
    {
        // 近似估算：ASCII 约 0.6em，CJK 约 1.0em，这里粗略按 0.8em 加权
        if (string.IsNullOrEmpty(text)) return 0;
        int ascii = text.Count(ch => ch <= 0x7F);
        int cjk = text.Length - ascii;
        double em = ascii * 0.6 + cjk * 1.0;
        return em * size; // 以 px 估算
    }

    private static string SelectMedianLength(List<string> strs)
    {
        if (strs.Count == 0) return string.Empty; if (strs.Count == 1) return strs[0];
        var sorted = strs.OrderBy(x => x.Length).ToList();
        return sorted[sorted.Count / 2];
    }

    #endregion

}
