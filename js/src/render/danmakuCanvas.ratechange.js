// 倍速变化平滑过渡逻辑

function nowSec() {
  try {
    return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
  } catch (_) {
    return Date.now() / 1000;
  }
}

/**
 * 媒体倍速变化时平滑过渡，避免弹幕位置瞬移
 * @returns {any}
 */
export function ratechange() {
  if (!this || !this.media) return this;
  var newRate = this.media.playbackRate || 1;
  if (this._.paused) { // 暂停状态不需要修正，恢复播放时已按当前速率计算
    this._.lastPbr = newRate;
    return this;
  }
  var oldRate = this._.lastPbr || 1;
  if (!newRate || newRate <= 0 || Math.abs(newRate - oldRate) < 1e-6) {
    this._.lastPbr = newRate;
    return this;
  }
  var dn = nowSec();
  for (var i = 0; i < this._.runningList.length; i++) {
    var c = this._.runningList[i];
    c._utc = dn - (dn - c._utc) * oldRate / newRate;
  }
  this._.lastPbr = newRate;
  return this;
}
