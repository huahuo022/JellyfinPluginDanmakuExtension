/*
 * Jellyfin Web Player State Detector
 * - 判定条件：DOM 中是否存在 <video class="htmlvideoplayer">
 * - 策略：低频轮询 + DOM 变动监听（MutationObserver）
 * - 判断是否为视频页并在激活时创建按钮组/热力图/弹幕
 */
import { attachButtonsGroup, generateHeatmap, renderDanmaku, cleanupAll } from './danmakuActions';
import { updateDanmakuSettings, fetchDanmakuData } from './api/fetch';
import { createAndMountDanmakuSettings } from './api/settings';
import Logger from './log';

(function () {
    'use strict';

    const NS = '__jfDanmakuGlobal__';
    if (typeof window !== 'undefined') {
        const existing = window[NS];
        if (existing && existing.__webPlayerStateInstalled) {
            return; // 已安装
        }
    }

    const POLL_INTERVAL_MS = 3000; // 低频轮询，3s 一次
    const MUTATION_DEBOUNCE_MS = 120; // DOM 变动去抖

    const state = {
        isActive: null, // null=未知，true/false=已判定
        pollTimer: null,
        observer: null,
        mediaItemId: null, // 从 PlaybackInfo 抓到的媒体 ID
    };

    // 日志器（默认关闭调试，优先读取本地存储的开关）
    let __initialDebug = false;
    try {
        // 仅当运行在浏览器环境且可访问 localStorage 时读取
        const v = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem('danmaku_debug_enabled')
            : null;
        if (v === '1') __initialDebug = true;
        else if (v === '0') __initialDebug = false;
        // 其它/缺失情况保持默认 false
    } catch (_) { /* ignore storage access issues */ }
    const logger = new Logger({ debug: __initialDebug, prefix: 'JF-Danmaku' });

    // 记录是否已在当前会话中创建过 UI（进入时创建，退出时销毁）
    let uiActive = false;

    // 辅助：判断元素是否可见
    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        try {
            const cs = window.getComputedStyle(el);
            return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        } catch (_) { return false; }
    }

    // 获取当前活跃的 OSD 根（优先包含当前 video 的且可见的 data-type=video-osd 容器）
    function getActiveOsdRoot() {
        const video = document.querySelector('video.htmlvideoplayer');
        const roots = Array.from(document.querySelectorAll("div[data-type='video-osd']"));
        const visibleRoots = roots.filter(isVisible);
        if (video) {
            const owner = visibleRoots.find(r => r.contains(video));
            if (owner) return owner;
        }
        return visibleRoots[0] || roots[0] || null;
    }

    function activateUI() {
        if (uiActive) return;
        const g = (typeof window !== 'undefined') ? (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {}) : {};

        // 根据媒体ID按需加载数据；仅在数据与设置就绪后再尝试创建渲染器
        const maybeLoadForMedia = (id) => {
            if (!id) return;
            try {
                // 避免并发与重复
                if (g.__loadingMediaId === id || g.__lastSettingsLoadedForId === id) return;
                g.__loadingMediaId = id;
                g.__danmakuDataReady = false;

                Promise.resolve(fetchDanmakuData(logger, id)).then(() => {
                    // 数据拉取成功，认为全局 danmakuSettings 已写入
                    g.__lastSettingsLoadedForId = id;
                    g.__danmakuDataReady = true;
                    // 确保设置面板挂载（此时已具备真实设置值）
                    try { createAndMountDanmakuSettings({}); } catch (_) {}
                    // 尝试渲染（容器未就绪时各自函数会自处理/稍后由观察器再触发）
                    try { maybeRenderIfReady(); } catch (_) {}
                }).catch((e) => {
                    logger.warn && logger.warn('fetchDanmakuData 失败', e);
                    // 失败允许后续重试
                    if (g.__lastSettingsLoadedForId === id) g.__lastSettingsLoadedForId = null;
                }).finally(() => {
                    if (g.__loadingMediaId === id) g.__loadingMediaId = null;
                });
            } catch (e) { /* ignore */ }
        };

        // 去重：清理多余的按钮/热力图
        const cleanupDuplicates = () => {
            try {
                const root = getActiveOsdRoot();
                if (root) {
                    const buttons = Array.from(root.querySelectorAll('[data-danmaku-buttons]'));
                    if (buttons.length > 1) {
                        buttons.slice(1).forEach(n => { try { n.remove(); } catch (_) {} });
                        logger.info(`清理冗余按钮组: ${buttons.length - 1}`);
                    }
                }
            } catch (_) {}
            try {
                const root = getActiveOsdRoot();
                if (root) {
                    const canvases = Array.from(root.querySelectorAll('#danmaku-heatmap-canvas'));
                    if (canvases.length > 1) {
                        canvases.slice(1).forEach(n => { try { n.remove(); } catch (_) {} });
                        logger.info(`清理冗余热力图: ${canvases.length - 1}`);
                    }
                }
            } catch (_) {}
        };

        // 单次初始化尝试
        const isButtonsReady = () => {
            const root = getActiveOsdRoot();
            return !!(root && root.querySelector('[data-danmaku-buttons]'));
        };
        const isHeatmapReady = () => {
            const root = getActiveOsdRoot();
            return !!(root && root.querySelector('#danmaku-heatmap-canvas'));
        };
        const isDanmakuReady = () => {
            const video = document.querySelector('video.htmlvideoplayer');
            const layer = document.getElementById('danmaku-layer');
            return !!(video && layer && layer.parentElement === video.parentElement);
        };
        const allReady = () => isButtonsReady() && isHeatmapReady() && isDanmakuReady();

        // 仅当数据就绪时尝试渲染器与热力图
        const maybeRenderIfReady = () => {
            if (!g.__danmakuDataReady) return;
            try { generateHeatmap(logger); } catch (_) { }
            try { renderDanmaku(logger); } catch (_) { }
        };

        const tryInitOnce = () => {
            const video = document.querySelector('video.htmlvideoplayer');
            if (!video) return false;
            cleanupDuplicates();

            // 仅在未就绪时尝试插入按钮；渲染器等待数据就绪后再触发
            let btnRes = { status: 'skipped' };
            if (!isButtonsReady()) {
                btnRes = attachButtonsGroup(logger);
            }
            // 将渲染动作交由 maybeRenderIfReady 来控制（数据就绪后会多次被触发）
            maybeRenderIfReady();

            // 以“至少按钮插入成功”作为激活条件；所有组件就绪交给持久监听继续完成
            return btnRes && btnRes.status !== 'no-container';
        };

        // 尝试一次；若未完成则开启短期观察+防抖重试
        let done = false;
        try { done = tryInitOnce(); } catch (e) { logger.warn && logger.warn('初始化尝试异常', e); }

    const finishAndLoadData = () => {
            if (uiActive) return;
            uiActive = true;
            logger.info('弹幕 UI 已激活');
            // 准备设置与数据
            try {
        const itemId = (typeof g.getMediaId === 'function') ? g.getMediaId() : state.mediaItemId;
        if (itemId) maybeLoadForMedia(itemId);
        else logger.warn && logger.warn('未能获取媒体ID，等待 XHR 嗅探再加载');
            } catch (e) {
                logger.warn && logger.warn('激活后加载全局数据失败', e);
            }
        };

        // 短期 -> 持久化观察器：等待关键锚点出现后再次尝试（直到全部就绪）
        const debounce = (fn, delay) => {
            let t = null; return (...args) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
        };
        const debouncedTry = debounce(() => {
            try {
                const res = tryInitOnce();
                if (!done && res) {
                    done = true;
                    finishAndLoadData();
                }
                // 保持监听至整个活跃期结束（deactivateUI 中统一清理），以便 OSD DOM 重建时自愈
            } catch (_) { /* ignore */ }
        }, 150);

        // 安装持久化监听与增强触发
        const setupPersistentWatchers = () => {
        // 1) MutationObserver：childList + attributes(style/class)，直到 allReady()
            try {
                const obs = new MutationObserver(() => {
            try { if (allReady()) return; } catch (_) {}
            debouncedTry();
            // DOM 有变化时也尝试一次受控渲染（数据未就绪时此调用是空操作）
            maybeRenderIfReady();
                });
                obs.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style']
                });
                g.__uiInitObserver = obs;
            } catch (e) {
                logger.warn && logger.warn('附加持久观察失败', e);
            }

            // 2) 周期轮询：每 1s 尝试一次，直至 allReady()
            try {
                g.__uiInitInterval = setInterval(() => {
                    if (allReady()) {
                        try { clearInterval(g.__uiInitInterval); } catch (_) {}
                        g.__uiInitInterval = null;
                        return;
                    }
                    debouncedTry();
                    maybeRenderIfReady();
                }, 1000);
            } catch (_) { }

            // 3) 一次性 mousemove：控制条显隐常依赖鼠标，首次移动强制重试
            try {
                const onMove = () => { debouncedTry(); maybeRenderIfReady(); try { document.removeEventListener('mousemove', onMove); } catch (_) {} g.__uiInitMouseMove = null; };
                document.addEventListener('mousemove', onMove, { once: true });
                g.__uiInitMouseMove = onMove;
            } catch (_) { }
        };

        const teardownPersistentWatchers = () => {
            try { g.__uiInitObserver?.disconnect?.(); } catch (_) {}
            g.__uiInitObserver = null;
            try { if (g.__uiInitInterval) clearInterval(g.__uiInitInterval); } catch (_) {}
            g.__uiInitInterval = null;
            try { if (g.__uiInitMouseMove) document.removeEventListener('mousemove', g.__uiInitMouseMove); } catch (_) {}
            g.__uiInitMouseMove = null;
        };

        // 若首次已达成“激活”条件，立即加载数据，但仍继续观察直至所有组件到位
        if (done) {
            finishAndLoadData();
        }
    // 即便未完成，也尝试基于当前已知媒体ID加载数据
    try { const idNow = state.mediaItemId; if (idNow) maybeLoadForMedia(idNow); } catch (_) { }
        setupPersistentWatchers();
    }

    function deactivateUI() {
        if (!uiActive) return;
        try { cleanupAll(logger); } catch (_) { }
        uiActive = false;
        logger.info('弹幕 UI 已销毁');
        // 清理持久化初始化监听
        try {
            const g = window.__jfDanmakuGlobal__ || {};
            try { g.__uiInitObserver?.disconnect?.(); } catch (_) {}
            g.__uiInitObserver = null;
            try { if (g.__uiInitInterval) clearInterval(g.__uiInitInterval); } catch (_) {}
            g.__uiInitInterval = null;
            try { if (g.__uiInitMouseMove) document.removeEventListener('mousemove', g.__uiInitMouseMove); } catch (_) {}
            g.__uiInitMouseMove = null;
        } catch (_) { }
    }

    // 拦截 XHR，监听 PlaybackInfo 响应以提取媒体 Id，并在ID变化时重建扩展实例
    function installXHRSniffer() {
        try {
            const proto = XMLHttpRequest?.prototype;
            if (!proto) return;
            if (proto.open && proto.open.__jfPlaybackPatched) return;

            const originalOpen = proto.open;
            proto.open = function (method, url, ...rest) {
                this.addEventListener('load', () => {
                    const u = String(url || '');
                    if (!u.endsWith('PlaybackInfo')) return;
                    try {
                        const res = JSON.parse(this.responseText);
                        const id = res?.MediaSources?.[0]?.Id;
                        if (!id) return;
                        const prevId = state.mediaItemId;
                        state.mediaItemId = id;
                        if (prevId !== id) logger.info('PlaybackInfo 媒体ID', id);
                        // 捕获到媒体ID后优先尝试加载数据（不依赖 UI 激活完成）
                        try {
                            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                            if (!g.__maybeLoadForMedia) {
                                // 复用 activateUI 中的策略：先确保数据与设置就绪，再尝试渲染
                                g.__maybeLoadForMedia = (mid, loggerRef) => {
                                    if (!mid) return;
                                    try {
                                        if (g.__loadingMediaId === mid || g.__lastSettingsLoadedForId === mid) return;
                                        g.__loadingMediaId = mid;
                                        g.__danmakuDataReady = false;
                                        Promise.resolve(fetchDanmakuData(loggerRef || logger, mid)).then(() => {
                                            g.__lastSettingsLoadedForId = mid;
                                            g.__danmakuDataReady = true;
                                            try { createAndMountDanmakuSettings({}); } catch (_) {}
                                            try { generateHeatmap(loggerRef || logger); } catch (_) {}
                                            try { renderDanmaku(loggerRef || logger); } catch (_) {}
                                        }).catch(() => {
                                            try { if (g.__lastSettingsLoadedForId === mid) g.__lastSettingsLoadedForId = null; } catch (_) {}
                                        }).finally(() => {
                                            if (g.__loadingMediaId === mid) g.__loadingMediaId = null;
                                        });
                                    } catch (_) { }
                                };
                            }
                            g.__maybeLoadForMedia(id, logger);
                        } catch (_) { }
                        // 媒体 ID 变化时，做一次轻量的 UI 重建（清理后再激活）
                        if (uiActive) { deactivateUI(); activateUI(); }
                    } catch (_) { /* ignore parse errors */ }
                }, { once: true });
                return originalOpen.apply(this, [method, url, ...rest]);
            };
            proto.open.__jfPlaybackPatched = true;
            logger.info('已安装 XMLHttpRequest 嗅探');
        } catch (err) {
            logger.warn && logger.warn('安装 XHR 嗅探失败', err);
        }
    }

    function ensureExt(active) {
        if (active) activateUI(); else deactivateUI();
    }

    function isInWebPlayer() {
    // 需要同时存在视频元素与OSD容器，避免路由过渡时误判
    const videoEl = document.querySelector('video.htmlvideoplayer');
    const osdEl = document.querySelector("div[data-type='video-osd']");
    return !!(videoEl && osdEl);
    }

    function handleStateChange(newState) {
        if (state.isActive === newState) return;
        state.isActive = newState;
        // 控制扩展实例的存活
        ensureExt(newState);
        logger.info('状态变更', { 是否激活: newState });
    }

    function runCheck() {
        const active = isInWebPlayer();
        handleStateChange(active);
    }

    // DOM 变动去抖
    function debounce(fn, delay) {
        let timer = null;
        function wrapped(...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                try { fn.apply(this, args); } catch (_) { /* no-op */ }
            }, delay);
        }
        wrapped.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        return wrapped;
    }
    const debouncedRunCheck = debounce(runCheck, MUTATION_DEBOUNCE_MS);

    function start() {
        // 安装 XHR 嗅探
        installXHRSniffer();
        // 低频轮询
        state.pollTimer = setInterval(runCheck, POLL_INTERVAL_MS);
        logger.info('轮询已启动');

        // DOM 变动监听
        if ('MutationObserver' in window) {
            state.observer = new MutationObserver(() => {
                debouncedRunCheck();
            });
            const target = document.documentElement || document.body;
            if (target) {
                state.observer.observe(target, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class', 'style'],
                });
                logger.info('DOM 变动监听已附加');
            }
        }

        // 立即做一次初判
        runCheck();
    }

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    // 暴露少量调试 API
    if (typeof window !== 'undefined') {
        const g = window[NS] = window[NS] || {};
        Object.assign(g, {
            start,
            isInWebPlayer,
            getState: () => state.isActive,
            getExt: () => ({ uiActive }),
            getMediaId: () => state.mediaItemId,
            spawnExt: () => { try { deactivateUI(); } catch (_) {}; try { activateUI(); } catch (_) {} },
            setDebug: (v) => logger.setDebug(v),
            getDebug: () => logger.getDebug(),
            getLogger: () => logger,
            __webPlayerStateInstalled: true
        });
    }

    // 自启动
    ready(start);
})();

