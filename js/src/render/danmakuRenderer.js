import {
  binsearch,
  formatMode,
  computeScale,
  getOccupiedWidth,
  getMotionWidth
} from './danmakuRenderer.utils';
import {
  ensureRemoteFontLoaded,
  maybeRewriteStyleFont,
  canvasHeight,
  computeFontSize
} from './danmakuRenderer.font';
import { resetSpace as resetSpaceExternal, allocateImpl } from './danmakuRenderer.allocate';
import { isDynamicMarkEnabled } from './danmakuRenderer.settings';
import { setupCopyContextMenu } from './danmakuRenderer.menu';
import { performSeekBackfill } from './danmakuRenderer.backfill';
import { updateMarkSuffix as updateMarkSuffixExternal } from './danmakuRenderer.mark';
import { emit as emitExternal } from './danmakuRenderer.emit';
import { ratechange as ratechangeExternal } from './danmakuRenderer.ratechange';


/**
 * 获取设备像素比，用于高分辨率屏幕适配
 */
var dpr = typeof window !== 'undefined' && window.devicePixelRatio || 1;

function __getGlobal() {
  try {
    // eslint-disable-next-line no-return-assign
    return (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {});
  } catch (_) {
    return {};
  }
}
// 将加载器暴露到全局，便于设置页等直接调用
try { __getGlobal().ensureRemoteFontLoaded = ensureRemoteFontLoaded; } catch (_) { }


/**
 * 创建弹幕文本的Canvas画布
 * @param {Object} cmt - 弹幕评论对象
 * @param {Object} fontSize - 字体大小配置
 * @returns {HTMLCanvasElement} 渲染好的Canvas元素
 */
function createCommentCanvas(cmt, fontSize) {
  // 如果弹幕有自定义渲染函数，优先使用
  if (typeof cmt.render === 'function') {
    var cvs = cmt.render();
    if (cvs instanceof HTMLCanvasElement) {
      cmt.width = cvs.width;
      cmt.height = cvs.height;
      return cvs;
    }
  }

  // 创建新的Canvas元素
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  var style = cmt.style || {};

  // 设置默认样式
  style.font = style.font || '25px sans-serif';
  style.textBaseline = style.textBaseline || 'bottom';

  // 如包含远程字体占位，尽量重写为已加载的家族名
  maybeRewriteStyleFont(style);

  // 计算描边宽度
  var strokeWidth = style.lineWidth * 1;
  strokeWidth = (strokeWidth > 0 && strokeWidth !== Infinity)
    ? Math.ceil(strokeWidth)
    : !!style.strokeStyle * 1;

  // 设置字体并测量文本尺寸
  ctx.font = style.font;
  cmt.width = cmt.width ||
    Math.max(1, Math.ceil(ctx.measureText(cmt.text).width) + strokeWidth * 2);
  cmt.height = cmt.height ||
    Math.ceil(canvasHeight(style.font, fontSize)) + strokeWidth * 2;

  // 设置Canvas尺寸（考虑设备像素比）
  canvas.width = cmt.width * dpr;
  canvas.height = cmt.height * dpr;
  ctx.scale(dpr, dpr);

  // 应用样式到Canvas上下文
  for (var key in style) {
    ctx[key] = style[key];
  }

  // 根据文本基线计算绘制位置
  var baseline = 0;
  switch (style.textBaseline) {
    case 'top':
    case 'hanging':
      baseline = strokeWidth;
      break;
    case 'middle':
      baseline = cmt.height >> 1;
      break;
    default:
      baseline = cmt.height - strokeWidth;
  }

  // 绘制文本（先描边后填充）
  if (style.strokeStyle) {
    ctx.strokeText(cmt.text, strokeWidth, baseline);
  }
  ctx.fillText(cmt.text, strokeWidth, baseline);
  return canvas;
}

/**
 * 初始化Canvas舞台
 * @param {HTMLElement} container - 容器元素
 * @returns {HTMLCanvasElement} 初始化后的Canvas舞台
 */
function init(container) {
  var stage = document.createElement('canvas');
  stage.context = stage.getContext('2d');
  // 计算字体大小配置（根元素和容器元素）
  stage._fontSize = {
    root: computeFontSize(document.getElementsByTagName('html')[0]),
    container: computeFontSize(container)
  };
  return stage;
}

