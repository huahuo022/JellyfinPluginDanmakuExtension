// danmakuCanvas 设置相关工具

function __getGlobal() {
  try {
    return (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {});
  } catch (_) { return {}; }
}

/**
 * 是否启用“动态加号”计数标记
 * 由全局设置 window.__jfDanmakuGlobal__.danmakuSettings 的 mark_style 控制
 */
export function isDynamicMarkEnabled() {
  try {
    var g = __getGlobal();
    var val = g && g.danmakuSettings && g.danmakuSettings.get && g.danmakuSettings.get('mark_style');
    return val === 'dynamic';
  } catch (_) { return false; }
}

/**
 * 读取合并计数的显示阈值 mark_threshold（严格大于此值才显示），默认 1，范围 1..20
 */
export function getMarkThreshold() {
  try {
    var g = __getGlobal();
    var v = g && g.danmakuSettings && g.danmakuSettings.get && g.danmakuSettings.get('mark_threshold');
    var n = Number(v);
    if (!isFinite(n)) n = 1;
    if (n < 1) n = 1; else if (n > 20) n = 20;
    return n;
  } catch (_) { return 1; }
}
