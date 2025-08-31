
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region 过滤编译器（白/黑名单） // Pakku.Filters.cs
    private static Func<string, bool> CompileWhitelist(ParsedLists lists)
    {
        var wlSig = string.Join("|", lists.WhiteList.Select(x => (x.isRegex ? "R:" : "P:") + x.pattern));
        if (RuntimeCache.WHITELIST_COMPILED == null || RuntimeCache.WHITELIST_SIG != wlSig)
        {
            RuntimeCache.WHITELIST_COMPILED = lists.WhiteList
                .Select(x => x.isRegex
                    ? (true, new Regex(x.pattern, RegexOptions.IgnoreCase | RegexOptions.Compiled), (string?)null)
                    : (false, (Regex?)null, x.pattern))
                .ToList();
            RuntimeCache.WHITELIST_SIG = wlSig;
        }
        return s =>
        {
            foreach (var entry in RuntimeCache.WHITELIST_COMPILED)
            {
                if (entry.isRegex)
                {
                    if (entry.regex!.IsMatch(s)) return true;
                }
                else
                {
                    if (!string.IsNullOrEmpty(entry.plain) && s.IndexOf(entry.plain, StringComparison.OrdinalIgnoreCase) >= 0) return true;
                }
            }
            return false;
        };
    }

    private static Func<string, string?> CompileBlacklist(ParsedLists lists)
    {
        var blSig = string.Join("|", lists.BlackList.Select(x => (x.isRegex ? "R:" : "P:") + x.pattern));
        if (RuntimeCache.BLACKLIST_COMPILED == null || RuntimeCache.BLACKLIST_SIG != blSig)
        {
            RuntimeCache.BLACKLIST_COMPILED = lists.BlackList
                .Select(x => x.isRegex
                    ? (true, new Regex(x.pattern, RegexOptions.Compiled), (string?)null)
                    : (false, (Regex?)null, x.pattern))
                .ToList();
            RuntimeCache.BLACKLIST_SIG = blSig;
        }
        return s =>
        {
            foreach (var entry in RuntimeCache.BLACKLIST_COMPILED)
            {
                if (entry.isRegex)
                {
                    if (entry.regex!.IsMatch(s)) return "/" + entry.regex.ToString() + "/";
                }
                else if (!string.IsNullOrEmpty(entry.plain) && s.IndexOf(entry.plain, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    return " " + entry.plain;
                }
            }
            return null;
        };
    }
    #endregion



}
