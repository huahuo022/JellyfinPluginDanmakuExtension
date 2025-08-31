using System.Security.Cryptography;
using Microsoft.Extensions.Logging;


namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    /// <summary>
    /// 构建弹幕匹配请求所需的媒体信息
    /// </summary>
    /// <param name="itemId">Jellyfin的媒体项ID</param>
    /// <returns>
    /// 包含以下字段的对象：
    /// { fileName, fileHash, fileSize, videoDuration, matchMode }
    /// 若文件不存在或无法访问则返回 null
    /// </returns>
    public MediaMatchRequest? GetMediaMatchInfo(Guid itemId)
    {
        try
        {
            // 通过ID获取媒体项
            var item = _libraryManager.GetItemById(itemId);
            if (item == null || item.Path == null || !File.Exists(item.Path))
            {
                _logger.LogWarning("无法找到媒体文件或文件不存在: {ItemId}", itemId);
                return null;
            }

            const int chunkSize = 16 * 1024 * 1024; // 16MB

            var fileInfo = new FileInfo(item.Path);

            // 读取前 16MB 计算 MD5
            using var fileStream = File.OpenRead(item.Path);
            byte[] buffer = new byte[chunkSize];
            int bytesRead = fileStream.Read(buffer, 0, chunkSize);

            if (bytesRead < chunkSize)
            {
                var actualData = new byte[bytesRead];
                Array.Copy(buffer, actualData, bytesRead);
                buffer = actualData;
            }

            var hashBytes = MD5.HashData(buffer);
            var hashString = Convert.ToHexString(hashBytes).ToLowerInvariant();

            // 文件名（不含扩展名）
            var nameWithoutExt = Path.GetFileNameWithoutExtension(item.Path) ?? string.Empty;

            // 时长（秒，32位整数），默认 0
            int durationSeconds = 0;
            try
            {
                var runtimeTicks = item.RunTimeTicks;
                if (runtimeTicks.HasValue)
                {
                    // TimeSpan.TicksPerSecond = 10,000,000
                    long seconds = runtimeTicks.Value / TimeSpan.TicksPerSecond;
                    if (seconds < int.MinValue) durationSeconds = int.MinValue;
                    else if (seconds > int.MaxValue) durationSeconds = int.MaxValue;
                    else durationSeconds = (int)seconds;
                }
            }
            catch
            {}

            return new MediaMatchRequest
            {
                FileName = nameWithoutExt,
                FileHash = hashString,
                FileSize = fileInfo.Length,
                VideoDuration = durationSeconds,
                MatchMode = "hashAndFileName"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "构建媒体匹配信息时发生错误: {ItemId}", itemId);
            return null;
        }
    }
}
