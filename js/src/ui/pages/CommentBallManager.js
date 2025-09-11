// 小球管理器：负责小球的创建、物理、拖拽、菜单与黑名单交互
import { saveIfAutoOn } from "../../api/utils";
import { TimeShiftDialog } from "../dialogs/TimeShiftDialog";
import { SourceInfoDialog } from "../dialogs/SourceInfoDialog";

export class CommentBallManager {
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
    // 菜单/幽灵球临时引用
    this._menuEl = null;
    this._menuBallRef = null;
    this._onMenuDocDown = null;
    this._onMenuScroll = null;
    this._onMenuKey = null;
    this._stopMenuCap = null;
    this._stopMenuBubble = null;
    // 时间偏移对话框
    this._timeShiftDialog = new TimeShiftDialog(this.logger);
  }

  setContainers({ boxEl, trashZoneEl, panel }) {
    this._boxEl = boxEl || null;
    this._trashZoneEl = trashZoneEl || null;
    this._panel = panel || null;
  }

  getBalls() { return this._balls; }

  _makeBallEl(label, color) {
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
  el.style.flexDirection = 'column'; // 纵向堆叠：数量在上，shift 在下
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.color = '#fff';
    el.style.textAlign = 'center';
    el.style.padding = '4px';
    el.style.boxSizing = 'border-box';
    el.style.cursor = 'grab';
    el.style.touchAction = 'none';
    el.style.willChange = 'transform';
    el.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), rgba(255,255,255,.05) 35%), ${color}`;
    el.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
    el.title = name ? `${name} (${countText || '0'})` : (countText || '');

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
  // shift 显示行（默认隐藏，非 0 时显示 MM:SS）
  const shiftEl = document.createElement('div');
  shiftEl.className = 'jf-ball-shift';
  shiftEl.style.position = 'relative';
  shiftEl.style.zIndex = '1';
  shiftEl.style.fontSize = '10px';
  shiftEl.style.fontWeight = '600';
  shiftEl.style.marginTop = '1px';
  shiftEl.style.opacity = '0.92';
  shiftEl.style.textShadow = '0 1px 2px rgba(0,0,0,.35)';
  shiftEl.style.color = 'rgba(255,255,255,.95)';
  shiftEl.style.display = 'none';
  shiftEl.textContent = '';
  el.appendChild(shiftEl);
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
      const bgFS = Math.max(12, Math.round(r * 1.1));
      if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
      this._boxEl.appendChild(el);
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
      const mass = r * r;
      const _driftAng = Math.random() * Math.PI * 2;
      const _DRIFT_FORCE_MIN = 40, _DRIFT_FORCE_MAX = 120;
      const _driftMag = _DRIFT_FORCE_MIN + Math.random() * (_DRIFT_FORCE_MAX - _DRIFT_FORCE_MIN);
      const ball = {
        el, name: s.name, type: s.type, count: s.count, x, y,
        vx: 0, vy: 0, r, mass,
        dragging: false, _px: 0, _py: 0, _pt: 0,
        _driftFx: 0, _driftFy: 0,
        _driftTargetFx: Math.cos(_driftAng) * _driftMag,
        _driftTargetFy: Math.sin(_driftAng) * _driftMag,
        _driftNext: performance.now() + (150 + Math.random() * 200),
        // 时间偏移（毫秒）
        shift: Number(s?.shift ?? s?.Shift ?? 0) || 0
      };
      this._attachDrag(ball);
      // 初始化 shift 标签
      try { this._setBallShiftLabel(ball); } catch (_) { }
      return ball;
    });
  }

  // 将毫秒格式化为 +/-MM:SS（分钟可超 99）
  _formatMsToMMSS(ms) {
    try {
      const isNeg = Number(ms) < 0;
      const absMs = Math.abs(Number(ms) || 0);
      const totalSec = Math.floor(absMs / 1000);
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      const txt = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
      return isNeg ? `-${txt}` : txt;
    } catch (_) { return '00:00'; }
  }

  // 根据 ball.shift 更新小球上的 shift 显示
  _setBallShiftLabel(ball) {
    try {
      const el = ball?.el;
      if (!el) return;
      let lab = el.querySelector?.('.jf-ball-shift');
      if (!lab) {
        // 兼容旧元素：动态补齐
        lab = document.createElement('div');
        lab.className = 'jf-ball-shift';
        lab.style.position = 'relative';
        lab.style.zIndex = '1';
        lab.style.fontSize = '10px';
        lab.style.fontWeight = '600';
        lab.style.marginTop = '1px';
        lab.style.opacity = '0.92';
        lab.style.textShadow = '0 1px 2px rgba(0,0,0,.35)';
        lab.style.color = 'rgba(255,255,255,.95)';
        el.appendChild(lab);
      }
      const v = Number(ball?.shift || 0) || 0;
      if (v === 0) {
        lab.textContent = '';
        lab.style.display = 'none';
      } else {
        lab.textContent = this._formatMsToMMSS(v);
        lab.style.display = '';
      }
    } catch (_) { }
  }

  _attachDrag(ball) {
    const onDown = (e) => {
      if (typeof e.button === 'number' && e.button !== 0) {
        try { e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.(); } catch (_) { }
        return;
      }
      try { ball.el.setPointerCapture?.(e.pointerId); } catch (_) { }
      ball.dragging = true;
      ball.el.style.cursor = 'grabbing';
      ball.vx = 0; ball.vy = 0;
      if (ball.inTrash) {
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
      try { e.preventDefault?.(); } catch (_) { }
      if (ball.inTrash) {
        if (!ball._ghostEl) this._createGhostEl(ball);
        const r = ball.r;
        const nx = Math.round(e.clientX - r);
        const ny = Math.round(e.clientY - r);
        ball._ghostEl.style.left = `${nx}px`;
        ball._ghostEl.style.top = `${ny}px`;
      } else {
        const inside = this._isPointInBox(e.clientX, e.clientY);
        if (inside) {
          if (ball._ghostEl) this._removeGhostEl(ball);
          if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
          const p = this._toLocal(e.clientX, e.clientY);
          const x = p.x - ball._offsetX; const y = p.y - ball._offsetY;
          const rect = this._boxEl.getBoundingClientRect();
          const W = rect.width, H = rect.height; const r = ball.r;
          ball.x = Math.max(r, Math.min(W - r, x));
          ball.y = Math.max(r, Math.min(H - r, y));
          const now = performance.now();
          const dt = Math.max(1, now - (ball._pt || now));
          ball.vx = (p.x - (ball._px || p.x)) / dt * 16;
          ball.vy = (p.y - (ball._py || p.y)) / dt * 16;
          ball._px = p.x; ball._py = p.y; ball._pt = now;
        } else {
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
      if (!wasDragging) return;
      const overTrash = this._isPointInTrash(e.clientX, e.clientY);
      const slack = (e.pointerType === 'touch') ? Math.max(24, Math.min(48, Math.round(ball.r))) : 0;
      const overBox = this._isPointInBox(e.clientX, e.clientY);
      const nearBox = slack > 0 ? this._isPointNearBox(e.clientX, e.clientY, slack) : false;
      if (ball._prevPosStyle != null) {
        ball.el.style.position = ball._prevPosStyle;
        ball.el.style.left = ball._prevLeft || '';
        ball.el.style.top = ball._prevTop || '';
        ball.el.style.transform = ball._prevTransform || '';
        ball._prevPosStyle = null; ball._prevLeft = null; ball._prevTop = null; ball._prevTransform = null;
      }
      if (!ball.inTrash && overTrash) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        await this._moveBallToTrash(ball);
        return;
      }
      if (ball.inTrash && (overBox || nearBox)) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        await this._moveBallBackToBox(ball, e.clientX, e.clientY);
        return;
      }
      if (ball.inTrash && !overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
      if (!ball.inTrash && overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
      if (!ball.inTrash && !overTrash && !overBox) {
        if (ball._ghostEl) this._removeGhostEl(ball);
        if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
        return;
      }
    };
    const onCancel = (e) => { try { onUp(e); } catch (_) { } };
    const onEnter = (e) => {
      try {
        if ((e.pointerType || 'mouse') !== 'mouse') return;
        if (ball.dragging || ball.inTrash) return;
        ball.hoverPause = true;
        ball._preHoverVx = ball.vx; ball._preHoverVy = ball.vy;
        ball.vx = 0; ball.vy = 0;
      } catch (_) { }
    };
    const onLeave = (e) => {
      try {
        if ((e.pointerType || 'mouse') !== 'mouse') return;
        ball.hoverPause = false;
      } catch (_) { }
    };
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
    ball.el.addEventListener('contextmenu', onCtx, { capture: true });
    ball._onDown = onDown;
    ball._onMove = onMove;
    ball._onUp = onUp;
    ball._onCancel = onCancel;
    ball._onEnter = onEnter;
    ball._onLeave = onLeave;
    ball._onCtx = onCtx;
  }

  _showBallMenu(ball, x, y) {
    try { this._closeMenu(); } catch (_) { }
    const menu = document.createElement('div');
    menu.style.position = 'absolute';
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

    if (ball.inTrash) {
      mkItem('移出黑名单', async () => {
        await this._moveBallBackToBox(ball, x, y);
      });
    } else {
      mkItem('加入黑名单', async () => {
        await this._moveBallToTrash(ball, true);
      }, { danger: true });
    }
    mkItem('查看来源信息', async () => {
      try {
        const dlg = new SourceInfoDialog(this.logger);
        await dlg.show(ball, this._panel);
      } catch (e) { this.logger?.warn?.('[CommentBallManager] 打开来源信息失败', e); }
    });
    mkItem('时间轴偏移', async () => {
      await this._showTimeShiftDialog(ball);
    });
    mkItem('更多操作（暂未实现）', () => { }, { disabled: true });
    mkItem('取消', () => { });

    const host = this._panel || document.body;
    host.appendChild(menu);
    const stopCap = (ev) => { try { ev.stopPropagation(); ev.stopImmediatePropagation?.(); } catch (_) { } };
    const stopBub = (ev) => { try { ev.stopPropagation(); } catch (_) { } };
    menu.addEventListener('pointerdown', stopCap, { capture: true });
    menu.addEventListener('pointerup', stopCap, { capture: true });
    menu.addEventListener('contextmenu', stopCap, { capture: true });
    menu.addEventListener('click', stopBub, { capture: false });
    this._stopMenuCap = stopCap;
    this._stopMenuBubble = stopBub;
    try {
      const w = menu.offsetWidth || 160;
      const h = menu.offsetHeight || 10;
      const hostRect = host.getBoundingClientRect();
      let nx = x - hostRect.left;
      let ny = y - hostRect.top;
      nx = Math.min(Math.max(8, nx), Math.max(8, (hostRect.width - w - 8)));
      ny = Math.min(Math.max(8, ny), Math.max(8, (hostRect.height - h - 8)));
      menu.style.left = `${nx}px`;
      menu.style.top = `${ny}px`;
    } catch (_) { }

    const onDocDown = (ev) => { try { if (!menu.contains(ev.target)) this._closeMenu(); } catch (_) { } };
    const onKey = (ev) => { if (ev.key === 'Escape') this._closeMenu(); };
    const onScroll = () => { this._closeMenu(); };
    setTimeout(() => {
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
    try { if (this._onMenuDocDown) document.removeEventListener('pointerdown', this._onMenuDocDown, { capture: true }); } catch (_) { }
    try { if (this._onMenuScroll) window.removeEventListener('scroll', this._onMenuScroll); } catch (_) { }
    try { if (this._onMenuScroll) window.removeEventListener('resize', this._onMenuScroll); } catch (_) { }
    try { if (this._onMenuKey) window.removeEventListener('keydown', this._onMenuKey); } catch (_) { }
    this._menuEl = null; this._menuBallRef = null; this._stopMenuBubble = null; this._stopMenuCap = null;
    this._onMenuDocDown = null; this._onMenuScroll = null; this._onMenuKey = null;
  }

  async _showTimeShiftDialog(ball) {
    await this._timeShiftDialog.show(ball, this._panel);
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
      ball.inTrash = true;
      ball.vx = 0; ball.vy = 0;
      if (ball._ghostEl) this._removeGhostEl(ball);
      ball.el.style.visibility = 'visible';
      if (this._trashZoneEl && ball.el?.parentElement !== this._trashZoneEl) {
        this._trashZoneEl.appendChild(ball.el);
      }
      ball.el.style.position = 'relative';
      ball.el.style.transform = 'none';
      ball.el.style.left = 'auto'; ball.el.style.top = 'auto';
      ball.el.style.margin = '4px';
      ball.el.style.zIndex = '1';
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
      ball.inTrash = false;
      if (this._boxEl && ball.el?.parentElement !== this._boxEl) {
        this._boxEl.appendChild(ball.el);
      }
      ball.el.style.margin = '0';
      ball.el.style.position = 'absolute';
      ball.el.style.zIndex = '';
      try {
        const r = ball.r;
        const bgFS = Math.max(12, Math.round(r * 1.1));
        if (ball.el && ball.el._bgWatermark) ball.el._bgWatermark.style.fontSize = `${bgFS}px`;
      } catch (_) { }
      const p = this._toLocal(clientX, clientY);
      const rect = this._boxEl.getBoundingClientRect();
      const W = rect.width, H = rect.height; const r = ball.r;
      ball.x = Math.max(r, Math.min(W - r, p.x));
      ball.y = Math.max(r, Math.min(H - r, p.y));
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
    if (this._panel && this._panel.getAttribute('data-active') !== 'true') {
      this._raf = null;
      return;
    }
    const dt = Math.min(32, (t - (this._lastT || t))) || 16;
    this._lastT = t;
    const rect = this._boxEl.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const c1 = 0.06;
    const c2 = 0.0008;
    const bounce = 0.9;
    let sumM = 0, cx = 0, cy = 0, activeCount = 0;
    for (const b of this._balls) {
      if (b.inTrash) continue;
      const m = b.mass || (b.r * b.r) || 1;
      sumM += m; cx += (b.x || 0) * m; cy += (b.y || 0) * m; activeCount++;
    }
    if (sumM > 0) {
      const virtM = sumM * 0.5;
      const totM = sumM + virtM;
      const cxc = W / 2, cyc = H / 2;
      cx = (cx + cxc * virtM) / totM;
      cy = (cy + cyc * virtM) / totM;
    } else {
      cx = W / 2; cy = H / 2;
    }
    const kCoh = 0.045;
    for (const b of this._balls) {
      if (!b.dragging && !b.inTrash && !b.hoverPause) {
        const m = b.mass || (b.r * b.r) || 1;
        const r = b.r;
        const axDrag = -((c1 * r) * b.vx + (c2 * r * r) * b.vx * Math.abs(b.vx)) / m;
        const ayDrag = -((c1 * r) * b.vy + (c2 * r * r) * b.vy * Math.abs(b.vy)) / m;
        b.vx += axDrag * dt;
        b.vy += ayDrag * dt;
        const DRIFT_LERP_TAU = 1000;
        const DRIFT_SWITCH_MIN = 1500, DRIFT_SWITCH_MAX = 3500;
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
        if (activeCount >= 1) {
          const dxC = (cx - b.x);
          const dyC = (cy - b.y);
          const theta = -Math.PI * 70 / 180;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const rx = dxC * cosT - dyC * sinT;
          const ry = dxC * sinT + dyC * cosT;
          b.vx += (kCoh * rx / m) * dt;
          b.vy += (kCoh * ry / m) * dt;
        }
        if (Math.abs(b.vx) < 0.001) b.vx = 0;
        if (Math.abs(b.vy) < 0.001) b.vy = 0;
        b.x += b.vx * dt / 16; b.y += b.vy * dt / 16;
      }
      if (!b.inTrash) {
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * bounce; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * bounce; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * bounce; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * bounce; b.vx *= 0.285; }
      }
    }
    for (let i = 0; i < this._balls.length; i++) {
      for (let j = i + 1; j < this._balls.length; j++) {
        const a = this._balls[i], c = this._balls[j];
        if (a.inTrash || c.inTrash) continue;
        const dx = c.x - a.x, dy = c.y - a.y; const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.r + c.r;
        if (dist < minDist) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = (minDist - dist);
          const invA = (a.dragging || a.hoverPause) ? 0 : 1 / (a.mass || (a.r * a.r) || 1);
          const invC = (c.dragging || c.hoverPause) ? 0 : 1 / (c.mass || (c.r * c.r) || 1);
          const invSum = invA + invC;
          if (invSum > 0) {
            const corr = overlap / invSum;
            a.x -= nx * (corr * invA);
            a.y -= ny * (corr * invA);
            c.x += nx * (corr * invC);
            c.y += ny * (corr * invC);
          }
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
    for (const b of this._balls) {
      if (b.inTrash) continue;
      const x = b.x - b.r, y = b.y - b.r;
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    this._raf = requestAnimationFrame(this._step);
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

  initWithStats(stats) {
    if (!this._boxEl) throw new Error('CommentBallManager: boxEl 未设置');
    this._initBalls(stats);
    // 初始黑名单视觉同步
    try {
      const initialBlack = this._readInitialBlacklist();
      if (initialBlack && initialBlack.set && initialBlack.set.size) {
        for (const b of this._balls) {
          const key = String(b.name || '').trim().toLowerCase();
          if (initialBlack.set.has(key)) {
            this._moveBallToTrash(b, false).catch(() => { });
          }
        }
        // 补齐仅在黑名单中而不在统计中的来源
        const present = new Set(this._balls.map(x => String(x.name || '').trim().toLowerCase()));
        let extraIdx = 0;
        for (const rawName of initialBlack.list) {
          const key = String(rawName || '').trim().toLowerCase();
          if (!key || present.has(key)) continue;
          const r = 14;
          const color = this._colorForIndex(this._balls.length + (extraIdx++));
          const el = this._makeBallEl(`${rawName}\n0`, color);
          el.style.width = `${r * 2}px`;
          el.style.height = `${r * 2}px`;
          const bgFS = Math.max(12, Math.round(r * 1.1));
          if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
          if (this._trashZoneEl) this._trashZoneEl.appendChild(el);
          el.style.position = 'relative';
          el.style.transform = 'none';
          el.style.left = 'auto'; el.style.top = 'auto';
          el.style.margin = '4px';
          el.style.zIndex = '1';
          const _ang = Math.random() * Math.PI * 2;
          const _FMIN = 0.4, _FMAX = 1.2;
          const _mag = _FMIN + Math.random() * (_FMAX - _FMIN);
          const ball = {
            el, name: rawName, type: undefined, count: 0, x: r, y: r,
            vx: 0, vy: 0, r, mass: r * r, dragging: false, _px: 0, _py: 0, _pt: 0, inTrash: true,
            _driftFx: 0, _driftFy: 0,
            _driftTargetFx: Math.cos(_ang) * _mag,
            _driftTargetFy: Math.sin(_ang) * _mag,
            _driftNext: performance.now() + (1500 + Math.random() * 2000)
          };
          this._attachDrag(ball);
          this._balls.push(ball);
        }
      }
    } catch (_) { }

    // 观察可见性变化：tab 切换时自动暂停/恢复
    try {
      this._activeMo = new MutationObserver(() => {
        if (!this._panel?.isConnected) return;
        const active = this._panel.getAttribute('data-active') === 'true';
        if (active && !this._raf) {
          this._lastT = 0;
          this._raf = requestAnimationFrame(this._step);
        }
      });
      if (this._panel) this._activeMo.observe(this._panel, { attributes: true, attributeFilter: ['data-active'] });
    } catch (_) { }

    // 收缩时收拢到容器内
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
    } catch (_) { }

    if (this._panel?.getAttribute('data-active') === 'true') {
      this._raf = requestAnimationFrame(this._step);
    }
  }

  /**
   * 增量更新：根据新的 stats 列表（[{name,count,...}]）
   * 1) 已存在 -> 更新 count/半径/显示文本
   * 2) 不存在 -> 新增小球（随机放置）
   * 3) 多余 -> 移除 DOM 与事件
   * 黑名单中的来源保持 inTrash 状态；新增来源若在黑名单初始集合中（仅首次初始化才读取），这里不再重新判定。
   */
  updateStats(stats) {
    try {
      if (!this._boxEl) return;
      if (!Array.isArray(stats)) stats = [];
      const map = new Map();
      for (const s of stats) {
        const key = String(s.name || '').trim();
        if (!key) continue;
        map.set(key.toLowerCase(), { raw: s, key });
      }
      // 1. 更新与标记保留
      const existingByKey = new Map();
      for (const b of this._balls) {
        existingByKey.set(String(b.name || '').trim().toLowerCase(), b);
      }
      const rect = this._boxEl.getBoundingClientRect();
      const W = Math.max(50, rect.width);
      const H = Math.max(50, rect.height);
      const max = stats.length ? Math.max(...stats.map(s => s.count)) : 0;
      const minR = 14, maxR = 44;
      // 更新现有
    for (const [k, info] of map.entries()) {
        const b = existingByKey.get(k);
        if (b) {
          const oldCount = b.count;
          b.count = info.raw.count;
      b.type = info.raw.type;
          // 同步 shift（毫秒）
          try { b.shift = Number(info?.raw?.shift ?? info?.raw?.Shift ?? b.shift ?? 0) || 0; } catch (_) { }
          // 更新 shift 标签
          try { this._setBallShiftLabel(b); } catch (_) { }
          // 半径调整
            const r = minR + (max > 0 ? (maxR - minR) * (b.count / max) : 0);
            const changed = Math.abs(r - b.r) > 0.5;
            b.r = r;
            b.mass = r * r;
            if (changed && !b.inTrash) {
              // 尽量保持中心位置不突变：目前仅修改尺寸
              b.el.style.width = `${Math.round(r * 2)}px`;
              b.el.style.height = `${Math.round(r * 2)}px`;
              try { if (b.el._bgWatermark) b.el._bgWatermark.style.fontSize = `${Math.max(12, Math.round(r * 1.1))}px`; } catch (_) { }
            }
            // 更新文本（数量）
            try {
              const parts = (b.el.title || '').split('(');
              const namePart = info.raw.name || b.name;
              b.el.title = `${namePart} (${b.count})`;
              const fg = b.el.querySelector?.('.jf-ball-count');
              if (fg) fg.textContent = String(b.count);
            } catch (_) { }
        }
      }
      // 2. 新增
      const needAdd = [];
      for (const s of stats) {
        const key = String(s.name || '').trim().toLowerCase();
        if (!existingByKey.has(key)) needAdd.push(s);
      }
      if (needAdd.length) {
        const startIndex = this._balls.length;
        const maxLocal = stats.length ? Math.max(...stats.map(s => s.count)) : 0;
        for (let i = 0; i < needAdd.length; i++) {
          const s = needAdd[i];
          const r = minR + (maxLocal > 0 ? (maxR - minR) * (s.count / maxLocal) : 0);
          const el = this._makeBallEl(`${s.name}\n${s.count}`, this._colorForIndex(startIndex + i));
          el.style.width = `${Math.round(r * 2)}px`;
          el.style.height = `${Math.round(r * 2)}px`;
          const bgFS = Math.max(12, Math.round(r * 1.1));
          if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
          this._boxEl.appendChild(el);
          let x = r + Math.random() * (W - 2 * r);
          let y = r + Math.random() * (H - 2 * r);
          const ball = { el, name: s.name, type: s.type, count: s.count, x, y, vx: 0, vy: 0, r, mass: r * r, dragging: false, _px: 0, _py: 0, _pt: 0, shift: Number(s?.shift ?? s?.Shift ?? 0) || 0 };
          this._attachDrag(ball);
          try { this._setBallShiftLabel(ball); } catch (_) { }
          this._balls.push(ball);
        }
      }
      // 3. 删除不存在
      const newSet = new Set(stats.map(s => String(s.name || '').trim().toLowerCase()));
      const remain = [];
      for (const b of this._balls) {
        const key = String(b.name || '').trim().toLowerCase();
        if (newSet.has(key) || b.inTrash) { // inTrash 的保留（如果来源被移除但用户手动拉黑，保留展示）
          remain.push(b);
        } else {
          // 移除 DOM 与事件
          try {
            if (b.el?.parentElement) b.el.parentElement.removeChild(b.el);
          } catch (_) { }
          // 事件移除略（destroy 时统一做，这里只删除 DOM 足够轻量）
        }
      }
      this._balls = remain;
      // 若当前没有动画循环且面板激活，则启动
      if (!this._raf && this._panel?.getAttribute('data-active') === 'true') {
        this._lastT = 0;
        this._raf = requestAnimationFrame(this._step);
      }
    } catch (e) {
      this.logger?.warn?.('[CommentBallManager] updateStats 失败', e);
    }
  }

  destroy() {
    try { if (this._raf) cancelAnimationFrame(this._raf); } catch (_) { }
    this._raf = null;
    this._lastT = 0;
    try { this._activeMo?.disconnect(); } catch (_) { }
    this._activeMo = null;
    try { this._resizeOb?.disconnect(); } catch (_) { }
    this._resizeOb = null;
    for (const b of this._balls) {
      if (b?._onDown) { try { b.el.removeEventListener('pointerdown', b._onDown); } catch (_) { } }
      if (b?._onMove) { try { window.removeEventListener('pointermove', b._onMove); } catch (_) { } }
      if (b?._onUp) { try { window.removeEventListener('pointerup', b._onUp); } catch (_) { } }
      if (b?._onCancel) { try { window.removeEventListener('pointercancel', b._onCancel); } catch (_) { } }
      if (b?._onEnter) { try { b.el.removeEventListener('pointerenter', b._onEnter); } catch (_) { } }
      if (b?._onLeave) { try { b.el.removeEventListener('pointerleave', b._onLeave); } catch (_) { } }
      if (b?._onCtx) { try { b.el.removeEventListener('contextmenu', b._onCtx); } catch (_) { } }
      if (b?._ghostEl) { try { this._removeGhostEl(b); } catch (_) { } }
      b._onMove = null; b._onUp = null; b._onCancel = null;
    }
    try { this._closeMenu(); } catch (_) { }
    this._trashZoneEl = null;
    this._boxEl = null;
    this._panel = null;
  }
}
