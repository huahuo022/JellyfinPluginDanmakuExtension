// 字体处理相关的工具函数：远程字体加载、字体占位重写、字体高度计算、获取元素字体大小

// Canvas高度缓存，避免重复计算字体高度
var canvasHeightCache = Object.create(null);

// 字体缓存：记录 /danmaku/font/ 路径加载状态与家族名
var fontCache = Object.create(null);

function __normalizeRel(path) {
  return (path || '').replace(/^\/+/, '');
}

/**
 * 确保以 /danmaku/font/ 开头的字体已加载至 document.fonts
 * @param {string} urlPath 形如 /danmaku/font/DejaVuSans.ttf
 * @returns {Promise<string|null>} 解析为字体家族名或 null
 */
export function ensureRemoteFontLoaded(urlPath) {
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
          try {
            if (useCaches) {
              var c2 = await caches.open('jfdanmaku-fonts-v1');
              await c2.put(new Request(absUrl, { credentials: 'same-origin', mode: 'cors' }), resp.clone());
            }
          } catch (_) { }
          typeHint = resp.headers.get('content-type') || typeHint;
          arrBuf = await resp.arrayBuffer();
        }

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

/**
 * 若 style.font 中包含 /danmaku/font/ 路径，则在可用时替换为已加载的家族名；失败则替换为 sans-serif。
 * 注意：该操作是就地修改 style.font。
 */
export function maybeRewriteStyleFont(style) {
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
    // 未加载或加载失败：用安全的回退字体替换占位，并异步尝试加载
    style.font = style.font.replace(url, 'sans-serif');
    ensureRemoteFontLoaded(url);
  } catch (_) { /* ignore */ }
}

/**
 * 计算字体在Canvas中的实际高度
 * @param {string} font - CSS字体样式字符串
 * @param {Object} fontSize - 字体大小配置对象 { root: px, container: px }
 * @returns {number} 高度
 */
export function canvasHeight(font, fontSize) {
  if (canvasHeightCache[font]) {
    return canvasHeightCache[font];
  }
  var height = 12;
  var regex = /(\d+(?:\.\d+)?)(px|%|em|rem)(?:\s*\/\s*(\d+(?:\.\d+)?)(px|%|em|rem)?)?/;
  var p = font.match(regex);
  if (p) {
    var fs = p[1] * 1 || 10;
    var fsu = p[2];
    var lh = p[3] * 1 || 1.2;
    var lhu = p[4];

    if (fsu === '%') fs *= fontSize.container / 100;
    if (fsu === 'em') fs *= fontSize.container;
    if (fsu === 'rem') fs *= fontSize.root;

    if (lhu === 'px') height = lh;
    if (lhu === '%') height = fs * lh / 100;
    if (lhu === 'em') height = fs * lh;
    if (lhu === 'rem') height = fontSize.root * lh;
    if (lhu === undefined) height = fs * lh;
  }
  canvasHeightCache[font] = height;
  return height;
}

/**
 * 计算指定元素的字体大小（px）
 * @param {HTMLElement} el
 * @returns {number}
 */
export function computeFontSize(el) {
  return window
    .getComputedStyle(el, null)
    .getPropertyValue('font-size')
    .match(/(.+)px/)[1] * 1;
}
