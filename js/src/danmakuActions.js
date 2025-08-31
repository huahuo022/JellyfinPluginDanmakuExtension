/**
 * Danmaku 操作集合
 * 暴露三个创建方法：attachButtonsGroup, generateHeatmap, renderDanmaku
 */

import { DanmakuButtonsGroup } from './ui/buttons';
import { DanmakuHeatmapRenderer } from './render/heatmapRenderer';
import Danmaku from './render/danmakuCanvas.js';

const GLOBAL_NS = '__jfDanmakuGlobal__';
function getGlobal() {
    if (typeof window === 'undefined') return {};
    window[GLOBAL_NS] = window[GLOBAL_NS] || {};
    return window[GLOBAL_NS];
}

// 可见性判断
function isVisible(el) {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    try {
        const cs = window.getComputedStyle(el);
        return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    } catch (_) { return false; }
}

// 获取当前活跃的 OSD 根节点（优先包含当前 video 的且可见的 data-type=video-osd 容器）
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

// 在活跃 OSD 内查找热力图可挂载的进度条容器（更鲁棒的选择器集）
function findHeatmapContainer() {
    const root = getActiveOsdRoot() || document;
    const candidates = [
        '.sliderMarkerContainer',
        '.osdProgressInner .sliderMarkerContainer',
        '.osdProgressInner',
        '.positionSlider',
        '.emby-slider',
        '.noUi-target',
        '[role="slider"]',
        'input[type="range"]'
    ];
    for (const sel of candidates) {
        const nodes = Array.from(root.querySelectorAll(sel));
        for (const n of nodes) {
            let el = n;
            // 如果命中的是 slider 控件本体，倾向使用其父容器
            if (el.tagName === 'INPUT' || el.getAttribute('role') === 'slider') {
                el = el.parentElement || el;
            }
            if (isVisible(el) && (el.offsetWidth || el.scrollWidth)) {
                return el;
            }
        }
    }
    // 全局兜底
    const fallback = document.querySelector('.sliderMarkerContainer');
    return fallback || null;
}

// 查找播放器按钮容器（优先在活跃 OSD 根内）
function findButtonsContainer() {
    const osdRoot = getActiveOsdRoot();
    const searchIn = (root) => {
        if (!root) return null;
        const anchors = ['.btnVideoOsdSettings', '.btnVideoOsd', '.pause'];
        for (const sel of anchors) {
            const nodes = root.querySelectorAll(sel);
            for (const n of nodes) {
                if (!isVisible(n)) continue;
                const container = n.closest('.buttons.focuscontainer-x');
                if (container && isVisible(container)) return container;
            }
        }
        const list = root.querySelectorAll('.buttons.focuscontainer-x');
        for (const el of list) { if (isVisible(el)) return el; }
        return list[0] || null;
    };

    // 先在活跃 OSD 内找；找不到再全局兜底
    return searchIn(osdRoot) || searchIn(document);
}

/**
 * 创建并插入“弹幕按钮组”。
 * 返回 { status: 'created'|'exists'|'no-container', instance?, element? }
 */
