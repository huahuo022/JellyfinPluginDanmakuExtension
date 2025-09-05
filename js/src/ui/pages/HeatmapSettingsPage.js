import { saveIfAutoOn } from "../../api/utils";

// 密度图设置分页：仅包含“弹幕密度图”开关/模式
export class HeatmapSettingsPage {
  constructor(opts = {}) { this.logger = opts.logger || null; }
  getKey() { return 'heatmap'; }
  getLabel() { return '密度图'; }

  // 读取并解析 heatmap_style JSON（带默认值与兜底）
  _getStyle() {
    try {
      const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
      const s = g.danmakuSettings;
      const raw = s?.get?.('heatmap_style');
      const def = { lineWidth: 1, lineColor: '#3498db', gradientColorStart: 'rgba(52, 152, 219, 0.08)', gradientColorEnd: 'rgba(52, 152, 219, 0.25)' };
      if (!raw || typeof raw !== 'string') return def;
      try {
        const obj = JSON.parse(raw);
        return { ...def, ...(obj || {}) };
      } catch (_) { return def; }
    } catch (_) {
      return { lineWidth: 1, lineColor: '#3498db', gradientColorStart: 'rgba(52, 152, 219, 0.08)', gradientColorEnd: 'rgba(52, 152, 219, 0.25)' };
    }
  }

  // 持久化部分样式变更，并实时更新渲染器
  _setStyle(partial = {}) {
    try {
      const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
      const s = g.danmakuSettings;
      const current = this._getStyle();
      const merged = { ...current, ...(partial || {}) };
      s?.set?.('heatmap_style', JSON.stringify(merged));
      // 实时更新渲染器
      try { g.heatmapRenderer?.updateStyles?.({
        lineWidth: merged.lineWidth,
        lineColor: merged.lineColor,
        gradientColorStart: merged.gradientColorStart,
        gradientColorEnd: merged.gradientColorEnd,
      }); } catch (_) { }
      // 自动保存（若开启）
      try { import('../../api/utils').then(m => m.saveIfAutoOn?.(this.logger)); } catch (_) { }
    } catch (_) { }
  }

  _createLineWidthRow() {
    const style = this._getStyle();
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'heatmap_lineWidth');
    row.setAttribute('data-type', 'number');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '线条粗细';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';

  const range = document.createElement('input');
  range.type = 'range'; range.min = '0.1'; range.max = '4.0'; range.step = '0.1';
  range.value = String(Number(style.lineWidth ?? 1));
  range.style.flex = '1 1 auto';
  range.style.height = '24px';

  const val = document.createElement('div');
  val.textContent = `${String(Number(style.lineWidth ?? 1))} px`;
  val.style.minWidth = '48px';
  val.style.textAlign = 'center';
  val.style.opacity = '.9';

    const apply = (valStr, src) => {
      let v = parseFloat(valStr);
      if (!isFinite(v)) return;
      if (v < 0.1) v = 0.1; else if (v > 4.0) v = 4.0;
      range.value = String(v);
      try { val.textContent = `${v} px`; } catch (_) {}
      this._setStyle({ lineWidth: v });
      this.logger?.info?.('[HeatmapSettings] lineWidth ->', v, '(from', src, ')');
    };

    range.addEventListener('input', () => apply(range.value, 'range'));

    wrap.appendChild(range);
    wrap.appendChild(val);
    row.appendChild(wrap);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  _createLineColorRow() {
    const style = this._getStyle();
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'heatmap_lineColor');
    row.setAttribute('data-type', 'color');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '线条颜色';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';

