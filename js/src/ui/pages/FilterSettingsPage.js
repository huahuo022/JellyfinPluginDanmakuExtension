// 过滤规则设置分页：白名单 / 黑名单 / 替换名单
import { saveIfAutoOn } from "../../api/utils";
// 按 BasicSettingsPage 的风格实现三个可折叠可编辑的列表表单。
// 数据来源：window.__jfDanmakuGlobal__.danmakuSettings 键 white_list / black_list / force_list
// white_list / black_list: [{ isRegex: false, pattern: '签到' }, { isRegex: true, pattern: '^.{1,2}$'}]
// force_list (替换名单): [{ pattern: 'test', replace: '测试' }]
export class FilterSettingsPage {
  constructor(opts = {}) { this.logger = opts.logger || null; this._sectionUpdaters = []; }
  getKey() { return 'filter'; }
  getLabel() { return '过滤规则'; }



  _commit(key, value, trigger = 'manual') {
    try {
      const settings = window.__jfDanmakuGlobal__.danmakuSettings
      // 规则字段 schema 是 string，需要序列化
      let toStore = value;
      if (Array.isArray(value)) {
        try { toStore = JSON.stringify(value); } catch (_) { toStore = '[]'; }
      }
      settings?.set?.(key, toStore);
      // 专属：确保并触发当前页的保存（完成后刷新统计）
      const p = saveIfAutoOn(this.logger);
      if (p) {p.then(() => { try { this._sectionUpdaters.forEach(fn => { try { fn(); } catch (_) { } }); } catch (_) { }; });}
      this.logger?.info?.('[FilterSettings]', key, 'updated via', trigger, value);

    } catch (e) {
      this.logger?.warn?.('[FilterSettings] commit failed', key, e);
    }
  }


