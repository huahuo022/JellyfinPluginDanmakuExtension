using MediaBrowser.Model.Plugins;
using System.Xml.Serialization;

namespace Jellyfin.Plugin.DanmakuExtension;

/// <summary>
/// 弹幕扩展插件配置类
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
	/// <summary>
	/// 是否启用自定义JavaScript代码注入
	/// </summary>
	[XmlElement("EnableInjection")]
	public bool EnableInjection { get; set; } = false;

	/// <summary>
	/// 注入使用 /web 下的静态文件
	/// </summary>
	[XmlElement("ScriptRelativePath")]
	public string ScriptRelativePath { get; set; } = "danmaku_custom.js";

	/// <summary>
	/// 启用弹幕的媒体库ID列表
	/// </summary>
	[XmlArray("EnabledLibraryIds")]
	[XmlArrayItem("LibraryId")]
	public List<string> EnabledLibraryIds { get; set; } = new List<string>();

	/// <summary>
	/// 弹幕缓存时间(分钟)，-1表示永久缓存，0表示不缓存，1-525600表示缓存分钟数(最多365天)
	/// </summary>
	[XmlElement("DanmakuCacheMinutes")]
	public int DanmakuCacheMinutes { get; set; } = 60;

	// 以下为开发/部署用隐藏配置（不在 UI 页面展示）
	/// <summary>
	/// dandanplay 应用 ID（用于生成请求头）
	/// </summary>
	[XmlElement("DandanplayAppId")]
	public string? DandanplayAppId { get; set; } = "";

	/// <summary>
	/// dandanplay 应用密钥（用于生成请求头）
	/// </summary>
	[XmlElement("DandanplayAppSecret")]
	public string? DandanplayAppSecret { get; set; } = "";

	/// <summary>
	/// 代理基地址（填写后将通过代理访问，且不再生成 dandanplay 签名头）
	/// 例如：https://your-proxy.example.com
	/// </summary>
	[XmlElement("DandanplayProxyBaseUrl")]
	public string? DandanplayProxyBaseUrl { get; set; } = string.Empty;

	/// <summary>
	/// 自定义服务器基地址（填写后将使用此地址替代官方 api.dandanplay.net，并不再生成签名头）
	/// 例如：https://api.your-dandan-server.com
	/// </summary>
	[XmlElement("DandanplayServerBaseUrl")]
	public string? DandanplayServerBaseUrl { get; set; } = string.Empty;
}