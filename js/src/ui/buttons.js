// 该文件现仅负责：
// 1. 生成按钮组 DOM 结构与事件逻辑
// 2. 注入必要样式（SVG mask 等）
// 不再负责：插入到控制条 / 轮询 / Mutation 监控（统一由 danmakuExt.js 的存在性监控完成）

import { DanmakuSettingsPanel } from './settingsPanel.js';

export class DanmakuButtonsGroup {
    constructor({ logger } = {}) {
        this.logger = logger || null;
        this.el = null;
        this.toggleButton = null;
        this.settingsButton = null;
        this.settingsPanel = new DanmakuSettingsPanel({ logger: this.logger });
        this._globalKeyInterceptor = null; // 聚焦输入时的全局快捷键拦截器
        this._enabled = false; // 当前开关状态（将尝试从本地存储恢复）
        this._storageKeyEnabled = 'jf_danmaku_enabled'; // 本地存储 key
        this._toggleRetryTimer = null; // 全局渲染器未就绪时的延迟重试
        this._onToggle = this._onToggle.bind(this);
        this._onOpenSettings = this._onOpenSettings.bind(this);
        this._onSettingsHoverOpen = this._onSettingsHoverOpen.bind(this);
        this._onDocumentClick = this._onDocumentClick.bind(this);
        this._onSettingsButtonMouseLeave = this._onSettingsButtonMouseLeave.bind(this);
        this._onPanelMouseEnter = this._onPanelMouseEnter.bind(this);
        this._onPanelMouseLeave = this._onPanelMouseLeave.bind(this);
        this._settingsHoverTimer = null;
        this._settingsAutoCloseTimer = null; // 面板自动关闭计时器
        this._restored = false; // 是否已尝试恢复
        this._freezeClickUntil = 0; // 悬停打开后的一段时间内禁止点击立即关闭
    // 设置面板内输入/焦点状态
    this._panelHasFocus = false; // 面板内是否存在聚焦元素
    this._imeComposing = false; // 是否处于输入法合成中
    }

    // 对外：获取（惰性创建）元素
    getElement() {
        if (this.el) return this.el;
        this._injectStylesIfNeeded();
        const group = document.createElement('div');
        group.setAttribute('data-danmaku-buttons', 'true');
        group.className = 'flex align-items-center flex-direction-row danmakuButtonsGroup';
        group.setAttribute('dir', 'ltr');
        group.setAttribute('data-enabled', 'false');

        // 文本输入框（位于最左侧）
        const inputEl = this._createTextInput();
        const toggleBtn = this._createToggleButton();
        const settingsBtn = this._createSettingsButton();
        toggleBtn.setAttribute('aria-label', '切换弹幕');
        settingsBtn.setAttribute('aria-label', '弹幕设置');
        try { toggleBtn.addEventListener('click', this._onToggle, { passive: true }); } catch (_) { }
        try { settingsBtn.addEventListener('click', this._onOpenSettings, { passive: true }); } catch (_) { }
        // 悬停 500ms 打开
        try { settingsBtn.addEventListener('mouseenter', this._onSettingsHoverOpen, { passive: true }); } catch (_) { }
        try { settingsBtn.addEventListener('mouseleave', this._onSettingsButtonMouseLeave, { passive: true }); } catch (_) { }
        group.appendChild(inputEl);
        group.appendChild(toggleBtn);
        group.appendChild(settingsBtn);

        this.el = group;
        this.inputEl = inputEl;
        this.toggleButton = toggleBtn;
        this.settingsButton = settingsBtn;

        // 初次创建后尝试恢复开关状态
        this._restoreEnabledState();
        // 应用 UI 标记（不触发日志）
        try {
            group.setAttribute('data-enabled', String(this._enabled));
            this.toggleButton?.setAttribute('aria-pressed', this._enabled ? 'true' : 'false');
        } catch (_) { }
        // 若是开启状态，尝试联动显示（可能 renderer 还没好，使用与 _onToggle 相似的重试逻辑）
        if (this._enabled) {
            this._applyVisibilityWithRetry();
        }
        return group;
    }

