using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Providers;
using MediaBrowser.Controller.Entities;

namespace Jellyfin.Plugin.DanmakuExtension.Providers
{
    /// <summary>
    /// 在“编辑元数据”页面暴露 danmaku 字段（映射到 ProviderIds["danmaku"]）。
    /// </summary>
    public class DanmakuExternalId : IExternalId
    {
        public string ProviderName => "Danmaku";   // UI 显示名

        // 必须与 ProviderIds 的键一致
        public string Key => "danmaku";

        // 返回 null 表示适用于所有媒体类型；如需限定可改为 ExternalIdMediaType.Movie/Series 等
        public ExternalIdMediaType? Type => null;

    // 返回空串以避免在 UI 生成可点击外链
    public string UrlFormatString => string.Empty;

        public bool Supports(IHasProviderIds item)
        {
            // 仅 BaseItem 能查询所属媒体库
            if (item is not BaseItem baseItem)
            {
                return false;
            }

            // 从插件配置读取允许的媒体库列表（为空或未配置 => 对所有库显示）
            var enabledIds = Plugin.Instance?.Configuration?.EnabledLibraryIds;
            if (enabledIds == null || enabledIds.Count == 0)
            {
                // 空列表/未配置：对所有库不生效
                return false;
            }

            // 解析为 Guid，忽略无效条目
            var enabledGuids = new HashSet<Guid>(
                enabledIds.Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                           .Where(g => g != Guid.Empty));

            if (enabledGuids.Count == 0)
            {
                // 解析后为空：对所有库不生效
                return false;
            }

            // 获取该条目所在的集合文件夹（媒体库）并比对
            var folders = BaseItem.LibraryManager.GetCollectionFolders(baseItem);
            foreach (var folder in folders)
            {
                if (enabledGuids.Contains(folder.Id))
                {
                    return true;
                }
            }
            return false;
        }
    }

    // 不提供 IExternalUrlProvider，实现纯输入字段，无外链
}
