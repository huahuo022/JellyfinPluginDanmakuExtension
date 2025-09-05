import { BasicSettingsPage } from './pages/BasicSettingsPage.js';
import { CombinedSettingsPage } from './pages/CombinedSettingsPage.js';
import { FilterSettingsPage } from './pages/FilterSettingsPage.js';
import { CommentPoolPage } from './pages/CommentPoolPage.js';
import { HeatmapSettingsPage } from './pages/HeatmapSettingsPage.js';
import { SearchDanmakuPage } from './pages/SearchDanmakuPage.js';
import { updateDanmakuSettings } from '../api/fetch.js';

export class DanmakuSettingsPanel {
    constructor({ logger } = {}) {
        this.logger = logger || null;
        this.el = null;
        this._styleInjected = false;
        this._id = 'danmakuSettingsPanel';
        this._followRaf = null; // requestAnimationFrame id
        this._followAnchor = null;
        this._lastPosKey = '';
        this._wheelListener = null;
        this._keyboardListener = null;
        this._currentTab = null;
        this._pinned = false; // 图钉固定状态
    this._vvListener = null; // visualViewport 监听器
    }

    getElement() {
        if (this.el) return this.el;
        this._injectStyles();
        const wrap = document.createElement('div');
        wrap.id = this._id;
        wrap.className = 'danmaku-settings-panel';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.setAttribute('data-open', 'false');
        // 构建内容骨架（仅样式 / 结构，不含功能逻辑）
        wrap.appendChild(this._buildContent());
        this._installWheelInterceptor(wrap);
        this._installKeyboardInterceptor(wrap);
        this.el = wrap;
        return wrap;
    }

    show(anchorEl) {
        try {
            const el = this.getElement();
            if (!el.parentElement) {
                (document.body || document.documentElement).appendChild(el);
            }
            // 初始化一次小屏 vh 变量，避免移动端 100vh 偏差
            this._updatePanelVhVar();
            this._position(anchorEl);
            el.removeAttribute('data-closing');
            el.setAttribute('data-open', 'true');
            el.setAttribute('aria-hidden', 'false');
            this._beginFollow(anchorEl);
        } catch (err) { this.logger?.warn?.('显示设置面板失败', err); }
    }

    hide() {
        try {
            const el = this.el;
            if (!el) return;
            if (el.getAttribute('data-open') !== 'true') return;
            // 标记关闭过渡
            el.setAttribute('data-closing', 'true');
            el.setAttribute('data-open', 'false');
            this._stopFollow();
            const done = () => {
                try { el.setAttribute('aria-hidden', 'true'); el.removeAttribute('data-closing'); } catch (_) { }
                try { el.removeEventListener('transitionend', done); } catch (_) { }
            };
            try { el.addEventListener('transitionend', done); } catch (_) { }
            setTimeout(done, 300); // 兜底
        } catch (_) { }
    }

    toggle(anchorEl) {
        if (!this.el || this.el.getAttribute('data-open') !== 'true') {
            this.show(anchorEl);
        } else {
            this.hide();
        }
    }

