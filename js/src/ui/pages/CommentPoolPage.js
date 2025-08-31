// 弹幕池分页：来源统计 -> 物理小球（拖拽/碰撞/重力）
import { updateDanmakuSettings } from '../../api/fetch';
import { saveIfAutoOn } from "../../api/utils";


export class CommentPoolPage {
  constructor(opts = {}) {
    this.logger = opts.logger || null;
    this._balls = [];
    this._raf = null;
    this._lastT = 0;
    this._boxEl = null;
    this._panel = null;
    this._resizeOb = null; // ResizeObserver
    this._activeMo = null; // MutationObserver for data-active
    this._trashZoneEl = null;
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

  _readInitialBlacklist() {
    try {
      const g = window.__jfDanmakuGlobal__ || {};
      const raw = g?.danmakuData?.settings?.black_source_list;
      let arr = [];
      if (Array.isArray(raw)) {
        arr = raw;
      } else if (typeof raw === 'string') {
        const s = raw.trim();
        if (s) {
          try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) arr = parsed; else arr = s.split(',');
          } catch (_) { arr = s.split(','); }
        }
      }
      const list = arr.map(x => String(x).trim()).filter(Boolean);
      const set = new Set(list.map(x => x.toLowerCase()));
      return { list, set };
    } catch (_) { return { list: [], set: new Set() }; }
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

