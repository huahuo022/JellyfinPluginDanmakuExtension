// 获取弹幕数据的独立函数，从 danmakuExt.js 中迁移
// 依赖全局 ApiClient 与统一命名空间 __jfDanmakuGlobal__ (兼容旧 __jfWebPlayerState__ 指向同对象)
import { createAndMountDanmakuSettings } from './settings';
const GLOBAL_NS = '__jfDanmakuGlobal__';




// 提交（保存）当前全局设置到服务器，并获取最新弹幕/设置返回
// 步骤：
// 1. 从 window.__jfDanmakuGlobal__.danmakuSettings 读取全部键值
// 2. 构建 URLSearchParams 作为表单数据
// 3. 调用同一接口 danmaku/comment?item_id=... 发送 POST（应用服务器端保存逻辑）
// 4. 若返回含 settings 再次实例化全局（保持与获取逻辑一致）
export async function updateDanmakuSettings(logger, item_id, danmaku_id) {
    // item_id 仅使用显式传入参数，不再回退到播放器 mediaId
    const g = window[GLOBAL_NS] = window[GLOBAL_NS] || {};
    const gSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
    if (!gSettings || typeof gSettings.toJSON !== 'function') {
        logger?.warn?.('无法保存设置：全局设置对象缺失');
        return null;
    }

    // 若没有媒体标识，避免误将默认设置保存到服务器
    if (!item_id && !danmaku_id) {
        logger?.info?.('跳过保存：缺少 item_id/danmaku_id');
        return null;
    }

    try {
        const settingsObj = gSettings.toJSON();
        const formParams = new URLSearchParams();
        for (const [k, v] of Object.entries(settingsObj)) {
            // 全部转为字符串
            formParams.append(k, String(v));
        }
        // 可附带一个动作字段(若后端需要)；此处仅示例，可按需开启
        // formParams.append('action', 'save_settings');

        // 构建查询参数（可选 item_id / danmaku_id）
        const queryParts = [];
        if (item_id) queryParts.push(`item_id=${encodeURIComponent(item_id)}`);
        if (danmaku_id) queryParts.push(`danmaku_id=${encodeURIComponent(danmaku_id)}`);
        const query = queryParts.length ? `?${queryParts.join('&')}` : '';
        const url = ApiClient.getUrl(`danmaku/comment${query}`);
        // Jellyfin ApiClient.ajax 典型参数：type, url, data, dataType
        // data 传入 URL 编码字符串
        const result = await ApiClient.ajax({
            type: 'POST',
            url,
            data: formParams.toString(),
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
            dataType: 'json'
        });
        logger?.info?.('已提交弹幕设置并获取响应', { 服务器返回弹幕数: result.comments?.length ?? undefined });
        // 仅在存在 item_id 或 danmaku_id 的场景下应用响应（更新全局设置/弹幕/热力图）

        if (!result || typeof result !== 'object') return result;
        // settings
        if (result.settings && typeof result.settings === 'object') {
            try {
                createAndMountDanmakuSettings(result.settings);
                logger?.info?.('弹幕设置对象已更新');
            } catch (e) {
                logger?.warn?.('弹幕设置对象更新失败', e);
            }
        }
        g.danmakuData = result;
        logger?.info?.('全局 danmakuData 已刷新', { 数量: result.comments.length });

        if (item_id || danmaku_id) {
            try {
                // 若已有渲染器实例，使用无闪烁替换方法更新数据
                if (g.danmakuRenderer && typeof g.danmakuRenderer.replaceComments === 'function') {
                    try {
                        g.danmakuRenderer.replaceComments(result.comments, { preserveState: true });
                        logger?.info?.('替换弹幕渲染器数据成功');
                    } catch (re) {
                        logger?.warn?.('替换弹幕渲染器数据失败', re);
                    }
                }
                // 若返回了热力图数据且有渲染器实例，更新热力图
                if (result.heatmap_data && typeof result.heatmap_data === 'object') {
                    const heatmapValues = Object.values(result.heatmap_data);
                    if (g.heatmapRenderer && typeof g.heatmapRenderer.recalculate === 'function') {
                        try {
                            const video = document.querySelector('video');
                            const duration = video?.duration || 0;
                            g.heatmapRenderer.recalculate(heatmapValues, duration);
                            logger?.info?.('热力图数据已更新并重新计算');
                        } catch (he) {
                            logger?.warn?.('热力图更新失败', he);
                        }
                    }
                }
            } catch (e) {
                logger?.warn?.('刷新全局 danmakuData 失败', e);
            }
        } else {
            logger?.info?.('设置已保存：未提供 item_id / danmaku_id，服务器正常不返回弹幕数据（未执行 _applyDanmakuResponse）');
        }
        return result;
    } catch (err) {
        logger?.warn?.('提交弹幕设置请求失败', err);
        throw err;
    }
}

// 仅获取（不覆盖）当前媒体的弹幕数据与设置
// 用于页面初次加载或媒体切换后初始化，避免将本地默认值提交覆盖服务器
export async function fetchDanmakuData(logger, item_id, danmaku_id) {
    const g = window[GLOBAL_NS] = window[GLOBAL_NS] || {};
    try {
        // 构建查询参数（可选 item_id / danmaku_id）
        const queryParts = [];
        if (item_id) queryParts.push(`item_id=${encodeURIComponent(item_id)}`);
        if (danmaku_id) queryParts.push(`danmaku_id=${encodeURIComponent(danmaku_id)}`);
        const query = queryParts.length ? `?${queryParts.join('&')}` : '';
        const url = ApiClient.getUrl(`danmaku/comment${query}`);
        const result = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
        if (!result || typeof result !== 'object') return result;
        // settings
        if (result.settings && typeof result.settings === 'object') {
            try {
                createAndMountDanmakuSettings(result.settings);
                logger?.info?.('弹幕设置对象已加载');
            } catch (e) {
                logger?.warn?.('弹幕设置对象加载失败', e);
            }
        }
        g.danmakuData = result;
        logger?.info?.('已获取弹幕数据', { 数量: result.comments?.length });

        // 更新渲染器/热力图
        try {
            if (g.danmakuRenderer && typeof g.danmakuRenderer.replaceComments === 'function' && Array.isArray(result.comments)) {
                try {
                    g.danmakuRenderer.replaceComments(result.comments, { preserveState: true });
                    logger?.info?.('替换弹幕渲染器数据成功');
                } catch (re) { logger?.warn?.('替换弹幕渲染器数据失败', re); }
            }
            if (result.heatmap_data && typeof result.heatmap_data === 'object') {
                const heatmapValues = Object.values(result.heatmap_data);
                if (g.heatmapRenderer && typeof g.heatmapRenderer.recalculate === 'function') {
                    try {
                        const video = document.querySelector('video');
                        const duration = video?.duration || 0;
                        g.heatmapRenderer.recalculate(heatmapValues, duration);
                        logger?.info?.('热力图数据已更新并重新计算');
                    } catch (he) { logger?.warn?.('热力图更新失败', he); }
                }
            }
        } catch (_) { }
        return result;
    } catch (err) {
        logger?.warn?.('获取弹幕设置/数据失败', err);
        throw err;
    }
}