    _position(anchorEl) {
        if (!this.el || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
        try {
            const rect = anchorEl.getBoundingClientRect();
            const h = this.el.offsetHeight || 0;
            this.el.style.position = 'absolute';
            this.el.style.zIndex = 9999;
            this.el.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
            this.el.style.top = `${Math.round(rect.top - h)}px`;
            this._lastPosKey = `${rect.left},${rect.top},${h}`;
            this._ensureInViewport();
        } catch (_) { }
    }

    _beginFollow(anchorEl) {
        this._followAnchor = anchorEl || this._followAnchor;
        if (!this._followAnchor) return;
        if (this._followRaf) return; // 已在跟随
        this._anchorInvisible = false;
        this._reacquireTick = 0;
    // 首次进入也刷新一次 vh 变量
    this._updatePanelVhVar();
        const isAnchorVisible = (el) => {
            if (!el) return false;
            if (!el.isConnected) return false; // 不在文档
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (style) {
                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return false;
            }
            return true;
        };
        const reacquireAnchor = () => {
            try {
                const cand = document.querySelector('.danmaku-settings-btn, .btnDanmakuSettings');
                if (cand) {
                    this._followAnchor = cand;
                    this._position(cand);
                    this._anchorInvisible = !isAnchorVisible(cand);
                }
            } catch (_) { }
        };
        const step = () => {
            this._followRaf = null;
            try {
                if (!this.el || this.el.getAttribute('data-open') !== 'true') { this._stopFollow(); return; }
                if (!this._followAnchor || !this._followAnchor.isConnected) {
                    // 尝试重新获取锚点，不隐藏面板
                    if ((this._reacquireTick++ % 30) === 0) reacquireAnchor();
                } else {
                    // 锚点存在但可能暂时不可见（控制条自动隐藏）
                    const visible = isAnchorVisible(this._followAnchor);
                    if (!visible) {
                        this._anchorInvisible = true; // 冻结位置
                    } else {
                        // 从不可见恢复
                        const rect = this._followAnchor.getBoundingClientRect();
                        const h = this.el.offsetHeight || 0;
                        const key = `${rect.left},${rect.top},${h}`;
                        if (key !== this._lastPosKey) {
                            this.el.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
                            this.el.style.top = `${Math.round(rect.top - h)}px`;
                            this._lastPosKey = key;
                            this._ensureInViewport();
                        }
                        this._anchorInvisible = false;
                    }
                }
            } catch (_) { }
            this._followRaf = requestAnimationFrame(step);
        };
        this._followRaf = requestAnimationFrame(step);
        // 监听窗口 resize 以强制一次定位
        if (!this._resizeListener) {
            this._resizeListener = () => { try { this._updatePanelVhVar(); this._position(this._followAnchor); this._ensureInViewport(); } catch (_) { } };
            try { window.addEventListener('resize', this._resizeListener, { passive: true }); } catch (_) { }
        }
        // 监听 visualViewport（移动端地址栏/软键盘变化更灵敏）
        if (!this._vvListener && window.visualViewport) {
            this._vvListener = () => { try { this._updatePanelVhVar(); this._ensureInViewport(); } catch (_) { } };
            try { window.visualViewport.addEventListener('resize', this._vvListener, { passive: true }); } catch (_) { }
            try { window.visualViewport.addEventListener('scroll', this._vvListener, { passive: true }); } catch (_) { }
        }
    }

    _stopFollow() {
        if (this._followRaf) { try { cancelAnimationFrame(this._followRaf); } catch (_) { } this._followRaf = null; }
        if (this._resizeListener) { try { window.removeEventListener('resize', this._resizeListener); } catch (_) { } this._resizeListener = null; }
        if (this._vvListener && window.visualViewport) {
            try { window.visualViewport.removeEventListener('resize', this._vvListener); } catch (_) { }
            try { window.visualViewport.removeEventListener('scroll', this._vvListener); } catch (_) { }
            this._vvListener = null;
        }
    }

    _injectStyles() {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const id = 'danmakuSettingsPanelStyles';
        if (document.getElementById(id)) { this._styleInjected = true; return; }
        const style = document.createElement('style');
        style.id = id;
        // 带淡入/上滑 & 淡出/下滑 动画的样式实现
        style.textContent = `
        .danmaku-settings-panel { 
            display:block; box-sizing:border-box; position:absolute; 
            background:rgba(0,0,0,.78); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
            color:#fff; font-size:12px; line-height:1.4; padding:10px 14px 12px; 
            border:1px solid rgba(255,255,255,.18); border-radius:10px; 
            /* 自适应宽度：在较窄窗口下自动收缩，保证不超出；使用 clamp 设定范围 */
            width:clamp(320px, 70vw, 400px); max-width:90vw; min-width:0; 
            /* 高度策略：空间充足固定 600px；小屏降级为可视高度的 90% */
            height:min(600px, calc(var(--danmaku-vh, 1vh) * 90));
            max-height:none;
            opacity:0; transform:translate(-50%, 8px) scale(.94); 
            transition:opacity .18s ease, transform .22s cubic-bezier(.215,.61,.355,1); 
            pointer-events:none; will-change:opacity,transform; 
            box-shadow:0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5);
            font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
            overflow:hidden; display:flex; flex-direction:column;
            /* 防止滚动冒泡到页面 */
            overscroll-behavior:contain;
        }
        .danmaku-settings-panel[data-open="true"] { opacity:1; transform:translate(-50%, 0) scale(1); pointer-events:auto; }
        .danmaku-settings-panel[data-closing="true"] { pointer-events:none; }
    .danmaku-settings-pinBtn { position:absolute; top:6px; right:34px; width:22px; height:22px; border:0; background:rgba(255,255,255,.08); color:#ddd; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition:background .18s ease, color .18s ease, box-shadow .18s ease; }
    .danmaku-settings-pinBtn:hover { background:rgba(255,255,255,.18); color:#fff; }
    .danmaku-settings-pinBtn svg { width:14px; height:14px; fill:currentColor; pointer-events:none; }
    .danmaku-settings-panel[data-pinned="true"] .danmaku-settings-pinBtn { background:#3fa9ff; color:#fff; box-shadow:0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6); }
    .danmaku-settings-panel[data-pinned="true"] .danmaku-settings-pinBtn:hover { background:#56b4ff; }
    .danmaku-settings-closeBtn { position:absolute; top:6px; right:6px; width:22px; height:22px; border:0; background:rgba(255,0,0,.14); color:#ff6b6b; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition:background .18s ease, color .18s ease, box-shadow .18s ease; }
    .danmaku-settings-closeBtn:hover { background:rgba(255,0,0,.22); color:#fff; }
    .danmaku-settings-closeBtn svg { width:14px; height:14px; fill:currentColor; pointer-events:none; }
        .danmaku-settings-panel__title { font-size:14px; font-weight:600; margin:0 0 6px; letter-spacing:.5px; }
        .danmaku-settings-tabs { display:flex; gap:6px; margin:0 0 8px; flex-wrap:wrap; }
        .danmaku-settings-tab { border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.06); color:#fff; padding:4px 10px; border-radius:16px; font-size:12px; cursor:pointer; line-height:1; position:relative; }
        .danmaku-settings-tab:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.35); }
        .danmaku-settings-tab[data-active="true"] { background:#3fa9ff; border-color:#3fa9ff; box-shadow:0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6); }
    .danmaku-settings-panel__inner { flex:1 1 auto; display:flex; flex-direction:column; overflow:hidden; }
    .danmaku-settings-scroll { flex:1 1 auto; overflow:auto; padding-right:6px; }
        .danmaku-settings-tabPanels { position:relative; }
        .danmaku-settings-tabPanel { display:none; animation:fadeIn .18s ease; }
        .danmaku-settings-tabPanel[data-active="true"] { display:block; }
    .danmaku-settings-list { display:flex; flex-direction:column; gap:8px; }
        .danmaku-setting-row { display:flex; flex-direction:column; gap:3px; padding:6px 8px 7px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:rgba(255,255,255,.05); position:relative; min-width:0; }
        .danmaku-setting-row[data-type="boolean"] { cursor:pointer; }
        .danmaku-setting-row:hover { border-color:rgba(255,255,255,.22); background:rgba(255,255,255,.09); }
        .danmaku-setting-row__label { font-size:12px; font-weight:500; display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .danmaku-setting-row__desc { font-size:10px; opacity:.55; line-height:1.25; }
        .danmaku-setting-input { width:100%; box-sizing:border-box; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.25); color:#fff; border-radius:4px; padding:3px 6px; font-size:12px; line-height:1.3; outline:none; }
        .danmaku-setting-input:focus { border-color:#3fa9ff; box-shadow:0 0 0 1px rgba(63,169,255,.45); }
        .danmaku-setting-textarea { resize:vertical; min-height:52px; }
        .danmaku-setting-switch { width:30px; height:16px; border-radius:16px; background:rgba(255,255,255,.35); position:relative; flex-shrink:0; }
        .danmaku-setting-switch::after { content:""; position:absolute; left:2px; top:2px; width:12px; height:12px; background:#fff; border-radius:50%; transition:transform .18s ease, background-color .18s ease; }
        .danmaku-setting-row[data-enabled="true"] .danmaku-setting-switch { background:#3fa9ff; }
        .danmaku-setting-row[data-enabled="true"] .danmaku-setting-switch::after { transform:translateX(14px); }
    .danmaku-settings-footer { padding:8px 2px 0; font-size:10px; opacity:.55; text-align:right; }
    .danmaku-settings-actions { display:flex; gap:8px; justify-content:flex-end; padding:10px 0 0; margin-top:8px; background:transparent; border-top:1px solid rgba(255,255,255,.15); }
    .danmaku-settings-actions button { font:500 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; padding:6px 14px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.10); color:#fff; cursor:pointer; letter-spacing:.5px; transition:background-color .15s ease, border-color .15s ease, transform .15s ease; }
    .danmaku-settings-actions button:hover:not([data-busy="true"]) { background:rgba(255,255,255,.18); border-color:rgba(255,255,255,.4); }
    .danmaku-settings-actions button:active:not([data-busy="true"]) { transform:translateY(1px); }
    .danmaku-settings-actions button[data-type="primary"] { background:#3fa9ff; border-color:#3fa9ff; color:#fff; box-shadow:0 2px 8px -2px rgba(63,169,255,.6); }
    .danmaku-settings-actions button[data-type="primary"]:hover:not([data-busy="true"]) { background:#56b4ff; }
    .danmaku-settings-actions button[data-busy="true"] { opacity:.6; cursor:default; }
        /* 滚动条微样式 */
    .danmaku-settings-scroll::-webkit-scrollbar { width:8px; }
    .danmaku-settings-scroll::-webkit-scrollbar-track { background:transparent; }
    .danmaku-settings-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.25); border-radius:4px; }
    .danmaku-settings-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.38); }
        @media (max-width:860px) { .danmaku-settings-grid { grid-template-columns:repeat(3,1fr);} }
        @media (max-width:680px) { .danmaku-settings-grid { grid-template-columns:repeat(2,1fr);} }
        @media (max-width:520px) { .danmaku-settings-grid { grid-template-columns:repeat(1,1fr);} }
        @media (prefers-reduced-motion: reduce) { .danmaku-settings-panel { transition:none!important; } .danmaku-setting-switch::after { transition:none!important; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:translateY(0);} }
    /* 确认框样式 */
    .danmaku-confirm-mask { position:absolute; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); z-index:10000; }
    .danmaku-confirm { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); min-width:280px; max-width:90%; background:rgba(0,0,0,.86); color:#fff; border:1px solid rgba(255,255,255,.18); border-radius:10px; box-shadow:0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5); padding:12px 14px; z-index:10001; }
    .danmaku-confirm__title { font-size:14px; font-weight:600; margin:0 0 6px; letter-spacing:.5px; }
    .danmaku-confirm__msg { font-size:12px; opacity:.9; line-height:1.4; }
    .danmaku-confirm__actions { display:flex; gap:8px; justify-content:flex-end; padding-top:10px; margin-top:10px; border-top:1px solid rgba(255,255,255,.15); }
    .danmaku-confirm__actions button { font:500 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; padding:6px 14px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.10); color:#fff; cursor:pointer; letter-spacing:.5px; transition:background-color .15s ease, border-color .15s ease, transform .15s ease; }
    .danmaku-confirm__actions button:hover { background:rgba(255,255,255,.18); border-color:rgba(255,255,255,.4); }
    .danmaku-confirm__actions button:active { transform:translateY(1px); }
    .danmaku-confirm__actions button[data-type="primary"] { background:#ff6363; border-color:#ff6363; color:#fff; box-shadow:0 2px 8px -2px rgba(255,99,99,.6); }
    .danmaku-confirm__actions button[data-type="primary"]:hover { background:#ff7a7a; }
        `;
        try { (document.head || document.documentElement).appendChild(style); this._styleInjected = true; } catch (_) { }
    }

    _buildContent() {
        const inner = document.createElement('div');
        inner.className = 'danmaku-settings-panel__inner';
        const title = document.createElement('h3');
        title.className = 'danmaku-settings-panel__title';
        title.textContent = '弹幕设置';
        // 图钉按钮
        const pinBtn = document.createElement('button');
        pinBtn.type = 'button';
        pinBtn.className = 'danmaku-settings-pinBtn';
        pinBtn.setAttribute('aria-label', '固定/取消固定 面板');
        pinBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14.53 2.53 12 0 9.47 2.53a5.5 5.5 0 0 0-1.61 3.9v4.17l-3.2 3.2a1 1 0 0 0 .7 1.7H11v6.5a1 1 0 0 0 2 0V15.5h5.64a1 1 0 0 0 .7-1.7l-3.2-3.2V6.43a5.5 5.5 0 0 0-1.61-3.9Z"/></svg>';
        pinBtn.addEventListener('click', () => { try { this.togglePin(); } catch (_) { } });
        inner.appendChild(title);
        inner.appendChild(pinBtn);
        // 关闭按钮（红叉）
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'danmaku-settings-closeBtn';
        closeBtn.setAttribute('aria-label', '关闭设置面板');
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>';
        closeBtn.addEventListener('click', (ev) => {
            try {
                ev.stopPropagation();
                ev.stopImmediatePropagation?.();
                ev.preventDefault?.();
            } catch (_) { }
            try { this.hide(); } catch (_) { }
        });
        inner.appendChild(closeBtn);
        const tabsWrap = document.createElement('div');
        tabsWrap.className = 'danmaku-settings-tabs';
        inner.appendChild(tabsWrap);
        // 可滚动主体容器
        const scrollWrap = document.createElement('div');
        scrollWrap.className = 'danmaku-settings-scroll';
        inner.appendChild(scrollWrap);
        // 新的分页类集合（新增“密度图”分页，移动自基础设置）
        this._pages = [
            new BasicSettingsPage({ logger: this.logger }),
            new CombinedSettingsPage({ logger: this.logger }),
            new FilterSettingsPage({ logger: this.logger }),
            new HeatmapSettingsPage({ logger: this.logger }),
            new SearchDanmakuPage({ logger: this.logger }),
            new CommentPoolPage({ logger: this.logger })
        ];
        const panelsWrap = document.createElement('div');
        panelsWrap.className = 'danmaku-settings-tabPanels';
        scrollWrap.appendChild(panelsWrap);
        const switchTab = (tabKey) => {
            if (this._currentTab === tabKey) return;
            this._currentTab = tabKey;
            tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.setAttribute('data-active', btn.dataset.key === tabKey ? 'true' : 'false'));
            panelsWrap.querySelectorAll('.danmaku-settings-tabPanel').forEach(p => p.setAttribute('data-active', p.dataset.key === tabKey ? 'true' : 'false'));
        };
        // 生成按钮与面板（显示全部分页）
        this._pages.forEach(page => {
            const key = page.getKey();
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'danmaku-settings-tab';
            btn.dataset.key = key;
            btn.textContent = page.getLabel();
            btn.setAttribute('data-active', 'false');
            btn.addEventListener('click', () => switchTab(key));
            tabsWrap.appendChild(btn);
            const panelEl = page.build();
            panelsWrap.appendChild(panelEl);
        });
        // 默认选中第一个分页
        if (this._pages.length) switchTab(this._pages[0].getKey());
        const footer = document.createElement('div');
        footer.className = 'danmaku-settings-footer';
        scrollWrap.appendChild(footer);
        // 操作按钮栏（重置 / 保存）保持在底部，不随内容滚动
        inner.appendChild(this._buildActionBar());
        return inner;
    }

