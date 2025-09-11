// 弹幕来源信息查看对话框
// 展示来源名称、类型、原始 source 文本；若 source 以 http/https 开头，提供可点击链接
export class SourceInfoDialog {
  constructor(logger = null) {
    this.logger = logger;
  }

  async show(ball, panel = null) {
    try {
      if (!ball) return;
      // 遮罩
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0,0,0,.5)';
      overlay.style.zIndex = '1000000';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      // 对话框容器（沿用 ExtSourceDialog 风格）
      const dialog = document.createElement('div');
      dialog.style.background = 'rgba(0,0,0,.86)';
      dialog.style.backdropFilter = 'blur(6px)';
      dialog.style.border = '1px solid rgba(255,255,255,.18)';
      dialog.style.borderRadius = '10px';
      dialog.style.boxShadow = '0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5)';
      dialog.style.padding = '16px 18px 14px';
      dialog.style.color = '#fff';
      dialog.style.fontSize = '12px';
      dialog.style.width = 'clamp(300px, 60vw, 420px)';
      dialog.style.maxWidth = '90vw';
      dialog.style.boxSizing = 'border-box';
      dialog.style.maxHeight = 'min(70vh, 480px)';
      dialog.style.overflowY = 'auto';

      const title = document.createElement('div');
      title.textContent = `来源信息 - ${ball.name}`;
      title.style.fontSize = '14px';
      title.style.fontWeight = '600';
      title.style.marginBottom = '10px';
      dialog.appendChild(title);

      const fieldWrap = document.createElement('div');
      fieldWrap.style.display = 'flex';
      fieldWrap.style.flexDirection = 'column';
      fieldWrap.style.gap = '10px';

      const makeField = (label, contentNode) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '4px';
        const lab = document.createElement('div');
        lab.textContent = label;
        lab.style.opacity = '.85';
        lab.style.fontSize = '11px';
        lab.style.letterSpacing = '0.5px';
        lab.style.fontWeight = '600';
        lab.style.userSelect = 'none';
        row.appendChild(lab);
        row.appendChild(contentNode);
        return row;
      };

      // 名称
      const nameEl = document.createElement('div');
      nameEl.textContent = ball.name || '';
      nameEl.style.fontSize = '13px';
      nameEl.style.wordBreak = 'break-all';
      fieldWrap.appendChild(makeField('名称', nameEl));

      // 类型
      const typeEl = document.createElement('div');
      typeEl.textContent = ball.type || '(未知)';
      typeEl.style.fontSize = '13px';
      fieldWrap.appendChild(makeField('类型', typeEl));

      // source 信息：需要从全局 stats 查找，因为 ball 目前不直接持有 source 文本
      let sourceText = '';
      let needFetchMatch = false;
      try {
        const g = window.__jfDanmakuGlobal__ || {};
        const list = Array.isArray(g?.danmakuData?.source_stats) ? g.danmakuData.source_stats : [];
        const found = list.find(it => {
          const n = it?.source_name ?? it?.sourceName ?? it?.SourceName;
          return String(n || '').trim().toLowerCase() === String(ball.name || '').trim().toLowerCase();
        });
        sourceText = found?.source ?? found?.Source ?? '';
        // 条件：类型为 match 且当前 source 为空 => 准备拉取匹配信息
        if ((!sourceText || !String(sourceText).trim()) && (ball.type === 'match' || String(found?.type || found?.Type).toLowerCase() === 'match')) {
          needFetchMatch = true;
        }
      } catch (_) { }

      const srcBox = document.createElement('div');
      srcBox.style.position = 'relative';
      srcBox.style.background = 'rgba(255,255,255,.06)';
      srcBox.style.border = '1px solid rgba(255,255,255,.18)';
      srcBox.style.borderRadius = '6px';
      srcBox.style.padding = '8px 10px';
      srcBox.style.fontSize = '12px';
      srcBox.style.lineHeight = '1.5';
      srcBox.style.fontFamily = 'monospace';
      srcBox.style.whiteSpace = 'pre-wrap';
      srcBox.style.wordBreak = 'break-all';
      srcBox.style.maxHeight = '160px';
      srcBox.style.overflowY = 'auto';
      const renderSource = (txt) => {
        srcBox.innerHTML = '';
        if (txt) {
          if (/^https?:\/\//i.test(txt)) {
            const a = document.createElement('a');
            a.href = txt;
            a.textContent = txt;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.color = '#4dabff';
            a.style.textDecoration = 'underline';
            a.style.wordBreak = 'break-all';
            srcBox.appendChild(a);
          } else {
            srcBox.textContent = txt;
          }
        } else {
          const empty = document.createElement('div');
          empty.textContent = '(无 source 文本)';
          empty.style.opacity = '.6';
          srcBox.appendChild(empty);
        }
      };