/**
 * 清空舞台并释放弹幕Canvas缓存
 * @param {HTMLCanvasElement} stage - Canvas舞台
 * @param {Array} comments - 弹幕数组
 */
function clear(stage, comments) {
  stage.context.clearRect(0, 0, stage.width, stage.height);
  // 避免缓存Canvas以减少内存使用
  for (var i = 0; i < comments.length; i++) {
    comments[i].canvas = null;
  }
}

/**
 * 调整舞台尺寸
 * @param {HTMLCanvasElement} stage - Canvas舞台
 * @param {number} width - 新宽度
 * @param {number} height - 新高度
 */
function resize(stage, width, height) {
  stage.width = width * dpr;
  stage.height = height * dpr;
  stage.style.width = width + 'px';
  stage.style.height = height + 'px';
}

/**
 * 清空一帧准备下一帧渲染
 * @param {HTMLCanvasElement} stage - Canvas舞台
 */
function framing(stage) {
  stage.context.clearRect(0, 0, stage.width, stage.height);
}

/**
 * 为弹幕数组设置Canvas画布
 * @param {HTMLCanvasElement} stage - Canvas舞台
 * @param {Array} comments - 弹幕数组
 */
function setup(stage, comments) {
  for (var i = 0; i < comments.length; i++) {
    var cmt = comments[i];
    cmt.canvas = createCommentCanvas(cmt, stage._fontSize);
  }
}

/**
 * 渲染单个弹幕到舞台
 * @param {HTMLCanvasElement} stage - Canvas舞台
 * @param {Object} cmt - 弹幕对象
 */
function render(stage, cmt) {
  var ctx = stage.context;
  var scale = (typeof cmt._scaleCurrent === 'number' && isFinite(cmt._scaleCurrent)) ? cmt._scaleCurrent : 1;
  if (scale === 1) {
    ctx.drawImage(cmt.canvas, cmt.x * dpr, cmt.y * dpr);
    return;
  }
  // 选择缩放锚点：显示徽标时，以“基础文本中心”为锚点；否则以画布中心。
  var useTextCenter = (cmt._markDisplay && typeof cmt._textWidth === 'number' && typeof cmt._textLeft === 'number');
  var pivotInsideX = useTextCenter ? (cmt._textLeft + cmt._textWidth / 2) : (cmt.width / 2);
  var pivotInsideY = cmt.height / 2;
  var cx = (cmt.x + pivotInsideX) * dpr;
  var cy = (cmt.y + pivotInsideY) * dpr;
  ctx.save();
  try {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.drawImage(
      cmt.canvas,
      - pivotInsideX * dpr,
      - pivotInsideY * dpr
    );
  } finally {
    ctx.restore();
  }
}



/**
 * 移除弹幕并释放资源
 * @param {HTMLCanvasElement} stage - Canvas舞台
 * @param {Object} cmt - 弹幕对象
 */
function remove(stage, cmt) {
  // 避免缓存Canvas以减少内存使用
  cmt.canvas = null;
}

/**
 * Canvas渲染引擎对象
 * 包含Canvas渲染相关的所有方法
 */
var canvasEngine = {
  name: 'canvas',
  init: init,
  clear: clear,
  resize: resize,
  framing: framing,
  setup: setup,
  render: render,
  remove: remove,
};

/**
 * 跨浏览器的requestAnimationFrame实现
 * 优先使用原生API，不支持时降级为setTimeout
 */
var raf = (function () {
  if (typeof window !== 'undefined') {
    var rAF = (
      window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame
    );
    if (rAF) return rAF.bind(window);
  }
  // 降级方案：使用setTimeout模拟60fps
  return function (cb) {
    return setTimeout(cb, 50 / 3);
  };
})();

/**
 * 跨浏览器的cancelAnimationFrame实现
 * 用于取消动画帧请求
 */
var caf = (function () {
  if (typeof window !== 'undefined') {
    var cAF = (
      window.cancelAnimationFrame ||
      window.mozCancelAnimationFrame ||
      window.webkitCancelAnimationFrame
    );
    if (cAF) return cAF.bind(window);
  }
  return clearTimeout;
})();