    _renderRow(key, label) { /* 已拆分到各分页类，占位方法保留避免调用错误 */ return document.createElement('div'); }

    _buildActionBar() {
        const bar = document.createElement('div');
        bar.className = 'danmaku-settings-actions';
        // 让左右分布：左侧调试开关，右侧按钮组
        bar.style.justifyContent = 'space-between';
        // 左侧调试模式开关
        const debugWrap = document.createElement('label');
        debugWrap.style.display = 'flex';
        debugWrap.style.alignItems = 'center';
        debugWrap.style.gap = '4px';
        debugWrap.style.fontSize = '11px';
        debugWrap.style.opacity = '.85';
        debugWrap.style.cursor = 'pointer';
        const debugCb = document.createElement('input');
        debugCb.type = 'checkbox';
        debugCb.style.margin = 0;
        // 从 localStorage 读取持久化调试模式（不上传服务器）
        let storedDebug = null;
        try { storedDebug = localStorage.getItem('danmaku_debug_enabled'); } catch (_) { }
        const storedBool = storedDebug === '1';
        // 若本地存储存在则优先使用；否则用当前 logger 状态
        let initialDebug = storedDebug != null ? storedBool : !!this.logger?.getDebug?.();
        debugCb.checked = initialDebug;
        // 同步 logger 状态（若 logger 当前不同）
        try { if (this.logger && this.logger.getDebug && this.logger.getDebug() !== initialDebug) { this.logger.setDebug(initialDebug); } } catch (_) { }
        const debugText = document.createElement('span');
        debugText.textContent = '调试模式';
        debugWrap.appendChild(debugCb);
        debugWrap.appendChild(debugText);
        debugCb.addEventListener('change', () => {
            try {
                this.logger?.setDebug?.(debugCb.checked);
                // 写入 localStorage 记忆
                try { localStorage.setItem('danmaku_debug_enabled', debugCb.checked ? '1' : '0'); } catch (_) { }
            } catch (_) { }
        });
        bar.appendChild(debugWrap);
        // 右侧按钮容器
        const rightGroup = document.createElement('div');
        rightGroup.style.display = 'flex';
        rightGroup.style.alignItems = 'center';
        rightGroup.style.gap = '8px';
        // 重置按钮
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.textContent = '重置';
        resetBtn.addEventListener('click', async () => {
            try {
                const ok = await this._showConfirm({
                    title: '恢复默认设置',
                    message: '确定将所有设置恢复为默认值吗？此操作会覆盖当前自定义设置。',
                    confirmText: '重置',
                    cancelText: '取消'
                });
                if (!ok) return;
                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                const settings = g.danmakuSettings;
                if (!settings || typeof settings.resetToDefaults !== 'function') {
                    this.logger?.warn?.('重置失败：设置对象缺失或不支持重置');
                    return;
                }
                settings.resetToDefaults();
                this.logger?.info?.('已重置为默认设置（本地）');
                try {
                    const mediaId = g.getMediaId?.();
                    if (mediaId) await updateDanmakuSettings(this.logger, mediaId);
                    else await updateDanmakuSettings(this.logger);
                    this.logger?.info?.('默认设置已提交保存');
                } catch (e) { this.logger?.warn?.('默认设置保存失败', e); }
                try { this._refreshPagesUI(); } catch (_) { }
            } catch (e) {
                this.logger?.warn?.('执行重置时出错', e);
            }
        });
        // 保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.textContent = '保存';
        saveBtn.dataset.type = 'primary';
        const setBusy = (busy) => {
            if (busy) {
                saveBtn.setAttribute('data-busy', 'true');
                saveBtn.textContent = '保存中…';
            } else {
                saveBtn.removeAttribute('data-busy');
                saveBtn.textContent = '保存';
            }
        };
        saveBtn.addEventListener('click', async () => {
            if (saveBtn.getAttribute('data-busy') === 'true') return; // 防重复
            try {
                const mediaId = window?.__jfDanmakuGlobal__?.getMediaId?.();
                if (!mediaId) {
                    this.logger?.warn?.('保存失败：缺少 mediaId');
                    return;
                }
                setBusy(true);
                await updateDanmakuSettings(this.logger, mediaId);
                this.logger?.info?.('弹幕设置已保存');
            } catch (e) {
                this.logger?.warn?.('保存弹幕设置出错', e);
            } finally {
                setBusy(false);
            }
        });
        rightGroup.appendChild(resetBtn);
        rightGroup.appendChild(saveBtn);
        // 实时保存开关
        const autoWrap = document.createElement('label');
        autoWrap.style.display = 'flex';
        autoWrap.style.alignItems = 'center';
        autoWrap.style.gap = '4px';
        autoWrap.style.marginLeft = '8px';
        autoWrap.style.fontSize = '11px';
        autoWrap.style.opacity = '.85';
        const autoCb = document.createElement('input');
        autoCb.type = 'checkbox';
        autoCb.style.margin = 0;
        // 初始状态：仅读取本地持久化；未设置时默认开启
        try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            let persisted = null;
            try { persisted = localStorage.getItem('danmaku_auto_save'); } catch (_) { }
            const persistedBool = (persisted === 'true') ? true : (persisted === 'false' ? false : null);
            g.danmakuAutoSave = (persistedBool != null) ? persistedBool : true;
            autoCb.checked = g.danmakuAutoSave;


        } catch (_) { }
        const autoText = document.createElement('span');
        autoText.textContent = '实时';
        autoWrap.appendChild(autoCb);
        autoWrap.appendChild(autoText);


