using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    #region 数据库操作
    public async Task InitializeDatabaseAsync()
    {
        // 始终打开数据库，确保所有表存在（支持升级）
        using var connection = await OpenConnectionAsync();

        var createTableSql = @"
            DROP TABLE IF EXISTS danmaku_cache;
            CREATE TABLE IF NOT EXISTS req_cache (
                cache_key TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                cache_time DATETIME NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS cache_stats (
                id INTEGER PRIMARY KEY,
                hit_count INTEGER NOT NULL DEFAULT 0,
                miss_count INTEGER NOT NULL DEFAULT 0
            );
            
            CREATE TABLE IF NOT EXISTS user_configs (
                user_id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL,
                updated_at DATETIME NOT NULL
            );

            CREATE TABLE IF NOT EXISTS custom_js_entries (
                ""index"" INTEGER PRIMARY KEY,
                data_type TEXT NOT NULL,
                name TEXT NOT NULL,
                data_base64 TEXT,
                updated_at DATETIME NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS js_net_cache (
                url_base64 TEXT PRIMARY KEY,
                js_base64 TEXT NOT NULL,
                updated_at DATETIME NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_cache_time ON req_cache(cache_time);

            -- 匹配数据表
            CREATE TABLE IF NOT EXISTS match_data (
                preferred_id TEXT PRIMARY KEY,
                anime_id INTEGER NOT NULL,
                anime_title TEXT,
                image_url TEXT,
                offset INTEGER NOT NULL
            );
            
            -- 初始化统计数据
            INSERT OR IGNORE INTO cache_stats (id, hit_count, miss_count) VALUES (1, 0, 0);
        ";

        using var command = new SqliteCommand(createTableSql, connection);
        await command.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// 覆盖式保存自定义 JS/URL 条目
    /// </summary>
    public async Task<int> SaveCustomJsEntriesAsync(IEnumerable<CustomJsEntryDto>? entries)
    {
        await InitializeDatabaseAsync();

        using var connection = await OpenConnectionAsync();

        using var tx = await connection.BeginTransactionAsync();

        // 清空表，覆盖式更新
        var deleteSql = "DELETE FROM custom_js_entries";
        using (var del = new SqliteCommand(deleteSql, connection, (SqliteTransaction)tx))
        {
            await del.ExecuteNonQueryAsync();
        }

        int inserted = 0;
        if (entries != null)
        {
            var insertSql = @"
                INSERT INTO custom_js_entries
                    (""index"", data_type, name, data_base64, updated_at)
                VALUES
                    (@index, @data_type, @name, @data_base64, @updated_at)
            ";

            foreach (var e in entries)
            {
                if (e == null) continue;
                var dataType = string.IsNullOrWhiteSpace(e.DataType) ? "js" : e.DataType.Trim().ToLowerInvariant();
                var name = e.Name ?? string.Empty;
                var base64 = e.DataBase64 ?? string.Empty;

                using var cmd = new SqliteCommand(insertSql, connection, (SqliteTransaction)tx);
                cmd.Parameters.AddWithValue("@index", e.Index);
                cmd.Parameters.AddWithValue("@data_type", dataType);
                cmd.Parameters.AddWithValue("@name", name);
                cmd.Parameters.AddWithValue("@data_base64", base64);
                cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow);
                inserted += await cmd.ExecuteNonQueryAsync();
            }
        }

        await tx.CommitAsync();
        _logger.LogInformation("Saved {Count} custom_js_entries (overwrite mode)", inserted);
        return inserted;
    }

    public async Task SaveDanmakuToCache(string cacheKey, string content)
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var insertSql = @"
                INSERT OR REPLACE INTO req_cache 
                (cache_key, content, cache_time) 
                VALUES (@cache_key, @content, @cache_time)
            ";

            using var command = new SqliteCommand(insertSql, connection);
            command.Parameters.AddWithValue("@cache_key", cacheKey);
            command.Parameters.AddWithValue("@content", content);
            command.Parameters.AddWithValue("@cache_time", DateTime.UtcNow);

            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            // 记录错误但不影响主要功能
            Console.WriteLine($"Error saving danmaku to cache: {ex.Message}");
        }
    }

    /// <summary>
    /// 保存用户配置到数据库（直接存储 DanmakuConfig 的 JSON）
    /// </summary>
    public async Task SaveUserConfigAsync(string userId, DanmakuConfig config)
    {
        using var connection = await OpenConnectionAsync();

        var sql = @"
            INSERT OR REPLACE INTO user_configs (user_id, config_json, updated_at)
            VALUES (@user_id, @config_json, @updated_at)
        ";

        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@user_id", userId);
        var json = JsonSerializer.Serialize(config);
        cmd.Parameters.AddWithValue("@config_json", json);
        cmd.Parameters.AddWithValue("@updated_at", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// 根据用户ID读取用户配置（反序列化为 DanmakuConfig）
    /// </summary>
    public async Task<DanmakuConfig?> GetUserConfigAsync(string userId)
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var sql = "SELECT config_json FROM user_configs WHERE user_id = @user_id";
            using var cmd = new SqliteCommand(sql, connection);
            cmd.Parameters.AddWithValue("@user_id", userId);

            var result = await cmd.ExecuteScalarAsync();
            if (result != null)
            {
                var configJson = result.ToString();
                if (!string.IsNullOrEmpty(configJson))
                {
                    return JsonSerializer.Deserialize<DanmakuConfig>(configJson);
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading user config for user: {UserId}", userId);
            return null;
        }
    }

    public async Task<string?> GetFromCache(string cacheKey)
    {
        try
        {
            var cfg = Plugin.Instance?.Configuration ?? new PluginConfiguration();
            var cacheMinutes = cfg.DanmakuCacheMinutes;

            // 如果设置为不缓存，直接返回null
            if (cacheMinutes == 0)
            {
                return null;
            }

            using var connection = await OpenConnectionAsync();

            var selectSql = @"
                SELECT content, cache_time 
                FROM req_cache 
                WHERE cache_key = @cache_key
            ";

            using var command = new SqliteCommand(selectSql, connection);
            command.Parameters.AddWithValue("@cache_key", cacheKey);

            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                var content = reader.GetString(0); // content 字段
                var cacheTime = reader.GetDateTime(1); // cache_time 字段

                // 如果设置为永久缓存，直接返回
                if (cacheMinutes == -1)
                {
                    return content;
                }

                // 检查是否过期
                var expireTime = cacheTime.AddMinutes(cacheMinutes);
                if (DateTime.UtcNow <= expireTime)
                {
                    return content;
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            // 记录错误但不影响主要功能
            Console.WriteLine($"Error getting from cache: {ex.Message}");
            return null;
        }
    }

    public async Task IncrementCacheHitAsync()
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var updateSql = "UPDATE cache_stats SET hit_count = hit_count + 1 WHERE id = 1";
            using var command = new SqliteCommand(updateSql, connection);
            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "更新缓存命中统计失败");
        }
    }

    public async Task IncrementCacheMissAsync()
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var updateSql = "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1";
            using var command = new SqliteCommand(updateSql, connection);
            await command.ExecuteNonQueryAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "更新缓存未命中统计失败");
        }
    }

    /// <summary>
    /// 保存匹配结果到 match_data 表（按 preferred_id 覆盖写入）。
    /// </summary>
    public async Task SaveMatchDataAsync(Guid preferredId, long animeId, string? animeTitle, string? imageUrl, int offset)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"
            INSERT OR REPLACE INTO match_data (preferred_id, anime_id, anime_title, image_url, offset)
            VALUES (@preferred_id, @anime_id, @anime_title, @image_url, @offset)
        ";

        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@preferred_id", preferredId.ToString());
        cmd.Parameters.AddWithValue("@anime_id", animeId);
        cmd.Parameters.AddWithValue("@anime_title", (object?)animeTitle ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@image_url", (object?)imageUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@offset", offset);
        await cmd.ExecuteNonQueryAsync();

        _logger.LogInformation("Saved match_data: preferred_id={PreferredId}, anime_id={AnimeId}, offset={Offset}", preferredId, animeId, offset);
    }

    /// <summary>
    /// 按 preferred_id 读取一条 match_data（若存在）。
    /// 返回 (animeId, offset, animeTitle, imageUrl)；不存在则返回 null。
    /// </summary>
    public async Task<(long AnimeId, int Offset, string? AnimeTitle, string? ImageUrl)?> GetMatchDataByPreferredIdAsync(Guid preferredId)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = @"SELECT anime_id, offset, anime_title, image_url FROM match_data WHERE preferred_id = @preferred_id LIMIT 1";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@preferred_id", preferredId.ToString());

        using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            var animeId = reader.GetInt64(0);
            var offset = reader.GetInt32(1);
            string? animeTitle = reader.IsDBNull(2) ? null : reader.GetString(2);
            string? imageUrl = reader.IsDBNull(3) ? null : reader.GetString(3);
            return (animeId, offset, animeTitle, imageUrl);
        }

        return null;
    }

    public async Task<(int HitCount, int MissCount)> GetCacheStatsAsync()
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var selectSql = "SELECT hit_count, miss_count FROM cache_stats WHERE id = 1";
            using var command = new SqliteCommand(selectSql, connection);
            using var reader = await command.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                return (reader.GetInt32(0), reader.GetInt32(1));
            }

            return (0, 0);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "获取缓存统计失败");
            return (0, 0);
        }
    }

    public async Task<int> GetCacheCountAsync()
    {
        try
        {
            using var connection = await OpenConnectionAsync();

            var selectSql = "SELECT COUNT(*) FROM req_cache";
            using var command = new SqliteCommand(selectSql, connection);
            var result = await command.ExecuteScalarAsync();

            return Convert.ToInt32(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "获取缓存数量失败");
            return 0;
        }
    }

    public async Task<int> ResetCacheDatabase()
    {
        // 确保数据库已初始化
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        // 清空弹幕缓存表
        var clearCacheSql = "DELETE FROM req_cache";
        using var clearCacheCommand = new SqliteCommand(clearCacheSql, connection);
        var deletedRows = await clearCacheCommand.ExecuteNonQueryAsync();

        // 重置统计数据
        var resetStatsSql = "UPDATE cache_stats SET hit_count = 0, miss_count = 0 WHERE id = 1";
        using var resetStatsCommand = new SqliteCommand(resetStatsSql, connection);
        await resetStatsCommand.ExecuteNonQueryAsync();

        _logger.LogInformation("Cache database reset: {DeletedRows} cache entries cleared, stats reset", deletedRows);

        return deletedRows;
    }

    /// <summary>
    /// 根据 preferred_id 删除 match_data 表中的记录。
    /// 返回删除的行数。
    /// </summary>
    public async Task<int> DeleteMatchDataByPreferredIdAsync(Guid preferredId)
    {
        await InitializeDatabaseAsync();
        using var connection = await OpenConnectionAsync();

        var sql = "DELETE FROM match_data WHERE preferred_id = @preferred_id";
        using var cmd = new SqliteCommand(sql, connection);
        cmd.Parameters.AddWithValue("@preferred_id", preferredId.ToString());
        var rows = await cmd.ExecuteNonQueryAsync();
        _logger.LogInformation("Deleted {Rows} rows from match_data for preferred_id={PreferredId}", rows, preferredId);
        return rows;
    }
    #endregion
}