/**
 * 根据 mark_count（时间点列表，秒）动态为弹幕文本追加 " +n" 后缀，并在需要时重建画布
 * 仅当 n 发生变化时才更新，以降低开销
 * @param {HTMLCanvasElement} stage 舞台（用于获取字体尺寸）
 * @param {Object} cmt 弹幕对象（期望包含 mark_count 数组）
 * @param {number} ct 当前时间（秒）
 */
function updateMarkSuffix(stage, cmt, ct) { return updateMarkSuffixExternal(stage, cmt, ct, createCommentCanvas); }


/**
 * 重置弹幕空间分配器
 * @param {Object} space - 空间分配对象
 */
function resetSpace(space) { return resetSpaceExternal(space); }

// 统一使用 utils 的 now（以秒为单位），此处需要毫秒时间戳供 rAF 锚点使用
function now() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()); }

/**
 * 为弹幕分配显示位置（避免碰撞）
 * @param {Object} cmt - 弹幕对象
 * @returns {number} 分配的Y坐标位置
 */
/* eslint no-invalid-this: 0 */
function allocate(cmt) { return allocateImpl(this, cmt); }

/**
 * 创建渲染引擎函数
 * @param {Function} framing - 帧初始化函数
 * @param {Function} setup - 弹幕设置函数
 * @param {Function} render - 弹幕渲染函数
 * @param {Function} remove - 弹幕移除函数
 * @returns {Function} 渲染引擎函数
 */