export function attachButtonsGroup(logger = null) {
    const container = findButtonsContainer();
    if (!container) {
        logger?.debug?.('按钮容器未就绪');
        return { status: 'no-container' };
    }

    const g = getGlobal();
    // 幂等：优先复用现有实例（如存在则只移动，不重建）
    const existing = g.danmakuButtonsGroup;
    const existingEl = existing?.getElement?.();
    const insertIndex = 1;
    const beforeNode = container.children && container.children.length > insertIndex ? container.children[insertIndex] : null;

    if (existing && existingEl) {
        // 移除同容器内除现有元素之外的重复项
        try {
            container.querySelectorAll('[data-danmaku-buttons]')?.forEach(node => {
                if (node !== existingEl) { try { node.remove(); } catch (_) { } }
            });
        } catch (_) { }
        // 不同父容器：移动现有元素
        if (existingEl.parentElement !== container) {
            try { container.insertBefore(existingEl, beforeNode); } catch (_) { try { container.appendChild(existingEl); } catch (_) { } }
            logger?.info?.('弹幕按钮组已移动到当前容器');
            return { status: 'moved', instance: existing, element: existingEl };
        }
        // 相同父容器但索引不同：调整位置
        const currentIndex = Array.prototype.indexOf.call(container.children, existingEl);
        if (currentIndex !== insertIndex) {
            try { container.insertBefore(existingEl, beforeNode); } catch (_) { }
        }
        return { status: 'exists', instance: existing, element: existingEl };
    }

    // 不存在则创建
    const group = new DanmakuButtonsGroup({ logger });
    const el = group.getElement();
    el?.setAttribute?.('data-danmaku-buttons', 'true');
    try {
        container.querySelectorAll('[data-danmaku-buttons]')?.forEach(node => { if (node !== el) { try { node.remove(); } catch (_) { } } });
    } catch (_) { }
    try { container.insertBefore(el, beforeNode); } catch (_) { try { container.appendChild(el); } catch (_) { } }
    g.danmakuButtonsGroup = group;
    logger?.info?.('弹幕按钮组已插入');
    return { status: 'created', instance: group, element: el };
}

/**
 * 创建热力图 Canvas 并追加到进度条容器
 * 返回 { status: 'created'|'exists'|null, canvas? }
 */
export function generateHeatmap(logger = null) {
    const g = getGlobal();
    const heatmapData = g?.danmakuData?.heatmap_data;
    const heatmapArray = heatmapData ? Object.values(heatmapData) : [];
    const CANVAS_ID = 'danmaku-heatmap-canvas';
    const container = findHeatmapContainer();
    const video = document.querySelector('video');
    const duration = video?.duration || 0;
    if (!container || !video) {
        logger?.debug?.('热力图容器/视频未就绪');
        return null;
    }

    // 若已存在 renderer 或 canvas：优先移动到当前容器，避免重建闪烁
    const existingCanvas = document.getElementById(CANVAS_ID);
    if (existingCanvas) {
        if (!container.contains(existingCanvas)) {
            try { container.appendChild(existingCanvas); } catch (_) { }
            logger?.info?.('热力图已移动到当前容器');
            return { status: 'moved', canvas: existingCanvas };
        }
        return { status: 'exists', canvas: existingCanvas };
    }
    if (!duration || !isFinite(duration) || duration <= 0) {
        try {
            logger?.debug?.('video.duration 未就绪，等待 loadedmetadata 再生成热力图');
            const once = () => {
                try { video.removeEventListener('loadedmetadata', once); } catch (_) { }
                try { generateHeatmap(logger); } catch (_) { }
            };
            video.addEventListener('loadedmetadata', once, { once: true });
        } catch (_) { }
        return null;
    }

    const checkAgain = document.getElementById(CANVAS_ID);
    if (checkAgain && checkAgain.parentNode) {
        return { status: 'exists', canvas: checkAgain };
    }

    try {
    const width = container.scrollWidth || container.offsetWidth || 3840;
        // 若已有 renderer，复用实例，仅 process 生成画布
        if (!g.heatmapRenderer) {
            g.heatmapRenderer = new DanmakuHeatmapRenderer({
            autoResize: true,
            resizeThreshold: 50,
            resizeDebounceDelay: 100,
            debug: false,
            color: 'blue',
            canvasId: CANVAS_ID
            });
        }

        const canvas = g.heatmapRenderer.process(heatmapArray, duration, width);
        canvas.id = CANVAS_ID;
        canvas.setAttribute('data-danmaku-heatmap', 'true');
        container.appendChild(canvas);
        logger?.info?.('热力图创建成功');
        return { status: 'created', canvas };
    } catch (err) {
        logger?.warn?.('热力图绘制异常', err);
        return null;
    }
}

