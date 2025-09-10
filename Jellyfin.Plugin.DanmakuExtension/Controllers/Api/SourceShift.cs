using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using System.Linq;

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
}

public class SourceShiftItem
{
    public string SourceName { get; set; } = string.Empty;
    public int Shift { get; set; } = 0;
}
