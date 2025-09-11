// 弹幕池分页：来源统计 -> 物理小球（拖拽/碰撞/重力）
import { CommentBallManager } from "./CommentBallManager";
import { ExtSourceDialog } from "../dialogs/ExtSourceDialog";
import { saveIfAutoOn } from "../../api/utils";


export class CommentPoolPage {
  constructor(opts = {}) {
    this.logger = opts.logger || null;
    this._boxEl = null;
    this._panel = null;
    this._trashZoneEl = null;
    this._ballMgr = null;
    this._trashZoneBgHTML = null; // 保存黑名单区域初始水印内容，便于重建时恢复
    this._onExtSourceSaved = null; // 事件句柄
  }
  getKey() { return 'commentpool'; }
  getLabel() { return '弹幕来源'; }

  _readStats() {
    try {
      const g = window.__jfDanmakuGlobal__ || {};
      const raw = g?.danmakuData?.source_stats;
      if (!Array.isArray(raw)) return null; // 不再兼容旧字典结构
      let entries = raw.map(item => {
        const name = item?.source_name ?? item?.sourceName ?? item?.SourceName ?? '';
        const count = Number(item?.count ?? item?.Count ?? 0) || 0;
        const type = item?.type ?? item?.Type;
        const source = item?.source ?? item?.Source;
        const enable = item?.enable ?? item?.Enable;
        const shift = Number(item?.shift ?? item?.Shift ?? 0) || 0;
        return { name, count, type, source, enable, shift };
      }).filter(e => e && e.name && e.count > 0);
      return entries.length ? entries : null;
    } catch (_) { return null; }
  }

  // 取消统计签名逻辑，初始化与重建统一走 _rebuildBalls

  _createBox() {
    const box = document.createElement('div');
    box.style.position = 'relative';
    box.style.width = '100%';
    box.style.height = '260px';
    box.style.background = 'rgba(255,255,255,.05)';
    box.style.border = '1px solid rgba(255,255,255,.15)';
    box.style.borderRadius = '10px';
    box.style.overflow = 'hidden';
    // 触屏优化：允许纵向滚动页面（在主框空白区域上下滑动可滚动）
    // 拖拽小球本身仍通过小球元素的 touch-action:none 阻止页面滚动
    box.style.touchAction = 'pan-y';
    box.style.userSelect = 'none';
    return box;
  }



