using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region 拼音字典加载 // Pakku.Pinyin.cs
    // ======== 拼音字典加载 ========
    private static readonly Dictionary<ushort, (byte, byte)> PinyinDict = new();
    private static bool _pyLoaded = false;
    private static void EnsurePinyinLoaded()
    {
        if (_pyLoaded) return;

        // 从嵌入式资源中读取拼音字典
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        var resourceName = "Jellyfin.Plugin.DanmakuExtension.Controllers.pinyin_dict.txt";

        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream == null)
        {
            _pyLoaded = true;
            return;
        }

        using var reader = new System.IO.StreamReader(stream);
        var re = new Regex(@"\{0x([0-9a-fA-F]+),\s*\{(\d+),\s*(\d+)\}\}", RegexOptions.Compiled);

        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            var m = PINYIN_DICT_LINE_RE.Match(line);
            if (!m.Success) continue;
            var ch = (ushort)Convert.ToInt32(m.Groups[1].Value, 16);
            var p1 = byte.Parse(m.Groups[2].Value);
            var p2 = byte.Parse(m.Groups[3].Value);
            PinyinDict[ch] = (p1, p2);
        }
        _pyLoaded = true;
    }

    // 静态构造：预加载拼音表（可按需懒加载）
    static Pakku() => EnsurePinyinLoaded();

    // 其它静态预编译正则
    private static readonly Regex PINYIN_DICT_LINE_RE = new(@"\{0x([0-9a-fA-F]+),\s*\{(\d+),\s*(\d+)\}\}", RegexOptions.Compiled);
    #endregion



}