/* eslint no-invalid-this: 0 */
function createEngine(framing, setup, render, remove) {
  return function (_timestamp) {
    framing(this._.stage);  // 清空画布准备新一帧
    var timestamp = _timestamp || now();
    var dn = timestamp / 1000;
    var ct = this.media ? this.media.currentTime : dn;    // 当前时间
    var pbr = this.media ? this.media.playbackRate : 1;   // 播放速率
    // 速率变化补偿：确保不会出现一帧使用新速率但旧 _utc 造成位置跳变
    if (this.media) {
      var prev = this._.lastPbr || 1;
      if (Math.abs(pbr - prev) > 1e-6) {
        // 在同一帧内平滑修正所有运行中的弹幕参考时间
        for (var ai = 0; ai < this._.runningList.length; ai++) {
          var ac = this._.runningList[ai];
          ac._utc = dn - (dn - ac._utc) * prev / pbr;
        }
        this._.lastPbr = pbr;
      }
    }
    var cmt = null;
    var cmtt = 0;
    var i = 0;

    // 移除过期的弹幕（顶/底静态弹幕：若存在 mark_count，则以其中最大值+4s 为截止）
    for (i = this._.runningList.length - 1; i >= 0; i--) {
      cmt = this._.runningList[i];
      cmtt = this.media ? cmt.time : cmt._utc;
      var shouldRemove = false;
      if (cmt.mode === 'top' || cmt.mode === 'bottom') {
        var deadline = cmtt + this._.duration;
        // 仅当动态标记开关开启时，才使用 mark_count 最大值 + 4s 的延长策略
        if (isDynamicMarkEnabled()) {
          var lastMark = undefined;
          if (Array.isArray(cmt._markTimes) && cmt._markTimes.length > 0) {
            lastMark = cmt._markTimes[cmt._markTimes.length - 1]; // 已排序
          } else if (Array.isArray(cmt.mark_count) && cmt.mark_count.length > 0) {
            try { lastMark = Math.max.apply(null, cmt.mark_count); } catch (_) { lastMark = undefined; }
          }
          if (typeof lastMark === 'number' && isFinite(lastMark)) {
            deadline = lastMark + 4; // 直接使用最大 mark 时间 + 4 秒
          }
        }
        shouldRemove = (ct > deadline);
      } else {
        shouldRemove = (ct - cmtt > this._.duration);
      }
      if (shouldRemove) {
        remove(this._.stage, cmt);
        this._.runningList.splice(i, 1);
      }
    }


    // 处理待显示的弹幕
    var pendingList = [];
    while (this._.position < this.comments.length) {
      cmt = this.comments[this._.position];
      cmtt = this.media ? cmt.time : cmt._utc;
      if (cmtt >= ct) {
        break;  // 还未到显示时间
      }

      // 跳过超出持续时间的弹幕
      // 当点击控件跳转时，media.currentTime可能在pause事件触发前改变
      // 详见 https://github.com/weizhenye/Danmaku/pull/30
      if (ct - cmtt > this._.duration) {
        ++this._.position;
        continue;
      }

      // 设置弹幕的UTC时间
      if (this.media) {
        cmt._utc = dn - (this.media.currentTime - cmt.time);
      }
      // 基于 mark_count 在进入前先更新一次后缀
      try { updateMarkSuffix(this._.stage, cmt, ct); } catch (_) { }
      pendingList.push(cmt);
      ++this._.position;
    }

    // 为新弹幕创建Canvas
    setup(this._.stage, pendingList);

    // 为新弹幕分配位置并加入运行列表
    for (i = 0; i < pendingList.length; i++) {
      cmt = pendingList[i];
      cmt.y = allocate.call(this, cmt);
      this._.runningList.push(cmt);
    }

    // 渲染所有正在运行的弹幕
    for (i = 0; i < this._.runningList.length; i++) {
      cmt = this._.runningList[i];
      // 每帧根据当前时间更新一次 " +n" 后缀，如有变化将重建画布
      try { updateMarkSuffix(this._.stage, cmt, ct); } catch (_) { }
      // 缩放动效：在计数增长后的一小段时间内执行回弹缩放
      if (typeof cmt._scaleStart === 'number') {
        var s = computeScale(cmt._scaleStart, ct, cmt._scaleDuration, cmt._scalePeak);
        cmt._scaleCurrent = s;
        // 动画结束后清理起始标记
        if (s === 1 && ct - cmt._scaleStart >= (cmt._scaleDuration || 0.35)) {
          cmt._scaleStart = undefined;
        }
      } else {
        cmt._scaleCurrent = 1;
      }
      var ocw = getOccupiedWidth(cmt);
      var mw = getMotionWidth(cmt);
      var totalWidth = this._.width + mw; // 使用基础宽度计算轨迹
      var elapsed = totalWidth * (dn - cmt._utc) * pbr / this._.duration;

      // 根据弹幕模式计算X坐标
      if (cmt.mode === 'ltr') cmt.x = elapsed - mw;               // 左到右（基础宽度）
      if (cmt.mode === 'rtl') cmt.x = this._.width - elapsed;     // 右到左（基础宽度）
      if (cmt.mode === 'top' || cmt.mode === 'bottom') {          // 顶部/底部：保持“文本”居中不动，徽标向右扩展
        if (cmt._markDisplay && typeof cmt._textWidth === 'number' && typeof cmt._textLeft === 'number') {
          // 画布中“文本中心”相对画布左的偏移
          var textCenterOffset = cmt._textLeft + cmt._textWidth / 2;
          // 令文本中心对齐舞台中心：x + textCenterOffset = width/2
          cmt.x = (this._.width / 2) - textCenterOffset;
        } else {
          // 无徽标或无记录时，退回以整体居中
          cmt.x = (this._.width - ocw) >> 1;
        }
      }
      render(this._.stage, cmt);
    }
  };
}

/**
 * 开始播放弹幕动画
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint no-invalid-this: 0 */
function play() {
  if (!this._.visible || !this._.paused) {
    return this;
  }
  this._.paused = false;

  // 如果有媒体元素，更新所有运行中弹幕的UTC时间
  if (this.media) {
    for (var i = 0; i < this._.runningList.length; i++) {
      var cmt = this._.runningList[i];
      cmt._utc = now() / 1000 - (this.media.currentTime - cmt.time);
    }
  }

  var that = this;
  var engine = createEngine(
    this._.engine.framing.bind(this),
    this._.engine.setup.bind(this),
    this._.engine.render.bind(this),
    this._.engine.remove.bind(this)
  );

  // 动画循环函数
  function frame(timestamp) {
    engine.call(that, timestamp);
    that._.requestID = raf(frame);
  }
  this._.requestID = raf(frame);
  return this;
}

/**
 * 暂停弹幕动画
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint no-invalid-this: 0 */
function pause() {
  if (!this._.visible || this._.paused) {
    return this;
  }
  this._.paused = true;
  caf(this._.requestID);  // 取消动画帧请求
  this._.requestID = 0;
  return this;
}

