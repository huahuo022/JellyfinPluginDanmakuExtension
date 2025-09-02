import { saveIfAutoOn } from "../../api/utils";

// 弹幕合并设置分页（逐步实现中）
export class CombinedSettingsPage {
  constructor(opts = {}) { this.logger = opts.logger || null; }
  getKey() { return 'combine'; }
  getLabel() { return '弹幕合并'; }


  _ensureCombineUpdate() {
    try {
      const p = saveIfAutoOn(this.logger);
      if (p) p.then(() => this._updateCombineStats());
    } catch (_) { }
  }

  _updateCombineStats() {
    try {
      const data = window.__jfDanmakuGlobal__.danmakuData;
      if (this._combineStatsEl) {
        let original = data?.original_total;
        let merged = data?.count;
        if (merged == null && Array.isArray(data?.comments)) merged = data.comments.length;
        if (original == null && typeof data?.raw_total === 'number') original = data.raw_total;
        if (original == null && Array.isArray(data?.original_comments)) original = data.original_comments.length;
        if (original == null && Array.isArray(data?.comments_before_merge)) original = data.comments_before_merge.length;
        if (original == null && Array.isArray(data?.comments)) original = data.comments.length;
        if (typeof original === 'number' && typeof merged === 'number') {
          if (original !== merged) this._combineStatsEl.textContent = `${original} → ${merged}`;
          else this._combineStatsEl.textContent = String(merged);
        } else if (merged != null) {
          this._combineStatsEl.textContent = String(merged);
        } else {
          this._combineStatsEl.textContent = '--';
        }
      }
      if (this._pakkuTimeEl) {
        const rawTime = data?.pakku_time;
        const displayTime = (rawTime === '' || rawTime == null) ? '--' : String(rawTime);
        this._pakkuTimeEl.textContent = `合并耗时: ${displayTime}`;
      }
      if (this._removed_countStatsEl) {
        const rawremoved_count = data?.removed_count;
        const num = (rawremoved_count === '' || rawremoved_count == null) ? 0 : Number(rawremoved_count);
        const display = Number.isFinite(num) ? num : 0;
        this._removed_countStatsEl.textContent = `总击杀数: ${display}`;
      }
      if (this._pinyinStatsEl) {
        const raw = data?.merge_counts?.pinyin;
        // 兼容数字、数字字符串; 空/NaN/不可解析时显示0
        const num = (raw === '' || raw == null) ? 0 : Number(raw);
        const display = Number.isFinite(num) ? num : 0;
        this.logger?.debug?.('[CombineSettings] 更新拼音击杀数', raw, '->', display);
        this._pinyinStatsEl.textContent = `击杀数: ${display}`;
      }
      if (this._editDistanceStatsEl) {
        const raw = data?.merge_counts?.edit_distance;
        const num = (raw === '' || raw == null) ? 0 : Number(raw);
        const display = Number.isFinite(num) ? num : 0;
        this._editDistanceStatsEl.textContent = `击杀数: ${display}`;
      }
      if (this._vectorStatsEl) {
        const raw = data?.merge_counts?.vector;
        const num = (raw === '' || raw == null) ? 0 : Number(raw);
        const display = Number.isFinite(num) ? num : 0;
        this._vectorStatsEl.textContent = `击杀数: ${display}`;
      }
    } catch (_) {
      if (this._combineStatsEl) this._combineStatsEl.textContent = '--';
      if (this._pakkuTimeEl) this._pakkuTimeEl.textContent = '合并耗时: --';
      if (this._removed_countStatsEl) this._removed_countStatsEl.textContent = '总击杀数: 0';
      if (this._pinyinStatsEl) this._pinyinStatsEl.textContent = '击杀数: --';
      if (this._editDistanceStatsEl) this._editDistanceStatsEl.textContent = '击杀数: 0';
      if (this._vectorStatsEl) this._vectorStatsEl.textContent = '击杀数: 0';
    }
  }

  // 合并耗时展示行（无设置，仅展示 & 点击刷新统计）
  _createCombineTimeRow() {
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'combine_time');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';
    row.style.cursor = 'pointer';

    const label = document.createElement('span');
    label.style.fontSize = '14px';
    label.style.fontWeight = '500';
    label.style.userSelect = 'none';
    this._pakkuTimeEl = label;
    label.textContent = '合并耗时: --';

    const removed_count = document.createElement('span');
    // 与其它“击杀数”统计统一样式
    removed_count.style.fontSize = '14px';
    removed_count.style.fontWeight = '500';
    removed_count.style.userSelect = 'none';
    this._removed_countStatsEl = removed_count;
    removed_count.textContent = '总击杀数: 0';

