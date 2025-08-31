
using System.Text.Json;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{


    #region JSON 列表解析辅助 // Pakku.ListFromJson.cs
    // ======== JSON 列表解析辅助 ========
    private static List<(string pattern, string replace)> ParseForcelistFromJson(string? jsonString)
    {
        var list = new List<(string, string)>();
        if (string.IsNullOrWhiteSpace(jsonString)) return list;
        List<Dictionary<string, JsonElement>>? items = null;
        try { items = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(jsonString); }
        catch { return list; }
        if (items == null) return list;
        foreach (var item in items)
        {
            try
            {
                string pattern = (item.GetValueOrDefault("pattern").GetString() ?? string.Empty).Trim();
                string replace = (item.GetValueOrDefault("replace").GetString() ?? string.Empty);
                if (string.IsNullOrEmpty(pattern)) continue; // 跳过空 pattern
                list.Add((pattern, replace));
            }
            catch { /* 跳过单条错误 */ }
        }
        return list;
    }

    private static bool TryReadBoolFlexible(JsonElement el, out bool value)
    {
        value = false;
        try
        {
            if (el.ValueKind == JsonValueKind.True || el.ValueKind == JsonValueKind.False)
            {
                value = el.GetBoolean(); return true;
            }
            if (el.ValueKind == JsonValueKind.String)
            {
                var s = el.GetString();
                if (bool.TryParse(s, out var b)) { value = b; return true; }
            }
        }
        catch { }
        return false;
    }

    private static List<(bool isRegex, string pattern)> ParseWhitelistFromJson(string? jsonString)
    {
        var list = new List<(bool, string)>();
        if (string.IsNullOrWhiteSpace(jsonString)) return list;
        List<Dictionary<string, JsonElement>>? items = null;
        try { items = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(jsonString); }
        catch { return list; }
        if (items == null) return list;
        foreach (var item in items)
        {
            try
            {
                var pat = (item.GetValueOrDefault("pattern").GetString() ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(pat)) continue;
                bool isRegex = false;
                if (!TryReadBoolFlexible(item.GetValueOrDefault("isRegex"), out isRegex)) isRegex = false;
                list.Add((isRegex, pat));
            }
            catch { }
        }
        return list;
    }

    private static List<(bool isRegex, string pattern)> ParseBlacklistFromJson(string? jsonString)
    {
        var list = new List<(bool, string)>();
        if (string.IsNullOrWhiteSpace(jsonString)) return list;
        List<Dictionary<string, JsonElement>>? items = null;
        try { items = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(jsonString); }
        catch { return list; }
        if (items == null) return list;
        foreach (var item in items)
        {
            try
            {
                var pat = (item.GetValueOrDefault("pattern").GetString() ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(pat)) continue;
                bool isRegex = false;
                if (!TryReadBoolFlexible(item.GetValueOrDefault("isRegex"), out isRegex)) isRegex = false;
                list.Add((isRegex, pat));
            }
            catch { }
        }
        return list;
    }

    private static List<string> ParseBlackSourceListFromJson(string? jsonString)
    {
        if (string.IsNullOrWhiteSpace(jsonString)) return new List<string>();
        try
        {
            var arr = JsonSerializer.Deserialize<List<string>>(jsonString);
            return arr?.Where(s => !string.IsNullOrWhiteSpace(s)).ToList() ?? new List<string>();
        }
        catch { return new List<string>(); }
    }
    #endregion



}
