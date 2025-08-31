

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;

public partial class DanmakuService
{
    #region 路径和工具方法
    public string GetCustomJsPath()
    {
        // Only use WebPath; if not available, return empty to indicate unsupported.
        if (string.IsNullOrWhiteSpace(_paths.WebPath))
        {
            return string.Empty;
        }
        return Path.Combine(_paths.WebPath, "danmaku_custom.js");
    }

    public string GetDatabasePath()
    {
        // 使用Jellyfin提供的插件数据目录
        var dataPath = _paths.PluginConfigurationsPath;
        var pluginDataDir = Path.Combine(dataPath, "DanmakuExtension");

        // 确保目录存在
        Directory.CreateDirectory(pluginDataDir);

        return Path.Combine(pluginDataDir, "danmaku.db");
    }

    /// <summary>
    /// 打开 SQLite 连接，并设置 WAL 与 busy_timeout 以缓解并发锁冲突。
    /// </summary>
    private async Task<Microsoft.Data.Sqlite.SqliteConnection> OpenConnectionAsync()
    {
        var dbPath = GetDatabasePath();
        var conn = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={dbPath};Cache=Shared");
        await conn.OpenAsync();
        // 设置 WAL 模式（提升读写并发），并设置忙等待时间（毫秒）
        using (var pragma = conn.CreateCommand())
        {
            pragma.CommandText = "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;";
            // 忽略返回值，仅确保 PRAGMA 生效
            await pragma.ExecuteNonQueryAsync();
        }
        return conn;
    }


    #endregion
}