/**
 * 媒体倍速变化时平滑过渡，避免弹幕位置瞬移
 * 原理：x 位置公式使用 (dn - _utc) * playbackRate
 * 当倍速由 r0 切换为 r1 时，保持当前位置不变，需令
 * (dn - _utc_new) * r1 = (dn - _utc_old) * r0 => _utc_new = dn - (dn - _utc_old) * r0 / r1
 * @returns {Object}
 */
/* eslint no-invalid-this: 0 */
function ratechange() { return ratechangeExternal.call(this); }

/**
 * 跳转到指定时间位置
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint no-invalid-this: 0 */
function seek() {
  if (!this.media) {
    return this;
  }
  this.clear();
  resetSpace(this._.space);
  // 使用二分查找找到当前时间对应的弹幕位置
  var position = binsearch(this.comments, 'time', this.media.currentTime);
  // 默认策略：按原库逻辑让 position 指向 "当前时间之前的最后一条"，首帧再回填其后仍在持续窗口内的弹幕
  this._.position = Math.max(0, position - 1);

  // 在 seek 当下直接预回填一批历史弹幕，使“本应仍在屏幕上的”弹幕立即出现
  if (this._.backfillOnSeek) {
    performSeekBackfill(this, position);
  }
  return this;
}

/**
 * 绑定媒体元素事件监听器
 * @param {Object} _ - 监听器存储对象
 */
/* eslint no-invalid-this: 0 */
function bindEvents(_) {
  _.play = play.bind(this);
  _.pause = pause.bind(this);
  _.seeking = seek.bind(this);
  _.ratechange = ratechange.bind(this);
  this.media.addEventListener('play', _.play);
  this.media.addEventListener('pause', _.pause);
  this.media.addEventListener('playing', _.play);
  this.media.addEventListener('waiting', _.pause);
  this.media.addEventListener('seeking', _.seeking);
  this.media.addEventListener('ratechange', _.ratechange);
}

/**
 * 解绑媒体元素事件监听器
 * @param {Object} _ - 监听器存储对象
 */
/* eslint no-invalid-this: 0 */
function unbindEvents(_) {
  this.media.removeEventListener('play', _.play);
  this.media.removeEventListener('pause', _.pause);
  this.media.removeEventListener('playing', _.play);
  this.media.removeEventListener('waiting', _.pause);
  this.media.removeEventListener('seeking', _.seeking);
  this.media.removeEventListener('ratechange', _.ratechange);
  _.play = null;
  _.pause = null;
  _.seeking = null;
  _.ratechange = null;
}

/**
 * 初始化弹幕实例
 * @param {Object} opt - 初始化选项
 * @param {HTMLElement} [opt.container] - 弹幕容器元素
 * @param {HTMLMediaElement} [opt.media] - 关联的媒体元素
 * @param {number} [opt.speed] - 弹幕滚动速度
 * @param {Array} [opt.comments] - 弹幕数据数组
 * @returns {Object} 弹幕实例
 */