  _makeBallEl(label, color) {
    // 解析名称与计数
    const parts = String(label ?? '').split('\n');
    const name = (parts[0] || '').trim();
    const countText = (parts[1] || '').trim();
    const initial = name ? name[0] : '·';

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.borderRadius = '50%';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = '#fff';
    el.style.textAlign = 'center';
    el.style.padding = '4px';
    el.style.boxSizing = 'border-box';
    el.style.cursor = 'grab';
    // 触屏优化：禁用浏览器手势滚动/缩放，避免拖动时页面滚动
    el.style.touchAction = 'none';
    el.style.willChange = 'transform';
    el.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), rgba(255,255,255,.05) 35%), ${color}`;
    el.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
    el.title = name ? `${name} (${countText || '0'})` : (countText || '');

    // 背景水印（名称首字母/首字）
    const bg = document.createElement('div');
    bg.className = 'jf-ball-bg';
    bg.style.position = 'absolute';
    bg.style.inset = '0';
    bg.style.display = 'flex';
    bg.style.alignItems = 'center';
    bg.style.justifyContent = 'center';
    bg.style.pointerEvents = 'none';
    bg.style.userSelect = 'none';
    bg.style.fontWeight = '800';
    bg.style.lineHeight = '1';
    bg.style.letterSpacing = '0';
    bg.style.color = 'rgba(255,255,255,.12)';
    bg.style.textShadow = '0 1px 2px rgba(0,0,0,.2)';
    bg.style.zIndex = '0';
    bg.textContent = initial;

    // 前景：只显示计数，字号固定（不随球大小变化）
    const fg = document.createElement('div');
    fg.className = 'jf-ball-count';
    fg.style.position = 'relative';
    fg.style.zIndex = '1';
    fg.style.fontSize = '12px';
    fg.style.fontWeight = '600';
    fg.style.textShadow = '0 1px 2px rgba(0,0,0,.35)';
    fg.textContent = countText || '';

    el.appendChild(bg);
    el.appendChild(fg);
    // 保存引用，方便外部依据半径设定字号
    el._bgWatermark = bg;
    return el;
  }

  _colorForIndex(i) {
    const palette = [
      'linear-gradient(135deg,#3fa9ff,#0c82d8)',
      'linear-gradient(135deg,#ff7a59,#ff3d6e)',
      'linear-gradient(135deg,#6bd06b,#2fbf71)',
      'linear-gradient(135deg,#a78bfa,#6d28d9)',
      'linear-gradient(135deg,#fbbf24,#f59e0b)',
      'linear-gradient(135deg,#34d399,#10b981)',
      'linear-gradient(135deg,#f472b6,#ec4899)'
    ];
    return palette[i % palette.length];
  }

  _initBalls(stats) {
    const rect = this._boxEl.getBoundingClientRect();
    const W = Math.max(50, rect.width);
    const H = Math.max(50, rect.height);
    const max = Math.max(...stats.map(s => s.count));
    const minR = 14, maxR = 44;
    this._balls = stats.map((s, i) => {
      const r = minR + (max > 0 ? (maxR - minR) * (s.count / max) : 0);
      const el = this._makeBallEl(`${s.name}\n${s.count}`, this._colorForIndex(i));
      el.style.width = `${Math.round(r * 2)}px`;
      el.style.height = `${Math.round(r * 2)}px`;
      // 背景水印字号 ~ 1.1 × 半径，最小 12px
      const bgFS = Math.max(12, Math.round(r * 1.1));
      if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
      this._boxEl.appendChild(el);
      // 随机放置，避免重叠：尝试多次
      let x = r + Math.random() * (W - 2 * r);
      let y = r + Math.random() * (H - 2 * r);
      let tries = 0;
      const temp = { x, y, r };
      while (tries++ < 50 && this._balls?.length) {
        let overlap = false;
        for (const b of this._balls) {
          const dx = temp.x - b.x; const dy = temp.y - b.y;
          if (Math.hypot(dx, dy) < temp.r + b.r + 2) { overlap = true; break; }
        }
        if (!overlap) break;
        temp.x = r + Math.random() * (W - 2 * r);
        temp.y = r + Math.random() * (H - 2 * r);
      }
      x = temp.x; y = temp.y;
      // 基于半径设定质量（二维近似：m ∝ r^2，密度取 1）
      const mass = r * r;
      // 初始化平滑随机漂移（力向量，缓慢变化）
      const _driftAng = Math.random() * Math.PI * 2;
      const _DRIFT_FORCE_MIN = 40, _DRIFT_FORCE_MAX = 120;
      const _driftMag = _DRIFT_FORCE_MIN + Math.random() * (_DRIFT_FORCE_MAX - _DRIFT_FORCE_MIN);
      const ball = {
        el, name: s.name, count: s.count, x, y,
        vx: 0, vy: 0, r, mass,
        dragging: false, _px: 0, _py: 0, _pt: 0,
        // 漂移力当前值与目标值、下次切换时间
        _driftFx: 0, _driftFy: 0,
        _driftTargetFx: Math.cos(_driftAng) * _driftMag,
        _driftTargetFy: Math.sin(_driftAng) * _driftMag,
        _driftNext: performance.now() + (150 + Math.random() * 200)
      };
      this._attachDrag(ball);
      return ball;
    });
  }

  _attachDrag(ball) {
    const onDown = (e) => {
      // 仅响应左键拖拽；右键在此截断，避免冒泡到外层导致面板关闭
      if (typeof e.button === 'number' && e.button !== 0) {
        try { e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.(); } catch (_) { }
        return;
      }
      try { ball.el.setPointerCapture?.(e.pointerId); } catch (_) { }
      ball.dragging = true;
      ball.el.style.cursor = 'grabbing';
      ball.vx = 0; ball.vy = 0;
      // 在垃圾桶内与在主容器内，偏移计算不同
      if (ball.inTrash) {
        // 使用幽灵球随鼠标移动，隐藏原球
        const r = ball.r;
        if (!ball._ghostEl) this._createGhostEl(ball);
        ball.el.style.visibility = 'hidden';
        ball._ghostEl.style.left = `${Math.round(e.clientX - r)}px`;
        ball._ghostEl.style.top = `${Math.round(e.clientY - r)}px`;
        const now = performance.now();
        ball._pt = now; ball._px = e.clientX; ball._py = e.clientY;
      } else {
        const p = this._toLocal(e.clientX, e.clientY);
        ball._offsetX = p.x - ball.x;
        ball._offsetY = p.y - ball.y;
        ball._px = p.x; ball._py = p.y; ball._pt = performance.now();
      }
      e.preventDefault?.(); e.stopPropagation?.();
    };
    const onMove = (e) => {
      if (!ball.dragging) return;
      // 触屏拖动时阻止页面滚动/回弹
      try { e.preventDefault?.(); } catch (_) { }
      if (ball.inTrash) {
        // 幽灵球跟随
        if (!ball._ghostEl) this._createGhostEl(ball);
        const r = ball.r;
        const nx = Math.round(e.clientX - r);
        const ny = Math.round(e.clientY - r);
        ball._ghostEl.style.left = `${nx}px`;
        ball._ghostEl.style.top = `${ny}px`;
      } else {
        // 主框内拖拽 + 框外幽灵球
        const inside = this._isPointInBox(e.clientX, e.clientY);
        if (inside) {
          // 回到框内：移除幽灵球、显示原球并按原逻辑更新
          if (ball._ghostEl) this._removeGhostEl(ball);
          if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
          const p = this._toLocal(e.clientX, e.clientY);
          const x = p.x - ball._offsetX; const y = p.y - ball._offsetY;
          const rect = this._boxEl.getBoundingClientRect();
          const W = rect.width, H = rect.height; const r = ball.r;
          ball.x = Math.max(r, Math.min(W - r, x));
          ball.y = Math.max(r, Math.min(H - r, y));
          // 估算拖拽速度以便松手后“掷出”
          const now = performance.now();
          const dt = Math.max(1, now - (ball._pt || now));
          ball.vx = (p.x - (ball._px || p.x)) / dt * 16;
          ball.vy = (p.y - (ball._py || p.y)) / dt * 16;
          ball._px = p.x; ball._py = p.y; ball._pt = now;
        } else {
          // 框外：隐藏原球，显示幽灵球跟随鼠标（以中心对准指针）
          if (!ball._ghostEl) {
            this._createGhostEl(ball);
          }
          if (ball.el.style.visibility !== 'hidden') ball.el.style.visibility = 'hidden';
          const r = ball.r;
          const nx = Math.round(e.clientX - r);
          const ny = Math.round(e.clientY - r);
          ball._ghostEl.style.left = `${nx}px`;
          ball._ghostEl.style.top = `${ny}px`;
        }
      }
      // 顶部垃圾桶命中检测（基于指针屏幕坐标）
      if (this._trashZoneEl) {
        try {
          const rct = this._trashZoneEl.getBoundingClientRect();
          const over = e.clientX >= rct.left && e.clientX <= rct.right && e.clientY >= rct.top && e.clientY <= rct.bottom;
          ball._overTrash = !!over;
          this._trashZoneEl.style.outlineColor = over ? 'rgba(255,80,80,.95)' : 'rgba(255,255,255,.25)';
          this._trashZoneEl.style.background = over ? 'linear-gradient(135deg, rgba(255,64,64,.25), rgba(255,0,0,.12))' : 'rgba(255,255,255,.04)';
        } catch (_) { }
      }
    };
    const onUp = async (e) => {
      const wasDragging = ball.dragging;
      ball.dragging = false;
      ball.el.style.cursor = 'grab';
      try { ball.el.releasePointerCapture?.(e.pointerId); } catch (_) { }
      // 根据松手位置决定逻辑
      if (!wasDragging) return;
      const overTrash = this._isPointInTrash(e.clientX, e.clientY);
      // 触屏增加“命中松弛”，让靠近主框边缘也视为命中，方便从黑名单拖出
      const slack = (e.pointerType === 'touch') ? Math.max(24, Math.min(48, Math.round(ball.r))) : 0;
      const overBox = this._isPointInBox(e.clientX, e.clientY);
      const nearBox = slack > 0 ? this._isPointNearBox(e.clientX, e.clientY, slack) : false;
      // 清理临时样式（若来自垃圾桶视口拖拽）
      if (ball._prevPosStyle != null) {
        // 恢复为相对排版（若仍在垃圾桶）或交由盒子物理渲染
        ball.el.style.position = ball._prevPosStyle;
        ball.el.style.left = ball._prevLeft || '';
        ball.el.style.top = ball._prevTop || '';
        ball.el.style.transform = ball._prevTransform || '';
        ball._prevPosStyle = null; ball._prevLeft = null; ball._prevTop = null; ball._prevTransform = null;
      }
      // 情况1：从主盒拖到垃圾桶
      if (!ball.inTrash && overTrash) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        await this._moveBallToTrash(ball);
        return;
      }
      // 情况2：从垃圾桶拖回主盒
      if (ball.inTrash && (overBox || nearBox)) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        await this._moveBallBackToBox(ball, e.clientX, e.clientY);
        return;
      }
      // 情况2.1：仍在垃圾桶或框外松手 -> 保留在垃圾桶，清理幽灵球并恢复可见
      if (ball.inTrash && !overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
      // 情况3：主盒拖拽，松手在盒内 -> 依靠现有位置即可
      if (!ball.inTrash && overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
      // 情况4：主盒拖拽，松手在盒外且不在垃圾桶 -> 还原显示（位置保持最近一次盒内位置）
      if (!ball.inTrash && !overTrash && !overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
      // 其他：回到原位（主盒由下一帧渲染，垃圾桶维持布局）
    };
    // 当触控被系统手势中断（pointercancel），按松手处理，防止卡住
    const onCancel = (e) => { try { onUp(e); } catch (_) { } };
    // 悬停暂停（仅限鼠标）
    const onEnter = (e) => {
      try {
        if ((e.pointerType || 'mouse') !== 'mouse') return;
        if (ball.dragging || ball.inTrash) return;
        ball.hoverPause = true;
        // 记录当前速度并清零，避免在暂停时残余移动
        ball._preHoverVx = ball.vx; ball._preHoverVy = ball.vy;
        ball.vx = 0; ball.vy = 0;
      } catch (_) { }
    };
    const onLeave = (e) => {
      try {
        if ((e.pointerType || 'mouse') !== 'mouse') return;
        ball.hoverPause = false;
        // 不恢复速度，保持静止，由系统力再次缓慢推动
      } catch (_) { }
    };
    // 右键菜单：阻止默认并显示自定义菜单
    const onCtx = (e) => {
      try { e.preventDefault?.(); e.stopPropagation?.(); } catch (_) { }
      this._showBallMenu(ball, e.clientX, e.clientY);
    };
    ball.el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    ball.el.addEventListener('pointerenter', onEnter);
    ball.el.addEventListener('pointerleave', onLeave);
    // 捕获阶段拦截，确保外层不会先关闭面板
    ball.el.addEventListener('contextmenu', onCtx, { capture: true });
    // 保存引用以便销毁时解绑
    ball._onDown = onDown;
    ball._onMove = onMove;
    ball._onUp = onUp;
    ball._onCancel = onCancel;
    ball._onEnter = onEnter;
    ball._onLeave = onLeave;
    ball._onCtx = onCtx;
    // 记录以便未来销毁（此处简化不做 remove，页面重建会释放元素引用）
  }

  _showBallMenu(ball, x, y) {
    try { this._closeMenu(); } catch (_) { }
    const menu = document.createElement('div');
    // 在面板内使用绝对定位，坐标以面板为参考系
    menu.style.position = 'absolute';
    // 初始定位占位，稍后根据尺寸再校正
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.background = 'rgba(20,20,20,.96)';
    menu.style.backdropFilter = 'blur(4px)';
    menu.style.border = '1px solid rgba(255,255,255,.15)';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 8px 24px rgba(0,0,0,.45)';
    menu.style.padding = '6px';
    menu.style.minWidth = '160px';
    menu.style.color = '#fff';
    menu.style.zIndex = '999999';
    menu.style.fontSize = '12px';
    menu.style.userSelect = 'none';

    const mkItem = (label, handler, { danger = false, disabled = false } = {}) => {
      const it = document.createElement('div');
      it.textContent = label;
      it.style.padding = '8px 10px';
      it.style.borderRadius = '6px';
      it.style.cursor = disabled ? 'not-allowed' : 'pointer';
      it.style.opacity = disabled ? '.45' : '1';
      it.style.color = danger ? 'rgb(255,120,120)' : '#fff';
      it.addEventListener('mouseenter', () => { if (!disabled) it.style.background = 'rgba(255,255,255,.08)'; });
      it.addEventListener('mouseleave', () => { it.style.background = 'transparent'; });
      if (!disabled && typeof handler === 'function') {
        it.addEventListener('click', async () => {
          try { await handler(); } finally { this._closeMenu(); }
        });
      }
      menu.appendChild(it);
      return it;
    };

    // 动态加入/移出黑名单
    if (ball.inTrash) {
      mkItem('移出黑名单', async () => {
        // 若在垃圾桶，回到主框，位置使用菜单触发坐标
        await this._moveBallBackToBox(ball, x, y);
      });
    } else {
      mkItem('加入黑名单', async () => {
        await this._moveBallToTrash(ball, true);
      }, { danger: true });
    }
    // 占位项（暂未实现功能）
    mkItem('查看来源信息（暂未实现）', () => { }, { disabled: true });
    mkItem('更多操作（暂未实现）', () => { }, { disabled: true });
    mkItem('取消', () => { });

    // 将菜单作为设置面板的一部分，避免触发面板的“点击外部关闭”
    const host = this._panel || document.body;
    host.appendChild(menu);
    // 阻止菜单内部的指针与点击事件向上冒泡，避免外层捕获到并关闭面板
    const stopCap = (ev) => { try { ev.stopPropagation(); ev.stopImmediatePropagation?.(); } catch (_) { } };
    const stopBub = (ev) => { try { ev.stopPropagation(); } catch (_) { } };
    // 捕获阶段阻断指针类事件，防止外层关闭
    menu.addEventListener('pointerdown', stopCap, { capture: true });
    menu.addEventListener('pointerup', stopCap, { capture: true });
    menu.addEventListener('contextmenu', stopCap, { capture: true });
    // 冒泡阶段阻断 click（允许目标点击处理器先执行，再阻断向外层冒泡）
    menu.addEventListener('click', stopBub, { capture: false });
    this._stopMenuCap = stopCap;
    this._stopMenuBubble = stopBub;
    // 在面板内校正坐标，避免超出面板可视范围
    try {
      const w = menu.offsetWidth || 160;
      const h = menu.offsetHeight || 10;
      const hostRect = host.getBoundingClientRect();
      // 将屏幕坐标转换为面板内坐标
      let nx = x - hostRect.left;
      let ny = y - hostRect.top;
      nx = Math.min(Math.max(8, nx), Math.max(8, (hostRect.width - w - 8)));
      ny = Math.min(Math.max(8, ny), Math.max(8, (hostRect.height - h - 8)));
      menu.style.left = `${nx}px`;
      menu.style.top = `${ny}px`;
    } catch (_) { }

    const onDocDown = (ev) => {
      try { if (!menu.contains(ev.target)) this._closeMenu(); } catch (_) { }
    };
    const onKey = (ev) => { if (ev.key === 'Escape') this._closeMenu(); };
    const onScroll = () => { this._closeMenu(); };
    setTimeout(() => { // 延迟绑定以避免立即触发
      document.addEventListener('pointerdown', onDocDown, { passive: true, capture: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      window.addEventListener('keydown', onKey, { passive: true });
    }, 0);

    this._menuEl = menu;
    this._menuBallRef = ball;
    this._onMenuDocDown = onDocDown;
    this._onMenuScroll = onScroll;
    this._onMenuKey = onKey;
  }

  _closeMenu() {
    try {
      if (this._menuEl?.parentElement) {
        try {
          // 解除菜单上为阻止冒泡/捕获绑定的监听
          if (this._stopMenuCap) {
            this._menuEl.removeEventListener('pointerdown', this._stopMenuCap, { capture: true });
            this._menuEl.removeEventListener('pointerup', this._stopMenuCap, { capture: true });
            this._menuEl.removeEventListener('contextmenu', this._stopMenuCap, { capture: true });
          }
          if (this._stopMenuBubble) {
            this._menuEl.removeEventListener('click', this._stopMenuBubble, { capture: false });
          }
        } catch (_) { }
        this._menuEl.parentElement.removeChild(this._menuEl);
      }
    } catch (_) { }
    try {
      if (this._onMenuDocDown) document.removeEventListener('pointerdown', this._onMenuDocDown, { capture: true });
    } catch (_) { }
    try { if (this._onMenuScroll) window.removeEventListener('scroll', this._onMenuScroll); } catch (_) { }
    try { if (this._onMenuScroll) window.removeEventListener('resize', this._onMenuScroll); } catch (_) { }
    try { if (this._onMenuKey) window.removeEventListener('keydown', this._onMenuKey); } catch (_) { }
    this._menuEl = null; this._menuBallRef = null; this._stopMenuBubble = null; this._stopMenuCap = null;
    this._onMenuDocDown = null; this._onMenuScroll = null; this._onMenuKey = null;
  }

  _isPointInTrash(clientX, clientY) {
    try {
      if (!this._trashZoneEl) return false;
      const r = this._trashZoneEl.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    } catch (_) { return false; }
  }

  _isPointInBox(clientX, clientY) {
    try {
      if (!this._boxEl) return false;
      const r = this._boxEl.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    } catch (_) { return false; }
  }

  // 触屏松弛命中：允许在主框边缘 slack 像素内判为“接近命中”
  _isPointNearBox(clientX, clientY, slack = 24) {
    try {
      if (!this._boxEl) return false;
      const r = this._boxEl.getBoundingClientRect();
      const rs = { left: r.left - slack, top: r.top - slack, right: r.right + slack, bottom: r.bottom + slack };
      return clientX >= rs.left && clientX <= rs.right && clientY >= rs.top && clientY <= rs.bottom;
    } catch (_) { return false; }
  }

  _createGhostEl(ball) {
    try {
      const g = document.createElement('div');
      const size = Math.round(ball.r * 2);
      g.style.position = 'fixed';
      g.style.left = '0px';
      g.style.top = '0px';
      g.style.width = `${size}px`;
      g.style.height = `${size}px`;
      g.style.borderRadius = '50%';
      g.style.pointerEvents = 'none';
      g.style.backdropFilter = 'none';
      g.style.filter = 'none';
      g.style.opacity = '0.7';
      g.style.boxShadow = '0 6px 16px rgba(0,0,0,.35)';
      // 复制背景和一个简单的文本（仅来源名，不显示数量以避免过密）
      g.style.background = ball.el.style.background || 'rgba(255,255,255,.2)';
      g.style.display = 'flex';
      g.style.alignItems = 'center';
      g.style.justifyContent = 'center';
      g.style.color = '#fff';
      g.style.fontSize = '11px';
      g.style.userSelect = 'none';
      g.style.zIndex = '999999';
      g.textContent = ball.name || '';
      document.body.appendChild(g);
      ball._ghostEl = g;
    } catch (_) { }
  }

  _removeGhostEl(ball) {
    try {
      if (ball?._ghostEl?.parentElement) {
        ball._ghostEl.parentElement.removeChild(ball._ghostEl);
      }
    } catch (_) { }
    ball._ghostEl = null;
  }

  async _moveBallToTrash(ball, persist = true) {
    try {
      this._closeMenu();
      // 标记并移入垃圾桶容器，暂停物理与渲染
      ball.inTrash = true;
      ball.vx = 0; ball.vy = 0;
      if (ball._ghostEl) this._removeGhostEl(ball);
      ball.el.style.visibility = 'visible';
      if (this._trashZoneEl && ball.el?.parentElement !== this._trashZoneEl) {
        this._trashZoneEl.appendChild(ball.el);
      }
      // 作为列表项布局
      ball.el.style.position = 'relative';
      ball.el.style.transform = 'none';
      ball.el.style.left = 'auto'; ball.el.style.top = 'auto';
      ball.el.style.margin = '4px';
      ball.el.style.zIndex = '1'; // 置于背景水印之上
      // 更新设置：加入黑名单
      if (persist) {
        await this._blacklistUpdate(ball.name, true);
      }
    } catch (e) {
      this.logger?.warn?.('[CommentPool] 移入垃圾桶失败', e);
    } finally {
      if (this._trashZoneEl) {
        this._trashZoneEl.style.outlineColor = 'rgba(255,255,255,.25)';
        this._trashZoneEl.style.background = 'rgba(255,255,255,.04)';
      }
    }
  }

  async _moveBallBackToBox(ball, clientX, clientY) {
    try {
      this._closeMenu();
      // 从垃圾桶恢复到主容器，恢复物理
      ball.inTrash = false;
      if (this._boxEl && ball.el?.parentElement !== this._boxEl) {
        this._boxEl.appendChild(ball.el);
      }
      ball.el.style.margin = '0';
      ball.el.style.position = 'absolute';
      ball.el.style.zIndex = ''; // 清理垃圾桶内的叠放样式
      // 依据半径重新设置水印字号
      try {
        const r = ball.r;
        const bgFS = Math.max(12, Math.round(r * 1.1));
        if (ball.el && ball.el._bgWatermark) ball.el._bgWatermark.style.fontSize = `${bgFS}px`;
      } catch (_) { }
      // 设置回盒子坐标
      const p = this._toLocal(clientX, clientY);
      const rect = this._boxEl.getBoundingClientRect();
      const W = rect.width, H = rect.height; const r = ball.r;
      ball.x = Math.max(r, Math.min(W - r, p.x));
      ball.y = Math.max(r, Math.min(H - r, p.y));
      // 移除 transform 由渲染循环接管
      // 黑名单移除
      await this._blacklistUpdate(ball.name, false);
    } catch (e) {
      this.logger?.warn?.('[CommentPool] 恢复至主框失败', e);
    } finally {
      if (this._trashZoneEl) {
        this._trashZoneEl.style.outlineColor = 'rgba(255,255,255,.25)';
        this._trashZoneEl.style.background = 'rgba(255,255,255,.04)';
      }
    }
  }

  async _blacklistUpdate(name, add) {
    try {
      const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
      const s = g.danmakuSettings;
      if (!(s?.get && s?.set)) return;
      const raw = s.get('black_source_list') || '';
      let arr = [];
      if (typeof raw === 'string' && raw.trim()) {
        try { const parsed = JSON.parse(raw.trim()); if (Array.isArray(parsed)) arr = parsed; } catch (_) {
          arr = raw.split(',').map(x => x.trim()).filter(Boolean);
        }
      }
      const key = String(name || '').trim().toLowerCase();
      const lower = arr.map(x => String(x).toLowerCase());
      if (add) {
        if (!lower.includes(key)) arr.push(key);
      } else {
        arr = arr.filter(x => String(x).toLowerCase() !== key);
      }
      s.set('black_source_list', JSON.stringify(arr));
      try { saveIfAutoOn(this.logger); } catch (e) { this.logger?.warn?.('[CommentPool] 保存 black_source_list 失败', e); }
      this.logger?.info?.(`[CommentPool] ${add ? '已加入' : '已移除'}黑名单来源`, key);
    } catch (e) {
      this.logger?.warn?.('[CommentPool] 更新黑名单失败', e);
    }
  }

  _toLocal(clientX, clientY) {
    const rect = this._boxEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  _step = (t) => {
    if (!this._boxEl?.isConnected) { this._raf = null; return; }
    // 不可见（当前tab未激活）则暂停动画，待激活时由观察器恢复
    if (this._panel && this._panel.getAttribute('data-active') !== 'true') {
      this._raf = null;
      return;
    }
    const dt = Math.min(32, (t - (this._lastT || t))) || 16; // ms
    this._lastT = t;
    const rect = this._boxEl.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    // 已移除重力
    // 空气阻力“力”系数基准：线性 c1（~Stokes，∝r），二次 c2（∝截面积∝r^2）
    // 实际加速度 a = F/m，因此分量加速度：-(c1*r*v + c2*r^2*v|v|)/m
    const c1 = 0.06;   // 线性阻力基准
    const c2 = 0.0008; // 二次阻力基准（保持与改动前量级一致）
    const bounce = 0.9;
    // 质量中心吸引力（主框内球朝系统质心靠拢）
    let sumM = 0, cx = 0, cy = 0, activeCount = 0;
    for (const b of this._balls) {
      if (b.inTrash) continue;
      const m = b.mass || (b.r * b.r) || 1;
      sumM += m; cx += (b.x || 0) * m; cy += (b.y || 0) * m; activeCount++;
    }
    if (sumM > 0) {
      // 添加位于框中心的虚拟质量点，质量为所有（主框内）球的一半
      const virtM = sumM * 0.5;
      const totM = sumM + virtM;
      const cxc = W / 2, cyc = H / 2;
      cx = (cx + cxc * virtM) / totM;
      cy = (cy + cyc * virtM) / totM;
    } else {
      cx = W / 2; cy = H / 2;
    }
    const kCoh = 0.045; // 吸引强度（越大越快收拢）
    // 积分 & 边界
    for (const b of this._balls) {
      if (!b.dragging && !b.inTrash && !b.hoverPause) {
        // 空气阻力：基于半径与质量的线性+二次模型
        const m = b.mass || (b.r * b.r) || 1;
        const r = b.r;
        const axDrag = -((c1 * r) * b.vx + (c2 * r * r) * b.vx * Math.abs(b.vx)) / m;
        const ayDrag = -((c1 * r) * b.vy + (c2 * r * r) * b.vy * Math.abs(b.vy)) / m;
        b.vx += axDrag * dt;
        b.vy += ayDrag * dt;
        // 平滑随机漂移力（缓慢变化，带插值），按质量转为加速度
        const DRIFT_LERP_TAU = 1000; // ms，越大越平滑
        const DRIFT_SWITCH_MIN = 1500, DRIFT_SWITCH_MAX = 3500; // 切换周期范围
        if (typeof b._driftNext !== 'number') b._driftNext = t + (1500 + Math.random() * 2000);
        if (t >= b._driftNext) {
          const ang = Math.random() * Math.PI * 2;
          const FMIN = 0.4, FMAX = 1.2;
          const mag = FMIN + Math.random() * (FMAX - FMIN);
          b._driftTargetFx = Math.cos(ang) * mag;
          b._driftTargetFy = Math.sin(ang) * mag;
          b._driftNext = t + (DRIFT_SWITCH_MIN + Math.random() * (DRIFT_SWITCH_MAX - DRIFT_SWITCH_MIN));
        }
        const alpha = Math.min(1, dt / DRIFT_LERP_TAU);
        b._driftFx = (b._driftFx || 0) + ((b._driftTargetFx || 0) - (b._driftFx || 0)) * alpha;
        b._driftFy = (b._driftFy || 0) + ((b._driftTargetFy || 0) - (b._driftFy || 0)) * alpha;
        b.vx += ((b._driftFx || 0) / m) * dt;
        b.vy += ((b._driftFy || 0) / m) * dt;
        // 质量中心吸引：沿与质量中心连线顺时针偏转70°的方向施力（右侧70度）
        // 原始方向 v = (cx - b.x, cy - b.y)，旋转公式（顺时针θ）：
        // v' = [ v.x*cos(-θ) - v.y*sin(-θ), v.x*sin(-θ) + v.y*cos(-θ) ]
        // 注意：当仅有一个球时也生效，以虚拟质量点影响其轨迹
        if (activeCount >= 1) {
          const dxC = (cx - b.x);
          const dyC = (cy - b.y);
          const theta = -Math.PI * 70 / 180; // -70°，顺时针
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const rx = dxC * cosT - dyC * sinT;
          const ry = dxC * sinT + dyC * cosT;
          b.vx += (kCoh * rx / m) * dt;
          b.vy += (kCoh * ry / m) * dt;
        }
        // 低速阈值截断，避免无限抖动
        if (Math.abs(b.vx) < 0.001) b.vx = 0;
        if (Math.abs(b.vy) < 0.001) b.vy = 0;
        b.x += b.vx * dt / 16; b.y += b.vy * dt / 16;
      }
      // 边界碰撞
      if (!b.inTrash) {
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * bounce; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * bounce; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * bounce; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * bounce; b.vx *= 0.285; }
      }
    }
    // 球-球碰撞（朴素 O(n^2)）
    for (let i = 0; i < this._balls.length; i++) {
      for (let j = i + 1; j < this._balls.length; j++) {
        const a = this._balls[i], c = this._balls[j];
        if (a.inTrash || c.inTrash) continue;
        const dx = c.x - a.x, dy = c.y - a.y; const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.r + c.r;
        if (dist < minDist) {
          const nx = dx / dist, ny = dy / dist; // 碰撞法线
          const overlap = (minDist - dist);
          // 质量权重：拖拽或悬停视为无限质量（invMass=0）
          const invA = (a.dragging || a.hoverPause) ? 0 : 1 / (a.mass || (a.r * a.r) || 1);
          const invC = (c.dragging || c.hoverPause) ? 0 : 1 / (c.mass || (c.r * c.r) || 1);
          const invSum = invA + invC;
          // 位置校正按逆质量比例分配
          if (invSum > 0) {
            const corr = overlap / invSum;
            a.x -= nx * (corr * invA);
            a.y -= ny * (corr * invA);
            c.x += nx * (corr * invC);
            c.y += ny * (corr * invC);
          }
          // 速度沿法线分离（可恢复系数 e=bounce）
          const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
          const rel = rvx * nx + rvy * ny;
          if (rel < 0 && invSum > 0) {
            const e = 0.9;
            const jImp = -(1 + e) * rel / invSum;
            const impX = jImp * nx, impY = jImp * ny;
            if (invA > 0) { a.vx -= impX * invA; a.vy -= impY * invA; }
            if (invC > 0) { c.vx += impX * invC; c.vy += impY * invC; }
          }
        }
      }
    }
    // 渲染
    for (const b of this._balls) {
      if (b.inTrash) continue; // 垃圾桶中由布局/拖拽样式控制
      const x = b.x - b.r, y = b.y - b.r;
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    this._raf = requestAnimationFrame(this._step);
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
    // 渲染函数：从 this._balls 生成图例项
    const renderLegend = () => {
      try {
        if (!legendWrap) return;
        legendWrap.innerHTML = '';
        const balls = Array.isArray(this._balls) ? this._balls : [];
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
    this._initBalls(stats);
    // 初始化完小球后渲染一次图例
    try { renderLegend(); } catch (_) { }
    // 按初始黑名单将对应来源放入垃圾桶（仅视觉，不触发保存）
    try {
      const initialBlack = this._readInitialBlacklist();
      if (initialBlack && initialBlack.set && initialBlack.set.size) {
        for (const b of this._balls) {
          const key = String(b.name || '').trim().toLowerCase();
          if (initialBlack.set.has(key)) {
            // 异步放入垃圾桶（仅视觉），不阻塞构建
            this._moveBallToTrash(b, false).catch(() => { });
          }
        }
        // 对于黑名单中但不在当前统计的数据源，创建计数为 0 的小球并放入垃圾桶
        const present = new Set(this._balls.map(x => String(x.name || '').trim().toLowerCase()));
        let extraIdx = 0;
        for (const rawName of initialBlack.list) {
          const key = String(rawName || '').trim().toLowerCase();
          if (!key || present.has(key)) continue;
          const r = 14; // 最小半径
          const color = this._colorForIndex(this._balls.length + (extraIdx++));
          const el = this._makeBallEl(`${rawName}\n0`, color);
          el.style.width = `${r * 2}px`;
          el.style.height = `${r * 2}px`;
          const bgFS = Math.max(12, Math.round(r * 1.1));
          if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
          // 直接加入垃圾桶容器并按列表项布局
          if (this._trashZoneEl) this._trashZoneEl.appendChild(el);
          el.style.position = 'relative';
          el.style.transform = 'none';
          el.style.left = 'auto'; el.style.top = 'auto';
          el.style.margin = '4px';
          el.style.zIndex = '1';
          // 初始化带漂移属性的小球（虽然在垃圾桶内不会参与物理，但便于拖回时直接生效）
          const _ang = Math.random() * Math.PI * 2;
          const _FMIN = 0.4, _FMAX = 1.2;
          const _mag = _FMIN + Math.random() * (_FMAX - _FMIN);
          const ball = {
            el, name: rawName, count: 0, x: r, y: r,
            vx: 0, vy: 0, r, mass: r * r, dragging: false, _px: 0, _py: 0, _pt: 0, inTrash: true,
            _driftFx: 0, _driftFy: 0,
            _driftTargetFx: Math.cos(_ang) * _mag,
            _driftTargetFy: Math.sin(_ang) * _mag,
            _driftNext: performance.now() + (1500 + Math.random() * 2000)
          };
          this._attachDrag(ball);
          this._balls.push(ball);
        }
        // 黑名单额外小球加入后，刷新图例
        try { renderLegend(); } catch (_) { }
      }
    } catch (_) { /* 忽略初始化黑名单异常 */ }
    // 监听可见性变化：tab 切换时自动暂停/恢复
    try {
      this._activeMo = new MutationObserver(() => {
        if (!this._panel?.isConnected) return;
        const active = this._panel.getAttribute('data-active') === 'true';
        if (active && !this._raf) {
          this._lastT = 0;
          this._raf = requestAnimationFrame(this._step);
        }
      });
      this._activeMo.observe(panel, { attributes: true, attributeFilter: ['data-active'] });
    } catch (_) { /* 忽略 */ }
    // 自适应尺寸变化：收缩时收拢到容器内
    try {
      this._resizeOb = new ResizeObserver(() => {
        if (!this._boxEl) return;
        const { width: W, height: H } = this._boxEl.getBoundingClientRect();
        for (const b of this._balls) {
          b.x = Math.max(b.r, Math.min(W - b.r, b.x));
          b.y = Math.max(b.r, Math.min(H - b.r, b.y));
        }
      });
      this._resizeOb.observe(this._boxEl);
    } catch (_) { /* 忽略 */ }
    // 初始若可见则启动动画
    if (panel.getAttribute('data-active') === 'true') {
      this._raf = requestAnimationFrame(this._step);
    }
    return panel;
  }

  // 清理资源，供上层在页面销毁/对话框关闭时调用
  destroy() {
    try { if (this._raf) cancelAnimationFrame(this._raf); } catch (_) { }
    this._raf = null;
    this._lastT = 0;
    try { this._activeMo?.disconnect(); } catch (_) { }
    this._activeMo = null;
    try { this._resizeOb?.disconnect(); } catch (_) { }
    this._resizeOb = null;
    // 解绑 window 事件
    for (const b of this._balls) {
      if (b?._onDown) { try { b.el.removeEventListener('pointerdown', b._onDown); } catch (_) { } }
      if (b?._onMove) { try { window.removeEventListener('pointermove', b._onMove); } catch (_) { } }
      if (b?._onUp) { try { window.removeEventListener('pointerup', b._onUp); } catch (_) { } }
      if (b?._onCancel) { try { window.removeEventListener('pointercancel', b._onCancel); } catch (_) { } }
      if (b?._onEnter) { try { b.el.removeEventListener('pointerenter', b._onEnter); } catch (_) { } }
      if (b?._onLeave) { try { b.el.removeEventListener('pointerleave', b._onLeave); } catch (_) { } }
      if (b?._onCtx) { try { b.el.removeEventListener('contextmenu', b._onCtx); } catch (_) { } }
      // 清理幽灵球
      if (b?._ghostEl) { try { this._removeGhostEl(b); } catch (_) { } }
      b._onMove = null; b._onUp = null; b._onCancel = null;
    }
    try { this._closeMenu(); } catch (_) { }
    this._trashZoneEl = null;
  }
}
