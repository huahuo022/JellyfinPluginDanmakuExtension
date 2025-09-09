using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MediaBrowser.Controller.Library;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Net;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Http;
using System.Runtime.InteropServices;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuController
{
    #region GET font endpoints
    // 列出服务器上可用（系统安装）的字体文件名清单
    [HttpGet("font/get_all")]
    [Produces("application/json")]
    public IActionResult GetAllFonts()
    {
        try
        {
            var files = EnumerateSystemFontFiles();
            // 以文件名去重（同名取其一）
            var list = files
                .GroupBy(p => Path.GetFileName(p), StringComparer.OrdinalIgnoreCase)
                .Select(g =>
                {
                    var fullPath = g.First();
                    var fi = new FileInfo(fullPath);
                    var name = Path.GetFileName(fullPath);
                    return new
                    {
                        name,
                        size = fi.Exists ? fi.Length : 0,
                        ext = Path.GetExtension(name),
                        // 供前端直接访问的相对路径
                        url = $"/danmaku/font/{Uri.EscapeDataString(name)}"
                    };
                })
                .OrderBy(x => x.name, StringComparer.OrdinalIgnoreCase)
                .ToList();

            return Content(JsonSerializer.Serialize(list), "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error listing system fonts");
            return StatusCode(500, $"Error listing fonts: {ex.Message}");
        }
    }

    // 提供字体文件下载（按文件名匹配，限制后缀，防止路径穿越）
    [HttpGet("font/{fileName}")]
    public IActionResult GetFontFile([FromRoute] string fileName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                return BadRequest("fileName is required");
            }

            // 禁止路径分隔符，避免目录穿越
            if (fileName.Contains('/') || fileName.Contains('\\'))
            {
                return BadRequest("Invalid file name");
            }

            var allowed = GetAllowedFontExtensions();
            var ext = Path.GetExtension(fileName);
            if (string.IsNullOrEmpty(ext) || !allowed.Contains(ext))
            {
                return BadRequest("Unsupported font extension");
            }

            var ct = GetContentTypeForFont(ext);
            var candidates = EnumerateSystemFontFiles();
            var match = candidates.FirstOrDefault(p => string.Equals(Path.GetFileName(p), fileName, StringComparison.OrdinalIgnoreCase));
            if (match == null || !System.IO.File.Exists(match))
            {
                return NotFound();
            }

            var stream = new FileStream(match, FileMode.Open, FileAccess.Read, FileShare.Read);
            return File(stream, ct, enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error serving font file {File}", fileName);
            return StatusCode(500, $"Error serving font: {ex.Message}");
        }
    }

    // 枚举系统字体目录中的所有字体文件（跨平台）
    private IEnumerable<string> EnumerateSystemFontFiles()
    {
        var dirs = GetSystemFontDirectories();
        var allowed = GetAllowedFontExtensions();
        var results = new List<string>();

        foreach (var d in dirs)
        {
            try
            {
                if (Directory.Exists(d))
                {
                    var files = Directory.EnumerateFiles(d, "*", SearchOption.AllDirectories)
                        .Where(f => allowed.Contains(Path.GetExtension(f)));
                    results.AddRange(files);
                }
            }
            catch
            {
                // 忽略不可访问目录
            }
        }

        return results;
    }

    private static HashSet<string> GetAllowedFontExtensions()
    {
        return new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".woff2", ".woff", ".ttf", ".otf"
        };
    }

    private static string GetContentTypeForFont(string ext)
    {
        return ext.ToLowerInvariant() switch
        {
            ".woff2" => "font/woff2",
            ".woff" => "font/woff",
            ".ttf" => "font/ttf",
            ".otf" => "font/otf",
            _ => "application/octet-stream"
        };
    }

    private IEnumerable<string> GetSystemFontDirectories()
    {
        var list = new List<string>();
        // Jellyfin 数据目录下的 fonts（最优先，若存在）
        try
        {
            if (!string.IsNullOrWhiteSpace(_paths?.DataPath))
            {
                list.Add(Path.Combine(_paths.DataPath, "fonts"));
            }
        }
        catch { }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            list.Add(@"C:\\Windows\\Fonts");
            // Windows ProgramData 下的 Jellyfin 目录
            try
            {
                var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
                if (!string.IsNullOrEmpty(programData))
                {
                    list.Add(Path.Combine(programData, "Jellyfin", "Server", "fonts"));
                    list.Add(Path.Combine(programData, "Jellyfin", "fonts"));
                }
            }
            catch { }
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux))
        {
            list.Add("/usr/share/fonts");
            list.Add("/usr/local/share/fonts");
            list.Add("/usr/share/fonts/truetype");
            list.Add("/usr/share/fonts/opentype");
            // Jellyfin 常见容器挂载目录
            list.Add("/config/fonts");
            // Jellyfin Linux 常见数据目录
            list.Add("/var/lib/jellyfin/fonts");
            list.Add("/var/lib/jellyfin/data/fonts");
            // 少数配置将字体置于 etc（并不标准，但兼容）
            list.Add("/etc/jellyfin/fonts");
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(home))
            {
                list.Add(Path.Combine(home, ".fonts"));
                list.Add(Path.Combine(home, ".local", "share", "fonts"));
            }
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            list.Add("/System/Library/Fonts");
            list.Add("/Library/Fonts");
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(home))
            {
                list.Add(Path.Combine(home, "Library", "Fonts"));
            }
            // Jellyfin macOS 数据目录（通过 DataPath 已添加），此处再兜底几处常见装载位
            list.Add("/usr/local/var/jellyfin/fonts");
            list.Add("/opt/homebrew/var/jellyfin/fonts");
        }

        return list;
    }
    #endregion
}
