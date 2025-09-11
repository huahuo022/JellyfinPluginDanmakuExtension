using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;
using System.IO;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuController
{
    #region GET/POST source_shift
    
    [HttpGet("source_shift")]
    [Produces("application/json")]
    public async Task<IActionResult> GetSourceShift([FromQuery(Name = "item_id")] Guid itemId)
    {
        try
        {
            if (itemId == Guid.Empty)
            {
                return BadRequest("item_id is required");
            }

            var data = await _danmakuService.GetSourceShiftAsync(itemId.ToString());
            if (data != null)
            {
                // 解析data中的shift信息，只返回shift不为0的项
                var sourceShifts = JsonSerializer.Deserialize<List<SourceShiftItem>>(data);
                var nonZeroShifts = sourceShifts?.Where(s => s.Shift != 0).ToList() ?? new List<SourceShiftItem>();
                
                if (nonZeroShifts.Any())
                {
                    return Content(JsonSerializer.Serialize(nonZeroShifts), "application/json", Encoding.UTF8);
                }
            }
            
            // 如果没有找到数据或所有shift都为0，返回空数组
            return Content("[]", "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting source_shift for item_id: {ItemId}", itemId);
            return StatusCode(500, $"Error getting source_shift: {ex.Message}");
        }
    }

    [HttpPost("source_shift")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> SaveSourceShift()
    {
        try
        {
            var form = await Request.ReadFormAsync();
            string itemIdStr = form["item_id"].ToString();
            
            if (string.IsNullOrWhiteSpace(itemIdStr) || !Guid.TryParse(itemIdStr, out var itemId) || itemId == Guid.Empty)
            {
                return BadRequest("item_id is required and must be a valid GUID");
            }

            string sourceName = form["source_name"].ToString();
            string shiftStr = form["shift"].ToString();
            
            if (string.IsNullOrWhiteSpace(sourceName))
            {
                return BadRequest("source_name is required");
            }
            
            if (string.IsNullOrWhiteSpace(shiftStr) || !int.TryParse(shiftStr, out var shift))
            {
                return BadRequest("shift is required and must be an integer");
            }

            await _danmakuService.UpdateSourceShiftAsync(itemId.ToString(), sourceName, shift);
            
            return Ok(new { success = true, message = "Source shift updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating source_shift");
            return StatusCode(500, $"Error updating source_shift: {ex.Message}");
        }
    }
    
    #endregion

    #region GET/POST ext_source

    [HttpGet("ext_source")]
    [Produces("application/json")]
    public async Task<IActionResult> GetExtSource([FromQuery(Name = "item_id")] Guid itemId)
    {
        try
        {
            if (itemId == Guid.Empty)
            {
                return BadRequest("item_id is required");
            }

            var data = await _danmakuService.GetExtSourceAsync(itemId.ToString());
            if (!string.IsNullOrWhiteSpace(data))
            {
                // 返回存储的 ext_source 原样 JSON
                return Content(data, "application/json", Encoding.UTF8);
            }

            return Content("[]", "application/json", Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ext_source for item_id: {ItemId}", itemId);
            return StatusCode(500, $"Error getting ext_source: {ex.Message}");
        }
    }

    [HttpPost("ext_source")]
    [Authorize(Policy = "RequiresElevation")]
    public async Task<IActionResult> SaveExtSource()
    {
        try
        {
            var form = await Request.ReadFormAsync();
            string itemIdStr = form["item_id"].ToString();

            if (string.IsNullOrWhiteSpace(itemIdStr) || !Guid.TryParse(itemIdStr, out var itemId) || itemId == Guid.Empty)
            {
                return BadRequest("item_id is required and must be a valid GUID");
            }

            string sourceName = form["source_name"].ToString();
            string type = form["type"].ToString();
            string source = form["source"].ToString();
            string enableStr = form["enable"].ToString();

            if (string.IsNullOrWhiteSpace(sourceName))
            {
                return BadRequest("source_name is required");
            }

            // 删除：source 为空字符串则删除该项
            if (source == "")
            {
                bool fileDeleted = false;
                try
                {
                    // 若客户端传入类型为 file，则尝试删除已保存的文件
                    if (!string.IsNullOrWhiteSpace(type) && string.Equals(type, "file", StringComparison.OrdinalIgnoreCase))
                    {
                        var currentJson = await _danmakuService.GetExtSourceAsync(itemId.ToString());
                        if (!string.IsNullOrWhiteSpace(currentJson))
                        {
                            var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                            var items = JsonSerializer.Deserialize<List<ExtSourceItem>>(currentJson, opts) ?? new List<ExtSourceItem>();
                            var match = items.FirstOrDefault(x => string.Equals(x.SourceName, sourceName, StringComparison.Ordinal));
                            var path = match?.Source ?? string.Empty;
                            if (!string.IsNullOrWhiteSpace(path) && System.IO.File.Exists(path))
                            {
                                try
                                {
                                    // 仅当目标文件与媒体同目录时删除，避免越权
                                    var libItem = _libraryManager.GetItemById(itemId);
                                    var mediaDir = libItem?.Path != null ? Path.GetDirectoryName(libItem.Path) : null;
                                    var targetDir = Path.GetDirectoryName(path);
                                    if (!string.IsNullOrWhiteSpace(mediaDir) && string.Equals(Path.GetFullPath(mediaDir), Path.GetFullPath(targetDir ?? string.Empty), StringComparison.OrdinalIgnoreCase))
                                    {
                                        System.IO.File.Delete(path);
                                        fileDeleted = true;
                                    }
                                    else
                                    {
                                        _logger.LogWarning("Skip deleting file outside media directory: {Path}", path);
                                    }
                                }
                                catch (Exception ioex)
                                {
                                    _logger.LogWarning(ioex, "Failed to delete ext_source file: {Path}", path);
                                }
                            }
                        }
                    }
                }
                catch (Exception delEx)
                {
                    _logger.LogWarning(delEx, "Error while trying to delete ext_source file on removal");
                }

                await _danmakuService.UpdateExtSourceAsync(itemId.ToString(), sourceName, string.Empty, string.Empty, false);
                return Ok(new { success = true, message = "Ext source deleted successfully", fileDeleted });
            }

            if (string.IsNullOrWhiteSpace(type))
            {
                return BadRequest("type is required when source is not empty");
            }

            bool enable = true;
            if (!string.IsNullOrWhiteSpace(enableStr) && bool.TryParse(enableStr, out var parsed))
            {
                enable = parsed;
            }

            await _danmakuService.UpdateExtSourceAsync(itemId.ToString(), sourceName, type, source, enable);

            return Ok(new { success = true, message = "Ext source updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating ext_source");
            return StatusCode(500, $"Error updating ext_source: {ex.Message}");
        }
    }

    #endregion

    #region POST upload_file
    [HttpPost("upload_file")]
    [Authorize(Policy = "RequiresElevation")]
    [Produces("application/json")]
    public async Task<IActionResult> UploadFile([FromBody] UploadFileJsonRequest req)
    {
        try
        {
            if (req == null)
            {
                return BadRequest("request body is required");
            }

            // item_id
            if (req.ItemId == Guid.Empty)
            {
                // 兼容如果传了字符串形式
                if (!string.IsNullOrWhiteSpace(req.ItemIdText) && Guid.TryParse(req.ItemIdText, out var gid))
                {
                    req.ItemId = gid;
                }
            }
            if (req.ItemId == Guid.Empty)
            {
                return BadRequest("item_id is required");
            }

            var sourceName = (req.SourceName ?? string.Empty).Trim();
            var contentBase64 = (req.ContentBase64 ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(sourceName))
            {
                return BadRequest("source_name is required");
            }
            // 新规则：不再接收 fileName；sourceName 自带期望文件名（可含扩展名）
            // 放宽：允许绝大多数可显示 Unicode（含中文 / 日文等），仅禁止：路径分隔符 / \\，以及 Windows 非法文件名字符:  < > : " | ? * 和 控制字符
            bool IsSafe(string s)
            {
                if (string.IsNullOrEmpty(s)) return false;
                var invalid = new HashSet<char>(new[] { '<', '>', ':', '"', '|', '?', '*'});
                foreach (var ch in s)
                {
                    if (ch == '/' || ch == '\\') return false; // 路径分隔符禁止
                    if (invalid.Contains(ch)) return false;
                    if (char.IsControl(ch)) return false; // 控制符禁止
                }
                return true;
            }
            if (!IsSafe(sourceName))
            {
                return BadRequest("source_name contains invalid characters");
            }
            if (sourceName.Length > 128)
            {
                return BadRequest("source_name too long");
            }
            if (string.IsNullOrWhiteSpace(contentBase64))
            {
                return BadRequest("content_base64 is required");
            }

            // 去掉 dataURL 前缀（如果有）
            var commaIdx = contentBase64.LastIndexOf(',');
            if (commaIdx >= 0)
            {
                contentBase64 = contentBase64.Substring(commaIdx + 1);
            }

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(contentBase64);
            }
            catch (Exception)
            {
                return BadRequest("content_base64 is invalid");
            }
            if (bytes.Length == 0)
            {
                return BadRequest("content_base64 is empty");
            }

            var item = _libraryManager.GetItemById(req.ItemId);
            if (item == null || string.IsNullOrWhiteSpace(item.Path))
            {
                return NotFound("item not found or path missing");
            }
            if (!System.IO.File.Exists(item.Path))
            {
                return NotFound("item file not found");
            }

            var dir = Path.GetDirectoryName(item.Path) ?? string.Empty;
            var nameWithoutExt = Path.GetFileNameWithoutExtension(item.Path) ?? string.Empty;
            if (string.IsNullOrWhiteSpace(dir) || string.IsNullOrWhiteSpace(nameWithoutExt))
            {
                return StatusCode(500, "cannot determine base path");
            }

            // 直接使用 nameWithoutExt + '.' + sourceName
            var targetFileName = $"{nameWithoutExt}.{sourceName}";
            var targetPath = Path.Combine(dir, targetFileName);

            try
            {
                await System.IO.File.WriteAllBytesAsync(targetPath, bytes);
            }
            catch (Exception ioex)
            {
                _logger.LogError(ioex, "Error saving uploaded file to {TargetPath}", targetPath);
                return StatusCode(500, new { success = false, path = targetPath, message = ioex.Message });
            }

            return Ok(new { success = true, path = targetPath });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling upload_file");
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    #endregion
}

public class SourceShiftItem
{
    public string SourceName { get; set; } = string.Empty;
    public int Shift { get; set; } = 0;
}

public class ExtSourceItem
{
    public string SourceName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // url | file
    public string Source { get; set; } = string.Empty; // URL 或 文件路径
    public bool Enable { get; set; } = true;
}

public class UploadFileJsonRequest
{
    // 支持两种传法：ItemId(Guid) 或 ItemIdText(string)
    public Guid ItemId { get; set; }
    public string? ItemIdText { get; set; }

    public string? SourceName { get; set; }
    public string? ContentBase64 { get; set; }
}
