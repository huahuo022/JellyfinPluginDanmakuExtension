// 右键复制菜单模块：导出 setupCopyContextMenu（基于 this 上下文）

/**
 * 在当前运行列表中找到与点击坐标匹配的弹幕（从上层往下）
 * @this any 期望为 Danmaku 实例
 */
function hitDanmaku(x, y) {
  for (var i = this._.runningList.length - 1; i >= 0; i--) {
    var c = this._.runningList[i];
    if (x >= c.x && x <= c.x + c.width && y >= c.y && y <= c.y + c.height) return c;
  }
  return null;
}

/**
 * 创建右键复制菜单并绑定到 document（捕获阶段）
 * @this any 期望为 Danmaku 实例
 */
export function setupCopyContextMenu() {
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
    item.addEventListener('mousedown', function (e) { if (e.button !== 0) return; });
    menu.appendChild(item);
  }

  var currentCmt = null;
  function hideMenu() { menu.style.display = 'none'; currentCmt = null; }

  addItem('复制', function () {
    if (!currentCmt) return;
    var text = currentCmt.text || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        var p = navigator.clipboard.writeText(text);
        if (p && typeof p.then === 'function') {
          p.then(function () { }).catch(function (err) {
            try { console.warn('[Danmaku] copy async failed, fallback to execCommand', err); } catch (_) { }
            fallbackCopy(text);
          });
        }
      } else {
        fallbackCopy(text);
      }
    } catch (err) {
      try { console.warn('[Danmaku] copy threw, fallback', err); } catch (_) { }
      try { fallbackCopy(text); } catch (_) { }
    }
  });

  document.body.appendChild(menu);
  this._.copyMenu = menu;

  function showAt(x, y) {
    var vw = window.innerWidth, vh = window.innerHeight;
    menu.style.left = Math.min(x, vw - menu.offsetWidth - 4) + 'px';
    menu.style.top = Math.min(y, vh - menu.offsetHeight - 4) + 'px';
    menu.style.display = 'block';
  }

  function onContext(e) {
    if (!that._.stage || !that._.stage.parentElement) return;
    if (menu.contains(e.target)) return;
    var rect = that._.stage.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    var cmt = hitDanmaku.call(that, x, y);
    if (!cmt) return;
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

  document.addEventListener('contextmenu', onContext, true);
  document.addEventListener('click', onDocClickWrapped, false);
  document.addEventListener('scroll', onScroll, true);
  this._.copyMenuHandlers = { onContext, onDocClick: onDocClickWrapped, onScroll };

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.top = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) { try { console.warn('[Danmaku] execCommand copy error', e); } catch (_) { } }
      document.body.removeChild(ta);
    } catch (e) { try { console.warn('[Danmaku] fallback copy failed', e); } catch (_) { } }
  }
}
