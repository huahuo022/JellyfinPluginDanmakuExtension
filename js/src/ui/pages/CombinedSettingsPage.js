import { saveIfAutoOn } from "../../api/utils";

// 样式工厂类，统一管理重复的样式设置
class StyleFactory {
  // 基础行样式
  static createBaseRow(key, type = '') {
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', key);
    if (type) row.setAttribute('data-type', type);
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'center';
    row.style.gap = '6px';
    row.style.textAlign = 'center';
    return row;
  }

  // 基础标题样式
  static createTitle(text) {
    const title = document.createElement('span');
    title.textContent = text;
    title.style.fontSize = '12px';
    title.style.opacity = '.85';
    title.style.userSelect = 'none';
    return title;
  }

  // Switch按钮样式
  static createSwitchButton(current) {
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
    return btn;
  }

  // Switch按钮的小球
  static createSwitchKnob(current) {
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
    return knob;
  }

  // 左侧容器（标题+按钮）
  static createLeftWrapper() {
    const leftWrap = document.createElement('div');
    leftWrap.style.display = 'flex';
    leftWrap.style.flexDirection = 'column';
    leftWrap.style.alignItems = 'center';
    leftWrap.style.flex = '0 0 auto';
    return leftWrap;
  }

  // 滑块样式
  static createSlider(min, max, step, current) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(current);
    slider.style.width = '140px';
    slider.style.cursor = 'pointer';
    slider.style.accentColor = '#3fa9ff';
    return slider;
  }

  // 滑块数值显示
  static createValueSpan(value) {
    const valSpan = document.createElement('span');
    valSpan.textContent = String(value);
    valSpan.style.minWidth = '0';
    valSpan.style.textAlign = 'center';
    valSpan.style.fontSize = '12px';
    valSpan.style.opacity = '.85';
    valSpan.style.whiteSpace = 'nowrap';
    valSpan.style.overflow = 'hidden';
    valSpan.style.textOverflow = 'clip';
    valSpan.style.flex = '0 0 auto';
    valSpan.style.width = '140px';
    return valSpan;
  }

  // 滑块容器
  static createSliderLine() {
    const sliderLine = document.createElement('div');
    sliderLine.style.display = 'flex';
    sliderLine.style.flexDirection = 'column';
    sliderLine.style.alignItems = 'center';
    sliderLine.style.gap = '4px';
    sliderLine.style.width = '100%';
    sliderLine.style.maxWidth = '190px';
    return sliderLine;
  }

  // 统计信息显示
  static createStatsSpan() {
    const stats = document.createElement('span');
    stats.style.fontSize = '14px';
    stats.style.fontWeight = '500';
    stats.style.whiteSpace = 'nowrap';
    stats.style.maxWidth = '180px';
    stats.style.overflow = 'hidden';
    stats.style.textOverflow = 'ellipsis';
    stats.style.textAlign = 'center';
    return stats;
  }

  // Switch按钮更新状态
  static updateSwitchButton(btn, knob, current) {
    btn.setAttribute('aria-checked', String(current));
    btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
    knob.style.left = current ? '26px' : '4px';
  }

  // 为Switch按钮添加事件监听
  static addSwitchEvents(row, btn, onToggle) {
    row.addEventListener('click', (e) => {
      if (btn.contains(e.target)) return;
      onToggle();
    });
    btn.addEventListener('click', () => onToggle());
    btn.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onToggle();
      }
    });
  }

  // 为滑块添加事件监听
  static addSliderEvents(row, slider, valSpan, onInput, onUpdate, suffix = '') {
    slider.addEventListener('input', () => { 
      onInput(slider.value); 
      valSpan.textContent = slider.value + suffix; 
    });
    slider.addEventListener('change', () => { 
      onUpdate(slider.value); 
      valSpan.textContent = slider.value + suffix; 
    });
    row.addEventListener('click', () => slider.focus());
  }

  // 数值范围验证和限制
  static validateRange(value, min, max, defaultValue = min) {
    let n = parseInt(value, 10);
    if (!Number.isFinite(n)) n = defaultValue;
    if (n < min) n = min;
    else if (n > max) n = max;
    return n;
  }

  // 创建标准的设置应用函数
  static createApplyValueFunction(settingKey, min, max, defaultValue, updateCallback, logger) {
    return (val, src = 'ui') => {
      const validatedValue = StyleFactory.validateRange(val, min, max, defaultValue);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.(settingKey, validatedValue);
        updateCallback?.();
      } catch (_) { }
      logger?.info?.(`[CombineSettings] ${settingKey} ->`, validatedValue, 'from', src);
      return validatedValue;
    };
  }

  // 创建布尔值设置应用函数
  static createBooleanApplyFunction(settingKey, updateCallback, logger) {
    return (val, src = 'ui') => {
      const boolValue = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.(settingKey, boolValue);
        updateCallback?.();
      } catch (_) { }
      logger?.info?.(`[CombineSettings] ${settingKey} ->`, boolValue, 'from', src);
      return boolValue;
    };
  }

  // 创建标准的滑块行（数值范围类型）
  static createSliderRow(config) {
    const {
      settingKey, title, min, max, step = 1, defaultValue, suffix = '',
      updateCallback, logger, statsElement
    } = config;

    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = StyleFactory.validateRange(settings?.get?.(settingKey), min, max, defaultValue);
    
    const row = StyleFactory.createBaseRow(settingKey, 'range');
    const titleEl = StyleFactory.createTitle(title);
    const slider = StyleFactory.createSlider(min, max, step, current);
    const valSpan = StyleFactory.createValueSpan(current + suffix);
    const sliderLine = StyleFactory.createSliderLine();
    
    sliderLine.appendChild(valSpan);
    sliderLine.appendChild(slider);

    const applyValue = StyleFactory.createApplyValueFunction(
      settingKey, min, max, defaultValue, updateCallback, logger
    );

    StyleFactory.addSliderEvents(row, slider, valSpan, 
      (val) => { current = applyValue(val, 'input'); slider.value = String(current); }, 
      (val) => { current = applyValue(val, 'change'); slider.value = String(current); }, 
      suffix
    );

    row.appendChild(titleEl);
    row.appendChild(sliderLine);
    
    if (statsElement) {
      row.appendChild(statsElement);
    }

    return row;
  }

  // 创建标准的布尔开关行
  static createBooleanRow(config) {
    const { settingKey, title, updateCallback, logger, rightElement } = config;
    
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.(settingKey);

    const row = StyleFactory.createBaseRow(settingKey, 'boolean');
    const btn = StyleFactory.createSwitchButton(current);
    const knob = StyleFactory.createSwitchKnob(current);
    btn.appendChild(knob);

    const leftWrap = StyleFactory.createLeftWrapper();
    const titleEl = StyleFactory.createTitle(title);
    titleEl.style.marginBottom = '4px';
    leftWrap.appendChild(titleEl);
    leftWrap.appendChild(btn);

    const applyValue = StyleFactory.createBooleanApplyFunction(settingKey, () => {
      StyleFactory.updateSwitchButton(btn, knob, current);
      updateCallback?.();
    }, logger);

    StyleFactory.addSwitchEvents(row, btn, () => {
      current = applyValue(!current, 'toggle');
    });

    row.appendChild(leftWrap);
    if (rightElement) {
      row.appendChild(rightElement);
    }

    return { row, updateValue: applyValue };
  }

  // 统计数据显示的通用逻辑
  static updateStatsDisplay(element, rawValue, defaultValue = 0, prefix = '击杀数: ') {
    if (!element) return;
    const num = (rawValue === '' || rawValue == null) ? defaultValue : Number(rawValue);
    const display = Number.isFinite(num) ? num : defaultValue;
    element.textContent = `${prefix}${display}`;
  }

  // 创建选择框样式
  static createSelectElement(width = '140px') {
    const select = document.createElement('select');
    select.className = 'danmaku-setting-input';
    select.style.width = width;
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
    return select;
  }

  // 为选择框添加选项
  static addSelectOptions(select, options, currentValue) {
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === currentValue) option.selected = true;
      select.appendChild(option);
    });
  }

  // 注入选择框的深色样式
  static injectSelectStyles(dataKey) {
    const styleId = `danmaku-${dataKey}-style`;
    if (document.getElementById(styleId)) return;
    
    try {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = `
.danmaku-setting-row[data-key="${dataKey}"] select.danmaku-setting-input {
  background-color: rgba(30,30,30,.92) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255,255,255,.28) !important;
  border-radius: 4px !important;
  outline: none !important;
}
.danmaku-setting-row[data-key="${dataKey}"] select.danmaku-setting-input:focus {
  box-shadow: 0 0 0 2px rgba(255,255,255,.15);
}
.danmaku-setting-row[data-key="${dataKey}"] select.danmaku-setting-input option {
  background-color: #1e1e1e;
  color: #fff;
}
@media (prefers-color-scheme: dark) {
  .danmaku-setting-row[data-key="${dataKey}"] select.danmaku-setting-input option { background-color:#222; }
}
`;
      document.head.appendChild(styleEl);
    } catch (_) { }
  }

  // 应用粘性样式
  static applyStickyStyle(element) {
    element.style.position = 'sticky';
    element.style.top = '0px';
    element.style.zIndex = '10';
    // 背景与分隔线，避免下层内容透出
    element.style.background = 'rgba(30,30,30,0.92)';
    element.style.borderBottom = '1px solid rgba(255,255,255,.12)';
    // 轻微投影提升层次感
    element.style.boxShadow = '0 2px 6px rgba(0,0,0,.25)';
  }

  // 创建网格列表容器
  static createGridList() {
    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';
    // 两列网格布局
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
    list.style.columnGap = '16px';
    list.style.rowGap = '14px';
    list.style.alignItems = 'stretch';
    list.style.width = '100%';
    return list;
  }

  // 创建占位元素
  static createPlaceholder(text = '', spanColumns = 2) {
    const placeholder = document.createElement('div');
    placeholder.style.padding = '6px 2px';
    placeholder.style.textAlign = 'center';
    placeholder.style.opacity = '.55';
    placeholder.style.fontSize = '12px';
    placeholder.style.gridColumn = `1 / span ${spanColumns}`;
    if (text) placeholder.textContent = text;
    return placeholder;
  }
}// 弹幕合并设置分页
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
      
      // 使用统一的统计更新方法
      StyleFactory.updateStatsDisplay(this._removed_countStatsEl, data?.removed_count, 0, '总击杀数: ');
      StyleFactory.updateStatsDisplay(this._pinyinStatsEl, data?.merge_counts?.pinyin);
      StyleFactory.updateStatsDisplay(this._editDistanceStatsEl, data?.merge_counts?.edit_distance);
      StyleFactory.updateStatsDisplay(this._vectorStatsEl, data?.merge_counts?.vector);
      
      if (this._pinyinStatsEl && data?.merge_counts?.pinyin !== undefined) {
        this.logger?.debug?.('[CombineSettings] 更新拼音击杀数', data.merge_counts.pinyin, '->', this._pinyinStatsEl.textContent);
      }
    } catch (_) {
      if (this._combineStatsEl) this._combineStatsEl.textContent = '--';
      if (this._pakkuTimeEl) this._pakkuTimeEl.textContent = '合并耗时: --';
      StyleFactory.updateStatsDisplay(this._removed_countStatsEl, null, 0, '总击杀数: ');
      StyleFactory.updateStatsDisplay(this._pinyinStatsEl, null, 0);
      StyleFactory.updateStatsDisplay(this._editDistanceStatsEl, null, 0);
      StyleFactory.updateStatsDisplay(this._vectorStatsEl, null, 0);
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

  // 合并计数标记样式：mark_style (string via <select>)
  _createMarkStyleRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = settings?.get?.('mark_style');
    if (typeof current !== 'string') current = 'default';
    
    const row = StyleFactory.createBaseRow('mark_style', 'select');
    const title = StyleFactory.createTitle('合并计数标记样式');

    // 注入深色下拉样式
    StyleFactory.injectSelectStyles('mark_style');

    const select = StyleFactory.createSelectElement();
    const options = [
      { value: 'off', label: '关闭' },
      { value: 'sub_low', label: '小写下标' },
      { value: 'sub_pre', label: '前置下标' },
      { value: 'multiply', label: '乘号' },
      { value: 'dynamic', label: '动态加号' },
    ];
    
    StyleFactory.addSelectOptions(select, options, current);

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
    return StyleFactory.createSliderRow({
      settingKey: 'mark_threshold',
      title: '显示标记阈值',
      min: 1,
      max: 20,
      step: 1,
      defaultValue: 1,
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }  _createUsePinyinRow() {
    // 右侧统计
    const stats = StyleFactory.createStatsSpan();
    stats.style.flex = '0 0 auto';
    this._pinyinStatsEl = stats;

    const { row } = StyleFactory.createBooleanRow({
      settingKey: 'use_pinyin',
      title: '识别谐音弹幕',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger,
      rightElement: stats
    });

    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 放大合并弹幕：enlarge (boolean)
  _createEnlargeRow() {
    const { row } = StyleFactory.createBooleanRow({
      settingKey: 'enlarge',
      title: '放大合并弹幕',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });

    return row;
  }

  // 编辑距离合并阈值：max_distance (0-20 整数) 滑块 + 击杀数(edit_distance)
  _createEditDistanceRow() {
    const stats = StyleFactory.createStatsSpan();
    stats.textContent = '击杀数: 0';
    this._editDistanceStatsEl = stats;

    const row = StyleFactory.createSliderRow({
      settingKey: 'max_distance',
      title: '编辑距离合并阈值',
      min: 0,
      max: 20,
      step: 1,
      defaultValue: 0,
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger,
      statsElement: stats
    });

    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }  // 词频向量合并阈值：max_cosine (0-100 整数) 滑块 + 击杀数(vector)
  _createVectorRow() {
    const stats = StyleFactory.createStatsSpan();
    stats.textContent = '击杀数: 0';
    this._vectorStatsEl = stats;

    const row = StyleFactory.createSliderRow({
      settingKey: 'max_cosine',
      title: '词频向量合并阈值',
      min: 0,
      max: 100,
      step: 1,
      defaultValue: 0,
      suffix: ' %',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger,
      statsElement: stats
    });

    setTimeout(() => this._updateCombineStats(), 0);
    return row;
  }

  // 跨模式合并：cross_mode (boolean)
  _createCrossModeRow() {
    const { row } = StyleFactory.createBooleanRow({
      settingKey: 'cross_mode',
      title: '跨模式合并',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });

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

    const row = StyleFactory.createBaseRow('text_normalize', 'boolean-group');
    const btn = StyleFactory.createSwitchButton(current);
    const knob = StyleFactory.createSwitchKnob(current);
    btn.appendChild(knob);

    const leftWrap = StyleFactory.createLeftWrapper();
    const title = StyleFactory.createTitle('文本规范化');
    title.style.marginBottom = '4px';
    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('trim_ending', current);
        liveSettings?.set?.('trim_space', current);
        liveSettings?.set?.('trim_width', current);
        StyleFactory.updateSwitchButton(btn, knob, current);
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] text_normalize ->', current, 'from', src);
    };

    StyleFactory.addSwitchEvents(row, btn, () => applyValue(!current, 'toggle'));

    row.appendChild(leftWrap);
    return row;
  }

  // 合并时间窗口：threshold_seconds (1-30) 滑块
  _createThresholdSecondsRow() {
    return StyleFactory.createSliderRow({
      settingKey: 'threshold_seconds',
      title: '合并时间窗口',
      min: 1,
      max: 30,
      step: 1,
      defaultValue: 1,
      suffix: ' 秒',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }  // 处理块最大数量：max_chunk_size (10-1000) 滑块
  _createMaxChunkSizeRow() {
    return StyleFactory.createSliderRow({
      settingKey: 'max_chunk_size',
      title: '处理块最大数量',
      min: 10,
      max: 1000,
      step: 1,
      defaultValue: 10,
      suffix: ' 条',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }

  // 总开关：enable_combine (boolean)
  _createEnableCombineRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    let current = !!settings?.get?.('enable_combine');

    const row = StyleFactory.createBaseRow('enable_combine', 'boolean');
    const btn = StyleFactory.createSwitchButton(current);
    const knob = StyleFactory.createSwitchKnob(current);
    btn.appendChild(knob);

    const leftWrap = StyleFactory.createLeftWrapper();
    const title = StyleFactory.createTitle('合并总开关');
    title.style.marginBottom = '4px';
    leftWrap.appendChild(title);
    leftWrap.appendChild(btn);

    // 右侧统计元素（特殊样式）
    const stats = StyleFactory.createStatsSpan();
    stats.style.fontSize = '16px';
    stats.style.fontWeight = '600';
    stats.style.letterSpacing = '.5px';
    stats.style.flex = '0 0 auto';
    this._combineStatsEl = stats;

    const applyValue = (val, src = 'ui') => {
      current = !!val;
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('enable_combine', current);
        StyleFactory.updateSwitchButton(btn, knob, current);
        // 使用专属去抖保存 + 完成后刷新统计
        this._ensureCombineUpdate();
      } catch (_) { }
      this.logger?.info?.('[CombineSettings] enable_combine ->', current, 'from', src);
    };

    StyleFactory.addSwitchEvents(row, btn, () => applyValue(!current, 'toggle'));

    row.appendChild(leftWrap);
    row.appendChild(stats);

    // 初始统计渲染
    setTimeout(() => this._updateCombineStats(), 0);

    return row;
  }

  // 合并后尽量显示为静态弹幕：mode_elevation (boolean)
  _createModeElevationRow() {
    const { row } = StyleFactory.createBooleanRow({
      settingKey: 'mode_elevation',
      title: '合并后尽量显示为静态',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });

    return row;
  }

  // 过宽静态弹幕转为滚动阈值：scroll_threshold (0-1920) 滑块 px
  _createScrollThresholdRow() {
    return StyleFactory.createSliderRow({
      settingKey: 'scroll_threshold',
      title: '过长静态弹幕转为滚动阈值',
      min: 0,
      max: 1920,
      step: 1,
      defaultValue: 0,
      suffix: ' px',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }

  // 密度过高时，弹幕缩小阈值：shrink_threshold (0-500) 滑块 条
  _createShrinkThresholdRow() {
    return StyleFactory.createSliderRow({
      settingKey: 'shrink_threshold',
      title: '弹幕缩小阈值',
      min: 0,
      max: 500,
      step: 1,
      defaultValue: 0,
      suffix: ' 条',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }

  // 密度过高时，丢弃弹幕阈值：drop_threshold (0-500) 滑块 条
  _createDropThresholdRow() {
    return StyleFactory.createSliderRow({
      settingKey: 'drop_threshold',
      title: '丢弃弹幕阈值',
      min: 0,
      max: 500,
      step: 1,
      defaultValue: 0,
      suffix: ' 条',
      updateCallback: () => this._ensureCombineUpdate(),
      logger: this.logger
    });
  }

  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();

    const list = StyleFactory.createGridList();
    const _stickyRow1 = this._createEnableCombineRow();
    const _stickyRow2 = this._createCombineTimeRow();
    
    // 顶部两栏固定在顶部（随页面滚动吸附），保持两列布局
    StyleFactory.applyStickyStyle(_stickyRow1);
    StyleFactory.applyStickyStyle(_stickyRow2);
    
    list.appendChild(_stickyRow1);
    list.appendChild(_stickyRow2);
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
    list.appendChild(this._createModeElevationRow());
    list.appendChild(this._createScrollThresholdRow());
    list.appendChild(this._createShrinkThresholdRow());
    list.appendChild(this._createDropThresholdRow());

    const placeholder = StyleFactory.createPlaceholder('', 2);
    list.appendChild(placeholder);

    panel.appendChild(list);
    return panel;
  }
}
