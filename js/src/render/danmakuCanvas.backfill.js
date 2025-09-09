// 回填弹幕（seek 时让仍在窗口内的弹幕立即出现）
import { binsearch } from './danmakuCanvas.utils';
import { allocateImpl } from './danmakuCanvas.allocate';

function nowSec() {
  try {
    return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
  } catch (_) {
    return Date.now() / 1000;
  }
}

/**
 * 在 seek 时执行历史弹幕回填。
 * - 计算 [ct - window, ct] 窗口内的历史弹幕
 * - 预创建 canvas，分配 y，推入 runningList
 * - 如暂停则静态渲染一帧
 *
 * @param {Object} dm Danmaku 实例（this）
 * @param {number} position 二分得到的插入点（第一个 > ct 的索引）
 */
export function performSeekBackfill(dm, position) {
  try {
    if (!dm || !dm.media) return;
    var ct = dm.media.currentTime;
    var windowStart = Math.max(0, ct - (dm._.backfillDuration || dm._.duration));
    // 找到窗口起点索引（第一个 > windowStart 的插入点 -> 前一个即 <= windowStart）
    var wsIndex = binsearch(dm.comments, 'time', windowStart) - 1;
    if (wsIndex < -1) wsIndex = -1;
    var start = wsIndex + 1;
    var end = position; // 不含 position (position 为第一个 > ct 的插入点)
    var pool = [];
    for (var i = start; i < end; i++) {
      var c = dm.comments[i];
      // 过滤：仅回填真正落在窗口内的；并限制数量
      if (c.time <= ct && c.time >= windowStart) {
        pool.push(c);
        if (dm._.maxBackfill && pool.length >= dm._.maxBackfill) break;
      }
    }
    if (!pool.length) return;

    // 创建 canvas（避免首帧重复 setup）
    dm._.engine.setup(dm._.stage, pool);
    var dn = nowSec();
    for (var j = 0; j < pool.length; j++) {
      var cmt = pool[j];
      // 复现其 _utc：等价于正常进入时的计算，使滚动位置正确
      cmt._utc = dn - (ct - cmt.time);
      // 分配 Y（按时间顺序保证占道逻辑正确）
      try { cmt.y = allocateImpl.call(dm, dm, cmt); } catch (_) { try { cmt.y = allocateImpl(dm, cmt); } catch (__) { cmt.y = 0; } }
      dm._.runningList.push(cmt);
    }
    // 为避免 engine 再次把这些回填的弹幕判定为“待进入”，直接将游标推进到 position
    dm._.position = position;

    // 如果当前是暂停状态（或可见但未播放），需要立即渲染一个静态帧，否则用户看不到回填结果
    if (dm._.paused || (dm.media && dm.media.paused)) {
      try {
        dm._.engine.framing(dm._.stage);
        var pbr = dm.media ? dm.media.playbackRate : 1;
        for (var k = 0; k < dm._.runningList.length; k++) {
          var rc = dm._.runningList[k];
          var baseW = (typeof rc._baseWidth === 'number' && isFinite(rc._baseWidth)) ? rc._baseWidth : rc.width;
          var totalWidth = dm._.width + baseW;
          // 使用 media.currentTime 保持与真正播放时的一致位置（基础宽度）
          var elapsed = totalWidth * (ct - rc.time) * pbr / dm._.duration;
          if (rc.mode === 'ltr') rc.x = elapsed - baseW;
          if (rc.mode === 'rtl') rc.x = dm._.width - elapsed;
          if (rc.mode === 'top' || rc.mode === 'bottom') {
            if (rc._markDisplay && typeof rc._textWidth === 'number' && typeof rc._textLeft === 'number') {
              var _tc = rc._textLeft + rc._textWidth / 2;
              rc.x = (dm._.width / 2) - _tc;
            } else {
              rc.x = (dm._.width - rc.width) >> 1;
            }
          }
          dm._.engine.render(dm._.stage, rc);
        }
      } catch (re) { try { console.warn('[Danmaku] seek backfill static render error', re); } catch (_) { } }
    }
  } catch (e) {
    try { console.warn('[Danmaku] seek backfill error', e); } catch (_) { }
  }
}
