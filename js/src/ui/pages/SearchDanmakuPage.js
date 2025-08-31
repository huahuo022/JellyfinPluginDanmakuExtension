// 搜索弹幕分页：首页顶部信息框 + 远端匹配数据获取
// 约定接口：getKey/getLabel/build/destroy
import { saveIfAutoOn } from "../../api/utils";

export class SearchDanmakuPage {
    constructor(opts = {}) {
        this.logger = opts.logger || null;
        this._panel = null;
        this._headerBox = null;
        this._imgEl = null;
        this._titleValEl = null;
        this._episodeTitleEl = null;
        this._idValEl = null;
        this._epIdValEl = null;
        this._offsetInput = null;
        this._matchData = null;
        this._unbinds = [];
        this._searchInput = null;
        this._searchBtn = null;
        this._searchPlaceholder = null;
        this._resultsWrap = null;
        this._listWrap = null;
        this._detailWrap = null;
        this._selectedItem = null;
        this._detailUnbinds = [];
        this._isAnimating = false;
    }
    getKey() { return 'search'; }
    getLabel() { return '搜索弹幕'; }

    build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();
        this._panel = panel;

        // 顶部信息框
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'stretch';
        header.style.gap = '10px';
        header.style.border = '1px solid rgba(255,255,255,.12)';
        header.style.borderRadius = '8px';
        header.style.background = 'rgba(255,255,255,.05)';
        header.style.padding = '10px';
        header.style.minHeight = '110px';
        header.style.boxSizing = 'border-box';
        header.style.overflow = 'hidden';
        this._headerBox = header;

        // 左侧图片（不超过整体宽度 1/4；高度等于容器高度）
        const leftWrap = document.createElement('div');
        leftWrap.style.flex = '0 0 25%';
        leftWrap.style.maxWidth = '25%';
        leftWrap.style.borderRadius = '6px';
        leftWrap.style.overflow = 'hidden';
        leftWrap.style.background = 'rgba(0,0,0,.2)';
        const img = document.createElement('img');
        img.alt = '海报';
        img.style.display = 'block';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.background = 'rgba(0,0,0,.3)';
        img.referrerPolicy = 'no-referrer';
        this._imgEl = img;
        leftWrap.appendChild(img);
        header.appendChild(leftWrap);

        // 右侧信息
        const rightWrap = document.createElement('div');
        rightWrap.style.flex = '1 1 auto';
        rightWrap.style.display = 'flex';
        rightWrap.style.flexDirection = 'column';
        rightWrap.style.gap = '8px';

        const makeLine = (labelText, valueNode) => {
            const line = document.createElement('div');
            line.style.display = 'flex';
            line.style.gap = '8px';
            line.style.alignItems = 'center';
            const lab = document.createElement('span');
            lab.textContent = labelText;
            lab.style.opacity = '.8';
            lab.style.minWidth = '64px';
            lab.style.fontSize = '12px';
            const val = valueNode || document.createElement('span');
            val.style.fontSize = '13px';
            val.style.wordBreak = 'break-all';
            line.appendChild(lab);
            line.appendChild(val);
            return { line, val };
        };

        const titleNode = document.createElement('span');
        titleNode.textContent = '加载中…';
        const titleLine = makeLine('标题:', titleNode);
        this._titleValEl = titleNode;

        // 本集标题（来自全局 danmakuData.episodeTitle）
        const epTitleNode = document.createElement('span');
        try {
            const gInit = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            epTitleNode.textContent = gInit?.danmakuData?.episodeTitle || '--';
        } catch (_) { epTitleNode.textContent = '--'; }
        const epTitleLine = makeLine('本集标题:', epTitleNode);
        this._episodeTitleEl = epTitleNode;

        const idNode = document.createElement('span');
        idNode.textContent = '--';
        const idLine = makeLine('anime_id:', idNode);
        this._idValEl = idNode;