    row.appendChild(label);
    row.appendChild(removed_count);
    row.addEventListener('click', () => this._updateCombineStats());
    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 显示合并标记：enable_mark (boolean)
  // 已移除：显示合并标记（enable_mark）

  // 标记样式：mark_style (string via <select>)
  _createMarkStyleRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('mark_style');
    if (typeof current !== 'string') current = 'default';
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'mark_style');
    row.setAttribute('data-type', 'select');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '标记样式';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    // 注入深色下拉样式
    try {
      if (!document.getElementById('danmaku-markstyle-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'danmaku-markstyle-style';
        styleEl.textContent = `
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input {
  background-color: rgba(30,30,30,.92) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255,255,255,.28) !important;
  border-radius: 4px !important;
  outline: none !important;
}
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input:focus {
  box-shadow: 0 0 0 2px rgba(255,255,255,.15);
}
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input option {
  background-color: #1e1e1e;
  color: #fff;
}
@media (prefers-color-scheme: dark) {
  .danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input option { background-color:#222; }
}
`; document.head.appendChild(styleEl);
      }
    } catch (_) { }

    const select = document.createElement('select');
    select.className = 'danmaku-setting-input';
    select.style.width = '140px';
    // 强制覆盖（与字体族一致）
    select.style.setProperty('background-color', 'rgba(30,30,30,.92)', 'important');
    select.style.setProperty('color', '#ffffff', 'important');
    select.style.setProperty('border', '1px solid rgba(255,255,255,.28)', 'important');
    select.style.borderRadius = '4px';
    select.style.padding = '4px 6px';
    select.style.fontSize = '12px';
    select.style.cursor = 'pointer';
    select.style.appearance = 'none';
    select.style.webkitAppearance = 'none';
    select.style.mozAppearance = 'none';

    const options = [
      { value: 'off', label: '关闭' },
      { value: 'sub_low', label: '小写下标' },
      { value: 'sub_pre', label: '前置下标' },
      { value: 'multiply', label: '乘号' },
    ];
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === current) o.selected = true;
      select.appendChild(o);
    }

    const applyValue = (val, src = 'ui') => {
      current = String(val || '');
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('mark_style', current);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] mark_style ->', current, 'from', src);
    };

    select.addEventListener('change', () => applyValue(select.value, 'change'));
    row.addEventListener('click', (e) => { if (select.contains(e.target)) return; select.focus(); });

    row.appendChild(title);
    row.appendChild(select);
    return row;
  }

  // 显示标记阈值：mark_threshold (1-20) 滑块
  _createMarkThresholdRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('mark_threshold');
    if (typeof current !== 'number' || !Number.isFinite(current)) current = 1;
    if (current < 1) current = 1; else if (current > 20) current = 20;

    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'mark_threshold');
    row.setAttribute('data-type', 'range');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '显示标记阈值';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.step = '1';
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';

    const valSpan = document.createElement('span');
    valSpan.textContent = String(current);
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';

    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const applyValue = (val, src = 'ui') => {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n)) n = 1;
      if (n < 1) n = 1; else if (n > 20) n = 20;
      current = n;
      slider.value = String(n);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('mark_threshold', n);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] mark_threshold ->', current, 'from', src);
    };

    slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value; });
    slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value; });
    row.addEventListener('click', () => slider.focus());

    row.appendChild(title);
    row.appendChild(sliderLine);
    return row;
  }

  _createUsePinyinRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.('use_pinyin');
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'use_pinyin');
    row.setAttribute('data-type', 'boolean');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(current));
    btn.style.position = 'relative';
    btn.style.width = '48px';
    btn.style.height = '22px';
    btn.style.borderRadius = '22px';
    btn.style.border = '1px solid rgba(255,255,255,.3)';
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background .2s, box-shadow .2s';
    btn.style.outline = 'none';
    btn.style.padding = '0';
    btn.style.marginTop = '6px';

    const knob = document.createElement('span');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.transform = 'translateY(-50%)';
    knob.style.left = current ? '26px' : '4px';
    knob.style.width = '16px';
    knob.style.height = '16px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
    knob.style.transition = 'left .2s';
    btn.appendChild(knob);

    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';

    const title = document.createElement('span');
    title.textContent = '识别谐音弹幕';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.marginBottom = '4px';
    title.style.userSelect = 'none';
    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    // 右侧统计
    const stats = document.createElement('span');
    stats.style.fontSize = '14px';
    stats.style.fontWeight = '500';
    stats.style.whiteSpace = 'nowrap';
    stats.style.flex = '0 0 auto';
    stats.style.maxWidth = '180px';
    stats.style.overflow = 'hidden';
    stats.style.textOverflow = 'ellipsis';
    stats.style.textAlign = 'center';
    this._pinyinStatsEl = stats;

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('use_pinyin', current);
        btn.setAttribute('aria-checked', String(current));
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        knob.style.left = current ? '26px' : '4px';
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] use_pinyin ->', current, 'from', src);
    };

    // 行级点击（排除点击开关自身避免双触发）
    row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
    btn.addEventListener('click', () => applyValue(!current, 'click'));
    btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

    row.appendChild(leftWrap);
    row.appendChild(stats);
    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 放大合并弹幕：enlarge (boolean)
  _createEnlargeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.('enlarge');
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'enlarge');
    row.setAttribute('data-type', 'boolean');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(current));
    btn.style.position = 'relative';
    btn.style.width = '48px';
    btn.style.height = '22px';
    btn.style.borderRadius = '22px';
    btn.style.border = '1px solid rgba(255,255,255,.3)';
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background .2s, box-shadow .2s';
    btn.style.outline = 'none';
    btn.style.padding = '0';
    btn.style.marginTop = '6px';

    const knob = document.createElement('span');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.transform = 'translateY(-50%)';
    knob.style.left = current ? '26px' : '4px';
    knob.style.width = '16px';
    knob.style.height = '16px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
    knob.style.transition = 'left .2s';
    btn.appendChild(knob);

    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';

    const title = document.createElement('span');
    title.textContent = '放大合并弹幕';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.marginBottom = '4px';
    title.style.userSelect = 'none';
    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('enlarge', current);
        btn.setAttribute('aria-checked', String(current));
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        knob.style.left = current ? '26px' : '4px';
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] enlarge ->', current, 'from', src);
    };

    row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
    btn.addEventListener('click', () => applyValue(!current, 'click'));
    btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

    row.appendChild(leftWrap);
    return row;
  }

  // 编辑距离合并阈值：max_distance (0-20 整数) 滑块 + 击杀数(edit_distance)
  _createEditDistanceRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('max_distance');
    if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
    if (current < 0) current = 0; else if (current > 20) current = 20;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'max_distance');
    row.setAttribute('data-type', 'range');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '编辑距离合并阈值';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '20';
    slider.step = '1';
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';

    // 数值显示（在滑块右侧）
    const valSpan = document.createElement('span');
    valSpan.textContent = String(current);
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';

    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const stats = document.createElement('span');
    stats.style.fontSize = '14px';
    stats.style.fontWeight = '500';
    stats.style.whiteSpace = 'nowrap';
    stats.style.maxWidth = '180px';
    stats.style.overflow = 'hidden';
    stats.style.textOverflow = 'ellipsis';
    stats.textContent = '击杀数: 0';
    this._editDistanceStatsEl = stats;

    const applyValue = (val, src = 'ui') => {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n)) n = 0;
      if (n < 0) n = 0; else if (n > 20) n = 20;
      current = n;
      slider.value = String(n);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('max_distance', n);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] max_distance ->', current, 'from', src);
    };

    slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value; });
    slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value; });
    // 行级点击：点击行聚焦到滑块
    row.addEventListener('click', () => slider.focus());

    row.appendChild(title);
    row.appendChild(sliderLine);
    row.appendChild(stats);
    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 词频向量合并阈值：max_cosine (0-100 整数) 滑块 + 击杀数(vector)
  _createVectorRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('max_cosine');
    if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
    if (current < 0) current = 0; else if (current > 100) current = 100;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'max_cosine');
    row.setAttribute('data-type', 'range');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '词频向量合并阈值';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';

    const valSpan = document.createElement('span');
    valSpan.textContent = String(current) + ' %';
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';

    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const stats = document.createElement('span');
    stats.style.fontSize = '14px';
    stats.style.fontWeight = '500';
    stats.style.whiteSpace = 'nowrap';
    stats.style.maxWidth = '180px';
    stats.style.overflow = 'hidden';
    stats.style.textOverflow = 'ellipsis';
    stats.textContent = '击杀数: 0';
    this._vectorStatsEl = stats;

    const applyValue = (val, src = 'ui') => {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n)) n = 0;
      if (n < 0) n = 0; else if (n > 100) n = 100;
      current = n;
      slider.value = String(n);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('max_cosine', n);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] max_cosine ->', current, 'from', src);
    };

    slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + " %"; });
    slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + " %"; });
    row.addEventListener('click', () => slider.focus());

    row.appendChild(title);
    row.appendChild(sliderLine);
    row.appendChild(stats);
    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 跨模式合并：cross_mode (boolean)
  _createCrossModeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.('cross_mode');
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'cross_mode');
    row.setAttribute('data-type', 'boolean');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(current));
    btn.style.position = 'relative';
    btn.style.width = '48px';
    btn.style.height = '22px';
    btn.style.borderRadius = '22px';
    btn.style.border = '1px solid rgba(255,255,255,.3)';
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background .2s, box-shadow .2s';
    btn.style.outline = 'none';
    btn.style.padding = '0';
    btn.style.marginTop = '6px';

    const knob = document.createElement('span');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.transform = 'translateY(-50%)';
    knob.style.left = current ? '26px' : '4px';
    knob.style.width = '16px';
    knob.style.height = '16px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
    knob.style.transition = 'left .2s';
    btn.appendChild(knob);

    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';

    const title = document.createElement('span');
    title.textContent = '跨模式合并';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.marginBottom = '4px';
    title.style.userSelect = 'none';

    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('cross_mode', current);
        btn.setAttribute('aria-checked', String(current));
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        knob.style.left = current ? '26px' : '4px';
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] cross_mode ->', current, 'from', src);
    };

    row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
    btn.addEventListener('click', () => applyValue(!current, 'click'));
    btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

    row.appendChild(leftWrap);
    return row;
  }

  // 文本规范化：同时设置 trim_ending / trim_space / trim_width (统一开关)
  _createNormalizeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const ending = !!settings?.get?.('trim_ending');
    const space = !!settings?.get?.('trim_space');
    const width = !!settings?.get?.('trim_width');
    // 只有全部为 true 才视为当前开启
    let current = ending && space && width;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'text_normalize');
    row.setAttribute('data-type', 'boolean-group');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(current));
    btn.style.position = 'relative';
    btn.style.width = '48px';
    btn.style.height = '22px';
    btn.style.borderRadius = '22px';
    btn.style.border = '1px solid rgba(255,255,255,.3)';
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background .2s, box-shadow .2s';
    btn.style.outline = 'none';
    btn.style.padding = '0';
    btn.style.marginTop = '6px';

    const knob = document.createElement('span');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.transform = 'translateY(-50%)';
    knob.style.left = current ? '26px' : '4px';
    knob.style.width = '16px';
    knob.style.height = '16px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
    knob.style.transition = 'left .2s';
    btn.appendChild(knob);

    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';

    const title = document.createElement('span');
    title.textContent = '文本规范化';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.marginBottom = '4px';
    title.style.userSelect = 'none';
    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('trim_ending', current);
        liveSettings?.set?.('trim_space', current);
        liveSettings?.set?.('trim_width', current);
        btn.setAttribute('aria-checked', String(current));
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        knob.style.left = current ? '26px' : '4px';
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] text_normalize ->', current, 'from', src);
    };

    row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
    btn.addEventListener('click', () => applyValue(!current, 'click'));
    btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

    row.appendChild(leftWrap);
    return row;
  }

  // 合并时间窗口：threshold_seconds (1-30) 滑块
  _createThresholdSecondsRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('threshold_seconds');
    if (typeof current !== 'number' || !Number.isFinite(current)) current = 1;
    if (current < 1) current = 1; else if (current > 30) current = 30;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'threshold_seconds');
    row.setAttribute('data-type', 'range');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '合并时间窗口';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '30';
    slider.step = '1';
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';

    const valSpan = document.createElement('span');
    valSpan.textContent = String(current) + ' 秒';
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';

    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const applyValue = (val, src = 'ui') => {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n)) n = 1;
      if (n < 1) n = 1; else if (n > 30) n = 30;
      current = n;
      slider.value = String(n);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('threshold_seconds', n);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] threshold_seconds ->', current, 'from', src);
    };

    slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 秒'; });
    slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 秒'; });
    row.addEventListener('click', () => slider.focus());

    row.appendChild(title);
    row.appendChild(sliderLine);
    return row;
  }

  // 处理块最大数量：max_chunk_size (10-1000) 滑块
  _createMaxChunkSizeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('max_chunk_size');
    if (typeof current !== 'number' || !Number.isFinite(current)) current = 10;
    if (current < 10) current = 10; else if (current > 1000) current = 1000;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'max_chunk_size');
    row.setAttribute('data-type', 'range');
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    const title = document.createElement('span');
    title.textContent = '处理块最大数量';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '10';
    slider.max = '1000';
    slider.step = '1';
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';

    const valSpan = document.createElement('span');
    valSpan.textContent = String(current) + ' 条';
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';

    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const applyValue = (val, src = 'ui') => {
      let n = parseInt(val, 10);
      if (!Number.isFinite(n)) n = 10;
      if (n < 10) n = 10; else if (n > 1000) n = 1000;
      current = n;
      slider.value = String(n);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('max_chunk_size', n);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] max_chunk_size ->', current, 'from', src);
    };

    slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 条'; });
    slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 条'; });
    row.addEventListener('click', () => slider.focus());

    row.appendChild(title);
    row.appendChild(sliderLine);
    return row;
  }

  // 总开关：enable_combine (boolean)
  _createEnableCombineRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.('enable_combine');
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'enable_combine');
    row.setAttribute('data-type', 'boolean');
    // 居中布局
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';

    // 左侧容器 + 标题 + Switch 按钮
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(current));
    btn.style.position = 'relative';
    btn.style.width = '48px';
    btn.style.height = '22px';
    btn.style.borderRadius = '22px';
    btn.style.border = '1px solid rgba(255,255,255,.3)';
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background .2s, box-shadow .2s';
    btn.style.outline = 'none';
    btn.style.padding = '0';
    btn.style.marginTop = '6px';

    const knob = document.createElement('span');
    knob.style.position = 'absolute';
    knob.style.top = '50%';
    knob.style.transform = 'translateY(-50%)';
    knob.style.left = current ? '26px' : '4px';
    knob.style.width = '16px';
    knob.style.height = '16px';
    knob.style.borderRadius = '50%';
    knob.style.background = '#fff';
    knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
    knob.style.transition = 'left .2s';
    btn.appendChild(knob);

    // 右侧统计元素
    const stats = document.createElement('span');
    stats.style.fontSize = '16px';
    stats.style.fontWeight = '600';
    stats.style.letterSpacing = '.5px';
    stats.style.whiteSpace = 'nowrap';
    stats.style.flex = '0 0 auto';
    stats.style.maxWidth = '180px';
    stats.style.overflow = 'hidden';
    stats.style.textOverflow = 'ellipsis';
    stats.style.textAlign = 'center';
    this._combineStatsEl = stats;

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('enable_combine', current);
        btn.setAttribute('aria-checked', String(current));
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        knob.style.left = current ? '26px' : '4px';
        // 使用专属去抖保存 + 完成后刷新统计
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] enable_combine ->', current, 'from', src);
    };

    // 行级点击（排除按钮自身）
    row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
    btn.addEventListener('click', () => applyValue(!current, 'click'));
    btn.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); }
    });
    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';

    const title = document.createElement('span');
    title.textContent = '合并总开关';
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.marginBottom = '4px';
    title.style.userSelect = 'none';

    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    row.appendChild(leftWrap);
    row.appendChild(stats);

    // 初始统计渲染
    setTimeout(() => this._updateCombineStats(), 0);

    return row;
  }

  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();

    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';
    // 两列网格布局
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    list.style.columnGap = '16px';
    list.style.rowGap = '14px';
    list.style.alignItems = 'stretch';
    list.style.width = '100%';
    list.appendChild(this._createEnableCombineRow());
    list.appendChild(this._createCombineTimeRow());
    list.appendChild(this._createMarkStyleRow());
    list.appendChild(this._createMarkThresholdRow());
    list.appendChild(this._createThresholdSecondsRow());
    list.appendChild(this._createEnlargeRow());
    list.appendChild(this._createEditDistanceRow());
    list.appendChild(this._createVectorRow());
    list.appendChild(this._createUsePinyinRow());
    list.appendChild(this._createMaxChunkSizeRow());
    list.appendChild(this._createCrossModeRow());
    list.appendChild(this._createNormalizeRow());

    // 占位：后续将添加具体参数（阈值、白名单等）
    const placeholder = document.createElement('div');
    placeholder.style.padding = '6px 2px';
    placeholder.style.textAlign = 'center';
    placeholder.style.opacity = '.55';
    placeholder.style.fontSize = '12px';
    // placeholder.textContent = '更多弹幕合并细节参数后续补充...';
    // 占位内容跨两列
    placeholder.style.gridColumn = '1 / span 2';
    list.appendChild(placeholder);

    panel.appendChild(list);
    return panel;
  }
}