    autoCb.addEventListener('change', () => {
            try {
                try { localStorage.setItem('danmaku_auto_save', autoCb.checked ? 'true' : 'false'); } catch (_) { }
                if (autoCb.checked) {
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    g.danmakuAutoSave = true;
                    localStorage.setItem('danmaku_auto_save', 'true');
                    this.logger?.info?.('实时保存已开启');
                } else {
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    g.danmakuAutoSave = false;
                    localStorage.setItem('danmaku_auto_save', 'false');
                    this.logger?.info?.('实时保存已关闭');
                }
            } catch (_) { }
        });
        rightGroup.appendChild(autoWrap);
        bar.appendChild(rightGroup);
        return bar;
    }

    // 重新构建分页以同步 UI 到当前全局设置值（尽量轻量，不销毁面板容器）
    _refreshPagesUI() {
        try {
            if (!this.el) return;
            const panelsWrap = this.el.querySelector('.danmaku-settings-tabPanels');
            const tabsWrap = this.el.querySelector('.danmaku-settings-tabs');
            if (!panelsWrap || !tabsWrap) return;
            const activeKey = this._currentTab || (this._pages?.[0]?.getKey?.());
            // 先销毁旧分页，释放资源（如 RAF/全局事件）
            if (Array.isArray(this._pages)) {
                try { this._pages.forEach(p => p?.destroy?.()); } catch (_) { }
            }
            // 清空旧内容
            panelsWrap.innerHTML = '';
            tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.remove());
            // 重新实例化分页（保持 logger），并重建 tabs + panels（含“密度图”分页）
            this._pages = [
                new BasicSettingsPage({ logger: this.logger }),
                new CombinedSettingsPage({ logger: this.logger }),
                new FilterSettingsPage({ logger: this.logger }),
                new HeatmapSettingsPage({ logger: this.logger }),
                new SearchDanmakuPage({ logger: this.logger }),
                new CommentPoolPage({ logger: this.logger })
            ];
            const switchTab = (tabKey) => {
                if (this._currentTab === tabKey) return;
                this._currentTab = tabKey;
                tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.setAttribute('data-active', btn.dataset.key === tabKey ? 'true' : 'false'));
                panelsWrap.querySelectorAll('.danmaku-settings-tabPanel').forEach(p => p.setAttribute('data-active', p.dataset.key === tabKey ? 'true' : 'false'));
            };
            this._pages.forEach(page => {
                const key = page.getKey();
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'danmaku-settings-tab';
                btn.dataset.key = key;
                btn.textContent = page.getLabel();
                btn.setAttribute('data-active', 'false');
                btn.addEventListener('click', () => switchTab(key));
                tabsWrap.appendChild(btn);
                const panelEl = page.build();
                panelsWrap.appendChild(panelEl);
            });
            if (this._pages.length) {
                const exists = this._pages.some(p => p.getKey() === activeKey);
                const key = exists ? activeKey : this._pages[0].getKey();
                // 确保初次切换不会因“当前等于目标”而早退，导致未设置 data-active
                this._currentTab = null;
                switchTab(key);
            }
        } catch (_) { }
    }

    destroy() {
        try { this.el?.parentElement?.removeChild(this.el); } catch (_) { }
        this.el = null;
        // 销毁所有分页实例，释放资源
        if (Array.isArray(this._pages)) {
            try { this._pages.forEach(p => p?.destroy?.()); } catch (_) { }
        }
        this._stopFollow();
        if (this._wheelListener) {
            try { window.removeEventListener('wheel', this._wheelListener, true); } catch (_) { }
            this._wheelListener = null;
        }
        if (this._keyboardListener) {
            try { document.removeEventListener('keydown', this._keyboardListener, true); } catch (_) { }
            this._keyboardListener = null;
        }
    }

    _installWheelInterceptor(rootEl) {
        if (this._wheelListener) return;
        this._wheelListener = (e) => {
            try {
                if (!this.el || this.el.getAttribute('data-open') !== 'true') return;
                // 仅当指针位于面板内部时拦截（包含任意子元素）
                if (this.el.contains(e.target)) {
                    // 阻止向外层播放器的冒泡，避免调整音量或其它快捷行为
                    e.stopPropagation();
                    e.stopImmediatePropagation?.();
                    // 不调用 preventDefault，保留面板内部滚动
                }
            } catch (_) { }
        };
        try { window.addEventListener('wheel', this._wheelListener, { capture: true, passive: true }); } catch (_) { }
    }

    _installKeyboardInterceptor(rootEl) {
        if (this._keyboardListener) return;
        this._keyboardListener = (ev) => {
            try {
                if (!this.el || this.el.getAttribute('data-open') !== 'true') return;
                // 仅当事件来自设置面板内部（包含其后代）时处理
                if (!this.el.contains(ev.target)) return;
                // Esc: 关闭面板但不阻断（或阻断后自行处理）。这里阻断播放器，再执行关闭
                if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    ev.stopImmediatePropagation?.();
                    this.hide();
                    return;
                }
                // 允许组合键 (Ctrl/Meta/Alt 任意) 交给浏览器/系统，不拦截
                if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
                // 放行 Enter（可能有提交/确认用途）
                if (ev.key === 'Enter') return;
                // 其它键统一阻断（含空格/方向键/F/C/M等播放器快捷键）
                ev.stopPropagation();
                ev.stopImmediatePropagation?.();
                // Space 防止页面滚动 & 播放切换
                if (ev.key === ' ' || ev.code === 'Space') {
                    ev.preventDefault();
                }
            } catch (_) { }
        };
        try { document.addEventListener('keydown', this._keyboardListener, true); } catch (_) { }
    }
    // 统一确认框
    _showConfirm({ title = '确认', message = '确定执行此操作吗？', confirmText = '确定', cancelText = '取消' } = {}) {
        return new Promise(resolve => {
            try {
                const host = this.el || document.body;
                const mask = document.createElement('div');
                mask.className = 'danmaku-confirm-mask';
                const box = document.createElement('div');
                box.className = 'danmaku-confirm';
                const h = document.createElement('div'); h.className = 'danmaku-confirm__title'; h.textContent = title; box.appendChild(h);
                const p = document.createElement('div'); p.className = 'danmaku-confirm__msg'; p.textContent = message; box.appendChild(p);
                const actions = document.createElement('div'); actions.className = 'danmaku-confirm__actions';
                const btnCancel = document.createElement('button'); btnCancel.type = 'button'; btnCancel.textContent = cancelText; actions.appendChild(btnCancel);
                const btnOk = document.createElement('button'); btnOk.type = 'button'; btnOk.textContent = confirmText; btnOk.dataset.type = 'primary'; actions.appendChild(btnOk);
                box.appendChild(actions);
                // 交互
                const cleanup = (val) => {
                    try { host.removeChild(mask); } catch (_) { }
                    try { host.removeChild(box); } catch (_) { }
                    resolve(!!val);
                };
                btnCancel.addEventListener('click', () => cleanup(false));
                btnOk.addEventListener('click', () => cleanup(true));
                mask.addEventListener('click', () => cleanup(false));
                // Esc 关闭，阻断冒泡到播放器
                const keyHandler = (ev) => {
                    try {
                        if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); cleanup(false); }
                        if (ev.key === 'Enter') { ev.stopPropagation(); ev.preventDefault(); cleanup(true); }
                    } catch (_) { }
                };
                document.addEventListener('keydown', keyHandler, true);
                const unbind = () => { try { document.removeEventListener('keydown', keyHandler, true); } catch (_) { } };
                const _origCleanup = cleanup;
                // 包装以确保移除监听
                const cleanupWrapped = (val) => { unbind(); _origCleanup(val); };
                // 替换引用
                // 重新绑定
                btnCancel.onclick = () => cleanupWrapped(false);
                btnOk.onclick = () => cleanupWrapped(true);
                mask.onclick = () => cleanupWrapped(false);
                // 注入 DOM
                host.appendChild(mask);
                host.appendChild(box);
                // 初始聚焦
                setTimeout(() => { try { btnOk.focus(); } catch (_) { } }, 0);
            } catch (_) { resolve(false); }
        });
    }
    // 确保面板在视口内：调整 left(中心) 和 top，留 8px 边距
    _ensureInViewport() {
        if (!this.el) return;
        try {
            const margin = 8;
            const vw = window.innerWidth || document.documentElement.clientWidth || 0;
            // 优先使用 visualViewport 的高度以应对移动端地址栏/键盘
            const vh = (window.visualViewport?.height) || window.innerHeight || document.documentElement.clientHeight || 0;
            const rect = this.el.getBoundingClientRect();
            if (!rect || rect.width === 0) return;
            let centerX = rect.left + rect.width / 2; // 因 translate(-50%) left 为中心
            let changed = false;
            if (rect.left < margin) { centerX += (margin - rect.left); changed = true; }
            if (rect.right > vw - margin) { centerX -= (rect.right - (vw - margin)); changed = true; }
            if (changed) this.el.style.left = `${Math.round(centerX)}px`;
            let newTop = null;
            if (rect.top < margin) newTop = margin; else if (rect.bottom > vh - margin) newTop = Math.max(margin, vh - margin - rect.height);
            if (newTop !== null) this.el.style.top = `${Math.round(newTop)}px`;
        } catch (_) { }
    }
    // 刷新小屏 vh 变量，解决 iOS/安卓 100vh 偏差；按 1vh 的像素值设置
    _updatePanelVhVar() {
        try {
            const vv = window.visualViewport;
            const h = Math.max(0, (vv?.height) || window.innerHeight || document.documentElement.clientHeight || 0);
            const oneVhPx = h / 100;
            const host = this.el || document.documentElement;
            host.style.setProperty('--danmaku-vh', `${oneVhPx}px`);
        } catch (_) { }
    }
    // 图钉固定状态切换
    togglePin() {
        this._pinned = !this._pinned;
        try { this.el?.setAttribute('data-pinned', this._pinned ? 'true' : 'false'); } catch (_) { }
        this.logger?.info?.(`设置面板已${this._pinned ? '固定 (不再自动关闭)' : '取消固定 (恢复自动关闭)'}`);
        // 取消固定后立即尝试触发一次视口检查防止位置偏移
        if (!this._pinned) { try { this._ensureInViewport(); } catch (_) { } }
    }
    isPinned() { return !!this._pinned; }
}