/* eslint-disable no-invalid-this */
function init$1(opt) {
  this._ = {};
  this.container = opt.container || document.createElement('div');
  this.media = opt.media;
  this._.visible = true;

  /* istanbul ignore next */
  {
    this.engine = 'canvas';
    this._.engine = canvasEngine;
  }
  /* eslint-enable no-undef */
  this._.requestID = 0;

  // 设置弹幕速度和持续时间
  this._.speed = Math.max(0, opt.speed) || 144;  // 像素/秒
  this._.duration = 4;                           // 默认持续时间（秒）
  this._.lastPbr = this.media ? (this.media.playbackRate || 1) : 1; // 记录上一次播放速率

  // 回填配置（可选）
  this._.backfillOnSeek = opt.backfillOnSeek !== undefined ? !!opt.backfillOnSeek : true; // 默认开启
  this._.backfillDuration = typeof opt.backfillDuration === 'number' && opt.backfillDuration > 0
    ? opt.backfillDuration
    : undefined; // 缺省时使用 this._.duration
  this._.maxBackfill = typeof opt.maxBackfill === 'number' && opt.maxBackfill > 0
    ? opt.maxBackfill
    : 120; // 防止 seek 回填过多影响性能

  // 右键复制菜单配置
  this._.enableCopyMenu = opt.enableCopyMenu !== undefined ? !!opt.enableCopyMenu : true;
  this._.copyMenu = null; // DOM 元素
  this._.copyMenuHandlers = null; // 保存监听器引用

  // 处理弹幕数据
  this.comments = opt.comments || [];
  this.comments.sort(function (a, b) {
    return a.time - b.time;  // 按时间排序
  });
  // 格式化弹幕模式
  for (var i = 0; i < this.comments.length; i++) {
    this.comments[i].mode = formatMode(this.comments[i].mode);
  }
  this._.runningList = [];  // 正在运行的弹幕列表
  this._.position = 0;      // 当前处理位置

  this._.paused = true;

  // 首帧字体就绪屏障：在第一条弹幕进入前等待需要的远程字体加载完成
  var fontUrls = [];
  try {
    var g = __getGlobal();
    var ff = g?.danmakuSettings?.get?.('font_family');
    if (typeof ff === 'string' && ff.indexOf('/danmaku/font/') === 0) {
      fontUrls.push(ff);
    }
  } catch (_) { }
  // 去重
  var needFonts = Array.from(new Set(fontUrls));
  var waitFontsPromise = Promise.resolve();
  if (needFonts.length > 0) {
    waitFontsPromise = Promise.all(needFonts.map(function (u) { return ensureRemoteFontLoaded(u); })).then(function () { }).catch(function () { });
  }
  this._.fontReadyPromise = waitFontsPromise;

  // 如果有媒体元素，绑定事件监听器
  if (this.media) {
    this._.listener = {};
    bindEvents.call(this, this._.listener);
  }

  // 初始化渲染舞台
  this._.stage = this._.engine.init(this.container);
  this._.stage.style.cssText += 'position:relative;pointer-events:none;';

  this.resize();  // 设置尺寸
  this.container.appendChild(this._.stage);

  // 若全局设置指定了远程字体（/danmaku/font/），尝试预加载并应用到容器，失败则忽略
  try {
    var g = __getGlobal();
    var ff = g?.danmakuSettings?.get?.('font_family');
    if (typeof ff === 'string' && ff.indexOf('/danmaku/font/') === 0) {
      ensureRemoteFontLoaded(ff).then(function (fam) {
        if (fam) {
          try { (g.danmakuRenderer?.container || this.container).style.fontFamily = "'" + fam + "', sans-serif"; } catch (_) { }
        }
      }.bind(this));
    }
  } catch (_) { /* ignore */ }

  // 初始化右键复制菜单（使用 document 捕获, 不改变 pointer-events 行为）
  if (this._.enableCopyMenu) {
    setupCopyContextMenu.call(this);
  }

  // 初始化空间分配器
  this._.space = {};
  resetSpace(this._.space);

  // 如果媒体未暂停或没有媒体元素，等待字体就绪后再开始播放，避免首帧字体回退
  if (!this.media || !this.media.paused) {
    var self = this;
    this._.fontReadyPromise.then(function () {
      seek.call(self);
      play.call(self);
    });
  }
  return this;
}

/**
 * 销毁弹幕实例，清理所有资源
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function destroy() {
  if (!this.container) {
    return this;
  }

  pause.call(this);   // 停止动画
  this.clear();       // 清空弹幕
  this.container.removeChild(this._.stage);  // 移除Canvas元素

  // 如果有媒体元素，解绑事件监听器
  if (this.media) {
    unbindEvents.call(this, this._.listener);
  }

  // 移除右键菜单监听
  if (this._.copyMenuHandlers) {
    try { document.removeEventListener('contextmenu', this._.copyMenuHandlers.onContext, true); } catch (_) { }
    try { document.removeEventListener('click', this._.copyMenuHandlers.onDocClick, true); } catch (_) { }
    try { document.removeEventListener('scroll', this._.copyMenuHandlers.onScroll, true); } catch (_) { }
  }
  if (this._.copyMenu && this._.copyMenu.parentElement) {
    try { this._.copyMenu.parentElement.removeChild(this._.copyMenu); } catch (_) { }
  }

  // 清空所有属性
  for (var key in this) {
    /* istanbul ignore else  */
    if (Object.prototype.hasOwnProperty.call(this, key)) {
      this[key] = null;
    }
  }
  return this;
}

function emit(obj) { return emitExternal.call(this, obj); }

