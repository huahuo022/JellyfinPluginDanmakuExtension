// 基础设置分页：提供基础弹幕相关可视化与行为调节
import { saveIfAutoOn } from "../../api/utils";

export class BasicSettingsPage {
  constructor(opts = {}) { this.logger = opts.logger || null; }
  getKey() { return 'basic'; }
  getLabel() { return '基础设置'; }

  _createFontSizeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const current = settings?.get?.('font_size') ?? 25;
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'font_size');
    row.setAttribute('data-type', 'number');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '字体大小 (px)';
    labelLine.appendChild(labelSpan);

    row.appendChild(labelLine);

    const sliderWrap = document.createElement('div');
    sliderWrap.style.display = 'flex';
    sliderWrap.style.alignItems = 'center';
    sliderWrap.style.gap = '8px';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '8';
    range.max = '80';
    range.step = '1';
    range.value = String(current);
    range.style.flex = '1 1 auto';

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = '8';
    numberInput.max = '80';
    numberInput.step = '1';
    numberInput.value = String(current);
    numberInput.className = 'danmaku-setting-input';
    numberInput.style.width = '70px';

    const applyValue = (v, src) => {
      let nv = parseInt(v, 10);
      if (isNaN(nv)) return;
      if (nv < 8) nv = 8; else if (nv > 80) nv = 80;
      range.value = String(nv);
      numberInput.value = String(nv);
      try {
        const liveSettings = window.__jfDanmakuGlobal__.danmakuSettings;
        liveSettings?.set?.('font_size', nv);
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] font_size ->', nv, '(from', src, ')');
    };

    range.addEventListener('input', () => applyValue(range.value, 'range'));
    numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
    numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));

    sliderWrap.appendChild(range);
    sliderWrap.appendChild(numberInput);
    row.appendChild(sliderWrap);

    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    // desc.textContent = '调整弹幕基础字号 (8 - 80px)。';
    row.appendChild(desc);

    return row;
  }

  _createOpacityRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const current = settings?.get?.('opacity') ?? 70; // 0-100
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'opacity');
    row.setAttribute('data-type', 'number');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '弹幕透明度 (%)';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const sliderWrap = document.createElement('div');
    sliderWrap.style.display = 'flex';
    sliderWrap.style.alignItems = 'center';
    sliderWrap.style.gap = '8px';
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1';
    range.value = String(current);
    range.style.flex = '1 1 auto';
    const numberInput = document.createElement('input');
    numberInput.type = 'number'; numberInput.min = '0'; numberInput.max = '100'; numberInput.step = '1';
    numberInput.value = String(current); numberInput.className = 'danmaku-setting-input'; numberInput.style.width = '70px';

    const applyValue = (v, src) => {
      let nv = parseInt(v, 10);
      if (isNaN(nv)) return; if (nv < 0) nv = 0; else if (nv > 100) nv = 100;
      range.value = String(nv); numberInput.value = String(nv);
      try {
        const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        liveSettings?.set?.('opacity', nv);
        // 更新实时弹幕层透明度（如果存在）
        const layer = document.querySelector('#danmaku-layer');
        if (layer) layer.style.opacity = String(Math.min(1, Math.max(0, nv / 100)));
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] opacity ->', nv, '(from', src, ')');
    };
    range.addEventListener('input', () => applyValue(range.value, 'range'));
    numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
    numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));
    sliderWrap.appendChild(range); sliderWrap.appendChild(numberInput); row.appendChild(sliderWrap);
    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    // desc.textContent = '调节弹幕整体透明度 (0-100)。';
    row.appendChild(desc);
    return row;
  }

  _createSpeedRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const current = settings?.get?.('speed') ?? 144; // 24-600
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'speed');
    row.setAttribute('data-type', 'number');
    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '弹幕速度';
    labelLine.appendChild(labelSpan);

    row.appendChild(labelLine);
    const sliderWrap = document.createElement('div'); sliderWrap.style.display = 'flex'; sliderWrap.style.alignItems = 'center'; sliderWrap.style.gap = '8px';
    const range = document.createElement('input'); range.type = 'range'; range.min = '24'; range.max = '600'; range.step = '1'; range.value = String(current); range.style.flex = '1 1 auto';
    const numberInput = document.createElement('input'); numberInput.type = 'number'; numberInput.min = '24'; numberInput.max = '600'; numberInput.step = '1'; numberInput.value = String(current); numberInput.className = 'danmaku-setting-input'; numberInput.style.width = '70px';
    const applyValue = (v, src) => {
      let nv = parseInt(v, 10); if (isNaN(nv)) return; if (nv < 24) nv = 24; else if (nv > 600) nv = 600;
      range.value = String(nv); numberInput.value = String(nv);
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const liveSettings = g.danmakuSettings;
        liveSettings?.set?.('speed', nv);
        // 直接写实例的 speed 属性
        try { g.danmakuRenderer.speed = nv; } catch (_) { }

        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] speed ->', nv, '(from', src, ')');
    };
    range.addEventListener('input', () => applyValue(range.value, 'range'));
    numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
    numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));
    sliderWrap.appendChild(range); sliderWrap.appendChild(numberInput); row.appendChild(sliderWrap);
    // const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '调节弹幕滚动速度 (24 - 600)。数值越大，移动越快。'; row.appendChild(desc);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
    return row;
  }

  _createFontFamilyRow() {
  const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
  let current = settings?.get?.('font_family') || 'sans-serif';
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'font_family');
    row.setAttribute('data-type', 'string');
    // 确保只注入一次针对字体选择控件的样式
    try {
      if (!document.getElementById('danmaku-fontfamily-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'danmaku-fontfamily-style';
        styleEl.textContent = `
/* Font Family combo input + list */
.danmaku-setting-row[data-key="font_family"] .ff-combo { position: relative; width: 100%; }
.danmaku-setting-row[data-key="font_family"] .ff-input {
  width: 100%; background-color: rgba(30,30,30,.92); color: #fff;
  border: 1px solid rgba(255,255,255,.28); border-radius: 4px; outline: none;
  padding: 6px 8px; font-size: 12px;
}
.danmaku-setting-row[data-key="font_family"] .ff-input:focus { box-shadow: 0 0 0 2px rgba(255,255,255,.15); }
.danmaku-setting-row[data-key="font_family"] .ff-list {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px);
  max-height: 220px; overflow: auto; background: #1e1e1e; color: #fff;
  border: 1px solid rgba(255,255,255,.28); border-radius: 6px; padding: 4px 0; z-index: 9999;
  display: none;
}
.danmaku-setting-row[data-key="font_family"] .ff-item {
  padding: 6px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.danmaku-setting-row[data-key="font_family"] .ff-item:hover,
.danmaku-setting-row[data-key="font_family"] .ff-item.active { background: rgba(255,255,255,.12); }
`;
        document.head.appendChild(styleEl);
      }
    } catch (_) { }
    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '字体';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);
    // 组合控件：输入框 + 过滤列表
  const combo = document.createElement('div');
    combo.className = 'ff-combo';
  const input = document.createElement('input');
  input.className = 'ff-input danmaku-setting-input';
  input.type = 'text';
  const genericPlaceholder = '输入以筛选字体...';
  input.placeholder = genericPlaceholder;
    const list = document.createElement('div');
    list.className = 'ff-list';
    combo.appendChild(input);
    combo.appendChild(list);

    let allFonts = [];
    let filtered = [];
    let activeIndex = -1;
    const labelFor = (f) => {
      if (typeof f === 'string' && f.indexOf('/danmaku/font/') === 0) {
        const last = (f.split('/').pop() || f).split('?')[0];
        let decoded = last;
        try { decoded = decodeURIComponent(last); } catch (_) { /* ignore */ }
        return `服务器字体: ${decoded}`;
      }
      return f;
    };
    const openList = () => { list.style.display = 'block'; };
    const closeList = () => { list.style.display = 'none'; activeIndex = -1; };
    const renderList = () => {
      list.innerHTML = '';
      filtered.forEach((f, idx) => {
        const it = document.createElement('div');
        it.className = 'ff-item' + (idx === activeIndex ? ' active' : '');
        it.textContent = labelFor(f);
        it.dataset.val = f;
        it.addEventListener('mousedown', (e) => { e.preventDefault(); selectFont(f); });
        list.appendChild(it);
      });
      // 仅在输入框处于聚焦状态时才展开，避免首次加载默认展开
      if (filtered.length && document.activeElement === input) openList(); else closeList();
      // 尝试滚动到当前激活项
      if (activeIndex >= 0 && list.children[activeIndex]) {
        try { list.children[activeIndex].scrollIntoView({ block: 'nearest' }); } catch (_) {}
      }
    };
    const setFilter = (kw) => {
      const q = (kw || '').toLowerCase();
      filtered = allFonts.filter(f => (f || '').toLowerCase().includes(q));
      // 优先把当前值放到顶部（保持存在感）
      if (current && filtered.indexOf(current) > 0) filtered = [current].concat(filtered.filter(x => x !== current));
      // 激活项尽量定位到当前值
      activeIndex = filtered.length ? (Math.max(0, filtered.indexOf(current))) : -1;
      renderList();
    };
    const selectFont = (val) => {
      if (!val) return;
      // 更新设置并失焦
      applyValue(val);
      current = val;
  input.value = '';
  input.placeholder = labelFor(val);
      closeList();
      try { input.blur(); } catch (_) {}
    };
    // 动态收集字体函数 -> 更新 allFonts
    const populateFonts = (fontList) => {
      const gset = new Set();
      fontList.forEach(f => { if (f) gset.add(f); });
      ['sans-serif', 'serif', 'monospace', 'system-ui'].forEach(f => gset.add(f));
      allFonts = Array.from(gset).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      if (current && !allFonts.includes(current)) allFonts.unshift(current);
  // 初始以占位符展示当前字体（虚化）
  input.value = '';
  input.placeholder = labelFor(current);
  setFilter('');
    };

    const detectViaLocalFontAccess = async () => {
      const fams = new Set();
      try {
        // 需权限，可能抛错
        if (navigator.fonts?.query) {
          // for await 迭代
          // 部分浏览器要求 https + 用户手势，失败即回退
          // eslint-disable-next-line no-restricted-syntax
          for await (const meta of navigator.fonts.query()) {
            if (meta.family) fams.add(meta.family);
          }
        }
      } catch (_) { /* 忽略 */ }
      return Array.from(fams);
    };

    const detectViaCanvas = () => {
      // 由于浏览器隐私限制无法真正枚举，只能用候选池测试是否存在
      const candidatePool = [
        'Arial', 'Helvetica', 'Segoe UI', 'Roboto', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei', 'SimSun', 'KaiTi', 'FangSong', 'Courier New', 'Consolas', 'Menlo', 'Monaco', 'Ubuntu', 'Ubuntu Mono', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman'
      ];
      const baseFonts = ['monospace', 'serif', 'sans-serif'];
      const testString = 'mmmmmmmmmwwwwwwwiiiilllOO0测试字样ABC123';
      const size = '72px';
      const span = document.createElement('span');
      span.style.position = 'absolute'; span.style.left = '-9999px'; span.style.fontSize = size; span.textContent = testString;
      document.body.appendChild(span);
      const baseMetrics = {};
      baseFonts.forEach(bf => { span.style.fontFamily = bf; baseMetrics[bf] = { w: span.offsetWidth, h: span.offsetHeight }; });
      const available = [];
      candidatePool.forEach(font => {
        let detected = false;
        for (const bf of baseFonts) {
          span.style.fontFamily = `'${font}',${bf}`;
          const w = span.offsetWidth, h = span.offsetHeight;
          if (w !== baseMetrics[bf].w || h !== baseMetrics[bf].h) { detected = true; break; }
        }
        if (detected) available.push(font);
      });
      document.body.removeChild(span);
      return available;
    };

    const detectViaServerFonts = async () => {
      try {
        if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) return [];
        const url = ApiClient.getUrl('danmaku/font/get_all');
        const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
        if (!Array.isArray(res)) return [];
        // 返回 URL 路径（保持与渲染器协议一致）
        return res.map(x => x && typeof x.url === 'string' ? x.url : null).filter(Boolean);
      } catch (_) { return []; }
    };

    const runDetection = async () => {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        if (Array.isArray(g.availableFontFamilies) && g.availableFontFamilies.length) {
          populateFonts(g.availableFontFamilies);
          return;
        }
        let fonts = await detectViaLocalFontAccess();
        // 合并服务器字体
        try {
          const serverFonts = await detectViaServerFonts();
          if (serverFonts && serverFonts.length) {
            const merged = new Set([...(fonts || []), ...serverFonts]);
            fonts = Array.from(merged);
          }
        } catch (_) {}
        // 若 Local Font Access 得到过少结果，则回退 canvas 探测
        if (!fonts || fonts.length < 5) {
          const canvasFonts = detectViaCanvas();
          const merged = new Set([...(fonts || []), ...canvasFonts]);
          fonts = Array.from(merged);
        }
        g.availableFontFamilies = fonts;
        populateFonts(fonts);
      } catch (e) {
        // 最终失败，使用最小集合
        populateFonts([current || 'sans-serif']);
      }
    };
    // 延迟微任务，等待元素插入再开始检测，减少阻塞
    Promise.resolve().then(runDetection);
    const applyValue = (nv) => {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const liveSettings = g.danmakuSettings;
        liveSettings?.set?.('font_family', nv);
        // 如果选择的是服务器字体 URL，则预加载并用加载完成的家族名；否则直接应用
        const applyFam = (famName) => {
          const targetFam = famName ? `'${famName}', sans-serif` : nv;
          const layer = document.querySelector('#danmaku-layer');
          if (layer) layer.style.fontFamily = targetFam;
          if (g.danmakuRenderer?.container) {
            try { g.danmakuRenderer.container.style.fontFamily = targetFam; } catch (_) { }
          }
        };

        if (typeof nv === 'string' && nv.indexOf('/danmaku/font/') === 0) {
          // 使用渲染器暴露的加载器（若存在）
          const loader = g.ensureRemoteFontLoaded || (g.danmakuRenderer && g.danmakuRenderer.ensureRemoteFontLoaded);
          if (typeof loader === 'function') {
            loader(nv).then(fam => {
              applyFam(fam || null);
            }).catch(() => applyFam(null));
          } else {
            // 尝试直接设置，浏览器会在未加载时自动回退
            applyFam(null);
          }
        } else {
          applyFam(null);
        }
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] font_family ->', nv);
    };
    // 交互：输入即筛选；上下箭头/回车选择；失焦隐藏
    input.addEventListener('input', () => setFilter(input.value));
    input.addEventListener('focus', () => {
      // 聚焦时：如果当前输入为空，显示通用提示占位符
      if (!input.value) input.placeholder = genericPlaceholder;
      // 聚焦清空输入，打开并高亮当前项
      input.value = '';
      setFilter('');
      openList();
    });
    input.addEventListener('blur', () => {
      // 失焦：恢复为当前已选字体的占位符
      input.placeholder = labelFor(current);
    });
    input.addEventListener('keydown', (e) => {
      if (list.style.display !== 'block') return;
      if (e.key === 'ArrowDown') { activeIndex = Math.min(filtered.length - 1, activeIndex + 1); renderList(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { activeIndex = Math.max(0, activeIndex - 1); renderList(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (activeIndex >= 0 && filtered[activeIndex]) { selectFont(filtered[activeIndex]); e.preventDefault(); } }
      else if (e.key === 'Escape') { closeList(); }
    });
    document.addEventListener('click', (e) => { if (!combo.contains(e.target)) closeList(); });

    row.appendChild(combo);
    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '字体建议放在服务端的"/config/fonts"路径'; row.appendChild(desc);
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
            // 优先调用渲染器 hide；退化隐藏画布
            if (g.heatmapRenderer && typeof g.heatmapRenderer.hide === 'function') {
              g.heatmapRenderer.hide();
            } else {
              const c = document.getElementById('danmaku-heatmap-canvas');
              if (c) c.style.display = 'none';
            }
          } else {
            // 显示或按需生成
            let shown = false;
            if (g.heatmapRenderer && typeof g.heatmapRenderer.show === 'function') {
              g.heatmapRenderer.show();
              shown = true;
            }
            const canvas = document.getElementById('danmaku-heatmap-canvas');
            if (!shown && canvas) { canvas.style.display = 'block'; shown = true; }
            if (!shown) {
              // 尝试通过扩展实例生成（允许内部自愈）
              try { g.getExt?.()?._generateHeatmap?.(); } catch (_) { }
            }
          }
        } catch (_) { }
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] enable_heatmap ->', val);
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
    // desc.textContent = '选择是否显示弹幕密度图（热力图）。';
    row.appendChild(desc);
    return row;
  }

  _createDisplayRangeRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const topInit = settings?.get?.('display_top_pct');
    const bottomInit = settings?.get?.('display_bottom_pct');
    // 初始值：确保为 0-100 整数
    let topVal = (isFinite(topInit) ? Math.round(topInit) : 0);
    let bottomVal = (isFinite(bottomInit) ? Math.round(bottomInit) : 100);
    if (topVal < 0) topVal = 0; if (topVal > 99) topVal = 99;
    if (bottomVal <= topVal) bottomVal = Math.min(100, topVal + 1);
    if (bottomVal > 100) bottomVal = 100;

    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'display_range');
    row.setAttribute('data-type', 'range');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '显示范围 (垂直%)';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    // 双拖动条容器
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.height = '32px';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.userSelect = 'none';

    const track = document.createElement('div');
    track.style.position = 'absolute';
    track.style.left = '0'; track.style.right = '0';
    track.style.top = '50%'; track.style.height = '4px';
    track.style.transform = 'translateY(-50%)';
    track.style.background = 'linear-gradient(90deg, rgba(255,255,255,.15), rgba(255,255,255,.15))';
    track.style.borderRadius = '2px';
    wrapper.appendChild(track);

    const activeRange = document.createElement('div');
    activeRange.style.position = 'absolute'; activeRange.style.top = '50%'; activeRange.style.height = '6px'; activeRange.style.transform = 'translateY(-50%)';
    activeRange.style.background = 'rgba(0,150,255,.6)'; activeRange.style.borderRadius = '3px';
    wrapper.appendChild(activeRange);

    function updateActiveRange() {
      activeRange.style.left = topVal + '%';
      activeRange.style.width = (bottomVal - topVal) + '%';
    }
    updateActiveRange();

    const handleStyle = (el) => {
      el.style.position = 'absolute';
      el.style.top = '50%'; el.style.transform = 'translate(-50%, -50%)';
      el.style.width = '14px'; el.style.height = '14px';
      el.style.borderRadius = '50%'; el.style.cursor = 'pointer';
      el.style.background = 'rgba(0,150,255,.9)';
      el.style.border = '1px solid rgba(255,255,255,.6)';
      el.style.boxShadow = '0 0 4px rgba(0,150,255,.7)';
      el.style.transition = 'background .15s, box-shadow .15s';
    };
    const handleTop = document.createElement('div'); handleStyle(handleTop);
    const handleBottom = document.createElement('div'); handleStyle(handleBottom);
    wrapper.appendChild(handleTop); wrapper.appendChild(handleBottom);

    function positionHandles() {
      handleTop.style.left = topVal + '%';
      handleBottom.style.left = bottomVal + '%';
    }
    positionHandles();

    function applyToSettings(src) {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const liveSettings = g.danmakuSettings || settings;
        liveSettings?.set?.('display_top_pct', topVal);
        liveSettings?.set?.('display_bottom_pct', bottomVal);
        // 实时应用到 layer-inner
        const inner = document.getElementById('danmaku-layer-inner');
        if (inner && inner.parentElement) {
          inner.style.top = topVal + '%';
          inner.style.height = (bottomVal - topVal) + '%';
        }
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this?.logger?.info?.('[BasicSettings] display_range ->', topVal, bottomVal, 'from', src);
    }

    function clamp() {
      // 四舍五入并限制为整数
      topVal = Math.round(topVal); bottomVal = Math.round(bottomVal);
      if (topVal < 0) topVal = 0; if (topVal > 99) topVal = 99;
      if (bottomVal <= topVal) bottomVal = Math.min(100, topVal + 1);
      if (bottomVal > 100) bottomVal = 100;
    }

    let dragging = null; // 'top' | 'bottom'
    const onPointerDown = (e, which) => {
      dragging = which; e.preventDefault();
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      if (dragging === 'top') topVal = Math.min(bottomVal - 1, Math.max(0, pct));
      else bottomVal = Math.max(topVal + 1, Math.min(100, pct));
      clamp(); positionHandles(); updateActiveRange(); applyToSettings.call(selfRef, 'drag');
    };
    const onPointerUp = () => {
      dragging = null;
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      applyToSettings.call(selfRef, 'release');
    };
    handleTop.addEventListener('pointerdown', e => onPointerDown(e, 'top'));
    handleBottom.addEventListener('pointerdown', e => onPointerDown(e, 'bottom'));

    // 点击轨道定位最近的手柄
    // 点击整个 wrapper（除手柄本身）时，移动最近手柄并直接进入拖动状态
    wrapper.addEventListener('pointerdown', e => {
      if (e.target === handleTop || e.target === handleBottom) return; // 由各自 handler 处理
      const rect = wrapper.getBoundingClientRect();
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const distTop = Math.abs(pct - topVal);
      const distBottom = Math.abs(pct - bottomVal);
      if (distTop <= distBottom) {
        topVal = Math.min(bottomVal - 1, Math.max(0, pct)); dragging = 'top';
      } else {
        bottomVal = Math.max(topVal + 1, Math.min(100, pct)); dragging = 'bottom';
      }
      clamp(); positionHandles(); updateActiveRange(); applyToSettings.call(selfRef, 'click-move');
      // 进入拖动监听
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      e.preventDefault();
    });

    // 键盘支持（聚焦手柄后用左右键）
    [handleTop, handleBottom].forEach((h, idx) => {
      h.tabIndex = 0;
      h.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          if (idx === 0) topVal = Math.max(0, topVal - 1); else bottomVal = Math.max(topVal + 1, bottomVal - 1);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          if (idx === 0) topVal = Math.min(bottomVal - 1, topVal + 1); else bottomVal = Math.min(100, bottomVal + 1);
        } else return;
        clamp(); positionHandles(); updateActiveRange(); applyToSettings.call(selfRef, 'key');
        e.preventDefault();
      });
    });

    // activeRange 已在前面插入，无需重复追加
    row.appendChild(wrapper);

    const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '限制弹幕垂直显示区域'; row.appendChild(desc);

    const selfRef = this; // for call
    return row;
  }

  _createChConvertRow() {
    const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    const current = settings?.get?.('chConvert') ?? '0'; // '0' 不转换, '1' 简体, '2' 繁体
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', 'chConvert');
    row.setAttribute('data-type', 'enum');

    const labelLine = document.createElement('div');
    labelLine.className = 'danmaku-setting-row__label';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = '简繁转换';
    labelLine.appendChild(labelSpan);
    row.appendChild(labelLine);

    const group = document.createElement('div');
    group.style.display = 'flex';
    group.style.width = '100%';
    group.style.gap = '6px';
    group.style.marginTop = '4px';

    const options = [
      { key: '0', label: '不转换' },
      { key: '1', label: '简体' },
      { key: '2', label: '繁体' }
    ];

    const applyValue = (val) => {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const liveSettings = g.danmakuSettings || settings;
        liveSettings?.set?.('chConvert', val);
        saveIfAutoOn(this.logger);
      } catch (_) { }
      this.logger?.info?.('[BasicSettings] chConvert ->', val);
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
      // 延迟设置激活样式在 currentVal 初始化之后
      setTimeout(setActiveState, 0);
    });

    let currentVal = String(current);
    row.appendChild(group);
    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    // desc.textContent = '选择是否进行简繁体转换。';
    row.appendChild(desc);
    return row;
  }

  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();

    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';
    list.appendChild(this._createFontSizeRow());
    list.appendChild(this._createOpacityRow());
    list.appendChild(this._createSpeedRow());
    list.appendChild(this._createFontFamilyRow());
    list.appendChild(this._createHeatmapModeRow());
    list.appendChild(this._createChConvertRow());
    list.appendChild(this._createDisplayRangeRow());
    panel.appendChild(list);
    return panel;
  }
}