    _onToggle() {
        this._enabled = !this._enabled;
        this.logger?.info?.(`弹幕开关: ${this._enabled ? '开启' : '关闭'}`);
        try {
            this.el?.setAttribute('data-enabled', String(this._enabled));
            this.toggleButton?.setAttribute('aria-pressed', this._enabled ? 'true' : 'false');
        } catch (_) { /* no-op */ }

        // 持久化当前状态
        this._persistEnabledState();

        // 与全局弹幕渲染器联动 show/hide
        this._applyVisibilityWithRetry();
    }

    _applyVisibilityWithRetry() {
        const applyVisibility = () => {
            try {
                const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                const renderer = g?.danmakuRenderer;
                if (!renderer) return false;
                if (this._enabled) {
                    try { renderer.show?.(); } catch (e) { this.logger?.warn?.('调用 renderer.show 失败', e); }
                } else {
                    try { renderer.hide?.(); } catch (e) { this.logger?.warn?.('调用 renderer.hide 失败', e); }
                }
                return true;
            } catch (err) {
                this.logger?.warn?.('切换弹幕显示状态失败', err);
                return true; // 避免重复重试
            }
        };
        const ok = applyVisibility();
        if (!ok && this._enabled) {
            if (this._toggleRetryTimer) { try { clearTimeout(this._toggleRetryTimer); } catch (_) { } }
            this._toggleRetryTimer = setTimeout(() => {
                this._toggleRetryTimer = null;
                applyVisibility();
            }, 1200);
        }
    }

