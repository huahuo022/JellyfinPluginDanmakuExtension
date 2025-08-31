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
