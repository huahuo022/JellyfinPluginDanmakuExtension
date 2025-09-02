// 统一的保存工具（带防抖）
// 用法：
//   saveIfAutoOn(logger) -> Promise | undefined
// 说明：
// - 当 g.danmakuAutoSave 关闭时，直接返回 undefined，并清理挂起的定时器。
// - 当开启时，进行尾随防抖（默认300ms，可通过 g.settingsSaveDebounceMs 或 g.saveDebounceMs 配置），
//   多次快速调用会合并为一次保存，并返回同一个 pending Promise。

import { updateDanmakuSettings } from "./fetch";


const DEFAULT_SAVE_DEBOUNCE_MS = 300;
let _saveTimer = null;
let _pendingPromise = null;
let _pendingResolve = null;
let _pendingReject = null;
let _lastLogger = null;

function _clearPendingTimer() {
  if (_saveTimer) {
    try { clearTimeout(_saveTimer); } catch (_) {}
    _saveTimer = null;
  }
}

function _resetPendingState() {
  _clearPendingTimer();
  _pendingPromise = null;
  _pendingResolve = null;
  _pendingReject = null;
}

// 通用保存（带防抖合并）
export function saveIfAutoOn(logger = null) {
  try {
    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
    const enabled = !!g.danmakuAutoSave;

    if (!enabled) {
      // 关闭时清理任何挂起的保存任务；若已有挂起 Promise，则以已完成(undefined)结束，避免悬挂
      if (_pendingPromise) {
        _clearPendingTimer();
        try { _pendingResolve?.(undefined); } catch (_) {}
      }
      _resetPendingState();
      return;
    }

    // 记录最近一次 logger，用于真正执行时输出
    if (logger) _lastLogger = logger;

    const delay = DEFAULT_SAVE_DEBOUNCE_MS;

    // 若已有定时器，则刷新触发时间
    _clearPendingTimer();

    // 复用一个 pending Promise，使多次快速调用拿到同一个结果
    if (!_pendingPromise) {
      _pendingPromise = new Promise((resolve, reject) => {
        _pendingResolve = resolve;
        _pendingReject = reject;
      });
    }

    _saveTimer = setTimeout(() => {
      _saveTimer = null;
      // 取最新 mediaId 与 logger 执行
      const currentLogger = _lastLogger || logger;
      const mediaId = g.getMediaId?.();
      try {
        const ret = updateDanmakuSettings(currentLogger, mediaId);
        if (ret && typeof ret.then === 'function') {
          ret.then(val => {
            _pendingResolve?.(val);
            _resetPendingState();
          }).catch(err => {
            currentLogger?.warn?.('保存设置失败', err);
            _pendingReject?.(err);
            _resetPendingState();
          });
        } else {
          _pendingResolve?.(ret);
          _resetPendingState();
        }
      } catch (err) {
        currentLogger?.warn?.('保存设置失败', err);
        _pendingReject?.(err);
        _resetPendingState();
      }
    }, delay);

    return _pendingPromise;
  } catch (err) {
    logger?.warn?.('保存设置失败', err);
  }
}

// 检查当前设置的服务器字体是否已缓存，若未缓存则下载并保存到 Cache Storage
// 返回 Promise<boolean> 表示是否已在缓存中（或已成功缓存）
export async function ensureCurrentServerFontCached(logger = null) {
  try {
    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
    const settings = g.danmakuSettings;
    const val = settings?.get?.('font_family');
    if (!val || typeof val !== 'string' || val.indexOf('/danmaku/font/') !== 0) return false;

    // 规范化绝对地址
    let absUrl = val.replace(/^\/+/, '');
    try { if (typeof ApiClient !== 'undefined' && ApiClient.getUrl) absUrl = ApiClient.getUrl(absUrl); } catch (_) {}

    if (typeof caches === 'undefined' || !caches?.open) return false; // 环境不支持 Cache Storage

    const cache = await caches.open('jfdanmaku-fonts-v1');
    const req = new Request(absUrl, { credentials: 'same-origin', mode: 'cors' });
    const hit = await cache.match(req);
    if (hit) return true;

    // 下载并写入缓存
    const resp = await fetch(req);
    if (!resp || !resp.ok) {
      logger?.warn?.('字体下载失败', absUrl, resp?.status);
      return false;
    }
    // 复制响应体，避免一次性消耗
    const cloned = resp.clone();
    await cache.put(req, cloned);
    return true;
  } catch (e) {
    logger?.warn?.('缓存服务器字体失败', e);
    return false;
  }
}

// 暴露到全局，方便无需模块导入时使用
try { (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {}).ensureCurrentServerFontCached = ensureCurrentServerFontCached; } catch (_) {}
