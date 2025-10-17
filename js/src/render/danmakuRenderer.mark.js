// 动态计数标记（“+n”徽标）逻辑
import { maybeRewriteStyleFont, canvasHeight } from './danmakuRenderer.font';
import { isDynamicMarkEnabled, getMarkThreshold } from './danmakuRenderer.settings';

// 单独维护 dpr，避免与主模块耦合
var dpr = typeof window !== 'undefined' && window.devicePixelRatio || 1;

/**
 * 根据 mark_count（时间点列表，秒）动态为弹幕文本追加 " +n" 后缀，并在需要时重建画布
 * 仅当 n 发生变化时才更新，以降低开销
 * @param {HTMLCanvasElement} stage 舞台（用于获取字体尺寸）
 * @param {Object} cmt 弹幕对象（期望包含 mark_count 数组）
 * @param {number} ct 当前时间（秒）
 * @param {Function} createCommentCanvas 用于重建基础或带徽标的画布（由主模块注入，避免循环依赖）
 */
export function updateMarkSuffix(stage, cmt, ct, createCommentCanvas) {
  try {
    var enabled = isDynamicMarkEnabled();
    if (!enabled) {
      if (cmt && (cmt._markShown && cmt._markShown > 0 || typeof cmt.render === 'function')) {
        cmt._markShown = 0;
        cmt.render = null;
        try {
          cmt.width = undefined; cmt.height = undefined;
          var fs0 = stage && stage._fontSize ? stage._fontSize : { root: 16, container: 16 };
          cmt.canvas = createCommentCanvas(cmt, fs0);
        } catch (_) { }
      }
      if (cmt) { cmt._scaleStart = undefined; cmt._scaleCurrent = 1; }
      return;
    }

    var list = cmt && cmt.mark_count;
    if (!Array.isArray(list) || list.length <= 1) {
      if (cmt._markShown && cmt._markShown > 0) {
        cmt._markShown = 0;
        cmt.render = null;
        try {
          cmt.width = undefined; cmt.height = undefined;
          cmt.canvas = createCommentCanvas(cmt, stage && stage._fontSize ? stage._fontSize : { root: 16, container: 16 });
        } catch (_) { }
      }
      if (cmt) cmt._occupiedWidth = undefined;
      return;
    }

    if (!cmt._markTimes) {
      try { cmt._markTimes = list.slice().sort(function (a, b) { return a - b; }); } catch (_) { cmt._markTimes = []; }
      if (!cmt._markBaseText) cmt._markBaseText = (cmt.text == null ? '' : String(cmt.text));
      cmt._markShown = 0;
      cmt._markDisplay = false;
    }

    var times = cmt._markTimes;
    if (!times || times.length === 0) return;

    // 由于 lowerBoundNumber 在 utils 中，这里采用本地实现以避免额外依赖
    function lowerBoundNumber(arr, key) {
      var l = 0, r = arr.length;
      while (l < r) {
        var m = (l + r) >> 1;
        if (arr[m] <= key) l = m + 1; else r = m;
      }
      return l;
    }

    var reached = lowerBoundNumber(times, ct);
    var show = reached;
    var threshold = getMarkThreshold();
    var displayNow = (show > threshold);
    var prevDisplay = !!cmt._markDisplay;
    if (show === cmt._markShown && displayNow === prevDisplay) return;

    if (typeof cmt._markShown === 'number' && show > cmt._markShown && show > 5) {
      cmt._scaleStart = ct;
      cmt._scaleDuration = 0.35;
      cmt._scalePeak = 1.25;
    }
    cmt._markShown = show;
    cmt._markDisplay = displayNow;

    if (displayNow) {
      var baseText = cmt._markBaseText;
      var style = cmt.style || {};
      var fontStr = style.font || '25px sans-serif';
      var strokeWidth = style.lineWidth * 1;
      strokeWidth = (strokeWidth > 0 && strokeWidth !== Infinity)
        ? Math.ceil(strokeWidth)
        : !!style.strokeStyle * 1;
      var fsConf = (stage && stage._fontSize) ? stage._fontSize : { root: 16, container: 16 };

      // 可扩展的颜色工具与色标配置
      function hexToRgbLocal(hex) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
      }
      function rgbToHexLocal(r, g, b) {
        function toHex(v) { var x = Math.max(0, Math.min(255, Math.round(v))); var s = x.toString(16); return s.length === 1 ? '0' + s : s; }
        return '#' + toHex(r) + toHex(g) + toHex(b);
      }
      function lerpLocal(a, b, t) { return a + (b - a) * t; }
      function lerpColor(aHex, bHex, t) {
        var a = hexToRgbLocal(aHex), b = hexToRgbLocal(bHex);
        return rgbToHexLocal(
          lerpLocal(a.r, b.r, t),
          lerpLocal(a.g, b.g, t),
          lerpLocal(a.b, b.b, t)
        );
      }
      // 颜色停靠点：value 为 show 值，color 为十六进制颜色
      // 只需改这里即可扩展更多节点
      var BADGE_COLOR_STOPS = [
        { value: 2,  color: 'rgba(103, 120, 199, 1)' }, // 蓝
        { value: 5,  color: '#72cc2e' }, // 绿
        { value: 10, color: '#e67e22' }, // 橙
        { value: 30, color: '#e74c3c' }, // 红（封顶）
      ];
      function getBadgeColorByStops(val) {
        if (!Array.isArray(BADGE_COLOR_STOPS) || BADGE_COLOR_STOPS.length === 0) return '#ffffff';
        // 边界：小于最小值/大于最大值直接返回端点色
        if (val <= BADGE_COLOR_STOPS[0].value) return BADGE_COLOR_STOPS[0].color;
        var last = BADGE_COLOR_STOPS[BADGE_COLOR_STOPS.length - 1];
        if (val >= last.value) return last.color;
        // 在相邻停靠点之间线性插值
        for (var i = 1; i < BADGE_COLOR_STOPS.length; i++) {
          var left = BADGE_COLOR_STOPS[i - 1];
          var right = BADGE_COLOR_STOPS[i];
          if (val <= right.value) {
            var span = Math.max(1e-6, right.value - left.value);
            var t = (val - left.value) / span;
            return lerpColor(left.color, right.color, t);
          }
        }
        return last.color;
      }
      var badgeColor = getBadgeColorByStops(show);

      cmt.render = function () {
        var cvs = document.createElement('canvas');
        var ctx = cvs.getContext('2d');
        var s = Object.assign({}, style);
        s.font = fontStr;
        s.textBaseline = s.textBaseline || 'bottom';
        maybeRewriteStyleFont(s);
        ctx.font = s.font;
        var tw = Math.max(1, Math.ceil(ctx.measureText(baseText).width));
        var th = Math.ceil(canvasHeight(s.font, fsConf));

        var d = Math.max(6, Math.round(th * 0.6));
        var r = d / 2;
        var gap = Math.max(2, Math.round(th * 0.2));

        var width = tw + strokeWidth * 2 + gap + d;
        var height = th + strokeWidth * 2;
        cvs.width = width * dpr;
        cvs.height = height * dpr;
        ctx.scale(dpr, dpr);

        for (var key in s) ctx[key] = s[key];

        var baseline = 0;
        switch (s.textBaseline) {
          case 'top':
          case 'hanging': baseline = strokeWidth; break;
          case 'middle': baseline = height >> 1; break;
          default: baseline = height - strokeWidth;
        }

        if (s.strokeStyle) ctx.strokeText(baseText, strokeWidth, baseline);
        ctx.fillText(baseText, strokeWidth, baseline);

        var cx = strokeWidth + tw + gap + r;
        var cy = baseline - r;
        ctx.beginPath();
        ctx.fillStyle = badgeColor;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        var fontSizeRatio = show >= 10 ? 0.6 : 0.7;
        var innerFontPx = Math.max(8, Math.floor(d * fontSizeRatio));
        var fam = 'sans-serif';
        try { var m = s.font.match(/\b\d+(?:\.\d+)?px\s+(.+)$/); if (m) fam = m[1]; } catch (_) { }
        ctx.font = innerFontPx + 'px ' + fam;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(show, cx, cy);

        ctx.textAlign = undefined;
        ctx.textBaseline = undefined;
        return cvs;
      };

      try {
        cmt.width = undefined; cmt.height = undefined;
        cmt.canvas = createCommentCanvas(cmt, fsConf);
      } catch (_) { }
      try {
        var textCanvas = document.createElement('canvas');
        var tctx = textCanvas.getContext('2d');
        var s2 = Object.assign({}, style); s2.font = fontStr; s2.textBaseline = s2.textBaseline || 'bottom'; maybeRewriteStyleFont(s2);
        tctx.font = s2.font;
        var tw2 = Math.max(1, Math.ceil(tctx.measureText(baseText).width));
        var th2 = Math.ceil(canvasHeight(s2.font, fsConf));
        var d2 = Math.max(6, Math.round(th2 * 0.6));
        var gap2 = Math.max(2, Math.round(th2 * 0.2));
        var stroke2 = strokeWidth * 2;
        cmt._textWidth = tw2;
        cmt._textLeft = strokeWidth;
        cmt._baseWidth = tw2 + stroke2;
        cmt._occupiedWidth = tw2 + stroke2 + gap2 + d2;
      } catch (_) { cmt._occupiedWidth = cmt.width; }
    } else {
      cmt.render = null;
      try {
        cmt.width = undefined; cmt.height = undefined;
        cmt.canvas = createCommentCanvas(cmt, stage && stage._fontSize ? stage._fontSize : { root: 16, container: 16 });
      } catch (_) { }
      cmt._occupiedWidth = undefined;
      cmt._textWidth = undefined;
      cmt._textLeft = undefined;
      cmt._baseWidth = undefined;
    }
  } catch (e) { /* ignore */ }
}
