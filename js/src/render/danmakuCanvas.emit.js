// 发送新弹幕逻辑拆分
import { binsearch } from './danmakuCanvas.utils';
import { formatMode } from './danmakuCanvas.utils';

// 内部有效属性白名单
var properties = ['mode', 'time', 'text', 'render', 'style'];

function nowMs() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()); }

/**
 * 发送新弹幕
 * @param {Object} obj
 * @returns {any}
 */
export function emit(obj) {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') {
    return this;
  }

  var cmt = {};
  for (var i = 0; i < properties.length; i++) {
    if (obj[properties[i]] !== undefined) {
      cmt[properties[i]] = obj[properties[i]];
    }
  }

  cmt.text = (cmt.text || '').toString();
  cmt.mode = formatMode(cmt.mode);
  cmt._utc = nowMs() / 1000;

  if (this.media) {
    var position = 0;
    if (cmt.time === undefined) {
      cmt.time = this.media.currentTime;
      position = this._.position;
    } else {
      position = binsearch(this.comments, 'time', cmt.time);
      if (position < this._.position) {
        this._.position += 1;
      }
    }
    this.comments.splice(position, 0, cmt);
  } else {
    this.comments.push(cmt);
  }
  return this;
}