    _persistEnabledState() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            window.localStorage.setItem(this._storageKeyEnabled, this._enabled ? '1' : '0');
        } catch (_) { /* ignore */ }
    }

    _restoreEnabledState() {
        if (this._restored) return; // 只尝试一次
        this._restored = true;
        try {
            if (typeof window === 'undefined' || !window.localStorage) return;
            const v = window.localStorage.getItem(this._storageKeyEnabled);
            if (v === '1') this._enabled = true;
            if (v === '0') this._enabled = false;
        } catch (_) { /* ignore */ }
    }

    _onOpenSettings() {
        // 悬停刚打开后 1 秒内点击忽略（防止意外闪烁关闭）
        if (this._freezeClickUntil && Date.now() < this._freezeClickUntil) {
            this.logger?.info?.('设置面板点击切换已被冻结 (hover 冷却中)');
            return;
        }
        // 点击：切换设置面板
        this.logger?.info?.('打开/关闭弹幕设置面板 (点击)');
        try { this.settingsPanel.toggle(this.settingsButton); } catch (_) { }
        this._ensureOutsideClickBinding();
        this._afterMaybeOpened();
    }

    _onSettingsHoverOpen() {
        if (this._settingsHoverTimer) { try { clearTimeout(this._settingsHoverTimer); } catch (_) { } }
        this._settingsHoverTimer = setTimeout(() => {
            this._settingsHoverTimer = null;
            // 仅当未打开时才通过 hover 打开
            const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
            if (!open) {
                this.logger?.info?.('打开弹幕设置面板 (悬停)');
                try { this.settingsPanel.show(this.settingsButton); } catch (_) { }
                this._ensureOutsideClickBinding();
                this._afterMaybeOpened();
                // 设置 1 秒冷却期
                this._freezeClickUntil = Date.now() + 1000;
            }
        }, 100);
    }

    _afterMaybeOpened() {
        // 如果已打开，绑定面板 hover 事件；如果关闭，清理自动关闭计时器
        const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
        if (open) {
            this._bindPanelHoverHandlers();
            this._bindPanelFocusHandlers();
            this._clearSettingsAutoClose();
        } else {
            this._clearSettingsAutoClose();
        }
    }

    _bindPanelHoverHandlers() {
        if (!this.settingsPanel?.el) return;
        if (this._panelHoverBound) return;
        try { this.settingsPanel.el.addEventListener('mouseenter', this._onPanelMouseEnter, { passive: true }); } catch (_) { }
        try { this.settingsPanel.el.addEventListener('mouseleave', this._onPanelMouseLeave, { passive: true }); } catch (_) { }
        this._panelHoverBound = true;
    }

    _onSettingsButtonMouseLeave() {
        // 清除悬停打开计时
        if (this._settingsHoverTimer) { try { clearTimeout(this._settingsHoverTimer); } catch (_) { } this._settingsHoverTimer = null; }
        // 若面板已打开，开始 5 秒自动关闭计时（如未进入面板区域将关闭）
        this._scheduleSettingsAutoClose();
    }

    _onPanelMouseEnter() {
        this._clearSettingsAutoClose();
    }

    _onPanelMouseLeave() {
        this._scheduleSettingsAutoClose();
    }

    _scheduleSettingsAutoClose() {
        const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
        if (!open) return;
        // 固定状态下不自动关闭
        if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return;
        // 面板内存在焦点或处于输入法合成中时，不自动关闭
        try {
            const hasFocusInPanel = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
            if (hasFocusInPanel) { return; }
        } catch (_) { /* ignore */ }
        if (this._imeComposing) return;
        this._clearSettingsAutoClose();
        this._settingsAutoCloseTimer = setTimeout(() => {
            // 再次确认是否仍未悬停
            const stillOpen = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
            if (!stillOpen) return;
            if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return; // pinned 期间不关闭
            // 输入法合成或面板内焦点期间不关闭
            try {
                const hasFocusInPanel2 = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
                if (hasFocusInPanel2) { this._scheduleSettingsAutoClose(); return; }
            } catch (_) { }
            if (this._imeComposing) { this._scheduleSettingsAutoClose(); return; }
            // 如果鼠标当前在按钮或面板上则取消
            try {
                const btnHover = this._isElementHovered(this.settingsButton);
                const panelHover = this._isElementHovered(this.settingsPanel.el);
                if (btnHover || panelHover) { this._scheduleSettingsAutoClose(); return; }
            } catch (_) { }
            try { this.settingsPanel.hide(); } catch (_) { }
        }, 100);
    }

    _clearSettingsAutoClose() {
        if (this._settingsAutoCloseTimer) { try { clearTimeout(this._settingsAutoCloseTimer); } catch (_) { } this._settingsAutoCloseTimer = null; }
    }

    _isElementHovered(el) {
        if (!el) return false;
        try {
            return el.parentElement && Array.from((el.ownerDocument || document).querySelectorAll(':hover')).includes(el);
        } catch (_) { return false; }
    }

    _ensureOutsideClickBinding() {
        try {
            if (!this._outsideClickBound) {
                document.addEventListener('mousedown', this._onDocumentClick, true);
                this._outsideClickBound = true;
            }
        } catch (_) { }
    }

    _onDocumentClick(e) {
        try {
            if (!this.settingsPanel?.el) return;
            const open = this.settingsPanel.el.getAttribute('data-open') === 'true';
            if (!open) return;
            // 固定状态下，点击外部不关闭
            if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return;
            // 输入法候选面板期间或面板内存在焦点时，不因外部点击立即关闭（避免误触）
            try {
                const hasFocusInPanel = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
                if (this._imeComposing || hasFocusInPanel) {
                    // 若点击目标确实是完全外部区域，则仅在合成结束后再评估
                    // 这里放行点击，但不主动关闭
                    return;
                }
            } catch (_) { }
            if (this.settingsPanel.el.contains(e.target) || this.settingsButton.contains(e.target)) return;
            this.settingsPanel.hide();
            this._clearSettingsAutoClose();
        } catch (_) { }
    }

    _bindPanelFocusHandlers() {
        if (!this.settingsPanel?.el) return;
        if (this._panelFocusBound) return;
        const panelEl = this.settingsPanel.el;
        // 定义回调（惰性创建）
        if (!this._onPanelFocusIn) {
            this._onPanelFocusIn = () => {
                this._panelHasFocus = true;
                this._clearSettingsAutoClose();
            };
        }
        if (!this._onPanelFocusOut) {
            this._onPanelFocusOut = () => {
                // 延迟检查当前 activeElement 是否仍位于面板
                setTimeout(() => {
                    try {
                        const ae = (this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement;
                        this._panelHasFocus = !!this.settingsPanel?.el?.contains?.(ae);
                        if (!this._panelHasFocus) {
                            this._scheduleSettingsAutoClose();
                        }
                    } catch (_) { /* ignore */ }
                }, 50);
            };
        }
        if (!this._onCompositionStart) {
            this._onCompositionStart = () => {
                this._imeComposing = true;
                this._clearSettingsAutoClose();
            };
        }
        if (!this._onCompositionEnd) {
            this._onCompositionEnd = () => {
                this._imeComposing = false;
                // 合成结束后，若鼠标不在面板/按钮且无焦点，再次评估是否需要关闭
                this._scheduleSettingsAutoClose();
            };
        }
        // 使用捕获阶段监听，保证能接收到内部控件事件
        try {
            panelEl.addEventListener('focusin', this._onPanelFocusIn, true);
            panelEl.addEventListener('focusout', this._onPanelFocusOut, true);
            panelEl.addEventListener('compositionstart', this._onCompositionStart, true);
            panelEl.addEventListener('compositionend', this._onCompositionEnd, true);
        } catch (_) { /* ignore */ }
        this._panelFocusBound = true;
    }

    _injectStylesIfNeeded() {
        if (typeof document === 'undefined') return;
        const id = 'danmakuButtonsStyles';
        if (document.getElementById(id)) return;
        // 局部：生成 data-uri
        const svgDataUri = (svg) => {
            try {
                const encoded = encodeURIComponent(svg)
                    .replace(/'/g, '%27')
                    .replace(/\(/g, '%28')
                    .replace(/\)/g, '%29');
                return `data:image/svg+xml;charset=UTF-8,${encoded}`;
            } catch (_) { return ''; }
        };
        const SVG_TOGGLE_OFF = `<svg id="Layer_1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-name="Layer 1"><path d="m2.422 7.365 13.5 13.5c-.357.042-.717.08-1.075.108-.767.849-2.159 1.977-2.767 2.023-.76.042-2.069-1.124-2.927-2.023-2.545-.201-5.219-.806-5.338-.833-.333-.076-.604-.316-.719-.638-.011-.03-1.096-3.112-1.096-7.457 0-1.809.196-3.421.422-4.68zm20.139 13.074-1.486-1.486c.308-1.072.925-3.629.925-6.908 0-4.174-1.043-7.309-1.088-7.44-.109-.322-.375-.567-.705-.65-.156-.039-3.871-.955-8.208-.955-2.505 0-4.781.303-6.309.57l-2.129-2.131c-.586-.586-1.535-.586-2.121 0-.586.585-.586 1.536 0 2.121l18.999 19.001c.586.586 1.535.586 2.121 0 .586-.585.586-1.536 0-2.121z"/></svg>`;
        const SVG_TOGGLE_ON = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" id="Layer_1" data-name="Layer 1" viewBox="0 0 24 24">\n  <path d="M21.795,2.883c-.11-.32-.375-.562-.703-.644-.172-.043-4.259-1.047-9.092-1.047C7.254,1.192,3.088,2.196,2.913,2.238c-.332,.082-.6,.327-.71,.651-.049,.145-1.203,3.605-1.203,8.151s1.154,8.006,1.203,8.151c.11,.326,.38,.572,.715,.652,.109,.026,2.649,.628,5.954,.907,1.32,1.184,2.582,1.897,2.639,1.929,.151,.085,.32,.128,.489,.128,.162,0,.324-.04,.473-.119,.054-.029,1.274-.689,2.652-1.933,3.372-.277,5.858-.888,5.966-.915,.33-.082,.596-.326,.705-.647,.049-.144,1.204-3.579,1.204-8.153,0-4.614-1.156-8.015-1.205-8.157ZM7.437,5.846h3.096c.553,0,1,.448,1,1s-.447,1-1,1h-3.096c-.553,0-1-.448-1-1s.447-1,1-1Zm9.127,10.042H7.437c-.553,0-1-.448-1-1s.447-1,1-1h9.127c.553,0,1,.448,1,1s-.447,1-1,1Zm1-4.021H6.437c-.553,0-1-.448-1-1s.447-1,1-1h11.127c.553,0,1,.448,1,1s-.447,1-1,1Z"/>\n</svg>`;
        const SVG_SETTINGS = `<svg id=\"Layer_1\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" data-name=\"Layer 1\"><path d=\"m21.977 2.786c-.083-.381-.381-.679-.762-.762-.19-.042-4.713-1.023-9.214-1.023s-9.025.98-9.215 1.022c-.381.083-.679.381-.762.762-.042.19-1.023 4.713-1.023 9.214s.981 9.024 1.023 9.214c.083.381.381.679.762.762.19.042 4.713 1.023 9.214 1.023s9.024-.981 9.214-1.023c.381-.083.679-.381.762-.762.042-.19 1.023-4.713 1.023-9.214s-.981-9.024-1.023-9.214zm-4.119 14.677c-.533-.077-1.165-.159-1.857-.232v.77c0 .552-.448 1-1 1s-1-.448-1-1v-.935c-.654-.039-1.327-.065-2-.065-1.724 0-3.749.161-5.857.465-.535.081-1.056-.297-1.133-.847-.079-.547.3-1.054.847-1.133 2.233-.322 4.299-.486 6.143-.486.674 0 1.345.024 2 .061v-1.061c0-.552.448-1 1-1s1 .448 1 1v1.22c.803.082 1.536.175 2.143.263.547.079.926.586.847 1.132-.079.547-.587.923-1.132.847zm0-8c-1.464-.211-3.669-.462-5.857-.462-.627 0-1.304.029-2 .07v.93c0 .552-.448 1-1 1s-1-.448-1-1v-.764c-.609.065-1.227.139-1.857.229-.535.081-1.056-.297-1.133-.847-.079-.547.3-1.054.847-1.133.736-.106 1.446-.189 2.143-.26v-1.226c0-.552.448-1 1-1s1 .448 1 1v1.066c.689-.039 1.362-.066 2-.066 2.307 0 4.614.263 6.143.483.547.079.926.586.847 1.132-.079.547-.587.923-1.132.847z\"/></svg>`;
        const ICON_TOGGLE_OFF = svgDataUri(SVG_TOGGLE_OFF);
        const ICON_TOGGLE_ON = svgDataUri(SVG_TOGGLE_ON);
        const ICON_SETTINGS = svgDataUri(SVG_SETTINGS);
        const css = `
        /* 尽量贴近 Jellyfin：最小化覆盖，仅定义图标 span 的显示与 mask */
        [data-danmaku-buttons] .danmaku-input-wrapper { display:flex; align-items:center; }
        [data-danmaku-buttons] .danmaku-text-input {
            width: 80px; max-width:200px; height:24px; box-sizing:border-box;
            background: rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.25); color:#fff;
            border-radius:4px; padding:0 6px; font-size:12px; line-height:22px; outline:none;
            transition: width .25s ease, border-color .2s ease;
        }
        [data-danmaku-buttons] .danmaku-text-input:focus { border-color:#3fa9ff; }
        [data-danmaku-buttons][data-enabled="false"] .danmaku-text-input { opacity:.7; }
        [data-danmaku-buttons] .danmaku-input-wrapper.active .danmaku-text-input { width:160px; }
        [data-danmaku-buttons] .danmaku-send-btn { display:none; margin-left:4px; background:rgba(63,169,255,0.15); border:1px solid rgba(63,169,255,0.6); color:#fff; border-radius:4px; padding:0 6px; height:24px; font-size:12px; cursor:pointer; }
        [data-danmaku-buttons] .danmaku-send-btn:hover { background:rgba(63,169,255,0.25); }
        [data-danmaku-buttons] .danmaku-input-wrapper.active .danmaku-send-btn { display:inline-flex; align-items:center; }
        [data-danmaku-buttons] .danmaku-btn {
            background: none;
            border: 0;
            color: inherit;
            cursor: pointer;
        }
        [data-danmaku-buttons] .danmaku-icon {
            display: inline-block;
            width: 24px; height: 24px;
            background-color: currentColor;
            -webkit-mask-position: center; mask-position: center;
            -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
            -webkit-mask-size: 24px 24px; mask-size: 24px 24px;
        }
        [data-danmaku-buttons] .danmaku-settings-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_SETTINGS});
            mask-image: url(${ICON_SETTINGS});
        }
        [data-danmaku-buttons] .danmaku-toggle-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_TOGGLE_OFF});
            mask-image: url(${ICON_TOGGLE_OFF});
        }
        [data-danmaku-buttons][data-enabled="true"] .danmaku-toggle-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_TOGGLE_ON});
            mask-image: url(${ICON_TOGGLE_ON});
        }
        `;
        const style = document.createElement('style');
        style.id = id;
        style.appendChild(document.createTextNode(css));
        try { (document.head || document.documentElement).appendChild(style); } catch (_) { }
    }

    _createToggleButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '';
        // 适配控制条原生按钮的结构标记，避免被样式隐藏
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'paper-icon-button-light autoSize danmaku-btn danmaku-toggle-btn btnDanmakuToggle';
        btn.setAttribute('data-danmaku-btn', 'toggle');
        btn.setAttribute('title', '弹幕开关');
        btn.setAttribute('aria-pressed', 'false');
        // 内层 span，贴近 Jellyfin DOM 结构
        const icon = document.createElement('span');
        icon.className = 'xlargePaperIconButton material-icons danmaku-icon';
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        return btn;
    }

    _createTextInput() {
        const wrap = document.createElement('div');
        wrap.className = 'danmaku-input-wrapper';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '发送弹幕';
        input.className = 'danmaku-text-input';
        input.setAttribute('data-danmaku-input', 'text');
        input.id = 'danmakuInputField';
        input.name = 'danmakuInput';
        input.setAttribute('aria-label', '弹幕输入');
        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.textContent = '发送';
        sendBtn.className = 'danmaku-send-btn';
        sendBtn.setAttribute('aria-label', '发送弹幕');
        // Enter 时简单记录日志（未来可接入真实发送逻辑）
        try {
            const sendCurrent = (keepFocus = true) => {
                const txt = input.value.trim();
                if (!txt) return;
                // 获取全局 danmakuRenderer
                let emitted = false;
                try {
                    const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                    const renderer = g?.danmakuRenderer;
                    if (renderer) {
                        // 选择时间：优先使用绑定媒体的 currentTime；否则使用 0
                        const t = (renderer.media && !isNaN(renderer.media.currentTime)) ? renderer.media.currentTime : 0;
                        renderer.emit({
                            text: txt,
                            time: t,
                            mode: 'rtl',
                            style: {
                                font: '25px sans-serif',
                                fillStyle: '#FFFFFF',
                                strokeStyle: '#000',
                                lineWidth: 2,
                                textBaseline: 'bottom'
                            }
                        });
                        // 确保显示/播放
                        try { renderer.show && renderer.show(); } catch (_) { }
                        emitted = true;
                    }
                } catch (err) {
                    this.logger?.warn?.('发送弹幕失败(emit异常)', err);
                }
                if (emitted) {
                    this.logger?.info?.('发送弹幕: ' + txt);
                } else {
                    this.logger?.info?.('发送弹幕失败: 找不到全局 danmakuRenderer');
                }
                input.value = '';
                // 发送后保持展开
                wrap.classList.add('active');
                if (keepFocus) {
                    try { input.focus(); } catch (_) { }
                }
            };
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendCurrent(true); // Enter 保持焦点
                }
            });
            input.addEventListener('focus', () => {
                wrap.classList.add('active');
                // 安装全局快捷键拦截
                if (!this._globalKeyInterceptor) {
                    this._globalKeyInterceptor = (ev) => {
                        // 只在当前输入框保持焦点时拦截
                        if (document.activeElement === input) {
                            // 允许的按键（不拦截）：组合键(含Ctrl/Alt/Meta)、Tab、Escape 让其正常冒泡
                            if (ev.key === 'Escape') { return; }
                            if (ev.ctrlKey || ev.metaKey || ev.altKey) { return; }
                            // 放行 Enter 以便输入框自身监听处理发送
                            if (ev.key === 'Enter') { return; }
                            // 其它按键阻断到播放器的全局监听
                            ev.stopPropagation();
                            ev.stopImmediatePropagation?.();
                            // Space 防止页面滚动
                            if (ev.key === ' ' || ev.code === 'Space') {
                                ev.preventDefault();
                            }
                        }
                    };
                }
                try { document.addEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
            });
            input.addEventListener('blur', (e) => {
                // 若为空则收起（延迟允许点击按钮）
                setTimeout(() => {
                    if (!input.value.trim()) wrap.classList.remove('active');
                    // 失焦解除拦截
                    try { document.removeEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
                }, 120);
            });
            sendBtn.addEventListener('click', () => {
                if (!input.value.trim()) { wrap.classList.remove('active'); return; }
                sendCurrent(false); // 点击发送后不保留焦点
                try { input.blur(); } catch (_) { }
            });
        } catch (_) { }
        wrap.appendChild(input);
        wrap.appendChild(sendBtn);
        return wrap;
    }

    _createSettingsButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '';
        // 适配控制条原生按钮的结构标记，避免被样式隐藏
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'paper-icon-button-light autoSize danmaku-btn danmaku-settings-btn btnDanmakuSettings';
        btn.setAttribute('data-danmaku-btn', 'settings');
        btn.setAttribute('title', '弹幕设置');
        const icon = document.createElement('span');
        icon.className = 'xlargePaperIconButton material-icons danmaku-icon';
        icon.setAttribute('aria-hidden', 'true');
        btn.appendChild(icon);
        return btn;
    }
    // 销毁（供外部在 destroy 时调用）
    destroy() {
        if (this._toggleRetryTimer) { try { clearTimeout(this._toggleRetryTimer); } catch (_) { } this._toggleRetryTimer = null; }
        try { this.toggleButton?.removeEventListener('click', this._onToggle); } catch (_) { }
        try { this.settingsButton?.removeEventListener('click', this._onOpenSettings); } catch (_) { }
        try { this.settingsButton?.removeEventListener('mouseenter', this._onSettingsHoverOpen); } catch (_) { }
        try { this.settingsButton?.removeEventListener('mouseleave', this._onSettingsButtonMouseLeave); } catch (_) { }
        try { this.inputEl?.querySelector?.('input')?.removeEventListener?.('keydown'); } catch (_) { }
        try { document.removeEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
        try { document.removeEventListener('mousedown', this._onDocumentClick, true); } catch (_) { }
        // 粗略清理自定义事件（直接置空 wrapper 即可被 GC）
        try { this.el?.parentElement?.removeChild(this.el); } catch (_) { }
        if (this.settingsPanel?.el) {
            try { this.settingsPanel.el.removeEventListener('mouseenter', this._onPanelMouseEnter); } catch (_) { }
            try { this.settingsPanel.el.removeEventListener('mouseleave', this._onPanelMouseLeave); } catch (_) { }
            try { this.settingsPanel.el.removeEventListener('focusin', this._onPanelFocusIn, true); } catch (_) { }
            try { this.settingsPanel.el.removeEventListener('focusout', this._onPanelFocusOut, true); } catch (_) { }
            try { this.settingsPanel.el.removeEventListener('compositionstart', this._onCompositionStart, true); } catch (_) { }
            try { this.settingsPanel.el.removeEventListener('compositionend', this._onCompositionEnd, true); } catch (_) { }
        }
        this._clearSettingsAutoClose();
        try { this.settingsPanel?.destroy?.(); } catch (_) { }
        this.el = null;
        this.inputEl = null;
        this.toggleButton = null;
        this.settingsButton = null;
    }
}