        const offsetInput = document.createElement('input');
        offsetInput.type = 'text';
        offsetInput.value = '0';
        offsetInput.className = 'danmaku-setting-input';
        offsetInput.style.width = '3ch';
        offsetInput.style.padding = '4px 6px';
        offsetInput.style.fontSize = '12px';
        offsetInput.step = '1';
        offsetInput.min = '-9999';
        offsetInput.max = '9999';
        this._offsetInput = offsetInput;
        // 右侧“更新”按钮
        const updateBtn = document.createElement('button');
        updateBtn.type = 'button';
        updateBtn.textContent = '更新';
        updateBtn.style.border = '1px solid rgba(255,255,255,.28)';
        updateBtn.style.background = 'rgba(255,255,255,.10)';
        updateBtn.style.color = '#fff';
        updateBtn.style.borderRadius = '6px';
        updateBtn.style.fontSize = '12px';
        updateBtn.style.padding = '6px 10px';
        updateBtn.style.cursor = 'pointer';
        updateBtn.style.whiteSpace = 'nowrap';
        const offsetValueWrap = document.createElement('div');
        offsetValueWrap.style.display = 'flex';
        offsetValueWrap.style.alignItems = 'center';
        offsetValueWrap.style.gap = '8px';
        offsetValueWrap.appendChild(offsetInput);
        offsetValueWrap.appendChild(updateBtn);
        const offsetLine = makeLine('集数偏移:', offsetValueWrap);
        // ep_id 展示（位于集数偏移下方）
        const epIdNode = document.createElement('span');
        epIdNode.textContent = '--';
        const epIdLine = makeLine('ep_id:', epIdNode);
        this._epIdValEl = epIdNode;
        const onOffsetChange = () => {
            let v = parseInt(offsetInput.value, 10);
            if (!Number.isFinite(v)) v = 0;
            if (v < -9999) v = -9999; else if (v > 9999) v = 9999;
            offsetInput.value = String(v);
            if (this._matchData) this._matchData.offset = v;
            try {
                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                g.danmakuMatchData = { ...(g.danmakuMatchData || {}), ...this._matchData };
            } catch (_) { }
            this.logger?.info?.('[Search] offset ->', v);
        };
        offsetInput.addEventListener('change', onOffsetChange);
        offsetInput.addEventListener('input', () => {
            // 轻量跟随，但不触发过多日志
            let v = parseInt(offsetInput.value, 10);
            if (!Number.isFinite(v)) return;
            if (this._matchData) this._matchData.offset = v;
        });
        this._unbinds.push(() => { try { offsetInput.removeEventListener('change', onOffsetChange); } catch (_) { } });
        // 更新按钮点击：仅发送，不修改本地
        const onUpdateClick = async () => {
            try {
                if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                    this.logger?.warn?.('[Search] 无法更新：缺少 ApiClient');
                    return;
                }
                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                const item_id = g.getMediaId?.();
                if (!item_id) { this.logger?.warn?.('[Search] 无法更新：缺少 item_id'); return; }
                let v = parseInt(offsetInput.value, 10);
                if (!Number.isFinite(v)) v = 0;
                const url = ApiClient.getUrl('danmaku/match_data');
                updateBtn.disabled = true;
                updateBtn.textContent = '更新中…';
                const form = new URLSearchParams();
                form.append('item_id', String(item_id));
                form.append('offset', String(v));
                await ApiClient.ajax({
                    type: 'POST',
                    url,
                    data: form.toString(),
                    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                    dataType: 'json'
                });
                const p = saveIfAutoOn(this.logger);
                // 根据返回 Promise 结果刷新“本集标题”
                try {
                    if (p && typeof p.then === 'function') {
                        p.then(val => {
                            if (val) {
                                try {
                                    const g2 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                    const newEpTitle = g2?.danmakuData?.episodeTitle || '--';
                                    if (this._episodeTitleEl) this._episodeTitleEl.textContent = newEpTitle;
                                } catch (_) { }
                            }
                        }).catch(() => { });
                    }
                } catch (_) { }
                this.logger?.info?.('[Search] 已提交匹配偏移更新', { item_id, offset: v });
            } catch (e) {
                this.logger?.warn?.('[Search] 提交偏移更新失败', e);
            } finally {
                try { updateBtn.disabled = false; updateBtn.textContent = '更新'; } catch (_) { }
            }
        };
        updateBtn.addEventListener('click', onUpdateClick);
        this._unbinds.push(() => { try { updateBtn.removeEventListener('click', onUpdateClick); } catch (_) { } });

        rightWrap.appendChild(titleLine.line);
        rightWrap.appendChild(epTitleLine.line);
        rightWrap.appendChild(idLine.line);
        rightWrap.appendChild(offsetLine.line);
        rightWrap.appendChild(epIdLine.line);
        header.appendChild(rightWrap);

        // 内容容器（为后续搜索 UI 预留）
        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';
        // 先只放顶部信息框
        list.appendChild(header);

        // 信息栏下方的搜索栏
        const searchWrap = document.createElement('div');
        searchWrap.style.position = 'relative';
        searchWrap.style.marginTop = '10px';
        searchWrap.style.height = '36px';
        searchWrap.style.display = 'block';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.autocomplete = 'off';
        searchInput.spellcheck = false;
        searchInput.className = 'danmaku-setting-input';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.width = '100%';
        searchInput.style.height = '36px';
        searchInput.style.padding = '0 40px 0 12px';
        searchInput.style.fontSize = '13px';
        searchInput.style.border = '1px solid rgba(255,255,255,.18)';
        searchInput.style.background = 'rgba(255,255,255,.06)';
        searchInput.style.color = '#fff';
        searchInput.style.borderRadius = '8px';
        searchInput.style.outline = 'none';
        this._searchInput = searchInput;

        // 居中占位提示（仅在未聚焦且无内容时显示）
        const placeholder = document.createElement('span');
        placeholder.textContent = '搜索';
        placeholder.style.position = 'absolute';
        placeholder.style.left = '0';
        placeholder.style.right = '40px';
        placeholder.style.top = '0';
        placeholder.style.bottom = '0';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.color = 'rgba(255,255,255,.5)';
        placeholder.style.pointerEvents = 'none';
        placeholder.style.fontSize = '13px';
        this._searchPlaceholder = placeholder;

        // 放大镜按钮（靠右）
        const searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.title = '搜索';
        searchBtn.style.position = 'absolute';
        searchBtn.style.top = '0';
        searchBtn.style.right = '0';
        searchBtn.style.height = '100%';
        searchBtn.style.width = '36px';
        searchBtn.style.border = '1px solid rgba(255,255,255,.18)';
        searchBtn.style.borderLeft = 'none';
        searchBtn.style.background = 'rgba(255,255,255,.10)';
        searchBtn.style.color = '#fff';
        searchBtn.style.cursor = 'pointer';
        searchBtn.style.borderTopRightRadius = '8px';
        searchBtn.style.borderBottomRightRadius = '8px';
        searchBtn.style.display = 'flex';
        searchBtn.style.alignItems = 'center';
        searchBtn.style.justifyContent = 'center';
        // 线条风格放大镜图标（SVG）
        const svgNS = 'http://www.w3.org/2000/svg';
        const icon = document.createElementNS(svgNS, 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '18');
        icon.setAttribute('height', '18');
        icon.style.pointerEvents = 'none';
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', '11');
        circle.setAttribute('cy', '11');
        circle.setAttribute('r', '7');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', 'currentColor');
        circle.setAttribute('stroke-width', '2');
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', '16.5');
        line.setAttribute('y1', '16.5');
        line.setAttribute('x2', '21');
        line.setAttribute('y2', '21');
        line.setAttribute('stroke', 'currentColor');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        icon.appendChild(circle);
        icon.appendChild(line);
        searchBtn.appendChild(icon);
        this._searchBtn = searchBtn;

        // 占位显示控制
        const updatePlaceholder = () => {
            const focused = document.activeElement === searchInput;
            const hasText = !!searchInput.value && searchInput.value.trim().length > 0;
            placeholder.style.display = (!focused && !hasText) ? 'flex' : 'none';
        };
        const onFocus = () => updatePlaceholder();
        const onBlur = () => updatePlaceholder();
        const onInput = () => updatePlaceholder();
        const onSearchClick = () => { try { searchInput.focus(); } catch (_) { } };
        searchInput.addEventListener('focus', onFocus);
        searchInput.addEventListener('blur', onBlur);
        searchInput.addEventListener('input', onInput);
        searchBtn.addEventListener('click', onSearchClick);
        this._unbinds.push(() => { try { searchInput.removeEventListener('focus', onFocus); } catch (_) { } });
        this._unbinds.push(() => { try { searchInput.removeEventListener('blur', onBlur); } catch (_) { } });
        this._unbinds.push(() => { try { searchInput.removeEventListener('input', onInput); } catch (_) { } });
        this._unbinds.push(() => { try { searchBtn.removeEventListener('click', onSearchClick); } catch (_) { } });

        // 组装
        searchWrap.appendChild(searchInput);
        searchWrap.appendChild(placeholder);
        searchWrap.appendChild(searchBtn);
        // 添加到列表
        list.appendChild(searchWrap);

        // 结果容器（两列布局）
        const resultsWrap = document.createElement('div');
        resultsWrap.style.marginTop = '12px';
        resultsWrap.style.display = 'grid';
        resultsWrap.style.gridTemplateColumns = '1fr 1fr';
        resultsWrap.style.gap = '12px';
        this._resultsWrap = resultsWrap;
        list.appendChild(resultsWrap);

        panel.appendChild(list);
        this._listWrap = list;
        // 绑定搜索事件
        this._bindSearchActions();

        // 异步获取匹配数据与 ep_id
        Promise.resolve().then(() => { this._fetchMatchData(); this._fetchEpId(); });
        return panel;
    }

    _bindSearchActions() {
        if (!this._searchInput || !this._searchBtn) return;
        const doSearch = () => this._doSearch();
        const onKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault?.(); doSearch(); } };
        this._searchInput.addEventListener('keydown', onKeyDown);
        this._searchBtn.addEventListener('click', doSearch);
        this._unbinds.push(() => { try { this._searchInput.removeEventListener('keydown', onKeyDown); } catch (_) { } });
        this._unbinds.push(() => { try { this._searchBtn.removeEventListener('click', doSearch); } catch (_) { } });
    }

    async _doSearch() {
        try {
            const q = (this._searchInput?.value || '').trim();
            if (!q) { this._renderSearchResults([]); return; }
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                this.logger?.warn?.('[Search] 缺少 ApiClient，无法搜索');
                return;
            }
            // 简易加载态
            this._renderSearchLoading();
            const url = ApiClient.getUrl(`danmaku/search?keyword=${encodeURIComponent(q)}`);
            const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            const animes = Array.isArray(res?.animes) ? res.animes : [];
            this.logger?.info?.('[Search] 搜索结果', { 关键字: q, 数量: animes.length });
            this._renderSearchResults(animes);
        } catch (e) {
            this.logger?.warn?.('[Search] 搜索失败', e);
            this._renderSearchError();
        }
    }

    _renderSearchLoading() {
        if (!this._resultsWrap) return;
        this._resultsWrap.innerHTML = '';
        const tip = document.createElement('div');
        tip.textContent = '正在搜索…';
        tip.style.opacity = '.8';
        tip.style.fontSize = '13px';
        tip.style.gridColumn = '1 / -1';
        this._resultsWrap.appendChild(tip);
    }

    _renderSearchError() {
        if (!this._resultsWrap) return;
        this._resultsWrap.innerHTML = '';
        const tip = document.createElement('div');
        tip.textContent = '搜索失败';
        tip.style.color = '#e66';
        tip.style.fontSize = '13px';
        tip.style.gridColumn = '1 / -1';
        this._resultsWrap.appendChild(tip);
    }

    _renderSearchResults(animes) {
        if (!this._resultsWrap) return;
        this._resultsWrap.innerHTML = '';
        if (!animes || animes.length === 0) {
            const tip = document.createElement('div');
            tip.textContent = '无结果';
            tip.style.opacity = '.7';
            tip.style.fontSize = '13px';
            tip.style.gridColumn = '1 / -1';
            this._resultsWrap.appendChild(tip);
            return;
        }
        for (const it of animes) {
            const card = this._createResultCard(it);
            // 点击进入二级页面
            card.style.cursor = 'pointer';
            card.style.userSelect = 'none';
            card.addEventListener('click', () => { try { this._enterDetail(it); } catch (_) { } });
            this._resultsWrap.appendChild(card);
        }
    }

    _createResultCard(item) {
        const card = document.createElement('div');
        card.style.border = '1px solid rgba(255,255,255,.12)';
        card.style.borderRadius = '8px';
        card.style.background = 'rgba(255,255,255,.04)';
        card.style.overflow = 'hidden';
        card.style.position = 'relative';
        try { card.style.aspectRatio = '2 / 3'; } catch (_) { }

        // 图片层（充满卡片）
        const topBox = document.createElement('div');
        topBox.style.position = 'absolute';
        topBox.style.left = '0';
        topBox.style.right = '0';
        topBox.style.top = '0';
        topBox.style.bottom = '0';
        topBox.style.background = 'transparent';
        topBox.style.overflow = 'hidden';
        topBox.style.zIndex = '1';

        const img = document.createElement('img');
        img.alt = item?.animeTitle || '';
        img.referrerPolicy = 'no-referrer';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain'; // 小图不拉伸，留白用于露出背景色
        img.style.objectPosition = 'center center';
        img.style.transition = 'transform .15s ease';
        img.style.transformOrigin = 'center center';

        const src = item?.imageUrl || '';
        if (src) img.src = src; else img.removeAttribute('src');

        img.onerror = () => {
            try {
                img.style.display = 'none';
                topBox.style.background = 'transparent';
            } catch (_) { }
        };
        img.onload = () => {
            try {
                if (!img.src) return;
                img.style.display = '';
                topBox.style.background = 'transparent';
            } catch (_) { }
        };
        topBox.appendChild(img);
        card.appendChild(topBox);

        // 覆盖文字层（叠在底部，半透明黑底）
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,.5)';
        overlay.style.color = '#fff';
        overlay.style.padding = '6px 8px';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.gap = '2px';
        overlay.style.zIndex = '2';
        overlay.style.transformOrigin = 'bottom left';
        overlay.style.transition = 'transform .15s ease';

        const title = document.createElement('div');
        title.textContent = item?.animeTitle || '--';
        title.style.fontSize = '12px';
        title.style.fontWeight = '600';
        title.style.lineHeight = '1.3';
        title.style.whiteSpace = 'nowrap';
        title.style.overflow = 'hidden';
        title.style.textOverflow = 'ellipsis';

        const type = document.createElement('div');
        type.textContent = item?.typeDescription || item?.type || '';
        type.style.opacity = '.9';
        type.style.fontSize = '11px';
        type.style.whiteSpace = 'nowrap';
        type.style.overflow = 'hidden';
        type.style.textOverflow = 'ellipsis';

        overlay.appendChild(title);
        overlay.appendChild(type);
        card.appendChild(overlay);

        // 悬停时放大文字
        card.addEventListener('mouseenter', () => {
            try { overlay.style.transform = 'scale(1.05)'; } catch (_) { }
            try { img.style.transform = 'scale(0.97)'; } catch (_) { }
        });
        card.addEventListener('mouseleave', () => {
            try { overlay.style.transform = 'scale(1)'; } catch (_) { }
            try { img.style.transform = 'scale(1)'; } catch (_) { }
        });

        return card;
    }

    _enterDetail(item) {
        try {
            if (this._isAnimating) return;
            this._isAnimating = true;
            this._selectedItem = item || null;
            // 确保列表视图可见以进行动画
            if (this._listWrap) this._listWrap.style.display = '';

            // 若已存在详情容器，先移除
            if (this._detailWrap && this._detailWrap.parentNode) {
                try { this._detailWrap.parentNode.removeChild(this._detailWrap); } catch (_) { }
            }
            this._detailWrap = document.createElement('div');
            this._detailWrap.style.position = 'relative';
            this._detailWrap.style.display = 'block';
            this._detailWrap.style.minHeight = '200px';
            this._detailWrap.style.border = '1px solid rgba(255,255,255,.12)';
            this._detailWrap.style.borderRadius = '8px';
            this._detailWrap.style.padding = '10px';
            this._detailWrap.style.background = 'rgba(255,255,255,.04)';

            // 顶部返回按钮
            const backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.textContent = '← 返回';
            backBtn.style.border = '1px solid rgba(255,255,255,.28)';
            backBtn.style.background = 'rgba(255,255,255,.10)';
            backBtn.style.color = '#fff';
            backBtn.style.borderRadius = '6px';
            backBtn.style.fontSize = '12px';
            backBtn.style.padding = '6px 10px';
            backBtn.style.cursor = 'pointer';
            backBtn.style.marginBottom = '10px';
            const onBack = () => { this._exitDetail(); };
            backBtn.addEventListener('click', onBack);
            this._detailUnbinds.push(() => { try { backBtn.removeEventListener('click', onBack); } catch (_) { } });
            this._detailWrap.appendChild(backBtn);

            // 简单详情内容（占位，可后续扩展）
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '12px';
            row.style.alignItems = 'stretch';

            const posterBox = document.createElement('div');
            posterBox.style.flex = '0 0 33%';
            posterBox.style.maxWidth = '240px';
            posterBox.style.borderRadius = '8px';
            posterBox.style.overflow = 'hidden';
            posterBox.style.background = 'transparent';
            posterBox.style.position = 'relative';
            try { posterBox.style.aspectRatio = '2 / 3'; } catch (_) { }

            const posterImg = document.createElement('img');
            posterImg.alt = item?.animeTitle || '';
            posterImg.referrerPolicy = 'no-referrer';
            posterImg.style.width = '100%';
            posterImg.style.height = '100%';
            posterImg.style.objectFit = 'contain';
            posterImg.style.background = 'transparent';
            const psrc = item?.imageUrl || '';
            if (psrc) posterImg.src = psrc;
            posterBox.appendChild(posterImg);

            const infoBox = document.createElement('div');
            infoBox.style.flex = '1 1 auto';
            infoBox.style.display = 'flex';
            infoBox.style.flexDirection = 'column';
            infoBox.style.gap = '8px';

            const title = document.createElement('div');
            title.textContent = item?.animeTitle || '--';
            title.style.fontSize = '16px';
            title.style.fontWeight = '700';
            title.style.lineHeight = '1.3';

            const type = document.createElement('div');
            type.textContent = item?.typeDescription || item?.type || '';
            type.style.opacity = '.9';
            type.style.fontSize = '12px';

            // 简介（最多 6 行，超出省略）
            const summary = document.createElement('div');
            summary.textContent = '';
            summary.style.opacity = '.85';
            summary.style.fontSize = '12px';
            summary.style.lineHeight = '1.45';
            summary.style.overflow = 'hidden';
            summary.style.display = '-webkit-box';
            summary.style.webkitLineClamp = '6';
            summary.style.webkitBoxOrient = 'vertical';

            infoBox.appendChild(title);
            infoBox.appendChild(type);
            infoBox.appendChild(summary);

            row.appendChild(posterBox);
            row.appendChild(infoBox);
            this._detailWrap.appendChild(row);

            // 设为本季id操作栏（位于分集列表上方）
            const actionBar = document.createElement('div');
            actionBar.style.marginTop = '10px';
            actionBar.style.border = '1px solid rgba(255,255,255,.12)';
            actionBar.style.borderRadius = '8px';
            actionBar.style.padding = '8px 10px';
            actionBar.style.display = 'flex';
            actionBar.style.alignItems = 'center';
            actionBar.style.gap = '10px';
            actionBar.style.background = 'rgba(255,255,255,.03)';
            actionBar.style.minHeight = '52px';

            const aidText = document.createElement('span');
            const curAnimeId = item?.animeId ?? item?.id ?? '--';
            aidText.textContent = `将 ${curAnimeId} 作为本季id offset:`;
            aidText.style.fontSize = '12px';
            aidText.style.opacity = '.95';

            const seasonOffsetInput = document.createElement('input');
            seasonOffsetInput.type = 'text';
            seasonOffsetInput.value = '0';
            seasonOffsetInput.className = 'danmaku-setting-input';
            seasonOffsetInput.style.width = '3ch';
            seasonOffsetInput.style.padding = '4px 6px';
            seasonOffsetInput.style.fontSize = '12px';
            seasonOffsetInput.step = '1';
            seasonOffsetInput.min = '-9999';
            seasonOffsetInput.max = '9999';

            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.textContent = '确认';
            confirmBtn.style.border = '1px solid rgba(255,255,255,.28)';
            confirmBtn.style.background = 'rgba(255,255,255,.10)';
            confirmBtn.style.color = '#fff';
            confirmBtn.style.borderRadius = '6px';
            confirmBtn.style.fontSize = '12px';
            confirmBtn.style.padding = '6px 10px';
            confirmBtn.style.cursor = 'pointer';
            confirmBtn.style.whiteSpace = 'nowrap';

            actionBar.appendChild(aidText);
            actionBar.appendChild(seasonOffsetInput);
            actionBar.appendChild(confirmBtn);
            this._detailWrap.appendChild(actionBar);

            const onConfirm = async () => {
                try {
                    if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                        this.logger?.warn?.('[Search] 无法设置本季id：缺少 ApiClient');
                        return;
                    }
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    const itemId = g.getMediaId?.();
                    const animeId = item?.animeId ?? item?.id;
                    const animeTitle = item?.animeTitle || '';
                    const imageUrl = item?.imageUrl || '';
                    if (!itemId || !animeId) {
                        this.logger?.warn?.('[Search] 无法设置本季id：缺少 itemId/animeId');
                        return;
                    }
                    let v = parseInt(seasonOffsetInput.value, 10);
                    if (!Number.isFinite(v)) v = 0;
                    if (v < -9999) v = -9999; else if (v > 9999) v = 9999;
                    seasonOffsetInput.value = String(v);

                    const url = ApiClient.getUrl('danmaku/match_data');
                    confirmBtn.disabled = true;
                    const prevText = confirmBtn.textContent;
                    confirmBtn.textContent = '提交中…';
                    const form = new URLSearchParams();
                    // 按需求使用 itemId/animeId 等表单键名
                    form.append('itemId', String(itemId));
                    form.append('animeId', String(animeId));
                    form.append('offset', String(v));
                    form.append('animeTitle', String(animeTitle));
                    form.append('imageUrl', String(imageUrl));

                    await ApiClient.ajax({
                        type: 'POST',
                        url,
                        data: form.toString(),
                        contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                        dataType: 'json'
                    });

                    // 成功后，适度更新顶部信息展示
                    try {
                        if (this._idValEl) this._idValEl.textContent = String(animeId);
                        if (this._titleValEl) this._titleValEl.textContent = animeTitle || this._titleValEl.textContent;
                        if (this._imgEl && imageUrl) this._imgEl.src = imageUrl;
                        if (this._offsetInput) this._offsetInput.value = String(v);
                        const g2 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                        g2.danmakuMatchData = {
                            ...(g2.danmakuMatchData || {}),
                            animeId,
                            animeTitle,
                            imageUrl,
                            offset: v,
                            exists: true
                        };
                    } catch (_) { }

                    // 触发自动保存后的刷新“本集标题”
                    try {
                        const p = saveIfAutoOn(this.logger);
                        if (p && typeof p.then === 'function') {
                            p.then(val => {
                                if (val) {
                                    try {
                                        const g3 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                        const newEpTitle = g3?.danmakuData?.episodeTitle || '--';
                                        if (this._episodeTitleEl) this._episodeTitleEl.textContent = newEpTitle;
                                    } catch (_) { }
                                }
                            }).catch(() => { });
                        }
                    } catch (_) { }

                    this.logger?.info?.('[Search] 已设置本季id', { itemId, animeId, offset: v });
                } catch (e) {
                    this.logger?.warn?.('[Search] 设置本季id失败', e);
                } finally {
                    try { confirmBtn.disabled = false; confirmBtn.textContent = '确认'; } catch (_) { }
                }
            };
            confirmBtn.addEventListener('click', onConfirm);
            this._detailUnbinds.push(() => { try { confirmBtn.removeEventListener('click', onConfirm); } catch (_) { } });

            // Episodes 容器
            const episodesWrap = document.createElement('div');
            episodesWrap.style.marginTop = '12px';
            episodesWrap.style.display = 'flex';
            episodesWrap.style.flexDirection = 'column';
            episodesWrap.style.gap = '8px';
            const loading = document.createElement('div');
            loading.textContent = '加载中…';
            loading.style.opacity = '.8';
            loading.style.fontSize = '13px';
            episodesWrap.appendChild(loading);
            this._detailWrap.appendChild(episodesWrap);

            // 挂载到面板
            if (this._panel) this._panel.appendChild(this._detailWrap);

            // 动画：进入二级 -> 向右移动
            const list = this._listWrap;
            const detail = this._detailWrap;
            const dur = 220; // ms
            const ease = 'ease';
            if (list) {
                list.style.transition = 'transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease;
                list.style.transform = 'translateX(0)';
                list.style.opacity = '1';
            }
            if (detail) {
                detail.style.transition = 'transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease;
                detail.style.transform = 'translateX(-24px)';
                detail.style.opacity = '0';
            }
            // 触发重排
            void (detail && detail.offsetWidth);
            // 目标状态：两个都向右移动感受
            if (list) {
                list.style.transform = 'translateX(24px)';
                list.style.opacity = '0';
            }
            if (detail) {
                detail.style.transform = 'translateX(0)';
                detail.style.opacity = '1';
            }

            const finish = () => {
                try {
                    if (list) {
                        list.style.display = 'none';
                        list.style.transition = '';
                        list.style.transform = '';
                        list.style.opacity = '';
                    }
                    if (detail) {
                        detail.style.transition = '';
                        detail.style.transform = '';
                        detail.style.opacity = '';
                    }
                } catch (_) { }
                this._isAnimating = false;
            };
            const onEnd = (e) => { finish(); try { detail.removeEventListener('transitionend', onEnd); } catch (_) { } };
            try { detail.addEventListener('transitionend', onEnd); } catch (_) { }
            // 兜底超时
            setTimeout(finish, dur + 80);

            // 异步加载 bangumi 详情
            this._loadBangumiDetail(item, { summaryEl: summary, episodesWrap });
        } catch (e) {
            this.logger?.warn?.('[Search] 进入二级页面失败', e);
            this._isAnimating = false;
        }
    }

    _exitDetail() {
        try {
            if (this._isAnimating) return;
            this._isAnimating = true;
            // 移除详情容器
            const list = this._listWrap;
            const detail = this._detailWrap;
            // 若没有详情，直接复原
            if (!detail) {
                if (list) list.style.display = '';
                this._isAnimating = false;
                return;
            }
            // 准备动画：返回一级 -> 向左移动
            const dur = 220; const ease = 'ease';
            if (list) {
                list.style.display = '';
                list.style.transition = 'transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease;
                list.style.transform = 'translateX(24px)';
                list.style.opacity = '0';
            }
            if (detail) {
                detail.style.transition = 'transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease;
                detail.style.transform = 'translateX(0)';
                detail.style.opacity = '1';
            }
            void (detail && detail.offsetWidth);
            // 目标：列表向左进入，详情向左退出
            if (list) {
                list.style.transform = 'translateX(0)';
                list.style.opacity = '1';
            }
            if (detail) {
                detail.style.transform = 'translateX(-24px)';
                detail.style.opacity = '0';
            }

            const finish = () => {
                try {
                    if (detail && detail.parentNode) { detail.parentNode.removeChild(detail); }
                } catch (_) { }
                this._detailWrap = null;
                this._selectedItem = null;
                try { this._detailUnbinds.forEach(fn => { try { fn(); } catch (_) { } }); } catch (_) { }
                this._detailUnbinds = [];
                if (list) {
                    list.style.transition = '';
                    list.style.transform = '';
                    list.style.opacity = '';
                    list.style.display = '';
                }
                this._isAnimating = false;
            };
            const onEnd = () => { finish(); try { detail.removeEventListener('transitionend', onEnd); } catch (_) { } };
            try { detail.addEventListener('transitionend', onEnd); } catch (_) { }
            setTimeout(finish, dur + 80);
        } catch (e) {
            this.logger?.warn?.('[Search] 退出二级页面失败', e);
            this._isAnimating = false;
        }
    }

    async _loadBangumiDetail(item, { summaryEl, episodesWrap }) {
        try {
            const animeId = item?.animeId ?? item?.id ?? null;
            if (!animeId) {
                if (summaryEl) summaryEl.textContent = '';
                if (episodesWrap) {
                    episodesWrap.innerHTML = '';
                    const tip = document.createElement('div');
                    tip.textContent = '缺少 animeId';
                    tip.style.color = '#e66';
                    tip.style.fontSize = '13px';
                    episodesWrap.appendChild(tip);
                }
                return;
            }
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                if (episodesWrap) { episodesWrap.innerHTML = ''; const tip = document.createElement('div'); tip.textContent = '缺少 ApiClient'; tip.style.color = '#e66'; tip.style.fontSize = '13px'; episodesWrap.appendChild(tip); }
                return;
            }
            const url = ApiClient.getUrl(`danmaku/search?bangumi_id=${encodeURIComponent(animeId)}`);
            const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            const bangumi = res?.bangumi || {};
            // 渲染简介
            if (summaryEl) {
                const txt = (bangumi.summary || '').trim();
                summaryEl.textContent = txt || '';
            }
            // 渲染分集
            if (episodesWrap) {
                episodesWrap.innerHTML = '';
                const episodes = Array.isArray(bangumi.episodes) ? bangumi.episodes : [];
                if (episodes.length === 0) {
                    const tip = document.createElement('div');
                    tip.textContent = '无分集';
                    tip.style.opacity = '.8';
                    tip.style.fontSize = '13px';
                    episodesWrap.appendChild(tip);
                } else {
                    for (const ep of episodes) {
                        const row = document.createElement('div');
                        row.style.border = '1px solid rgba(255,255,255,.12)';
                        row.style.borderRadius = '8px';
                        row.style.padding = '8px 10px';
                        row.style.display = 'flex';
                        row.style.alignItems = 'center';
                        row.style.justifyContent = 'space-between';
                        row.style.gap = '10px';
                        row.style.background = 'rgba(255,255,255,.03)';

                        // 左侧：大写 episodeNumber
                        const left = document.createElement('div');
                        left.style.flex = '0 0 auto';
                        left.style.display = 'flex';
                        left.style.alignItems = 'center';
                        left.style.justifyContent = 'center';
                        left.style.padding = '0 8px';
                        const num = document.createElement('div');
                        const n = (ep?.episodeNumber ?? '').toString();
                        num.textContent = n.toUpperCase();
                        num.style.fontSize = '18px';
                        num.style.fontWeight = '700';
                        num.style.letterSpacing = '.5px';
                        num.style.opacity = '.95';
                        left.appendChild(num);

                        // 右侧：内容（episodeId + episodeTitle），垂直居中
                        const right = document.createElement('div');
                        right.style.flex = '1 1 auto';
                        right.style.display = 'flex';
                        right.style.flexDirection = 'column';
                        right.style.justifyContent = 'center';
                        right.style.minHeight = '52px';

                        const eid = document.createElement('div');
                        eid.textContent = 'ep_id: ' + String(ep?.episodeId ?? '--');
                        eid.style.fontSize = '12px';
                        eid.style.opacity = '.9';

                        const etitle = document.createElement('div');
                        etitle.textContent = ep?.episodeTitle || '';
                        etitle.style.fontSize = '13px';
                        etitle.style.fontWeight = '600';
                        etitle.style.lineHeight = '1.35';
                        etitle.style.whiteSpace = 'nowrap';
                        etitle.style.overflow = 'hidden';
                        etitle.style.textOverflow = 'ellipsis';

                        right.appendChild(eid);
                        right.appendChild(etitle);

                        // 右侧操作按钮：设置单集ID
                        const actionWrap = document.createElement('div');
                        actionWrap.style.flex = '0 0 auto';
                        const setBtn = document.createElement('button');
                        setBtn.type = 'button';
                        setBtn.textContent = '设置单集ID';
                        setBtn.style.border = '1px solid rgba(255,255,255,.28)';
                        setBtn.style.background = 'rgba(255,255,255,.10)';
                        setBtn.style.color = '#fff';
                        setBtn.style.borderRadius = '6px';
                        setBtn.style.fontSize = '12px';
                        setBtn.style.padding = '6px 10px';
                        setBtn.style.cursor = 'pointer';
                        setBtn.style.whiteSpace = 'nowrap';
                        actionWrap.appendChild(setBtn);

                        const onSet = async () => {
                            try {
                                if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                                    this.logger?.warn?.('[Search] 无法设置单集ID：缺少 ApiClient');
                                    return;
                                }
                                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                const item_id = g.getMediaId?.();
                                const danmaku_id = ep?.episodeId;
                                if (!item_id || danmaku_id == null) {
                                    this.logger?.warn?.('[Search] 无法设置单集ID：缺少 item_id/episodeId');
                                    return;
                                }
                                const url = ApiClient.getUrl(`danmaku/set_id?item_id=${encodeURIComponent(String(item_id))}&danmaku_id=${encodeURIComponent(String(danmaku_id))}`);
                                setBtn.disabled = true;
                                const prev = setBtn.textContent; setBtn.textContent = '设置中…';
                                // 无返回体，避免解析 JSON 导致挂起
                                await ApiClient.ajax({ type: 'GET', url });
                                // 成功后刷新头部 ep_id 展示
                                try {
                                    if (this._epIdValEl) this._epIdValEl.textContent = String(danmaku_id);
                                    g.danmakuEpId = danmaku_id;
                                } catch (_) { }
                                this.logger?.info?.('[Search] 已设置单集ID', { item_id, danmaku_id });
                                setBtn.textContent = prev;
                                // 保存完成后刷新“本集标题”
                                try {
                                    const p = saveIfAutoOn(this.logger);
                                    if (p && typeof p.then === 'function') {
                                        p.then(val => {
                                            if (val) {
                                                try {
                                                    const g2 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                                    const newEpTitle = g2?.danmakuData?.episodeTitle || '--';
                                                    if (this._episodeTitleEl) this._episodeTitleEl.textContent = newEpTitle;
                                                } catch (_) { }
                                            }
                                        }).catch(() => { });
                                    }
                                } catch (_) { }
                            } catch (e) {
                                this.logger?.warn?.('[Search] 设置单集ID失败', e);
                            } finally {
                                try { setBtn.disabled = false; } catch (_) { }
                            }
                        };
                        setBtn.addEventListener('click', onSet);
                        this._detailUnbinds.push(() => { try { setBtn.removeEventListener('click', onSet); } catch (_) { } });

                        row.appendChild(left);
                        row.appendChild(right);
                        row.appendChild(actionWrap);
                        episodesWrap.appendChild(row);
                    }
                }
            }
        } catch (e) {
            this.logger?.warn?.('[Search] 加载 bangumi 详情失败', e);
            try {
                if (episodesWrap) {
                    episodesWrap.innerHTML = '';
                    const tip = document.createElement('div');
                    tip.textContent = '加载失败';
                    tip.style.color = '#e66';
                    tip.style.fontSize = '13px';
                    episodesWrap.appendChild(tip);
                }
            } catch (_) { }
        }
    }

    // 取消随机背景取色逻辑，保持透明背景

    async _fetchMatchData() {
        try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const item_id = g.getMediaId?.();
            if (!item_id) {
                this._applyMatchData(null, { reason: 'no-media-id' });
                return;
            }
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                this._applyMatchData(null, { reason: 'no-apiclient' });
                return;
            }
            const url = ApiClient.getUrl(`danmaku/match_data?item_id=${encodeURIComponent(item_id)}`);
            const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            this.logger?.info?.('[Search] 获取匹配信息', res);
            this._applyMatchData(res);
        } catch (e) {
            this.logger?.warn?.('[Search] 获取匹配信息失败', e);
            this._applyMatchData(null, { reason: 'error' });
        }
    }

    _applyMatchData(data, meta = {}) {
        this._matchData = (data && typeof data === 'object') ? data : null;
        const exists = !!this._matchData?.exists;
        // 标题
        try { this._titleValEl.textContent = exists ? (this._matchData.animeTitle ?? '--') : (meta.reason ? '未获取到匹配数据' : '--'); } catch (_) { }
        // id（仅显示 animeId）
        try {
            const aid = this._matchData?.animeId;
            this._idValEl.textContent = exists && (aid !== undefined && aid !== null) ? String(aid) : '--';
        } catch (_) { }
        // offset
        try {
            const off = Number(this._matchData?.offset ?? 0);
            if (Number.isFinite(off)) this._offsetInput.value = String(off); else this._offsetInput.value = '0';
        } catch (_) { try { this._offsetInput.value = '0'; } catch (__) { } }
        // image
        try {
            const url = exists ? (this._matchData.imageUrl || '') : '';
            if (url) this._imgEl.src = url; else this._imgEl.removeAttribute('src');
            this._imgEl.onerror = () => { try { this._imgEl.removeAttribute('src'); } catch (_) { } };
        } catch (_) { }
        // 将数据放入全局以便其它模块复用
        try { const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {}; g.danmakuMatchData = this._matchData || null; } catch (_) { }
    }

    async _fetchEpId() {
        try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const item_id = g.getMediaId?.();
            if (!item_id) { try { if (this._epIdValEl) this._epIdValEl.textContent = '--'; } catch (_) { } return; }
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) { return; }
            const url = ApiClient.getUrl(`danmaku/get_id?item_id=${encodeURIComponent(item_id)}`);
            const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            this.logger?.info?.('[Search] 获取 ep_id', res);
            let epId = null;
            if (res && typeof res === 'object') {
                epId = res.ep_id ?? res.epId ?? res.id ?? null;
            } else if (typeof res === 'string' || typeof res === 'number') {
                epId = res;
            }
            if (epId === undefined || epId === null || epId === '') epId = '--';
            try { if (this._epIdValEl) this._epIdValEl.textContent = String(epId); } catch (_) { }
            try { g.danmakuEpId = epId; } catch (_) { }
        } catch (e) {
            this.logger?.warn?.('[Search] 获取 ep_id 失败', e);
            try { if (this._epIdValEl) this._epIdValEl.textContent = '--'; } catch (_) { }
        }
    }

    destroy() {
        try { this._exitDetail(); } catch (_) { }
        try { this._unbinds.forEach(fn => { try { fn(); } catch (_) { } }); } catch (_) { }
        this._unbinds = [];
        try { this._detailUnbinds.forEach(fn => { try { fn(); } catch (_) { } }); } catch (_) { }
        this._detailUnbinds = [];
        this._panel = null;
        this._headerBox = null;
        this._imgEl = null;
        this._titleValEl = null;
        this._episodeTitleEl = null;
        this._idValEl = null;
        this._epIdValEl = null;
        this._offsetInput = null;
        this._matchData = null;
        this._searchInput = null;
        this._searchBtn = null;
        this._searchPlaceholder = null;
        this._resultsWrap = null;
        this._listWrap = null;
        this._detailWrap = null;
        this._selectedItem = null;
    }
}
