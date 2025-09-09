// 轨道分配与碰撞相关拆分
import { getOccupiedWidth, computeStaticExpireAt } from './danmakuRenderer.utils';
import { isDynamicMarkEnabled } from './danmakuRenderer.settings';

/**
 * 创建碰撞检测范围的初始边界
 */
export function collidableRange() {
  var max = 9007199254740991; // Number.MAX_SAFE_INTEGER 的语义近似
  return [
    { range: 0, time: -max, width: max, height: 0 },
    { range: max, time: max, width: 0, height: 0 }
  ];
}

/**
 * 重置弹幕空间分配器
 */
export function resetSpace(space) {
  space.ltr = collidableRange();
  space.rtl = collidableRange();
  space.top = collidableRange();
  space.bottom = collidableRange();
}

/**
 * willCollide - 判断两个弹幕是否在时间/空间上冲突（供 allocate 调用）
 * @param {object} ctx 包含 _.width/_.duration/media 等
 * @param {object} cr  已存在的碰撞记录（含 time/height/width/cmt）
 * @param {object} cmt 新弹幕
 */
export function willCollide(ctx, cr, cmt) {
  var ct = ctx.media ? ctx.media.currentTime : (Date.now() / 1000);
  var pbr = ctx.media ? ctx.media.playbackRate : 1;

  if (cmt.mode === 'top' || cmt.mode === 'bottom') {
    var expireAt = computeStaticExpireAt(cr, ctx._.duration, isDynamicMarkEnabled());
    return ct < expireAt;
  }

  var crW = getOccupiedWidth(cr.cmt || cr);
  var cmtW = getOccupiedWidth(cmt);
  var crTotalWidth = ctx._.width + crW;
  var crElapsed = crTotalWidth * (ct - cr.time) * pbr / ctx._.duration;
  if (crW > crElapsed) return true;

  var crLeftTime = ctx._.duration + cr.time - ct;
  var cmtTotalWidth = ctx._.width + cmtW;
  var cmtTime = ctx.media ? cmt.time : cmt._utc;
  var cmtElapsed = cmtTotalWidth * (ct - cmtTime) * pbr / ctx._.duration;
  var cmtArrival = ctx._.width - cmtElapsed;
  var cmtArrivalTime = ctx._.duration * cmtArrival / (ctx._.width + cmtW);
  return crLeftTime > cmtArrivalTime;
}

/**
 * allocate 实现：返回 y 坐标
 */
export function allocateImpl(ctx, cmt) {
  var crs = ctx._.space[cmt.mode];
  var last = 0;
  var curr = 0;

  for (var i = 1; i < crs.length; i++) {
    var cr = crs[i];
    var requiredRange = cmt.height;
    if (cmt.mode === 'top' || cmt.mode === 'bottom') requiredRange += cr.height;

    if (cr.range - cr.height - crs[last].range >= requiredRange) { curr = i; break; }

    if (willCollide(ctx, cr, cmt)) last = i;
  }

  var channel = crs[last].range;
  var crObj = {
    range: channel + cmt.height,
    time: ctx.media ? cmt.time : cmt._utc,
    width: getOccupiedWidth(cmt),
    height: cmt.height,
    cmt: cmt
  };
  crs.splice(last + 1, curr - last - 1, crObj);

  if (cmt.mode === 'bottom') return ctx._.height - cmt.height - channel % ctx._.height;
  return channel % (ctx._.height - cmt.height);
}