  build() {
    const panel = document.createElement('div');
    panel.className = 'danmaku-settings-tabPanel';
    panel.dataset.key = this.getKey();
    this._panel = panel;

    const list = document.createElement('div');
    list.className = 'danmaku-settings-list';

    const row = document.createElement('div');
    row.className = 'danmaku-setting-row';
    const label = document.createElement('div');
    label.className = 'danmaku-setting-row__label';
    const title = document.createElement('span');
    title.className = 'danmaku-setting-row__labelText';
    title.textContent = '弹幕来源';
    label.appendChild(title);
    row.appendChild(label);

    // 辅助函数：创建可放置小球的区域（垃圾桶）
    const makeZone = (label, align = 'left') => {
      const z = document.createElement('div');
      z.style.flex = '1';
      z.style.minHeight = '48px';
      z.style.border = '1px dashed rgba(255,255,255,.25)';
      z.style.borderRadius = '8px';
      z.style.display = 'flex';
      z.style.alignItems = 'center';
      z.style.justifyContent = align === 'left' ? 'flex-start' : 'flex-end';
      z.style.padding = '8px 10px';
      z.style.background = 'rgba(255,255,255,.04)';
      z.style.outline = '2px solid transparent';
      z.style.outlineColor = 'rgba(255,255,255,.25)';
      z.style.flexWrap = 'wrap';
      z.style.gap = '6px';
      z.style.position = 'relative';
      // 背景水印文字
      const bg = document.createElement('div');
      bg.style.position = 'absolute';
      bg.style.left = '0';
      bg.style.top = '0';
      bg.style.right = '0';
      bg.style.bottom = '0';
      bg.style.display = 'flex';
      bg.style.alignItems = 'center';
      bg.style.justifyContent = 'center';
      bg.style.pointerEvents = 'none';
      bg.style.userSelect = 'none';
      bg.style.fontSize = '30px';
      bg.style.fontWeight = '700';
      bg.style.letterSpacing = '0.3em';
      bg.style.color = 'rgba(255,255,255,.12)';
      bg.style.textShadow = '0 1px 2px rgba(0,0,0,.2)';
      bg.style.zIndex = '0';
      bg.textContent = label || '';
      z.appendChild(bg);
      return z;
    };
    const box = this._createBox();
    this._boxEl = box;
    row.appendChild(box);
    // 将垃圾桶区域移动到主框下方（背景显示“黑名单”）
    this._trashZoneEl = makeZone('黑名单', 'left');
    try { this._trashZoneBgHTML = this._trashZoneEl.innerHTML; } catch (_) { }
    // 触屏优化：垃圾桶区域允许纵向滚动，但拖拽小球本身会阻止默认
    this._trashZoneEl.style.touchAction = 'pan-y';
    this._trashZoneEl.style.margin = '8px 0 0 0';
    row.appendChild(this._trashZoneEl);
    const desc = document.createElement('div');
    desc.className = 'danmaku-setting-row__desc';
    // 图例：颜色-名称-数量 对照
    desc.textContent = '';
    const legendTitle = document.createElement('div');
    legendTitle.style.fontWeight = '600';
    legendTitle.style.margin = '2px 0 6px';
    const legendWrap = document.createElement('div');
    legendWrap.style.display = 'flex';
    legendWrap.style.flexWrap = 'wrap';
    legendWrap.style.gap = '8px 14px';
    legendWrap.style.alignItems = 'center';
    legendWrap.style.opacity = '0.95';
    desc.appendChild(legendTitle);
    desc.appendChild(legendWrap);
    // 图例渲染函数（实例属性，便于后续重建调用）
    const renderLegend = () => {
      try {
        if (!legendWrap) return;
        legendWrap.innerHTML = '';
        const balls = Array.isArray(this._ballMgr?.getBalls?.()) ? this._ballMgr.getBalls() : [];
        for (const b of balls) {
          const item = document.createElement('div');
          item.style.display = 'inline-flex';
          item.style.alignItems = 'center';
          item.style.lineHeight = '1.3';
          const dot = document.createElement('span');
          dot.style.width = '12px';
          dot.style.height = '12px';
          dot.style.borderRadius = '50%';
          dot.style.display = 'inline-block';
          dot.style.marginRight = '6px';
          dot.style.boxShadow = '0 0 0 1px rgba(255,255,255,.25) inset, 0 0 4px rgba(0,0,0,.35)';
          try { dot.style.background = b?.el?.style?.background || '#999'; } catch (_) { dot.style.background = '#999'; }
          const txt = document.createElement('span');
          txt.style.fontSize = '12px';
          txt.style.opacity = '0.95';
          try {
            const nm = (b?.name ?? '').toString();
            const tp = (b?.type ?? '').toString();
            txt.textContent = tp ? `${nm}(${tp})` : nm;
          } catch (_) { txt.textContent = (b?.name ?? '').toString(); }
          item.appendChild(dot);
          item.appendChild(txt);
          legendWrap.appendChild(item);
        }
      } catch (_) { }
    };
    this._legendRender = renderLegend; // 保存引用
    row.appendChild(desc);
    list.appendChild(row);
    panel.appendChild(list);

    // --- 添加弹幕源表单区 ---
    const extRow = document.createElement('div');
    extRow.className = 'danmaku-setting-row';
    const extLabel = document.createElement('div');
    extLabel.className = 'danmaku-setting-row__label';
    const extTitle = document.createElement('span');
    extTitle.className = 'danmaku-setting-row__labelText';
    extTitle.textContent = '添加弹幕源';
    extLabel.appendChild(extTitle);
    extRow.appendChild(extLabel);

    const extWrap = document.createElement('div');
    extWrap.style.flex = '1';
    extWrap.style.display = 'flex';
    extWrap.style.flexDirection = 'column';
    extWrap.style.gap = '8px';
    extWrap.style.padding = '10px';
    extWrap.style.border = '1px solid rgba(255,255,255,.15)';
    extWrap.style.borderRadius = '10px';
    extWrap.style.background = 'rgba(255,255,255,.05)';
    extWrap.style.minHeight = '48px';
    extWrap.style.position = 'relative';
    extRow.appendChild(extWrap);

    const renderInfo = (msg, opacity = .8) => {
      const info = document.createElement('div');
      info.className = 'danmaku-setting-row__desc';
      info.style.opacity = String(opacity);
      info.textContent = msg;
      return info;
    };

    list.appendChild(extRow);
    // 数据与启动
    const stats = this._readStats();
    if (!stats) {
      const empty = document.createElement('div');
      empty.className = 'danmaku-setting-row__desc';
      empty.style.opacity = '.8';
      empty.textContent = '暂无来源统计数据。';
      list.appendChild(empty);
    }
    // 统一使用重建流程（首次）
    this._rebuildBalls(stats);
    try { renderLegend(); } catch (_) { }

    // 监听外部弹幕源保存事件（来自 ExtSourceDialog）以重建小球
    this._onExtSourceSaved = () => {
      try { this._rebuildBalls(this._readStats()); } catch (e) { this.logger?.warn?.('[CommentPoolPage] handle danmaku-ext-source-saved failed', e); }
    };
    try { window.addEventListener('danmaku-ext-source-saved', this._onExtSourceSaved, { passive: true }); } catch (_) { }

    // 渲染添加弹幕源表单
    try { this._renderExtSourceUI(extWrap); } catch (e) { this.logger?.warn?.('[CommentPoolPage] renderExtSourceUI error', e); }
    return panel;
  }

