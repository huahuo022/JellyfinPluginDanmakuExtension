/**
 * 自动检测浏览器支持的CSS Transform属性
 * 兼容不同浏览器的前缀版本
 */
var transform = (function () {
  /* istanbul ignore next */
  if (typeof document === 'undefined') return 'transform';
  var properties = [
    'oTransform', // Opera 11.5
    'msTransform', // IE 9
    'mozTransform',
    'webkitTransform',
    'transform'
  ];
  var style = document.createElement('div').style;
  for (var i = 0; i < properties.length; i++) {
    /* istanbul ignore else */
    if (properties[i] in style) {
      return properties[i];
    }
  }
  /* istanbul ignore next */
  return 'transform';
}());

/**
 * 获取设备像素比，用于高分辨率屏幕适配
 */
var dpr = typeof window !== 'undefined' && window.devicePixelRatio || 1;

/**
 * Canvas高度缓存，避免重复计算字体高度
 */
var canvasHeightCache = Object.create(null);

/**
 * 远程字体支持（/danmaku/font/ 前缀）
 * - 使用 FontFace 动态加载
 * - 通过 Jellyfin ApiClient.getUrl 生成绝对地址
 * - 结果缓存在模块级 fontCache 中
 * - 加载失败回退到系统 sans-serif
 */
function __getGlobal() {
  try {
    // eslint-disable-next-line no-return-assign
    return (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {});
  } catch (_) {
    return {};
  }
}

// 字体缓存
var fontCache = Object.create(null);

function __normalizeRel(path) {
  // 去除开头的 '/'
  return (path || '').replace(/^\/+/, '');
}


/**
 * 确保以 /danmaku/font/ 开头的字体已加载至 document.fonts
 * @param {string} urlPath 形如 /danmaku/font/DejaVuSans.ttf
 * @returns {Promise<string|null>} 解析为字体家族名或 null
 */
function ensureRemoteFontLoaded(urlPath) {
  try {
    if (!urlPath || typeof urlPath !== 'string' || urlPath.indexOf('/danmaku/font/') !== 0) return Promise.resolve(null);
    var cache = fontCache;
    if (cache[urlPath] && cache[urlPath].status === 'loaded') {
      return Promise.resolve(cache[urlPath].family);
    }
    if (cache[urlPath] && cache[urlPath].status === 'loading' && cache[urlPath].promise) {
      return cache[urlPath].promise;
    }

    var filename = (urlPath.split('/').pop() || 'RemoteFont');
    var base = filename.replace(/\.[a-z0-9]+$/i, '');
    var family = 'JFDanmaku_' + base;
    var rel = __normalizeRel(urlPath);
    var absUrl = rel;
    try {
      if (typeof ApiClient !== 'undefined' && ApiClient.getUrl) {
        absUrl = ApiClient.getUrl(rel);
      }
    } catch (_) { /* ignore */ }

    // 优先从 Cache Storage 读取；否则网络获取，并将结果写入缓存
    var p = (async function () {
      try {
        var useCaches = (typeof caches !== 'undefined' && caches.open);
        var arrBuf = null;
        var typeHint = 'font/ttf';
        if (useCaches) {
          try {
            var c = await caches.open('jfdanmaku-fonts-v1');
            var req = new Request(absUrl, { credentials: 'same-origin', mode: 'cors' });
            var hit = await c.match(req);
            if (hit) {
              arrBuf = await hit.arrayBuffer();
              typeHint = hit.headers.get('content-type') || typeHint;
            }
          } catch (_) { }
        }

        if (!arrBuf) {
          var resp = await fetch(absUrl, { credentials: 'same-origin', mode: 'cors' });
          if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
          // 写入缓存（不阻塞）
          try {
            if (useCaches) {
              var c2 = await caches.open('jfdanmaku-fonts-v1');
              await c2.put(new Request(absUrl, { credentials: 'same-origin', mode: 'cors' }), resp.clone());
            }
          } catch (_) { }
          typeHint = resp.headers.get('content-type') || typeHint;
          arrBuf = await resp.arrayBuffer();
        }

        // 用 Blob URL 创建 FontFace，避免大数组 btoa 堆栈溢出
        var blob = new Blob([arrBuf], { type: typeHint });
        var objUrl = (URL && URL.createObjectURL) ? URL.createObjectURL(blob) : null;
        var ff = new FontFace(family, objUrl ? ("url(" + objUrl + ")") : ("url(" + absUrl + ")"), { style: 'normal', display: 'swap' });
        var loaded = await ff.load();
        try { document.fonts.add(loaded); } catch (_) { }
        try { if (objUrl && URL && URL.revokeObjectURL) URL.revokeObjectURL(objUrl); } catch (_) { }
        cache[urlPath] = { status: 'loaded', family: family, fontFace: loaded };
        return family;
      } catch (err) {
        cache[urlPath] = { status: 'failed', error: String(err) };
        return null;
      }
    })();
    cache[urlPath] = { status: 'loading', family: family, promise: p };
    return p;
  } catch (e) {
    return Promise.resolve(null);
  }
}