/**
 * 显示弹幕
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function show() {
  if (this._.visible) {
    return this;
  }
  this._.visible = true;
  // 始终执行 seek 以重建运行列表并触发回填逻辑（即使媒体处于暂停状态）
  // 这样在 hide() -> show() 且视频暂停时，也能看到当前时间窗口内应在屏幕上的弹幕
  var self = this;
  var p = this._.fontReadyPromise || Promise.resolve();
  p.then(function () {
    seek.call(self);
    // 如果媒体正在播放则恢复动画帧；若暂停则 seek 内部已静态渲染一帧
    if (!(self.media && self.media.paused)) {
      play.call(self);
    }
  });
  return this;
}

/**
 * 隐藏弹幕
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function hide() {
  if (!this._.visible) {
    return this;
  }
  pause.call(this);
  this.clear();
  this._.visible = false;
  return this;
}

/**
 * 清空当前显示的所有弹幕
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function clear$1() {
  this._.engine.clear(this._.stage, this._.runningList);
  this._.runningList = [];
  return this;
}

/**
 * 重新调整弹幕容器尺寸
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function resize$1() {
  this._.width = this.container.offsetWidth;
  this._.height = this.container.offsetHeight;
  this._.engine.resize(this._.stage, this._.width, this._.height);
  this._.duration = this._.width / this._.speed;  // 重新计算持续时间
  return this;
}

/**
 * 弹幕滚动速度属性描述符
 * 提供getter和setter方法
 */
var speed = {
  /**
   * 获取当前滚动速度
   * @returns {number} 当前速度值
   */
  get: function () {
    return this._.speed;
  },
  /**
   * 设置滚动速度
   * @param {number} s - 新的速度值
   * @returns {number} 设置后的速度值
   */
  set: function (s) {
    if (typeof s !== 'number' ||
      isNaN(s) ||
      !isFinite(s) ||
      s <= 0) {
      return this._.speed;  // 无效值时返回当前速度
    }
    this._.speed = s;
    if (this._.width) {
      this._.duration = this._.width / s;  // 重新计算持续时间
    }
    return s;
  }
};

/**
 * 弹幕构造函数
 * @param {Object} [opt] - 初始化选项
 * @constructor
 */
function Danmaku(opt) {
  opt && init$1.call(this, opt);
}

// 原型方法定义
Danmaku.prototype.destroy = function () {
  return destroy.call(this);
};
Danmaku.prototype.emit = function (cmt) {
  return emit.call(this, cmt);
};
Danmaku.prototype.show = function () {
  return show.call(this);
};
Danmaku.prototype.hide = function () {
  return hide.call(this);
};
Danmaku.prototype.clear = function () {
  return clear$1.call(this);
};
Danmaku.prototype.resize = function () {
  return resize$1.call(this);
};

// 对实例暴露字体加载器（语义代理）
Danmaku.prototype.ensureRemoteFontLoaded = function (url) {
  return ensureRemoteFontLoaded(url);
};

// 定义speed属性的getter和setter
Object.defineProperty(Danmaku.prototype, 'speed', speed);

// 暴露为内部方法（如果未来需要外部开关）
Danmaku.prototype._setupCopyContextMenu = function () { setupCopyContextMenu.call(this); };

/**
 * 原地替换整批弹幕数据，预处理完成后一次性切换，尽量减少可见空窗。
 * @param {Array} newComments 新的弹幕数组（元素需包含 time / text / mode 等）
 * @param {Object} [opt]
 * @param {boolean} [opt.preserveState=true] 是否保持当前播放/暂停与显示状态
 * @param {boolean} [opt.resetCopyMenu=false] 是否重建右键菜单（一般不需要）
 * @returns {Danmaku} this
 */