    const color = document.createElement('input');
    color.type = 'color';
    // 尝试解析为十六进制；若为 rgba 则转换为 hex（忽略 alpha）
    const toHex = (col) => {
      if (typeof col !== 'string' || !col) return '#3498db';
      const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
      if (hexMatch) return '#' + hexMatch[1].toLowerCase();
      const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgba) {
        const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
        const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
        const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
        const hex = (n) => n.toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
      }
      return '#3498db';
    };
    color.value = toHex(style.lineColor);
    color.className = 'danmaku-setting-input';
    color.style.width = '44px'; color.style.padding = '0'; color.style.height = '24px';

    const text = document.createElement('input');
    text.type = 'text'; text.value = style.lineColor || '#3498db';
    text.className = 'danmaku-setting-input';
    text.style.flex = '1 1 auto';

    const apply = (val, src) => {
      if (!val || typeof val !== 'string') return;
      this._setStyle({ lineColor: val });
      // 同步两个输入的表现
      try { color.value = toHex(val); } catch (_) {}
      try { text.value = val; } catch (_) {}
      this.logger?.info?.('[HeatmapSettings] lineColor ->', val, '(from', src, ')');
    };

    color.addEventListener('input', () => apply(color.value, 'color'));
    text.addEventListener('change', () => apply(text.value.trim(), 'text'));

    wrap.appendChild(color); wrap.appendChild(text);
    row.appendChild(wrap);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  _createGradientColorsRow() {
    const style = this._getStyle();
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'heatmap_gradientColors');
    row.setAttribute('data-type', 'color');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '渐变颜色（起/止）';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'auto 1fr auto 1fr';
    wrap.style.gap = '8px';
    wrap.style.alignItems = 'center';

    const toHex = (col, fallback = '#3498db') => {
      if (typeof col !== 'string' || !col) return fallback;
      const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
      if (hexMatch) return '#' + hexMatch[1].toLowerCase();
      const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgba) {
        const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
        const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
        const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
        const hex = (n) => n.toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
      }
      return fallback;
    };
    const getAlpha = (col, fallback) => {
      const m = (typeof col === 'string') && col.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)/i);
      if (m) {
        const a = parseFloat(m[1]);
        return isFinite(a) ? Math.max(0, Math.min(1, a)) : fallback;
      }
      return fallback;
    };
    const makeRgba = (hex, alpha = 1) => {
      const h = (hex || '').replace('#', '');
      if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const startAlpha = getAlpha(style.gradientColorStart, 0.08);
    const endAlpha = getAlpha(style.gradientColorEnd, 0.25);

    const startColor = document.createElement('input'); startColor.type = 'color'; startColor.className = 'danmaku-setting-input'; startColor.style.width = '44px'; startColor.style.height = '24px'; startColor.style.padding = '0'; startColor.value = toHex(style.gradientColorStart, '#3498db');
    const startText = document.createElement('input'); startText.type = 'text'; startText.className = 'danmaku-setting-input'; startText.style.width = '100%'; startText.value = style.gradientColorStart || 'rgba(52, 152, 219, 0.08)';

    const endColor = document.createElement('input'); endColor.type = 'color'; endColor.className = 'danmaku-setting-input'; endColor.style.width = '44px'; endColor.style.height = '24px'; endColor.style.padding = '0'; endColor.value = toHex(style.gradientColorEnd, '#3498db');
    const endText = document.createElement('input'); endText.type = 'text'; endText.className = 'danmaku-setting-input'; endText.style.width = '100%'; endText.value = style.gradientColorEnd || 'rgba(52, 152, 219, 0.25)';

    const applyStart = (srcVal, src) => {
      let val = srcVal || '';
      if (src === 'color') { // 从色板将 hex 合成带 alpha 的 rgba，沿用当前 alpha
        val = makeRgba(startColor.value, startAlpha);
        startText.value = val;
      }
      this._setStyle({ gradientColorStart: val });
      this.logger?.info?.('[HeatmapSettings] gradientColorStart ->', val, '(from', src, ')');
    };
    const applyEnd = (srcVal, src) => {
      let val = srcVal || '';
      if (src === 'color') {
        val = makeRgba(endColor.value, endAlpha);
        endText.value = val;
      }
      this._setStyle({ gradientColorEnd: val });
      this.logger?.info?.('[HeatmapSettings] gradientColorEnd ->', val, '(from', src, ')');
    };

    startColor.addEventListener('input', () => applyStart(startColor.value, 'color'));
    startText.addEventListener('change', () => applyStart(startText.value.trim(), 'text'));
    endColor.addEventListener('input', () => applyEnd(endColor.value, 'color'));
    endText.addEventListener('change', () => applyEnd(endText.value.trim(), 'text'));

    // 布局：起色板 + 起文本 + 止色板 + 止文本
    wrap.appendChild(startColor); wrap.appendChild(startText); wrap.appendChild(endColor); wrap.appendChild(endText);
    row.appendChild(wrap);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  // 合并三个颜色选择为同一栏：线条颜色 + 渐变开始 + 渐变结束（下方显示只读文本）
  _createColorsRow() {
    const style = this._getStyle();
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'heatmap_colors');
    row.setAttribute('data-type', 'color');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '颜色设置';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = '1fr 1fr';
  wrap.style.gap = '12px';
  wrap.style.alignItems = 'center';

    const toHex = (col, fallback = '#3498db') => {
      if (typeof col !== 'string' || !col) return fallback;
      const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
      if (hexMatch) return '#' + hexMatch[1].toLowerCase();
      const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgba) {
        const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
        const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
        const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
        const hex = (n) => n.toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
      }
      return fallback;
    };
    const getAlpha = (col, fallback) => {
      const m = (typeof col === 'string') && col.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)/i);
      if (m) {
        const a = parseFloat(m[1]);
        return isFinite(a) ? Math.max(0, Math.min(1, a)) : fallback;
      }
      return fallback;
    };
    const makeRgba = (hex, alpha = 1) => {
      const h = (hex || '').replace('#', '');
      if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // 线条颜色（2:1 预览块 + 弹出选择器）
  const lineWrap = document.createElement('div'); lineWrap.style.display = 'flex'; lineWrap.style.flexDirection = 'column'; lineWrap.style.gap = '6px'; lineWrap.style.position = 'relative';
    const lineLabel = document.createElement('div'); lineLabel.style.fontSize = '11px'; lineLabel.style.opacity = '.85'; lineLabel.textContent = '线条颜色';

  const lineBlock = document.createElement('div');
  lineBlock.style.width = '100%';
  lineBlock.style.maxWidth = '280px';
  lineBlock.style.aspectRatio = '2 / 1';
  lineBlock.style.borderRadius = '6px';
  lineBlock.style.border = '1px solid rgba(255,255,255,.25)';
  lineBlock.style.cursor = 'pointer';
  lineBlock.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.2)';
  lineBlock.style.position = 'relative';

    const updateLineBlock = () => {
      const st = this._getStyle();
      const col = st.lineColor || '#3498db';
      lineBlock.style.background = col; // 支持 hex 或 rgba
    };
    updateLineBlock();

    // 覆盖在色块上的原生颜色选择器（透明）
    const linePickerOverlay = document.createElement('input');
    linePickerOverlay.type = 'color';
    linePickerOverlay.style.position = 'absolute';
    linePickerOverlay.style.inset = '0';
    linePickerOverlay.style.width = '100%';
    linePickerOverlay.style.height = '100%';
    linePickerOverlay.style.opacity = '0';
    linePickerOverlay.style.cursor = 'pointer';
    linePickerOverlay.style.border = 'none';
    linePickerOverlay.style.padding = '0';
    linePickerOverlay.style.margin = '0';
    linePickerOverlay.style.zIndex = '1';
    linePickerOverlay.value = toHex(style.lineColor, '#3498db');
    linePickerOverlay.addEventListener('input', () => {
      const hex = linePickerOverlay.value;
      // 保留当前 alpha
      const currentAlpha = getAlpha(this._getStyle().lineColor, 1);
      const rgba = makeRgba(hex, currentAlpha);
      this._setStyle({ lineColor: rgba });
      updateLineBlock();
      this.logger?.info?.('[HeatmapSettings] lineColor ->', rgba, '(from overlay picker, keep alpha)');
    });

    lineWrap.appendChild(lineLabel);
    lineWrap.appendChild(lineBlock);
    lineBlock.appendChild(linePickerOverlay);

    // 线条颜色透明度竖向滑块（覆盖在右侧，不改变总尺寸）
  const lineAlphaWrap = document.createElement('div');
  lineAlphaWrap.style.position = 'absolute';
  lineAlphaWrap.style.right = '4px';
  lineAlphaWrap.style.top = '0';
  lineAlphaWrap.style.width = '24px';
  lineAlphaWrap.style.height = '100%'; // 与色块等高
  lineAlphaWrap.style.display = 'flex';
  lineAlphaWrap.style.alignItems = 'center';
  lineAlphaWrap.style.justifyContent = 'center';
  lineAlphaWrap.style.zIndex = '3';

    const lineAlpha = document.createElement('input');
  lineAlpha.type = 'range';
  lineAlpha.min = '0'; lineAlpha.max = '1'; lineAlpha.step = '0.01';
  lineAlpha.value = String(getAlpha(style.lineColor, 1));
  // 垂直滑块，长度=容器高度
  lineAlpha.style.appearance = 'slider-vertical';
  lineAlpha.style.WebkitAppearance = 'slider-vertical';
  lineAlpha.style.MozAppearance = 'slider-vertical';
  lineAlpha.style.writingMode = 'bt-lr';
  lineAlpha.style.height = '100%';
  lineAlpha.style.width = '16px';
  lineAlpha.style.cursor = 'pointer';
    lineAlpha.addEventListener('input', () => {
      const a = Math.max(0, Math.min(1, parseFloat(lineAlpha.value)));
      const st = this._getStyle();
      const hex = toHex(st.lineColor, toHex(style.lineColor, '#3498db'));
      const rgba = makeRgba(hex, a);
      this._setStyle({ lineColor: rgba });
      updateLineBlock();
      this.logger?.info?.('[HeatmapSettings] lineAlpha ->', a);
    });
    lineAlphaWrap.appendChild(lineAlpha);
    lineBlock.appendChild(lineAlphaWrap);

    // 渐变预览 + 弹出选择器（点击预览同时修改两个颜色：结束在上，开始在下）
  const startAlpha = getAlpha(style.gradientColorStart, 0.08);
  const endAlpha = getAlpha(style.gradientColorEnd, 0.25);

    const gradientWrap = document.createElement('div');
    gradientWrap.style.display = 'flex';
    gradientWrap.style.flexDirection = 'column';
    gradientWrap.style.gap = '6px';
    gradientWrap.style.position = 'relative';

    const gradLabel = document.createElement('div');
    gradLabel.style.fontSize = '11px';
    gradLabel.style.opacity = '.85';
    gradLabel.textContent = '渐变填充颜色';

    const gradientBlock = document.createElement('div');
    gradientBlock.style.width = '100%';
    gradientBlock.style.maxWidth = '280px';
    gradientBlock.style.aspectRatio = '2 / 1'; // 2:1 长宽比
    gradientBlock.style.borderRadius = '6px';
    gradientBlock.style.border = '1px solid rgba(255,255,255,.25)';
    gradientBlock.style.cursor = 'pointer';
    gradientBlock.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.2)';

    const updateGradientBlock = () => {
      const st = this._getStyle();
      const start = st.gradientColorStart || 'rgba(52, 152, 219, 0.08)';
      const end = st.gradientColorEnd || 'rgba(52, 152, 219, 0.25)';
      // 结束颜色在上方，开始颜色在下方
      gradientBlock.style.background = `linear-gradient(to bottom, ${end} 0%, ${start} 100%)`;
    };
    updateGradientBlock();

    const toHexSafe = (col, fb = '#3498db') => {
      if (typeof col !== 'string' || !col) return fb;
      const m = col.match(/^#([0-9a-f]{6})$/i);
      if (m) return '#' + m[1].toLowerCase();
      const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (rgba) {
        const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
        const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
        const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
        const hex = (n) => n.toString(16).padStart(2, '0');
        return '#' + hex(r) + hex(g) + hex(b);
      }
      return fb;
    };
    // 覆盖在渐变块上的两个原生选择器：上半=结束颜色，下半=开始颜色，并在中间绘制虚线
    gradientBlock.style.position = 'relative';

  const divider = document.createElement('div');
    divider.style.position = 'absolute';
    divider.style.left = '8px';
    divider.style.right = '8px';
    divider.style.top = '50%';
    divider.style.transform = 'translateY(-0.5px)';
    divider.style.borderTop = '1px dashed rgba(255,255,255,.5)';
    divider.style.pointerEvents = 'none';

    const endPickerOverlay = document.createElement('input');
    endPickerOverlay.type = 'color';
    endPickerOverlay.style.position = 'absolute';
    endPickerOverlay.style.left = '0';
    endPickerOverlay.style.right = '0';
    endPickerOverlay.style.top = '0';
  endPickerOverlay.style.width = '100%';
    endPickerOverlay.style.height = '50%';
    endPickerOverlay.style.opacity = '0';
    endPickerOverlay.style.cursor = 'pointer';
    endPickerOverlay.style.border = 'none';
    endPickerOverlay.style.padding = '0';
    endPickerOverlay.style.margin = '0';
    endPickerOverlay.style.zIndex = '1';
    endPickerOverlay.value = toHexSafe(style.gradientColorEnd, '#3498db');
    endPickerOverlay.addEventListener('input', () => {
      const hex = endPickerOverlay.value;
      const currentA = getAlpha(this._getStyle().gradientColorEnd, 0.25);
      const rgba = makeRgba(hex, currentA);
      this._setStyle({ gradientColorEnd: rgba });
      updateGradientBlock();
      this.logger?.info?.('[HeatmapSettings] gradientColorEnd ->', rgba, '(from overlay picker)');
    });

    const startPickerOverlay = document.createElement('input');
    startPickerOverlay.type = 'color';
    startPickerOverlay.style.position = 'absolute';
    startPickerOverlay.style.left = '0';
    startPickerOverlay.style.right = '0';
    startPickerOverlay.style.bottom = '0';
  startPickerOverlay.style.width = '100%';
    startPickerOverlay.style.height = '50%';
    startPickerOverlay.style.opacity = '0';
    startPickerOverlay.style.cursor = 'pointer';
    startPickerOverlay.style.border = 'none';
    startPickerOverlay.style.padding = '0';
    startPickerOverlay.style.margin = '0';
    startPickerOverlay.style.zIndex = '1';
    startPickerOverlay.value = toHexSafe(style.gradientColorStart, '#3498db');
    startPickerOverlay.addEventListener('input', () => {
      const hex = startPickerOverlay.value;
      const currentA = getAlpha(this._getStyle().gradientColorStart, 0.08);
      const rgba = makeRgba(hex, currentA);
      this._setStyle({ gradientColorStart: rgba });
      updateGradientBlock();
      this.logger?.info?.('[HeatmapSettings] gradientColorStart ->', rgba, '(from overlay picker)');
    });

  gradientWrap.appendChild(gradLabel);
  gradientWrap.appendChild(gradientBlock);
  gradientBlock.appendChild(divider);
  gradientBlock.appendChild(endPickerOverlay);
  gradientBlock.appendChild(startPickerOverlay);

    // 渐变颜色透明度竖向滑块：上半（结束色）+下半（开始色），各占一半高度
  const gradAlphaTopWrap = document.createElement('div');
  gradAlphaTopWrap.style.position = 'absolute';
  gradAlphaTopWrap.style.right = '4px';
  gradAlphaTopWrap.style.top = '0';
  gradAlphaTopWrap.style.width = '24px';
  gradAlphaTopWrap.style.height = '50%'; // 与上半色块等高
  gradAlphaTopWrap.style.display = 'flex';
  gradAlphaTopWrap.style.alignItems = 'center';
  gradAlphaTopWrap.style.justifyContent = 'center';
  gradAlphaTopWrap.style.zIndex = '3';

    const gradAlphaTop = document.createElement('input');
  gradAlphaTop.type = 'range';
  gradAlphaTop.min = '0'; gradAlphaTop.max = '1'; gradAlphaTop.step = '0.01';
  gradAlphaTop.value = String(getAlpha(style.gradientColorEnd, 0.25));
  // 垂直滑块，长度=上半容器高度
  gradAlphaTop.style.appearance = 'slider-vertical';
  gradAlphaTop.style.WebkitAppearance = 'slider-vertical';
  gradAlphaTop.style.MozAppearance = 'slider-vertical';
  gradAlphaTop.style.writingMode = 'bt-lr';
  gradAlphaTop.style.height = '100%';
  gradAlphaTop.style.width = '16px';
  gradAlphaTop.style.cursor = 'pointer';
    gradAlphaTop.addEventListener('input', () => {
      const a = Math.max(0, Math.min(1, parseFloat(gradAlphaTop.value)));
      const st = this._getStyle();
      const hex = toHexSafe(st.gradientColorEnd, '#3498db');
      const rgba = makeRgba(hex, a);
      this._setStyle({ gradientColorEnd: rgba });
      updateGradientBlock();
      this.logger?.info?.('[HeatmapSettings] gradientEndAlpha ->', a);
    });
    gradAlphaTopWrap.appendChild(gradAlphaTop);
    gradientBlock.appendChild(gradAlphaTopWrap);

  const gradAlphaBottomWrap = document.createElement('div');
  gradAlphaBottomWrap.style.position = 'absolute';
  gradAlphaBottomWrap.style.right = '4px';
  gradAlphaBottomWrap.style.bottom = '0';
  gradAlphaBottomWrap.style.width = '24px';
  gradAlphaBottomWrap.style.height = '50%'; // 与下半色块等高
  gradAlphaBottomWrap.style.display = 'flex';
  gradAlphaBottomWrap.style.alignItems = 'center';
  gradAlphaBottomWrap.style.justifyContent = 'center';
  gradAlphaBottomWrap.style.zIndex = '3';

    const gradAlphaBottom = document.createElement('input');
  gradAlphaBottom.type = 'range';
  gradAlphaBottom.min = '0'; gradAlphaBottom.max = '1'; gradAlphaBottom.step = '0.01';
  gradAlphaBottom.value = String(getAlpha(style.gradientColorStart, 0.08));
  // 垂直滑块，长度=下半容器高度
  gradAlphaBottom.style.appearance = 'slider-vertical';
  gradAlphaBottom.style.WebkitAppearance = 'slider-vertical';
  gradAlphaBottom.style.MozAppearance = 'slider-vertical';
  gradAlphaBottom.style.writingMode = 'bt-lr';
  gradAlphaBottom.style.height = '100%';
  gradAlphaBottom.style.width = '16px';
  gradAlphaBottom.style.cursor = 'pointer';
    gradAlphaBottom.addEventListener('input', () => {
      const a = Math.max(0, Math.min(1, parseFloat(gradAlphaBottom.value)));
      const st = this._getStyle();
      const hex = toHexSafe(st.gradientColorStart, '#3498db');
      const rgba = makeRgba(hex, a);
      this._setStyle({ gradientColorStart: rgba });
      updateGradientBlock();
      this.logger?.info?.('[HeatmapSettings] gradientStartAlpha ->', a);
    });
    gradAlphaBottomWrap.appendChild(gradAlphaBottom);
    gradientBlock.appendChild(gradAlphaBottomWrap);

    wrap.appendChild(lineWrap);
    wrap.appendChild(gradientWrap);
    row.appendChild(wrap);

    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  _createHeatmapModeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const current = settings?.get?.('enable_heatmap') ?? 'combined'; // 'off' | 'combined' | 'original'
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'enable_heatmap');
    row.setAttribute('data-type', 'enum');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '弹幕密度图';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const group = document.createElement('div');
    group.style.display = 'flex';
    group.style.width = '100%';
    group.style.gap = '6px';
    group.style.marginTop = '4px';

    const options = [
      { key: 'off', label: '关闭' },
      { key: 'combined', label: '合并后' },
      { key: 'original', label: '原始数据' }
    ];

    const applyValue = (val) => {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const liveSettings = g.danmakuSettings || settings;
        liveSettings?.set?.('enable_heatmap', val);
        // 实时应用到热力图
        try {
          if (val === 'off') {
            if (g.heatmapRenderer && typeof g.heatmapRenderer.hide === 'function') {
              g.heatmapRenderer.hide();
            } else {
              const c = document.getElementById('danmaku-heatmap-canvas');
              if (c) c.style.display = 'none';
            }
          } else {
            let shown = false;
            if (g.heatmapRenderer && typeof g.heatmapRenderer.show === 'function') {
              g.heatmapRenderer.show();
              shown = true;
            }
            const canvas = document.getElementById('danmaku-heatmap-canvas');
            if (!shown && canvas) { canvas.style.display = 'block'; shown = true; }
            if (!shown) {
              try { g.getExt?.()?._generateHeatmap?.(); } catch (_) { }
            }
          }
        } catch (_) { }
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[HeatmapSettings] enable_heatmap ->', val);
    };

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = opt.label;
      btn.dataset.val = opt.key;
      btn.style.flex = '1 1 0';
      btn.style.padding = '6px 4px';
      btn.style.fontSize = '12px';
      btn.style.lineHeight = '1.1';
      btn.style.borderRadius = '6px';
      btn.style.border = '1px solid rgba(255,255,255,.25)';
      btn.style.background = 'rgba(255,255,255,.08)';
      btn.style.color = '#fff';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background .15s, border-color .15s, box-shadow .15s';
      const setActiveState = () => {
        if (btn.dataset.val === String(currentVal)) {
          btn.style.background = '#3fa9ff';
          btn.style.borderColor = '#3fa9ff';
          btn.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
        } else {
          btn.style.background = 'rgba(255,255,255,.08)';
          btn.style.borderColor = 'rgba(255,255,255,.25)';
          btn.style.boxShadow = 'none';
        }
      };
      btn.addEventListener('mouseenter', () => { if (btn.dataset.val !== String(currentVal)) btn.style.background = 'rgba(255,255,255,.15)'; });
      btn.addEventListener('mouseleave', () => setActiveState());
      btn.addEventListener('click', () => {
        if (currentVal === opt.key) return;
        currentVal = opt.key;
        applyValue(currentVal);
        group.querySelectorAll('button').forEach(b => {
          const v = b.dataset.val;
          if (v === currentVal) {
            b.style.background = '#3fa9ff';
            b.style.borderColor = '#3fa9ff';
            b.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
          } else {
            b.style.background = 'rgba(255,255,255,.08)';
            b.style.borderColor = 'rgba(255,255,255,.25)';
            b.style.boxShadow = 'none';
          }
        });
      });
      group.appendChild(btn);
      setTimeout(setActiveState, 0);
    });

    let currentVal = String(current);
    row.appendChild(group);
    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    row.appendChild(desc);
    return row;
  }

  // 取样间隔（1-20，整型，滑块调整）
  _createIntervalRow() {
    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
    const settings = g.danmakuSettings;
    let cur = settings?.get?.('heatmap_interval');
    let value = (typeof cur === 'number' && isFinite(cur)) ? Math.max(1, Math.min(20, Math.round(cur))) : 5;

    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'heatmap_interval');
    row.setAttribute('data-type', 'number');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '取样间隔';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';

    const range = document.createElement('input');
  range.type = 'range';
    range.min = '1';
    range.max = '20';
    range.step = '1';
    range.value = String(value);
  range.style.flex = '1 1 auto';
  range.style.height = '24px';

  const val = document.createElement('div');
  val.textContent = `${String(value)} 秒`;
  val.style.minWidth = '48px';
    val.style.textAlign = 'center';
    val.style.opacity = '.9';

    const apply = (v) => {
      let n = parseInt(v, 10);
      if (!isFinite(n)) return;
      if (n < 1) n = 1; else if (n > 20) n = 20;
      value = n;
      range.value = String(n);
  val.textContent = `${String(n)} 秒`;
      try { settings?.set?.('heatmap_interval', n); } catch (_) {}
      try { saveIfAutoOn(this.logger); } catch (_) {}
      // 若已启用热力图，尝试重新生成以反映变化（如果渲染器实现了对该设置的支持）
      try { g.getExt?.()?._generateHeatmap?.(); } catch (_) {}
      this.logger?.info?.('[HeatmapSettings] heatmap_interval ->', n);
    };

    range.addEventListener('input', () => apply(range.value));

    wrap.appendChild(range);
    wrap.appendChild(val);
    row.appendChild(wrap);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();

    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';
  // 第一项：弹幕密度图
  list.appendChild(this._createHeatmapModeRow());
  // 第二项：取样间隔
  list.appendChild(this._createIntervalRow());
  // 第三项：线条粗细
  list.appendChild(this._createLineWidthRow());
  // 颜色栏：线条 + 渐变起止
  list.appendChild(this._createColorsRow());
    panel.appendChild(list);
    return panel;
  }
}
