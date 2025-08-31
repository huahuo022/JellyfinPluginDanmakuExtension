/**
 * Logger - 轻量日志器
 * 用于在调试模式下输出日志；非调试模式静默。
 */
export default class Logger {
  constructor({ debug = false, prefix = 'Danmaku', maxLines = 100 } = {}) {
    this._debug = !!debug;
    this._prefix = prefix;
    this._maxLines = maxLines;
    this._overlay = null; // DOM 节点
  this._overlayWrap = null; // 外层包裹，用于正确显示/隐藏
    this._buffer = []; // 在 overlay 未就绪前暂存的日志
    this._lastOverlayTsMs = 0; // 上一条覆盖层日志的时间戳
    this._altFlip = false; // 覆盖层行配色交替开关
    if (this._debug) this._ensureOverlay();
  }

  setDebug(v) {
    const next = !!v;
    if (this._debug === next) return;
    this._debug = next;
    if (this._debug) {
      this._ensureOverlay();
      this.info('调试:开启');
    } else {
      this.info('调试:关闭');
      this._hideOverlay();
    }
  }
  getDebug() { return this._debug; }
  setPrefix(p) { this._prefix = String(p || ''); }

  _fmt(args) {
    try {
      return [`[${this._prefix}]`, ...args];
    } catch (_) {
      return args;
    }
  }

  _stringify(arg) {
    const t = typeof arg;
    if (arg == null || t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol') {
      return String(arg);
    }
    if (t === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch (_) {
      try { return String(arg); } catch (_) { return '[Unserializable]'; }
    }
  }

  _appendToOverlay(level, args) {
    if (!this._debug) return;
    this._ensureOverlay();
    if (!this._overlay) return;
    const now = new Date();
    const nowMs = now.getTime();
    const pad2 = (n) => String(n).padStart(2, '0');
    const ts = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    const delta = this._lastOverlayTsMs ? (nowMs - this._lastOverlayTsMs) : 0;
    this._lastOverlayTsMs = nowMs;
    // 覆盖层：不显示前缀，显示时间(无毫秒) + 与上一条的间隔毫秒
    const line = `${ts}(${delta}ms) ${level.toUpperCase()} ${args.map(a => this._stringify(a)).join(' ')}`;

    // 如果 overlay 还未挂载，缓冲
    if (!this._overlay._ready) {
      this._buffer.push(line);
      return;
    }

    const pre = document.createElement('div');
    pre.textContent = line;
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    if (level === 'warn') {
      pre.style.color = '#ffda6b';
    } else if (level === 'error') {
      pre.style.color = '#ff6b6b';
    } else {
      // 普通级别交替颜色，提升可读性
      this._altFlip = !this._altFlip;
      pre.style.color = this._altFlip ? '#dbffb9ff' : '#9ec7f0ff';
    }
    this._overlay.appendChild(pre);

    // 截断到最大行数
    while (this._overlay.childNodes.length > this._maxLines) {
      this._overlay.removeChild(this._overlay.firstChild);
    }
    this._overlay.scrollTop = this._overlay.scrollHeight;
  }

  _ensureOverlay() {
    if (this._overlay) {
      // 仅重新显示外层容器
      try {
        (this._overlayWrap || this._overlay.parentElement)?.style && ((this._overlayWrap || this._overlay.parentElement).style.display = 'block');
      } catch (_) { }
      return;
    }
    const mount = () => {
      if (this._overlay) return;
      const wrap = document.createElement('div');
      wrap.setAttribute('data-danmaku-debug', 'overlay');
      wrap.style.position = 'fixed';
      wrap.style.top = '8px';
      wrap.style.right = '8px';
      wrap.style.width = '320px';
      wrap.style.height = '180px';
      // 允许拖动底部调整高度（浏览器原生）
      wrap.style.resize = 'vertical';
      wrap.style.minHeight = '14px';
      wrap.style.maxHeight = '90vh';
      wrap.style.padding = '6px 8px';
      wrap.style.background = 'rgba(0,0,0,0.7)';
      wrap.style.border = '1px solid rgba(255,255,255,0.2)';
      wrap.style.borderRadius = '6px';
      wrap.style.color = '#9ef09e';
      wrap.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, Monospace';
      wrap.style.fontSize = '12px';
      wrap.style.lineHeight = '1.25';
      wrap.style.zIndex = '2147483647';
      wrap.style.overflow = 'auto';
      wrap.style.pointerEvents = 'auto';
      wrap.style.userSelect = 'text';
      wrap.style.boxShadow = '0 2px 12px rgba(0,0,0,0.4)';

      // 标题栏（拖拽和清理可以后续再做，这里仅标题）
      const title = document.createElement('div');
      title.textContent = 'Danmaku Debug Logs';
      title.style.fontWeight = '600';
      title.style.marginBottom = '4px';
      title.style.color = '#d1ffe2';
      title.style.cursor = 'pointer';
      title.title = '点击收起/展开';
      wrap.appendChild(title);

      // 内容容器
      const content = document.createElement('div');
      content.style.height = 'calc(100% - 20px)';
      content.style.overflow = 'auto';
      wrap.appendChild(content);

      // 折叠/展开逻辑（点击标题切换）
      let __collapsed = false;
      let __prevHeight = '';
      let __prevResize = '';
      let __prevMinHeight = '';
      const setCollapsed = (next) => {
        __collapsed = !!next;
        if (__collapsed) {
          __prevHeight = wrap.style.height;
          __prevResize = wrap.style.resize;
          __prevMinHeight = wrap.style.minHeight;
          content.style.display = 'none';
          try {
            wrap.style.resize = 'none';
            wrap.style.minHeight = '14px';
            wrap.style.height = '14px';
          } catch (_) { }
        } else {
          content.style.display = 'block';
          try {
            wrap.style.resize = __prevResize || 'vertical';
            wrap.style.minHeight = __prevMinHeight || '200px';
            wrap.style.height = __prevHeight || '640px';
          } catch (_) { }
        }
      };
      try { title.addEventListener('click', () => setCollapsed(!__collapsed)); } catch (_) { }

      // 将内容容器作为 overlay 主体
  this._overlay = content;
  this._overlayWrap = wrap;
      this._overlay._ready = true;
      document.body ? document.body.appendChild(wrap) : document.documentElement.appendChild(wrap);

      // 刷新缓冲
      if (this._buffer.length) {
        for (const line of this._buffer) {
          const div = document.createElement('div');
          div.textContent = line;
          this._overlay.appendChild(div);
        }
        this._buffer.length = 0;
        this._overlay.scrollTop = this._overlay.scrollHeight;
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    } else {
      mount();
    }
  }

  _hideOverlay() {
  const container = this._overlayWrap || this._overlay?.parentElement;
  if (container) container.style.display = 'none';
  }

  clear() {
    if (this._overlay) this._overlay.innerHTML = '';
    this._buffer.length = 0;
    this._altFlip = false;
  }

  log(...args) {
  this._appendToOverlay('log', args);
  }
  info(...args) {
  this._appendToOverlay('info', args);
  }
  warn(...args) {
  this._appendToOverlay('warn', args);
  }
  error(...args) {
  this._appendToOverlay('error', args);
  }
}
