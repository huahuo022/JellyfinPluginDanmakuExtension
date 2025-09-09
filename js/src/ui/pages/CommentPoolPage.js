// 弹幕池分页：来源统计 -> 物理小球（拖拽/碰撞/重力）
import { CommentBallManager } from "./CommentBallManager";


export class CommentPoolPage {
  constructor(opts = {}) {
    this.logger = opts.logger || null;
    this._boxEl = null;
    this._panel = null;
    this._trashZoneEl = null;
  this._ballMgr = null;
  }
  getKey() { return 'commentpool'; }
  getLabel() { return '弹幕池'; }

  _readStats() {
    try {
      const g = window.__jfDanmakuGlobal__ || {};
      const stats = g?.danmakuData?.source_stats;
      if (!stats || typeof stats !== 'object') return null;
      const entries = Object.entries(stats)
        .map(([name, v]) => ({ name, count: Number(v) || 0 }))
        .filter(e => e.count > 0);
      if (!entries.length) return null;
      return entries;
    } catch (_) { return null; }
  }

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
  // 渲染函数：从小球管理器生成图例项
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
          // 直接复用小球背景（包含高光与渐变）
          try { dot.style.background = b?.el?.style?.background || '#999'; } catch (_) { dot.style.background = '#999'; }
          const txt = document.createElement('span');
          txt.style.fontSize = '12px';
          txt.style.opacity = '0.95';
          // const name = (b?.name ?? '').toString();
          // const count = Number(b?.count || 0);
          txt.textContent = (b?.name ?? '').toString();;
          item.appendChild(dot);
          item.appendChild(txt);
          legendWrap.appendChild(item);
        }
      } catch (_) { /* 忽略图例渲染异常 */ }
    };
    row.appendChild(desc);

    list.appendChild(row);
    panel.appendChild(list);

    // 数据与启动
  const stats = this._readStats();
    if (!stats) {
      const empty = document.createElement('div');
      empty.className = 'danmaku-setting-row__desc';
      empty.style.opacity = '.8';
      empty.textContent = '暂无来源统计数据。';
      list.appendChild(empty);
      return panel;
    }
  // 初始化小球管理器并填充数据
  this._ballMgr = new CommentBallManager({ logger: this.logger });
  this._ballMgr.setContainers({ boxEl: this._boxEl, trashZoneEl: this._trashZoneEl, panel });
  this._ballMgr.initWithStats(stats);
  // 初始化完小球后渲染一次图例
  try { renderLegend(); } catch (_) { }
    return panel;
  }

  // 清理资源，供上层在页面销毁/对话框关闭时调用
  destroy() {
  try { this._ballMgr?.destroy?.(); } catch (_) { }
  this._ballMgr = null;
  this._trashZoneEl = null;
  }
}
