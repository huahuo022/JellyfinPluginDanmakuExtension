using Microsoft.Data.Sqlite;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    #region JS 缓存
    // JS 网络缓存相关

    /// <summary>
    /// 下载指定 URL 的 JS 内容并返回 Base64 结果及其长度
    /// </summary>
    public async Task<(string JsBase64, int Base64Length)> DownloadJsToBase64Async(string url)
    {
        using var resp = await _httpClient.GetAsync(url);
        resp.EnsureSuccessStatusCode();
        var bytes = await resp.Content.ReadAsByteArrayAsync();
        var b64 = Convert.ToBase64String(bytes);
        return (b64, b64.Length);
    }

    /// <summary>
    /// 插入或更新 js_net_cache（主键为 url_base64）
    /// </summary>
    public async Task UpsertJsNetCacheAsync(string urlBase64, string jsBase64)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"INSERT OR REPLACE INTO js_net_cache (url_base64, js_base64, updated_at) VALUES (@k, @v, @t)";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@k", urlBase64 ?? string.Empty);
        cmd.Parameters.AddWithValue("@v", jsBase64 ?? string.Empty);
        cmd.Parameters.AddWithValue("@t", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// 插入或更新 js_net_cache，使用提供的更新时间（便于上层返回一致的 updated_at）
    /// </summary>
    public async Task UpsertJsNetCacheAsync(string urlBase64, string jsBase64, DateTime updatedAt)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"INSERT OR REPLACE INTO js_net_cache (url_base64, js_base64, updated_at) VALUES (@k, @v, @t)";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@k", urlBase64 ?? string.Empty);
        cmd.Parameters.AddWithValue("@v", jsBase64 ?? string.Empty);
        cmd.Parameters.AddWithValue("@t", updatedAt);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// 根据 url_base64 删除缓存
    /// </summary>
    public async Task<int> DeleteJsNetCacheByUrlBase64Async(string urlBase64)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"DELETE FROM js_net_cache WHERE url_base64 = @k";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@k", urlBase64 ?? string.Empty);
        var rows = await cmd.ExecuteNonQueryAsync();
        return rows;
    }

    /// <summary>
    /// 检查指定 url_base64 的缓存是否存在
    /// </summary>
    public async Task<bool> ExistsJsNetCacheByUrlBase64Async(string urlBase64)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"SELECT 1 FROM js_net_cache WHERE url_base64 = @k LIMIT 1";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@k", urlBase64 ?? string.Empty);
        var result = await cmd.ExecuteScalarAsync();
        return result != null;
    }

    /// <summary>
    /// 读取指定 url_base64 的缓存内容与更新时间
    /// </summary>
    public async Task<(string JsBase64, DateTime UpdatedAt)?> GetJsNetCacheByUrlBase64Async(string urlBase64)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"SELECT js_base64, updated_at FROM js_net_cache WHERE url_base64 = @k LIMIT 1";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@k", urlBase64 ?? string.Empty);
        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var js = reader.IsDBNull(0) ? string.Empty : reader.GetString(0);
            var t = reader.IsDBNull(1) ? DateTime.MinValue : reader.GetDateTime(1);
            return (js, t);
        }
        return null;
    }
    #endregion
}