// 供外部在数据变化后主动刷新热力图（若已创建）
export function refreshHeatmapWithData(logger = null) {
    const g = getGlobal();
    const container = findHeatmapContainer();
    const video = document.querySelector('video');
    const duration = video?.duration || 0;
    const heatmapData = g?.danmakuData?.heatmap_data;
    const heatmapArray = heatmapData ? Object.values(heatmapData) : [];
    if (!g.heatmapRenderer || !container || !video) return false;
    try {
        g.heatmapRenderer.recalculate(heatmapArray, duration);
        logger?.info?.('热力图已根据新数据重新计算');
        return true;
    } catch (e) {
        logger?.warn?.('热力图重新计算失败', e);
        return false;
    }
}

/**
 * 渲染弹幕到视频上方
 * 返回 { status: 'created'|null, comments?: number }
 */
export function renderDanmaku(logger = null) {
    const g = getGlobal();
    const comments = g?.danmakuData?.comments || [];
    logger?.info?.('开始渲染弹幕', { 弹幕数量: comments.length });

    const videoEl = document.querySelector('video');
    if (!videoEl || !videoEl.parentElement) {
        logger?.debug?.('视频元素未就绪');
        return null;
    }

    const parent = videoEl.parentElement;
    const cs = window.getComputedStyle(parent);
    if (!/(relative|absolute|fixed|sticky)/.test(cs.position)) {
        parent.style.position = 'relative';
    }
    const layerId = 'danmaku-layer';
    const existing = document.getElementById(layerId);
    if (existing) {
        if (existing.parentElement !== parent) {
            // 仅搬移，不销毁重建
            try { parent.appendChild(existing); } catch (_) { }
        }
        // 若渲染器已存在，仅刷新尺寸
        if (g.danmakuRenderer) {
            try { g.danmakuRenderer.resize?.(); } catch (_) { }
            return { status: 'exists', comments: comments.length };
        }
        // 没有渲染器但有图层：继续在现有层上创建实例
    }

    // 复用现有图层或新建
    let layer = existing;
    let innerWrapper = null;
    if (!layer) {
        layer = document.createElement('div');
        layer.setAttribute('data-danmaku-layer', 'true');
        layer.id = layerId;
        layer.style.cssText = [
            'position:absolute',
            'left:0', 'top:0', 'right:0', 'bottom:0',
            'width:100%', 'height:100%',
            'pointer-events:none',
            'overflow:hidden',
        ].join(';');
        try {
            const opacitySetting = g?.danmakuSettings?.get('opacity');
            const opacity = Math.min(1, Math.max(0, (opacitySetting ?? 70) / 100));
            layer.style.opacity = String(opacity);
        } catch (_) {
            layer.style.opacity = '0.7';
        }
        try { parent.appendChild(layer); } catch (_) { }
    }

    // 确保内层 wrapper 存在并应用显示范围
    innerWrapper = layer.querySelector('#danmaku-layer-inner');
    const displayTop = (() => { try { return Number(g?.danmakuSettings?.get('display_top_pct')); } catch (_) { return 0; } })();
    const displayBottom = (() => { try { return Number(g?.danmakuSettings?.get('display_bottom_pct')); } catch (_) { return 100; } })();
    const topPct = isFinite(displayTop) ? Math.min(99, Math.max(0, displayTop)) : 0;
    const bottomPct = isFinite(displayBottom) ? Math.min(100, Math.max(topPct + 1, displayBottom)) : 100;
    if (!innerWrapper) {
        innerWrapper = document.createElement('div');
        innerWrapper.id = 'danmaku-layer-inner';
        layer.appendChild(innerWrapper);
    }
    innerWrapper.style.cssText = [
        'position:absolute',
        `top:${topPct}%`,
        `height:${bottomPct - topPct}%`,
        'left:0', 'right:0',
        'overflow:hidden',
        'width:100%',
        'pointer-events:none'
    ].join(';');

    // 仅在不存在实例时创建，避免反复销毁/重建
    if (!g.danmakuRenderer) {
        const danmakuInstance = g.danmakuRenderer = new Danmaku({
        container: innerWrapper,
        media: videoEl,
        comments: comments,
        speed: (() => {
            try {
                const v = g.danmakuSettings?.get('speed');
                const num = Number(v);
                if (!Number.isFinite(num)) return 144;
                return Math.min(600, Math.max(24, num));
            } catch (_) { return 144; }
        })(),
        });

    // 应用“是否显示”的本地记忆
    try {
        const key = 'jf_danmaku_enabled';
        if (typeof window !== 'undefined' && window.localStorage) {
            const v = window.localStorage.getItem(key);
            if (v === null) {
                try { window.localStorage.setItem(key, '1'); } catch (_) { }
                try { danmakuInstance.show?.(); } catch (_) { }
                logger?.info?.('弹幕记忆缺失: 默认开启并写入');
            } else if (v === '0') {
                try { danmakuInstance.hide?.(); } catch (_) { }
                logger?.info?.('读取记忆: 弹幕初始隐藏');
            } else if (v === '1') {
                try { danmakuInstance.show?.(); } catch (_) { }
                logger?.info?.('读取记忆: 弹幕初始显示');
            }
        }
    } catch (_) { }

    // 尺寸自适应
    if (typeof ResizeObserver !== 'undefined') {
        const resizeDebounceDelay = 50;
        let resizeTimer = null;
        const ro = new ResizeObserver(() => {
            if (!g.danmakuRenderer) return;
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                try { g.danmakuRenderer.resize(); } catch (_) { }
            }, resizeDebounceDelay);
        });
        try { ro.observe(parent); } catch (_) { }
        // 存到全局，便于 index.js 主流程在销毁时断开
        g.__danmakuResizeObserver = ro;
        g.__danmakuResizeTimerCancel = () => { if (resizeTimer) { try { clearTimeout(resizeTimer); } catch (_) { } resizeTimer = null; } };
    } else {
        const handleWindowResize = () => { try { g.danmakuRenderer?.resize?.(); } catch (_) { } };
        window.addEventListener('resize', handleWindowResize);
        g.__danmakuWindowResizeHandler = handleWindowResize;
    }

        logger?.info?.('弹幕渲染器创建完成');
        return { status: 'created', comments: comments.length };
    }
    // 已有实例场景
    return { status: 'exists', comments: comments.length };
}

