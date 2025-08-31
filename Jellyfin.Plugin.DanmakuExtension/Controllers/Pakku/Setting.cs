

namespace Jellyfin.Plugin.DanmakuExtension.Controllers;


public partial class Pakku
{
    #region 运行常量与设置 // Pakku.Setting.cs
    // ======== 对应 post_combine 常量/选项 ========
    private const int DISPVAL_TIME_THRESHOLD = 5000; // ms
    private const double DISPVAL_POWER = 0.35;       // 用于 shrink 比率
    private const double SHRINK_MAX_RATE = 1.732;    // 最大缩放倍数
    #endregion

}
