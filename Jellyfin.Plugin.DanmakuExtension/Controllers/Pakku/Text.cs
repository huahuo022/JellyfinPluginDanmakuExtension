using System.Text;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region 文本规范化与显示度 / 宽度估算 // Pakku.Text.cs
    // ======== 工具：文本规范化 / 标记 / 密度 ========
    private static readonly HashSet<char> ENDING_CHARS = new("。,.?/？？！…~～@^、+=-_♂♀ ，");
    private static readonly Regex TRIM_EXTRA_SPACE_RE = new("[ \\u3000]+", RegexOptions.Compiled);
    private static readonly Regex TRIM_CJK_SPACE_RE = new("([\\u3000-\\u9FFF\\uFF00-\\uFFEF]) (?=[\\u3000-\\u9FFF\\uFF00-\\uFFEF])", RegexOptions.Compiled);
    private static readonly Regex TRIM_DISP_RE = new("([\\r\\n\\t])", RegexOptions.Compiled);
    private static readonly Regex UID_SOURCE_RE = new(@"\[([^\]]+)\]", RegexOptions.Compiled);

    private static readonly Dictionary<char, char> WIDTH_TABLE = BuildWidthTable();
    private static Dictionary<char, char> BuildWidthTable()
    {
        // 仅覆盖常见全角 => 半角；可按需扩充
        var map = new Dictionary<char, char>();
        string full = "！＠＃＄％＾＆＊（）＿＋［］｛｝；：\"，．／＜＞？＼｜｀～１２３４５６７８９０ｑｗｅｒｔｙｕｉｏｐａｓｄｆｇｈｊｋｌｚｘｃｖｂｎｍＱＷＥＲＴＹＵＩＯＰＡＳＤＦＧＨＪＫＬＺＸＣＶＢＮＭ";
        string half = "!@#$%^&*()_+[]{};:\"',./<>?\\|`~1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM";
        for (int i = 0; i < Math.Min(full.Length, half.Length); i++) map[full[i]] = half[i];
        map['　'] = ' ';
        return map;
    }

    private static (bool matched, string text) DeTaolu(DanmakuConfig cfg, ParsedLists lists, string input)
    {
        int len = input.Length;
        string text;
        if (cfg.TrimEnding)
        {
            while (len > 0 && ENDING_CHARS.Contains(input[len - 1])) len--;
            if (len == 0) len = input.Length;
        }
        if (cfg.TrimWidth)
        {
            var sb = new StringBuilder(len);
            for (int i = 0; i < len; i++) sb.Append(WIDTH_TABLE.GetValueOrDefault(input[i], input[i]));
            text = sb.ToString();
        }
        else text = input[..len];

        if (cfg.TrimSpace)
        {
            text = TRIM_EXTRA_SPACE_RE.Replace(text, " ");
            text = TRIM_CJK_SPACE_RE.Replace(text, "$1");
        }

        foreach (var (pat, repl) in lists.ForceList)
        {
            // 将 FORCELIST 预编译并缓存
            var sig = string.Join("|", lists.ForceList.Select(x => x.pattern + "\u0001" + x.replace));
            if (RuntimeCache.FORCELIST_COMPILED == null || RuntimeCache.FORCELIST_SIG != sig)
            {
                RuntimeCache.FORCELIST_COMPILED = lists.ForceList
                    .Select(x => (new Regex(x.pattern, RegexOptions.IgnoreCase | RegexOptions.Compiled), x.replace))
                    .ToList();
                RuntimeCache.FORCELIST_SIG = sig;
            }
            break; // 跳出，改用下面已编译列表匹配
        }
        if (RuntimeCache.FORCELIST_COMPILED != null)
        {
            foreach (var (re, repl) in RuntimeCache.FORCELIST_COMPILED)
            {
                if (re.IsMatch(text)) { text = re.Replace(text, repl); return (true, text); }
            }
        }
        return (false, text);
    }
    #endregion



}
