// 通用纯工具函数集合，供渲染模块复用（以秒为单位的时间）

/**
 * 二分查找：返回插入位置 (0..arr.length)
 * @param {Array<object>} arr 已按 arr[i][prop] 升序排序
 * @param {string} prop 比较属性名
 * @param {number} key 目标值
 * @returns {number}
 */
export function binsearch(arr, prop, key) {
  var left = 0;
  var right = arr.length; // [left, right)
  while (left < right) {
    var mid = (left + right) >> 1;
    var v = arr[mid][prop];
    if (v <= key) left = mid + 1; else right = mid;
  }
  return left;
}

/**
 * 计算 <= key 的数量（arr 为升序数字数组）
 * @param {number[]} arr 升序数组
 * @param {number} key 目标值
 */
export function lowerBoundNumber(arr, key) {
  var l = 0, r = arr.length;
  while (l < r) {
    var m = (l + r) >> 1;
    if (arr[m] <= key) l = m + 1; else r = m;
  }
  return l;
}

/** 模式标准化 */
export function formatMode(mode) {
  if (!/^(ltr|top|bottom)$/i.test(mode)) return 'rtl';
  return String(mode || '').toLowerCase();
}

/** backOut 缓动（带回弹），t∈[0,1] */
export function easeBackOut(t) {
  var s = 1.70158;
  t = t - 1;
  return (t * t * ((s + 1) * t + s) + 1);
}

/**
 * 计算缩放值：触发时瞬间放大到 peak，随后在 duration 秒内“缩小并带回弹”回到 1。
 */
export function computeScale(start, nowSec, duration, peak) {
  if (typeof start !== 'number') return 1;
  var dt = nowSec - start;
  if (dt <= 0) return peak || 1.25;
  var dur = (duration || 0.35);
  if (dt >= dur) return 1;
  var t = dt / dur;
  var k = easeBackOut(t);
  var p = (peak || 1.25) - 1;
  return 1 + p * (1 - k);
}

/** 获取用于碰撞与路径计算的“占位宽度”，优先使用预留宽度 */
export function getOccupiedWidth(cmt) {
  var w = (typeof cmt && cmt ? cmt.width : 0) || 0;
  var rw = (typeof cmt._occupiedWidth === 'number' && isFinite(cmt._occupiedWidth)) ? cmt._occupiedWidth : w;
  return Math.max(w, rw);
}

/** 获取用于运动轨迹的“基础宽度”（不含徽标扩展），以保持本体轨迹不变 */
export function getMotionWidth(cmt) {
  if (cmt && typeof cmt._baseWidth === 'number' && isFinite(cmt._baseWidth)) return cmt._baseWidth;
  return (cmt && typeof cmt.width === 'number' && isFinite(cmt.width)) ? cmt.width : 0;
}

/** 当前时间（秒） */
export function now() {
  return (typeof window !== 'undefined' && window.performance && window.performance.now
    ? window.performance.now()
    : Date.now()) / 1000;
}

/**
 * 计算静态弹幕（top/bottom）的“真实过期时间”
 * - 默认：time + duration
 * - 若动态徽标启用且存在 mark_count/_markTimes：max(mark) + 4
 * @param {object} cmt 弹幕对象或 { cmt } 包装对象
 * @param {number} duration 基础持续时长（秒）
 * @param {boolean} dynamicEnabled 是否开启动态徽标
 * @returns {number} expireAt 过期的绝对时间（秒）
 */
export function computeStaticExpireAt(cmt, duration, dynamicEnabled) {
  var src = cmt && cmt.cmt ? cmt.cmt : cmt;
  var expireAt = (src && typeof src.time === 'number') ? src.time + duration : duration;
  if (!dynamicEnabled) return expireAt;
  var lastMark;
  if (Array.isArray(src && src._markTimes) && src._markTimes.length > 0) {
    lastMark = src._markTimes[src._markTimes.length - 1];
  } else if (Array.isArray(src && src.mark_count) && src.mark_count.length > 0) {
    try { lastMark = Math.max.apply(null, src.mark_count); } catch (_) { lastMark = undefined; }
  }
  if (typeof lastMark === 'number' && isFinite(lastMark)) return lastMark + 4;
  return expireAt;
}