  _createSection(opts) {
    const { key, label, type } = opts; // type: 'wl' | 'bl' | 'repl'
    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    row.setAttribute('data-key', key);
    row.setAttribute('data-type', 'list');

    const header = document.createElement('div');
    header.className = 'danmaku-setting-row__label';
    header.style.cursor = 'pointer';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'danmaku-setting-row__labelText';
    labelSpan.textContent = label;
    header.appendChild(labelSpan);
    const countBadge = document.createElement('span');
    countBadge.style.fontSize = '11px';
    countBadge.style.opacity = '.75';
    countBadge.textContent = '0';
    header.appendChild(countBadge);
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▸';
    toggleIcon.style.marginLeft = '6px';
    toggleIcon.style.transition = 'transform .18s';
    header.appendChild(toggleIcon);
    row.appendChild(header);

    const container = document.createElement('div');
    container.style.marginTop = '6px';
    container.style.display = 'none'; // 折叠初始状态
    container.style.padding = '4px 2px 2px';
    container.style.borderTop = '1px solid rgba(255,255,255,.12)';
    container.style.display = 'none';

    const listWrap = document.createElement('div');
    listWrap.style.display = 'flex';
    listWrap.style.flexDirection = 'column';
    listWrap.style.gap = '4px';
    container.appendChild(listWrap);

    // 说明行
    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    desc.style.marginTop = '4px';
    desc.textContent = type === 'repl' ? '替换名单: 正则/纯文本 pattern 匹配后替换为 replace' : '支持纯文本或正则 (切换开关)。';
    container.appendChild(desc);

    row.appendChild(container);

    // 读取初始数据
    let dataRaw = [];
    try {
      const s = window?.__jfDanmakuGlobal__?.danmakuSettings || null;
      const rawVal = s?.get?.(key);
      if (Array.isArray(rawVal)) dataRaw = rawVal; // 理论上不会：schema 为 string
      else if (typeof rawVal === 'string') {
        const trimmed = rawVal.trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) dataRaw = parsed;
          } catch (_) { /* ignore parse error */ }
        }
      }
      if (!Array.isArray(dataRaw)) dataRaw = [];
    } catch (_) { dataRaw = []; }

    let expanded = false;
    const toggle = () => {
      expanded = !expanded;
      container.style.display = expanded ? 'block' : 'none';
      toggleIcon.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
    };
    header.addEventListener('click', toggle);

    // 更新规则数 + 命中次数的 badge
    const updateHitBadge = () => {
      try {
        const g = window.__jfDanmakuGlobal__ || {};
        const rc = g?.danmakuData?.rule_counts;
        const map = { white_list: 'whitelist', black_list: 'blacklist', force_list: 'forcelist' };
        const rcKey = map[key];
        let hit = 0;
        if (rc && rcKey && rc[rcKey] != null) {
          const num = Number(rc[rcKey]);
          if (Number.isFinite(num)) hit = num; else if (typeof rc[rcKey] === 'string' && rc[rcKey].trim() !== '') {
            const n2 = Number(rc[rcKey].trim()); if (Number.isFinite(n2)) hit = n2;
          }
        }
        countBadge.textContent = `规则数:${dataRaw.length} 命中次数:${hit}`;
      } catch (_) {
        countBadge.textContent = `规则数:${dataRaw.length} 命中次数:0`;
      }
    };

    const rebuild = () => {
      listWrap.innerHTML = '';
      // 初步写入规则数，命中数稍后更新
      countBadge.textContent = `规则数:${dataRaw.length} 命中次数:--`;
      const makeAddRow = (position = 'bottom') => {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.textContent = '+ 添加';
        addBtn.style.width = '100%';
        addBtn.style.padding = '6px 8px';
        addBtn.style.fontSize = '12px';
        addBtn.style.background = 'rgba(255,255,255,.08)';
        addBtn.style.color = '#fff';
        addBtn.style.border = '1px dashed rgba(255,255,255,.3)';
        addBtn.style.borderRadius = '6px';
        addBtn.style.cursor = 'pointer';
        addBtn.addEventListener('mouseenter', () => addBtn.style.background = 'rgba(255,255,255,.15)');
        addBtn.addEventListener('mouseleave', () => addBtn.style.background = 'rgba(255,255,255,.08)');
        addBtn.addEventListener('click', () => {
          if (type === 'repl') dataRaw.push({ pattern: '', replace: '' });
          else dataRaw.push({ isRegex: false, pattern: '' });
          this._commit(key, dataRaw, 'add');
          rebuild();
        });
        if (position === 'top') listWrap.appendChild(addBtn); else listWrap.appendChild(addBtn);
      };

      if (dataRaw.length === 0) {
        makeAddRow('top');
        return;
      }

      dataRaw.forEach((item, idx) => {
        const line = document.createElement('div');
        line.style.display = 'flex';
        line.style.alignItems = 'center';
        line.style.gap = '6px';
        line.style.padding = '6px 6px';
        line.style.background = 'rgba(255,255,255,.05)';
        line.style.border = '1px solid rgba(255,255,255,.15)';
        line.style.borderRadius = '6px';
        line.style.position = 'relative';

        if (type !== 'repl') {
          // isRegex switch
          const regexToggle = document.createElement('button');
          regexToggle.type = 'button';
          regexToggle.textContent = item.isRegex ? '正则' : '文本';
          regexToggle.style.minWidth = '44px';
          regexToggle.style.fontSize = '11px';
          regexToggle.style.padding = '4px 6px';
          regexToggle.style.border = '1px solid rgba(255,255,255,.25)';
          regexToggle.style.borderRadius = '4px';
          regexToggle.style.background = item.isRegex ? '#3fa9ff' : 'rgba(255,255,255,.12)';
          regexToggle.style.cursor = 'pointer';
          regexToggle.addEventListener('click', () => {
            item.isRegex = !item.isRegex;
            regexToggle.textContent = item.isRegex ? '正则' : '文本';
            regexToggle.style.background = item.isRegex ? '#3fa9ff' : 'rgba(255,255,255,.12)';
            this._commit(key, dataRaw, 'toggle');
          });
          line.appendChild(regexToggle);
        }

        const patternInput = document.createElement('input');
        patternInput.type = 'text';
        patternInput.placeholder = 'pattern';
        patternInput.value = item.pattern || '';
        patternInput.className = 'danmaku-setting-input';
        patternInput.style.flex = '1 1 auto';
        patternInput.style.minWidth = '120px';
        patternInput.addEventListener('input', () => { item.pattern = patternInput.value; });
        patternInput.addEventListener('change', () => { this._commit(key, dataRaw, 'pattern-change'); });
        line.appendChild(patternInput);

        if (type === 'repl') {
          const replaceInput = document.createElement('input');
          replaceInput.type = 'text';
          replaceInput.placeholder = 'replace';
          replaceInput.value = item.replace || '';
          replaceInput.className = 'danmaku-setting-input';
          replaceInput.style.flex = '1 1 auto';
          replaceInput.style.minWidth = '120px';
          replaceInput.addEventListener('input', () => { item.replace = replaceInput.value; });
          replaceInput.addEventListener('change', () => { this._commit(key, dataRaw, 'replace-change'); });
          line.appendChild(replaceInput);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '✕';
        delBtn.title = '删除';
        delBtn.style.padding = '4px 6px';
        delBtn.style.fontSize = '12px';
        delBtn.style.background = 'rgba(255,80,80,.25)';
        delBtn.style.border = '1px solid rgba(255,80,80,.4)';
        delBtn.style.borderRadius = '4px';
        delBtn.style.cursor = 'pointer';
        delBtn.addEventListener('mouseenter', () => delBtn.style.background = 'rgba(255,80,80,.4)');
        delBtn.addEventListener('mouseleave', () => delBtn.style.background = 'rgba(255,80,80,.25)');
        delBtn.addEventListener('click', () => {
          dataRaw.splice(idx, 1);
          this._commit(key, dataRaw, 'delete');
          rebuild();
        });
        line.appendChild(delBtn);

        listWrap.appendChild(line);
      });

      // 添加按钮放到底部
      makeAddRow('bottom');
      // 重建后刷新命中次数
      updateHitBadge();
    };

    rebuild();
    // 注册全局刷新器（用于保存后统一刷新）
    this._sectionUpdaters.push(updateHitBadge);
    // 初始异步刷新一次（确保 rule_counts 可能稍后写入）
    setTimeout(updateHitBadge, 0);
    return row;
  }

  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();

    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';

    list.appendChild(this._createSection({ key: 'white_list', label: '白名单', type: 'wl' }));
    list.appendChild(this._createSection({ key: 'black_list', label: '黑名单', type: 'bl' }));
    list.appendChild(this._createSection({ key: 'force_list', label: '替换名单', type: 'repl' }));

    // 全局说明：显示白/黑名单的命中处理逻辑
    const footerNote = document.createElement('div');
    footerNote.className = 'danmaku-setting-row__desc';
    footerNote.style.marginTop = '8px';
    footerNote.style.opacity = '.85';
    footerNote.innerHTML = '白名单: 命中时无视合并规则<br>黑名单: 命中时直接删除<br>替换名单: 命中时替换文本后继续处理<br>需要开启弹幕合并总开关才能生效';
    list.appendChild(footerNote);

    panel.appendChild(list);
    return panel;
  }
}