  // 清理资源，供上层在页面销毁/对话框关闭时调用
  destroy() {
    try { this._ballMgr?.destroy?.(); } catch (_) { }
    this._ballMgr = null;
    this._trashZoneEl = null;
    try { if (this._onExtSourceSaved) window.removeEventListener('danmaku-ext-source-saved', this._onExtSourceSaved); } catch (_) { }
    this._onExtSourceSaved = null;
  }

  _renderExtSourceUI(container) {
    // 获取 itemId
    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
    const itemId = g.getMediaId?.();
    if (!itemId) {
      container.innerHTML = '';
      container.appendChild((() => { const d = document.createElement('div'); d.className = 'danmaku-setting-row__desc'; d.style.opacity = '.8'; d.textContent = '无法获取媒体ID，无法管理添加弹幕源。'; return d; })());
      return;
    }
    if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
      container.innerHTML = '';
      container.appendChild((() => { const d = document.createElement('div'); d.className = 'danmaku-setting-row__desc'; d.style.opacity = '.8'; d.textContent = '缺少 ApiClient，无法管理添加弹幕源。'; return d; })());
      return;
    }

    const createButton = (text, variant = 'primary') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = text;
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '12px';
      btn.style.borderRadius = '6px';
      btn.style.padding = '6px 10px';
      btn.style.marginLeft = '8px';
      btn.style.border = '1px solid rgba(255,255,255,.25)';
      btn.style.background = variant === 'danger' ? 'rgba(255,80,80,.15)' : 'rgba(255,255,255,.08)';
      btn.style.color = '#fff';
      btn.onmouseenter = () => { btn.style.background = variant === 'danger' ? 'rgba(255,80,80,.25)' : 'rgba(255,255,255,.15)'; };
      btn.onmouseleave = () => { btn.style.background = variant === 'danger' ? 'rgba(255,80,80,.15)' : 'rgba(255,255,255,.08)'; };
      return btn;
    };

    const createInput = (placeholder = '', type = 'text') => {
      const input = document.createElement('input');
      input.type = type;
      input.placeholder = placeholder;
      input.style.background = 'rgba(255,255,255,.1)';
      input.style.border = '1px solid rgba(255,255,255,.25)';
      input.style.borderRadius = '6px';
      input.style.padding = '6px 8px';
      input.style.color = '#fff';
      input.style.minWidth = '120px';
      return input;
    };

    const createSelect = (options) => {
      const sel = document.createElement('select');
      sel.style.background = 'rgba(255,255,255,.1)';
      sel.style.border = '1px solid rgba(255,255,255,.25)';
      sel.style.borderRadius = '6px';
      sel.style.padding = '6px 8px';
      sel.style.color = '#fff';
      for (const { value, label } of options) {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        sel.appendChild(opt);
      }
      return sel;
    };

    const fetchData = async () => {
      const url = ApiClient.getUrl(`danmaku/ext_source?item_id=${encodeURIComponent(itemId)}`);
      const response = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
      if (Array.isArray(response)) return response;
      return [];
    };

    const postData = async ({ sourceName, type, source, enable }) => {
      const url = ApiClient.getUrl('danmaku/ext_source');
      const form = new URLSearchParams();
      form.append('item_id', String(itemId));
      form.append('source_name', sourceName);
      form.append('type', type ?? 'url');
      form.append('source', source ?? '');
      form.append('enable', String(!!enable));
      await ApiClient.ajax({ type: 'POST', url, data: form.toString(), contentType: 'application/x-www-form-urlencoded; charset=UTF-8', dataType: 'json' });
      let autoOk = false;
      try { await saveIfAutoOn(); autoOk = true; } catch (_) { }
      if (autoOk) {
        try { this._rebuildBalls(this._readStats()); } catch (e) { this.logger?.warn?.('[CommentPoolPage] rebuild balls failed', e); }
      }
    };

    const render = async () => {
      container.innerHTML = '';
      let data = [];
      try { data = await fetchData(); }
      catch (e) {
        this.logger?.warn?.('[CommentPoolPage] 获取添加弹幕源失败', e);
        container.appendChild(renderInfo('获取添加弹幕源失败')); return;
      }

      const makeRow = (item) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '8px';
        row.style.padding = '8px 10px';
        row.style.background = 'rgba(255,255,255,.04)';
        row.style.border = '1px solid rgba(255,255,255,.12)';
        row.style.borderRadius = '8px';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.style.gap = '10px';
        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = '600';
        nameSpan.textContent = item?.SourceName ?? '';
        left.appendChild(nameSpan);

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.alignItems = 'center';
        // 启用/停用按钮放在最前
        const btnToggle = createButton(item?.Enable ? '停用' : '启用', item?.Enable ? 'danger' : 'primary');
        const btnEdit = createButton('修改');
        const btnDel = createButton('删除', 'danger');
        right.appendChild(btnToggle);
        right.appendChild(btnEdit);
        right.appendChild(btnDel);
        btnToggle.onclick = async () => {
          try {
            await postData({
              sourceName: item?.SourceName || '',
              type: item?.Type || 'url',
              source: item?.Source || '',
              enable: !item?.Enable
            });
            await render();
          } catch (e) { this.logger?.warn?.('[CommentPoolPage] 切换启用状态失败', e); }
        };

        btnEdit.onclick = async () => {
          try {
            const dialog = new ExtSourceDialog(this.logger);
            await dialog.show({
              itemId,
              item: item,
              onSaved: async () => { await render(); }
            }, this._panel);
          } catch (e) { this.logger?.warn?.('[CommentPoolPage] 打开外部源编辑对话框失败', e); }
        };
        btnDel.onclick = async () => {
          try {
            const ok = await this._showConfirm({
              title: '确认删除',
              message: `确认删除添加弹幕源“${item?.SourceName || ''}”吗？${item?.Type === 'file' ? '（若为文件来源，将尝试删除磁盘中的对应文件）' : ''}`,
              confirmText: '删除',
              cancelText: '取消'
            });
            if (!ok) return;
            // 删除时必须带上原来的 type，后端在 type === 'file' 时会尝试删除物理文件
            await postData({ sourceName: item?.SourceName || '', type: item?.Type || 'url', source: '', enable: false });
            await render();
          } catch (e) { this.logger?.warn?.('[CommentPoolPage] 删除添加弹幕源失败', e); }
        };

        row.appendChild(left);
        row.appendChild(right);
        return row;
      };

      // 现有项
      for (const item of data) container.appendChild(makeRow(item));

      // 新增项（+）
      const addRow = document.createElement('div');
      addRow.style.display = 'flex';
      addRow.style.alignItems = 'center';
      addRow.style.justifyContent = 'center';
      addRow.style.padding = '8px';
      addRow.style.border = '1px dashed rgba(255,255,255,.3)';
      addRow.style.borderRadius = '8px';
      addRow.style.cursor = 'pointer';
      addRow.style.userSelect = 'none';
      addRow.style.background = 'rgba(255,255,255,.04)';
      const plus = document.createElement('div'); plus.textContent = '+'; plus.style.fontSize = '18px'; plus.style.opacity = '.9';
      addRow.appendChild(plus);
      addRow.onclick = async () => {
        try {
          const dialog = new ExtSourceDialog(this.logger);
          await dialog.show({
            itemId,
            item: null,
            onSaved: async () => { await render(); }
          }, this._panel);
        } catch (e) { this.logger?.warn?.('[CommentPoolPage] 打开外部源新增对话框失败', e); }
      };
      container.appendChild(addRow);
    };

    // 首次渲染
    render();
  }

  _rebuildBalls(stats) {
    try {
      if (!this._boxEl) return;
      if (!Array.isArray(stats) || !stats.length) {
        // 如果没有数据，清空但保留实例不再渲染小球
        try { if (this._boxEl) this._boxEl.innerHTML = ''; } catch (_) { }
        return;
      }
      if (!this._ballMgr) {
        this._ballMgr = new CommentBallManager({ logger: this.logger });
        this._ballMgr.setContainers({ boxEl: this._boxEl, trashZoneEl: this._trashZoneEl, panel: this._panel });
        this._ballMgr.initWithStats(stats);
      } else {
        this._ballMgr.updateStats(stats);
      }
      try { this._legendRender?.(); } catch (_) { }
    } catch (e) { this.logger?.warn?.('[CommentPoolPage] _rebuildBalls error', e); }
  }

  // 参考 SearchDanmakuPage 的统一确认弹窗
  _ensureModalLayer() {
    if (!this._panel) return null;
    let overlay = this._panel.querySelector?.('.danmaku-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'danmaku-modal-overlay';
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.display = 'none';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.background = 'rgba(0,0,0,.45)';
      overlay.style.zIndex = '9999';
      overlay.style.backdropFilter = 'blur(2px)';
      this._panel.appendChild(overlay);
    }
    return overlay;
  }

  _showConfirm({ title = '确认', message = '确定执行该操作吗？', confirmText = '确定', cancelText = '取消' } = {}) {
    return new Promise((resolve) => {
      try {
        const overlay = this._ensureModalLayer();
        if (!overlay) { resolve(window.confirm?.(message)); return; }

        overlay.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.maxWidth = '420px';
        wrap.style.width = 'min(90vw, 420px)';
        wrap.style.background = 'rgba(30,30,30,.98)';
        wrap.style.border = '1px solid rgba(255,255,255,.16)';
        wrap.style.borderRadius = '10px';
        wrap.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
        wrap.style.padding = '14px 16px 12px';
        wrap.style.color = '#fff';
        wrap.style.transform = 'scale(.96)';
        wrap.style.opacity = '0';
        wrap.style.transition = 'transform .15s ease, opacity .15s ease';

        const h = document.createElement('div');
        h.textContent = title;
        h.style.fontSize = '15px';
        h.style.fontWeight = '700';
        h.style.marginBottom = '8px';

        const msg = document.createElement('div');
        msg.textContent = message;
        msg.style.fontSize = '13px';
        msg.style.opacity = '.92';
        msg.style.lineHeight = '1.6';
        msg.style.marginBottom = '12px';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.justifyContent = 'flex-end';
        btnRow.style.gap = '8px';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = cancelText;
        cancel.style.padding = '6px 12px';
        cancel.style.fontSize = '12px';
        cancel.style.borderRadius = '6px';
        cancel.style.border = '1px solid rgba(255,255,255,.20)';
        cancel.style.background = 'rgba(255,255,255,.08)';
        cancel.style.color = '#fff';

        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = confirmText;
        ok.style.padding = '6px 12px';
        ok.style.fontSize = '12px';
        ok.style.borderRadius = '6px';
        ok.style.border = '1px solid rgba(220, 53, 69, .7)';
        ok.style.background = 'rgba(220, 53, 69, .25)';
        ok.style.color = '#ffdede';

        btnRow.appendChild(cancel);
        btnRow.appendChild(ok);

        wrap.appendChild(h);
        wrap.appendChild(msg);
        wrap.appendChild(btnRow);
        overlay.appendChild(wrap);

        let prevOverflow = null;
        try { prevOverflow = document.body && document.body.style ? document.body.style.overflow : null; } catch (_) { }

        const close = (val) => {
          try {
            wrap.style.transform = 'scale(.96)';
            wrap.style.opacity = '0';
            setTimeout(() => {
              overlay.style.display = 'none';
              overlay.innerHTML = '';
              try { if (document.body && document.body.style) document.body.style.overflow = prevOverflow || ''; } catch (_) { }
              try { document.removeEventListener('keydown', onKey); } catch (_) { }
              resolve(val);
            }, 140);
          } catch (_) { overlay.style.display = 'none'; resolve(val); }
        };

        const onKey = (e) => {
          if (e.key === 'Escape') { e.preventDefault?.(); close(false); }
          if (e.key === 'Enter') { e.preventDefault?.(); close(true); }
        };

        cancel.addEventListener('click', () => close(false));
        ok.addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', onKey);

        overlay.style.display = 'flex';
        try { if (document.body && document.body.style) document.body.style.overflow = 'hidden'; } catch (_) { }
        requestAnimationFrame(() => {
          wrap.style.transform = 'scale(1)';
          wrap.style.opacity = '1';
        });
      } catch (_) { resolve(false); }
    });
  }
}