Danmaku.prototype.replaceComments = function (newComments, opt) {
  opt = opt || {};
  if (!Array.isArray(newComments)) return this;
  // 拷贝 & 排序 & 标准化（不修改传入数组引用）
  var prepared = newComments.slice();
  prepared.sort(function (a, b) { return (a.time || 0) - (b.time || 0); });
  for (var i = 0; i < prepared.length; i++) {
    var c = prepared[i];
    c.mode = formatMode(c.mode);
    // 规范 text
    c.text = (c.text == null ? '' : String(c.text));
  }

  // 计算当前参考时间
  var media = this.media;
  var ct = media ? media.currentTime : (now() / 1000);
  var duration = this._.duration || 4;
  var windowStart = ct - duration;

  // 预建空间/运行列表（不影响现有实例状态）
  var newSpace = {};
  resetSpace(newSpace);
  var visibleList = [];

  // 二分找到显示窗口起点
  var startIndex = binsearch(prepared, 'time', windowStart) - 1; // bins 返回插入点，前一条可能仍在窗口
  if (startIndex < -1) startIndex = -1;
  var idx = startIndex + 1;
  var dn = now() / 1000;
  var pbr = media ? (media.playbackRate || 1) : 1;
  // 临时上下文用于 allocate
  var tempCtx = {
    media: media,
    _: {
      duration: duration,
      width: this._.width,
      height: this._.height,
      space: newSpace
    }
  };
  // 需要字体尺寸用于 createCommentCanvas
  var fontSize = this._.stage ? this._.stage._fontSize : { root: 16, container: 16 };

  while (idx < prepared.length) {
    var cm = prepared[idx];
    var t = cm.time || 0;
    if (t > ct) break; // 之后都是未来弹幕
    if (t >= windowStart) {
      // 预创建 canvas
      try { cm.canvas = createCommentCanvas(cm, fontSize); } catch (e) { cm.canvas = null; }
      // 计算 _utc 以保持位置连贯
      cm._utc = dn - (ct - t);
      // 分配 y
      try { cm.y = allocate.call(tempCtx, cm); } catch (e) { cm.y = 0; }
      visibleList.push(cm);
    }
    idx++;
  }

  // 计算新的 position（下一条待进入的索引）
  var position = binsearch(prepared, 'time', ct) - 1; // 与 seek 中逻辑保持一致
  if (position < 0) position = 0;
  // NOTE: engine 在帧循环里会 ++position 后读取，保持与内部一致性

  var wasPaused = this._.paused;
  var wasVisible = this._.visible;
  // 暂停动画循环（如果在运行）
  if (!wasPaused) {
    try { caf(this._.requestID); } catch (_) { }
    this._.requestID = 0;
    // 关键修复：原来未将 paused 置回 true，随后调用 play() 会因 this._.paused===false 直接返回，导致动画不再恢复。
    // 这里显式标记为暂停状态，使 play() 能重新建立 rAF 循环。
    this._.paused = true;
  }

  // 原子替换内部结构
  this.comments = prepared;
  this._.space = newSpace;
  this._.runningList = visibleList; // 立即可渲染列表
  this._.position = position; // 下次帧循环从此处继续

  // 清帧并静态渲染一帧（避免空白）
  try {
    this._.engine.framing(this._.stage);
    for (var ri = 0; ri < visibleList.length; ri++) {
      var vc = visibleList[ri];
      // 根据模式计算 x（复制 engine 内逻辑）
      var baseW = (typeof vc._baseWidth === 'number' && isFinite(vc._baseWidth)) ? vc._baseWidth : vc.width;
      var totalWidth = this._.width + baseW;
      var elapsed = totalWidth * (dn - vc._utc) * pbr / duration;
      if (vc.mode === 'ltr') vc.x = elapsed - baseW;
      if (vc.mode === 'rtl') vc.x = this._.width - elapsed;
      if (vc.mode === 'top' || vc.mode === 'bottom') {
        if (vc._markDisplay && typeof vc._textWidth === 'number' && typeof vc._textLeft === 'number') {
          var __tc = vc._textLeft + vc._textWidth / 2;
          vc.x = (this._.width / 2) - __tc;
        } else {
          vc.x = (this._.width - vc.width) >> 1;
        }
      }
      this._.engine.render(this._.stage, vc);
    }
  } catch (e) { /* ignore */ }

  // 恢复播放状态
  if (wasVisible) {
    if (!wasPaused) {
      // 继续动画
      play.call(this);
    } else {
      // 暂停但可见：保持静态帧即可
    }
  }

  // 可选重建右键菜单（通常不需要）
  if (opt.resetCopyMenu && this._.enableCopyMenu) {
    try { this._setupCopyContextMenu(); } catch (_) { }
  }
  return this;
};

export default Danmaku;