      if (sourceText) {
        renderSource(sourceText);
      } else if (needFetchMatch) {
        // 显示加载占位
        const loading = document.createElement('div');
        loading.textContent = '正在获取匹配信息...';
        loading.style.opacity = '.75';
        srcBox.appendChild(loading);
        // 异步获取匹配来源文本（后端端点尚未实现，失败时显示提示）
        (async () => {
          try {
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
              throw new Error('缺少 ApiClient');
            }
            const g = window.__jfDanmakuGlobal__ || {};
            const ep = g?.danmakuData?.episodeId || g?.danmakuData?.EpisodeId || '';
            const name = ball.name || '';
            // 假设后端接受参数 episode_id 与 name；若后端实现使用不同参数名，可在此调整
            const url = ApiClient.getUrl(`danmaku/match_source_info?episode_id=${encodeURIComponent(ep)}&name=${encodeURIComponent(name)}`);
            // 兼容返回纯文本或 JSON 数组
            let raw = await ApiClient.ajax({ type: 'GET', url, dataType: 'text' });
            if (raw && typeof raw !== 'string') {
              try { raw = JSON.stringify(raw); } catch (_) { raw = String(raw); }
            }
            let handled = false;
            if (typeof raw === 'string') {
              const trimmed = raw.trim();
              if (trimmed.startsWith('[')) {
                try {
                  const arr = JSON.parse(trimmed);
                  if (Array.isArray(arr)) {
                    srcBox.innerHTML = '';
                    if (arr.length === 0) {
                      renderSource('(未获取到匹配来源信息)');
                    } else {
                      // 渲染多个链接/行
                      for (const u of arr) {
                        const line = document.createElement('div');
                        line.style.marginBottom = '6px';
                        if (typeof u === 'string' && /^https?:\/\//i.test(u)) {
                          const a = document.createElement('a');
                          a.href = u; a.textContent = u; a.target = '_blank'; a.rel = 'noopener noreferrer';
                          a.style.color = '#4dabff'; a.style.textDecoration = 'underline'; a.style.wordBreak = 'break-all';
                          line.appendChild(a);
                        } else {
                          line.textContent = String(u);
                        }
                        srcBox.appendChild(line);
                      }
                      handled = true;
                    }
                    handled = true;
                  }
                } catch (_) { /* fallback to treat as text */ }
              }
              if (!handled) {
                if (trimmed) {
                  renderSource(trimmed);
                } else {
                  renderSource('(未获取到匹配来源信息)');
                }
              }
            } else {
              renderSource('(未获取到匹配来源信息)');
            }
          } catch (err) {
            this.logger?.warn?.('[SourceInfoDialog] 获取 match_source_info 失败', err);
            renderSource('(获取匹配信息失败)');
          }
        })();
      } else {
        renderSource('');
      }
      fieldWrap.appendChild(makeField('Source', srcBox));

      dialog.appendChild(fieldWrap);

      // 操作按钮
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.justifyContent = 'flex-end';
      btnRow.style.gap = '10px';
      btnRow.style.marginTop = '16px';
      const btnClose = document.createElement('button');
      btnClose.type = 'button';
      btnClose.textContent = '关闭';
      Object.assign(btnClose.style, {
        cursor: 'pointer', fontSize: '12px', borderRadius: '6px', padding: '6px 14px',
        border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.15)', color: '#fff'
      });
      btnClose.onmouseenter = () => { btnClose.style.background = 'rgba(255,255,255,.22)'; };
      btnClose.onmouseleave = () => { btnClose.style.background = 'rgba(255,255,255,.15)'; };
      btnRow.appendChild(btnClose);
      dialog.appendChild(btnRow);

      const close = () => {
        try { if (overlay.parentElement) overlay.parentElement.removeChild(overlay); } catch (_) { }
      };

      btnClose.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

      overlay.appendChild(dialog);
      (panel || document.body).appendChild(overlay);
    } catch (e) {
      this.logger?.warn?.('[SourceInfoDialog] 显示失败', e);
    }
  }
}