// 将加载器暴露到全局，便于设置页等直接调用
try { __getGlobal().ensureRemoteFontLoaded = ensureRemoteFontLoaded; } catch (_) { }

/**
 * 若 style.font 中包含 /danmaku/font/ 路径，则在可用时替换为已加载的家族名；失败则替换为 sans-serif。
 * 注意：该操作是就地修改 style.font。
 */
function maybeRewriteStyleFont(style) {
  try {
    if (!style || !style.font || typeof style.font !== 'string') return;
    if (style.font.indexOf('/danmaku/font/') === -1) return;
    var m = style.font.match(/\/danmaku\/font\/[^"',)\s]+/);
    if (!m) return;
    var url = m[0];
    var cache = fontCache;
    if (cache[url] && cache[url].status === 'loaded' && cache[url].family) {
      var fam = cache[url].family;
      style.font = style.font.replace(url, "'" + fam + "'");
      return;
    }
  // 未加载或加载失败：用安全的回退字体替换占位，保留原字号/行高，避免 Canvas 解析为 10px
  style.font = style.font.replace(url, 'sans-serif');
  // 仍然异步尝试加载；加载成功后，后续新建弹幕会使用已加载的家族名
  ensureRemoteFontLoaded(url);
  } catch (_) { /* ignore */ }
}

/**
 * 计算字体在Canvas中的实际高度
 * @param {string} font - CSS字体样式字符串
 * @param {Object} fontSize - 字体大小配置对象
 * @returns {number} 计算后的字体高度
 */
function canvasHeight(font, fontSize) {
  // 如果已缓存则直接返回
  if (canvasHeightCache[font]) {
    return canvasHeightCache[font];
  }
  var height = 12;
  // 匹配CSS字体样式的正则表达式
  var regex = /(\d+(?:\.\d+)?)(px|%|em|rem)(?:\s*\/\s*(\d+(?:\.\d+)?)(px|%|em|rem)?)?/;
  var p = font.match(regex);
  if (p) {
    var fs = p[1] * 1 || 10;    // 字体大小
    var fsu = p[2];             // 字体大小单位
    var lh = p[3] * 1 || 1.2;   // 行高
    var lhu = p[4];             // 行高单位

    // 根据不同单位转换字体大小
    if (fsu === '%') fs *= fontSize.container / 100;
    if (fsu === 'em') fs *= fontSize.container;
    if (fsu === 'rem') fs *= fontSize.root;

    // 根据不同单位计算行高
    if (lhu === 'px') height = lh;
    if (lhu === '%') height = fs * lh / 100;
    if (lhu === 'em') height = fs * lh;
    if (lhu === 'rem') height = fontSize.root * lh;
    if (lhu === undefined) height = fs * lh;
  }
  // 缓存计算结果
  canvasHeightCache[font] = height;
  return height;
}

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
 * 计算指定元素的字体大小（以px为单位）
 * @param {HTMLElement} el - 目标元素
 * @returns {number} 字体大小的像素值
 */
function computeFontSize(el) {
  return window
    .getComputedStyle(el, null)
    .getPropertyValue('font-size')
    .match(/(.+)px/)[1] * 1;
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
  stage.context.drawImage(cmt.canvas, cmt.x * dpr, cmt.y * dpr);
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
 * 二分查找算法
 * 在已排序数组中查找指定属性值的位置
 * @param {Array} arr - 已排序的数组
 * @param {string} prop - 要比较的属性名
 * @param {*} key - 要查找的值
 * @returns {number} 插入位置的索引
 */
function binsearch(arr, prop, key) {
  try { console.log(LOG_PREFIX, 'binsearch: start', { length: arr && arr.length, prop: prop, key: key }); } catch (e) { }
  // 返回插入位置 (0..arr.length)
  var left = 0;
  var right = arr.length; // 区间: [left, right)
  while (left < right) {
    var mid = (left + right) >> 1;
    var v = arr[mid][prop];
    if (v <= key) {
      left = mid + 1; // 插入点在右侧
    } else {
      right = mid;
    }
  }
  // left 即为插入点
  try { console.log(LOG_PREFIX, 'binsearch: end', { insertion: left }); } catch (e) { }
  return left;
}
/**
 * 格式化弹幕模式
 * @param {string} mode - 弹幕模式
 * @returns {string} 标准化的弹幕模式
 */
function formatMode(mode) {
  // 只允许左到右、顶部、底部三种模式，其他默认为右到左
  if (!/^(ltr|top|bottom)$/i.test(mode)) {
    return 'rtl';
  }
  return mode.toLowerCase();
}

/**
 * 创建碰撞检测范围的初始边界
 * @returns {Array} 包含初始和结束边界的数组
 */
function collidableRange() {
  var max = 9007199254740991; // JavaScript最大安全整数
  return [
    { range: 0, time: -max, width: max, height: 0 },      // 起始边界
    { range: max, time: max, width: 0, height: 0 }        // 结束边界
  ];
}

/**
 * 重置弹幕空间分配器
 * @param {Object} space - 空间分配对象
 */
function resetSpace(space) {
  space.ltr = collidableRange();     // 左到右弹幕空间
  space.rtl = collidableRange();     // 右到左弹幕空间
  space.top = collidableRange();     // 顶部弹幕空间
  space.bottom = collidableRange();  // 底部弹幕空间
}

/**
 * 获取当前时间戳
 * 优先使用高精度计时器，降级为Date.now()
 * @returns {number} 当前时间戳（毫秒）
 */
function now() {
  return typeof window.performance !== 'undefined' && window.performance.now
    ? window.performance.now()
    : Date.now();
}

/**
 * 为弹幕分配显示位置（避免碰撞）
 * @param {Object} cmt - 弹幕对象
 * @returns {number} 分配的Y坐标位置
 */
/* eslint no-invalid-this: 0 */
function allocate(cmt) {
  var that = this;
  var ct = this.media ? this.media.currentTime : now() / 1000;  // 当前时间
  var pbr = this.media ? this.media.playbackRate : 1;           // 播放速率

  /**
   * 判断两个弹幕是否会发生碰撞
   * @param {Object} cr - 已存在的弹幕
   * @param {Object} cmt - 新弹幕
   * @returns {boolean} 是否会碰撞
   */
  function willCollide(cr, cmt) {
    // 顶部和底部弹幕只需要检查时间重叠
    if (cmt.mode === 'top' || cmt.mode === 'bottom') {
      return ct - cr.time < that._.duration;
    }

    // 滚动弹幕需要计算运动轨迹
    var crTotalWidth = that._.width + cr.width;
    var crElapsed = crTotalWidth * (ct - cr.time) * pbr / that._.duration;
    if (cr.width > crElapsed) {
      return true;
    }

    // RTL模式：计算右端移出左侧的时间
    var crLeftTime = that._.duration + cr.time - ct;
    var cmtTotalWidth = that._.width + cmt.width;
    var cmtTime = that.media ? cmt.time : cmt._utc;
    var cmtElapsed = cmtTotalWidth * (ct - cmtTime) * pbr / that._.duration;
    var cmtArrival = that._.width - cmtElapsed;

    // RTL模式：计算左端到达左侧的时间
    var cmtArrivalTime = that._.duration * cmtArrival / (that._.width + cmt.width);
    return crLeftTime > cmtArrivalTime;
  }

  var crs = this._.space[cmt.mode];  // 获取对应模式的空间数组
  var last = 0;
  var curr = 0;

  // 寻找合适的插入位置
  for (var i = 1; i < crs.length; i++) {
    var cr = crs[i];
    var requiredRange = cmt.height;
    if (cmt.mode === 'top' || cmt.mode === 'bottom') {
      requiredRange += cr.height;
    }

    // 检查是否有足够空间
    if (cr.range - cr.height - crs[last].range >= requiredRange) {
      curr = i;
      break;
    }

    // 检查碰撞
    if (willCollide(cr, cmt)) {
      last = i;
    }
  }

  var channel = crs[last].range;
  // 创建新的碰撞记录
  var crObj = {
    range: channel + cmt.height,
    time: this.media ? cmt.time : cmt._utc,
    width: cmt.width,
    height: cmt.height
  };
  crs.splice(last + 1, curr - last - 1, crObj);

  // 底部弹幕需要从下往上计算位置
  if (cmt.mode === 'bottom') {
    return this._.height - cmt.height - channel % this._.height;
  }
  return channel % (this._.height - cmt.height);
}

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

    // 移除过期的弹幕
    for (i = this._.runningList.length - 1; i >= 0; i--) {
      cmt = this._.runningList[i];
      cmtt = this.media ? cmt.time : cmt._utc;
      if (ct - cmtt > this._.duration) {
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
      var totalWidth = this._.width + cmt.width;
      var elapsed = totalWidth * (dn - cmt._utc) * pbr / this._.duration;

      // 根据弹幕模式计算X坐标
      if (cmt.mode === 'ltr') cmt.x = elapsed - cmt.width;        // 左到右
      if (cmt.mode === 'rtl') cmt.x = this._.width - elapsed;     // 右到左
      if (cmt.mode === 'top' || cmt.mode === 'bottom') {          // 顶部/底部居中
        cmt.x = (this._.width - cmt.width) >> 1;
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
function ratechange() {
  if (!this.media) return this;
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
  var dn = now() / 1000;
  for (var i = 0; i < this._.runningList.length; i++) {
    var c = this._.runningList[i];
    c._utc = dn - (dn - c._utc) * oldRate / newRate;
  }
  this._.lastPbr = newRate;
  return this;
}

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
    try {
      var ct = this.media.currentTime;
      var windowStart = Math.max(0, ct - (this._.backfillDuration || this._.duration));
      // 找到窗口起点索引（第一个 > windowStart 的插入点 -> 前一个即 <= windowStart）
      var wsIndex = binsearch(this.comments, 'time', windowStart) - 1;
      if (wsIndex < -1) wsIndex = -1;
      var start = wsIndex + 1;
      var end = position; // 不含 position (position 为第一个 > ct 的插入点)
      var pool = [];
      for (var i = start; i < end; i++) {
        var c = this.comments[i];
        // 过滤：仅回填真正落在窗口内的；并限制数量
        if (c.time <= ct && c.time >= windowStart) {
          pool.push(c);
          if (this._.maxBackfill && pool.length >= this._.maxBackfill) break;
        }
      }
      if (pool.length) {
        // 创建 canvas（避免首帧重复 setup）
        this._.engine.setup(this._.stage, pool);
        var dn = now() / 1000;
        for (var j = 0; j < pool.length; j++) {
          var cmt = pool[j];
          // 复现其 _utc：等价于正常进入时的计算，使滚动位置正确
          cmt._utc = dn - (ct - cmt.time);
          // 分配 Y（按时间顺序保证占道逻辑正确）
          cmt.y = allocate.call(this, cmt);
          this._.runningList.push(cmt);
        }
        // 为避免 engine 再次把这些回填的弹幕判定为“待进入”，直接将游标推进到 position
        this._.position = position;

        // 如果当前是暂停状态（或可见但未播放），需要立即渲染一个静态帧，否则用户看不到回填结果
        if (this._.paused || (this.media && this.media.paused)) {
          try {
            // 清帧
            this._.engine.framing(this._.stage);
            var pbr = this.media ? this.media.playbackRate : 1;
            for (var k = 0; k < this._.runningList.length; k++) {
              var rc = this._.runningList[k];
              var totalWidth = this._.width + rc.width;
              // 使用 media.currentTime 保持与真正播放时的一致位置
              var elapsed = totalWidth * (ct - rc.time) * pbr / this._.duration;
              if (rc.mode === 'ltr') rc.x = elapsed - rc.width;
              if (rc.mode === 'rtl') rc.x = this._.width - elapsed;
              if (rc.mode === 'top' || rc.mode === 'bottom') rc.x = (this._.width - rc.width) >> 1;
              this._.engine.render(this._.stage, rc);
            }
          } catch (re) { try { console.warn('[Danmaku] seek backfill static render error', re); } catch (_) { } }
        }
      }
    } catch (e) {
      try { console.warn('[Danmaku] seek backfill error', e); } catch (_) { }
    }
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
  // 全局设置中的 font_family 若为 /danmaku/font/
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

/**
 * 弹幕对象的有效属性列表
 */
var properties = ['mode', 'time', 'text', 'render', 'style'];

/**
 * 发送新弹幕
 * @param {Object} obj - 弹幕对象
 * @param {string} [obj.mode] - 弹幕模式 (rtl/ltr/top/bottom)
 * @param {number} [obj.time] - 显示时间
 * @param {string} obj.text - 弹幕文本
 * @param {Function} [obj.render] - 自定义渲染函数
 * @param {Object} [obj.style] - 样式对象
 * @returns {Object} 弹幕实例（支持链式调用）
 */
/* eslint-disable no-invalid-this */
function emit(obj) {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') {
    return this;
  }

  var cmt = {};
  // 只保留有效属性
  for (var i = 0; i < properties.length; i++) {
    if (obj[properties[i]] !== undefined) {
      cmt[properties[i]] = obj[properties[i]];
    }
  }

  cmt.text = (cmt.text || '').toString();  // 确保文本为字符串
  cmt.mode = formatMode(cmt.mode);         // 格式化模式
  cmt._utc = now() / 1000;                 // 设置UTC时间

  if (this.media) {
    var position = 0;
    if (cmt.time === undefined) {
      // 如果未指定时间，使用当前媒体时间
      cmt.time = this.media.currentTime;
      position = this._.position;
    } else {
      // 查找插入位置
      position = binsearch(this.comments, 'time', cmt.time);
      if (position < this._.position) {
        this._.position += 1;  // 更新当前位置
      }
    }
    this.comments.splice(position, 0, cmt);
  } else {
    this.comments.push(cmt);
  }
  return this;
}

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

/**
 * 命中检测：在当前运行列表中找到与点击坐标匹配的弹幕
 * @param {number} x 相对 stage 左上角坐标
 * @param {number} y 相对 stage 左上角坐标
 */
function hitDanmaku(x, y) {
  // 从最上层(后绘制)开始，便于选择视觉上前景的弹幕
  for (var i = this._.runningList.length - 1; i >= 0; i--) {
    var c = this._.runningList[i];
    if (x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height) return c;
  }
  return null;
}

/**
 * 创建右键复制菜单
 */
function setupCopyContextMenu() {
  var that = this;
  if (this._.copyMenuHandlers) return; // 已初始化
  var menu = document.createElement('div');
  menu.style.position = 'fixed';
  menu.style.zIndex = '2147483646';
  menu.style.background = 'rgba(30,30,30,0.95)';
  menu.style.backdropFilter = 'blur(4px)';
  menu.style.border = '1px solid rgba(255,255,255,0.15)';
  menu.style.borderRadius = '6px';
  menu.style.padding = '4px 0';
  menu.style.minWidth = '96px';
  menu.style.font = '12px/1.4 system-ui, sans-serif';
  menu.style.color = '#f0f0f0';
  menu.style.boxShadow = '0 4px 18px rgba(0,0,0,0.4)';
  menu.style.userSelect = 'none';
  menu.style.display = 'none';
  menu.setAttribute('data-danmaku-copy-menu', '');

  // 预览框（显示被命中的弹幕文本）
  var preview = document.createElement('div');
  preview.style.padding = '6px 10px 6px 10px';
  preview.style.fontSize = '12px';
  preview.style.lineHeight = '1.35';
  preview.style.color = '#e5f6ff';
  preview.style.maxWidth = '360px';
  preview.style.maxHeight = '120px';
  preview.style.overflow = 'auto';
  preview.style.wordBreak = 'break-all';
  preview.style.whiteSpace = 'pre-wrap';
  preview.style.borderBottom = '1px solid rgba(255,255,255,0.08)';
  preview.style.boxSizing = 'border-box';
  preview.setAttribute('data-danmaku-preview', '');
  menu.appendChild(preview);

  function addItem(label, onClick) {
    var item = document.createElement('div');
    item.textContent = label;
    item.style.padding = '4px 12px';
    item.style.cursor = 'pointer';
    item.style.whiteSpace = 'nowrap';
    item.addEventListener('mouseenter', function () { item.style.background = 'rgba(255,255,255,0.08)'; });
    item.addEventListener('mouseleave', function () { item.style.background = 'transparent'; });
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      try { onClick(); } catch (_) { }
      hideMenu();
    });
    // 备用：提供 mousedown 触发兼容（不再打印日志）
    item.addEventListener('mousedown', function (e) { if (e.button !== 0) return; });
    menu.appendChild(item);
  }

  var currentCmt = null;

  function hideMenu() {
    menu.style.display = 'none';
    currentCmt = null;
  }

  addItem('复制', function () {
    if (!currentCmt) return;
    var text = currentCmt.text || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        var p = navigator.clipboard.writeText(text);
        if (p && typeof p.then === 'function') {
          p.then(function () {
          }).catch(function (err) {
            // 降级时输出一次警告
            console.warn('[Danmaku] copy async failed, fallback to execCommand', err);
            fallbackCopy(text);
          });
        }
      } else {
        fallbackCopy(text);
      }
    } catch (err) {
      console.warn('[Danmaku] copy threw, fallback', err);
      try { fallbackCopy(text); } catch (_) { }
    }
  });

  document.body.appendChild(menu);
  this._.copyMenu = menu;

  function showAt(x, y) {
    // 防溢出
    var vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(x, vw - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, vh - menu.offsetHeight - 4) + 'px';
    menu.style.display = 'block';
  }

  function onContext(e) {
    // 仅当点击区域覆盖在 stage 上方才检测
    if (!that._.stage || !that._.stage.parentElement) return;
    // 允许其他右键操作通过：如果点击目标在复制菜单内部直接返回
    if (menu.contains(e.target)) return;
    var rect = that._.stage.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return; // 不在画布区域
    // 进行命中检测
    var cmt = hitDanmaku.call(that, x, y);
    if (!cmt) return; // 没有弹幕，不拦截
    if (menu.style.display === 'block') menu.style.display = 'none';
    currentCmt = cmt;
    preview.textContent = cmt.text || '';
    e.preventDefault();
    e.stopPropagation();
    menu.style.display = 'block';
    showAt(e.clientX, e.clientY);
  }

  function onScroll() { hideMenu(); }
  function onDocClickWrapped(e) { if (!menu.contains(e.target)) hideMenu(); }

  document.addEventListener('contextmenu', onContext, true); // 仍用捕获，优先拦截
  document.addEventListener('click', onDocClickWrapped, false); // 改为冒泡，避免抢先隐藏
  document.addEventListener('scroll', onScroll, true);
  this._.copyMenuHandlers = { onContext, onDocClick: onDocClickWrapped, onScroll };

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.top = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { console.warn('[Danmaku] execCommand copy error', e); }
      document.body.removeChild(ta);
    } catch (e) { console.warn('[Danmaku] fallback copy failed', e); }
  }
}

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
      var totalWidth = this._.width + vc.width;
      var elapsed = totalWidth * (dn - vc._utc) * pbr / duration;
      if (vc.mode === 'ltr') vc.x = elapsed - vc.width;
      if (vc.mode === 'rtl') vc.x = this._.width - elapsed;
      if (vc.mode === 'top' || vc.mode === 'bottom') vc.x = (this._.width - vc.width) >> 1;
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