// 提供少量辅助清理（可选使用）——非必须接口
export function cleanupAll(logger = null) {
    const g = getGlobal();
    try { g.danmakuButtonsGroup?.destroy?.(); } catch (_) { }
    g.danmakuButtonsGroup = null;

    try { g.danmakuRenderer?.destroy?.(); } catch (_) { }
    g.danmakuRenderer = null;
    try {
        const layer = document.getElementById('danmaku-layer');
        if (layer?.parentElement) layer.parentElement.removeChild(layer);
    } catch (_) { }

    try { g.heatmapRenderer?.destroy?.(); } catch (_) { }
    g.heatmapRenderer = null;
    try {
        const canvas = document.getElementById('danmaku-heatmap-canvas');
        if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
    } catch (_) { }

    try { g.__danmakuResizeObserver?.disconnect?.(); } catch (_) { }
    g.__danmakuResizeObserver = null;
    try { g.__danmakuResizeTimerCancel?.(); } catch (_) { }
    g.__danmakuResizeTimerCancel = null;
    try {
        if (g.__danmakuWindowResizeHandler) {
            window.removeEventListener('resize', g.__danmakuWindowResizeHandler);
        }
    } catch (_) { }
    g.__danmakuWindowResizeHandler = null;
    logger?.info?.('已清理弹幕相关 UI/实例');
}
