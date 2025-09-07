/*!
 * jellyfin-danmaku-extension v1.0.0
 * Jellyfin Web弹幕扩展
 * 
 * 构建时间: 2025-09-07T22:48:43.396Z
 * 
 * 使用方法:
 * 1. 将此文件复制到Jellyfin Web目录
 * 2. 在index.html的</body>前添加: <script src="./jellyfin-danmaku.js"></script>
 * 3. 或者将内容直接注入到<script>标签中
 * 
 * @license MIT
 */
(function () {
    'use strict';

    /**
     * DanmakuSettings - 弹幕 / 热力图 参数设置类
     * - 负责：类型规范化、默认值填充、更新验证、序列化
     * - 用法：
     *   const s = new DanmakuSettings(rawSettingsObject);
     *   s.set('font_size', 30); s.enable_heatmap = 'combined';
     */

    const GLOBAL_NS$2 = '__jfDanmakuGlobal__';

    class DanmakuSettings {
        /**
         * @param {Object} raw 服务器返回的 settings 对象（可选 / 部分字段）
         */
        constructor(raw = {}) {
            // 定义所有受支持的键：默认值 + 期望类型
            // type: 'number' | 'boolean' | 'string'
            this._schema = Object.freeze({
                // 基础选项
                enable_danmaku:     { def: true,       type: 'boolean' },
                chConvert:          { def: '0',        type: 'string'  }, // '0' | '1' | '2'
                withRelated:        { def: 'true',     type: 'string'  }, // 服务器用字符串布尔
                enable_heatmap:     { def: 'combined', type: 'string'  },
                heatmap_interval:   { def: 5,          type: 'number'  },
                font_size:          { def: 25,         type: 'number'  },
                font_family:        { def: 'sans-serif', type: 'string'},
                opacity:            { def: 70,         type: 'number'  },
                speed:              { def: 144,        type: 'number'  },
                display_top_pct:    { def: 0,          type: 'number'  },
                display_bottom_pct: { def: 100,        type: 'number'  },
                // 合并选项
                enable_combine:     { def: true,       type: 'boolean' },
                threshold_seconds:  { def: 15,          type: 'number'  },
                max_distance:       { def: 3,          type: 'number'  },
                max_cosine:         { def: 40,         type: 'number'  },
                use_pinyin:         { def: true,       type: 'boolean' },
                cross_mode:         { def: true,       type: 'boolean' },
                trim_ending:        { def: true,       type: 'boolean' },
                trim_space:         { def: true,       type: 'boolean' },
                trim_width:         { def: true,       type: 'boolean' },
                heatmap_style:      { def: "{\"lineWidth\":1,\"lineColor\":\"#3498db\",\"gradientColorStart\":\"rgba(52, 152, 219, 0.08)\",\"gradientColorEnd\":\"rgba(52, 152, 219, 0.25)\"}",     type: 'string'  },
                mark_style:         { def: "sub_low",  type: 'string'  },
                mark_threshold:     { def: 1,          type: 'number'  },
                mode_elevation:     { def: true,       type: 'boolean' },
                enlarge:            { def: true,       type: 'boolean' },
                scroll_threshold:   { def: 0,          type: 'number'  },
                shrink_threshold:   { def: 0,          type: 'number'  },
                drop_threshold:     { def: 0,          type: 'number'  },
                max_chunk_size:     { def: 1000,       type: 'number'  },
                // 规则列表
                force_list:         { def: '[]',         type: 'string'  },
                white_list:         { def: '[]',         type: 'string'  },
                black_list:         { def: '[]',         type: 'string'  },
                black_source_list:  { def: '[]',         type: 'string'  },
            });

            // 内部存储实际值
            this._values = {};
            // 逐项加载
            for (const key of Object.keys(this._schema)) {
                const schema = this._schema[key];
                const rawVal = Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : schema.def;
                this._values[key] = this._normalize(rawVal, schema.type, schema.def);
            }
            // 记录未知字段（可能用于调试）
            this._unknown = Object.keys(raw).filter(k => !this._schema[k]);
        }

        /**
         * 类型规范化
         */
        _normalize(value, type, def) {
            if (value == null) return def;
            try {
                switch (type) {
                    case 'number': {
                        if (typeof value === 'number' && !isNaN(value)) return value;
                        const n = Number(value);
                        return isNaN(n) ? def : n;
                    }
                    case 'boolean': {
                        if (typeof value === 'boolean') return value;
                        if (value === 'true' || value === '1') return true;
                        if (value === 'false' || value === '0') return false;
                        return !!value;
                    }
                    case 'string': {
                        return String(value);
                    }
                    default:
                        return value;
                }
            } catch (_) {
                return def;
            }
        }

        /**
         * 获取全部键列表
         */
        keys() { return Object.keys(this._schema); }

        /**
         * 快速导出纯对象（深拷贝简单值）
         */
        toJSON() {
            const out = {};
            for (const k of this.keys()) out[k] = this._values[k];
            return out;
        }

        /**
         * 获取单个值
         */
        get(key) { return this._values[key]; }

        /**
         * 设置单个值（带类型校验与规范化）
         */
        set(key, value) {
            const schema = this._schema[key];
            if (!schema) return false;
            this._values[key] = this._normalize(value, schema.type, schema.def);
            return true;
        }

        /**
         * 批量更新
         */
        patch(obj = {}) {
            for (const [k, v] of Object.entries(obj)) this.set(k, v);
            return this;
        }

        /**
         * 便捷获取布尔（某些后端使用字符串布尔）
         */
        asBool(key) {
            const v = this.get(key);
            if (typeof v === 'boolean') return v;
            if (v === 'true' || v === '1') return true;
            if (v === 'false' || v === '0') return false;
            return !!v;
        }

        /**
         * 全局挂载
         */
        mountGlobal() {
            if (typeof window === 'undefined') return this;
            const g = window[GLOBAL_NS$2] = window[GLOBAL_NS$2] || {};
            g.danmakuSettings = this;
            return this;
        }

        /**
         * 重置为默认值（不自动保存到服务器）
         * - 就地修改当前实例的所有键为 schema.def
         * - 返回自身，便于链式调用
         */
        resetToDefaults() {
            try {
                for (const k of Object.keys(this._schema)) {
                    const { def, type } = this._schema[k];
                    this._values[k] = this._normalize(def, type, def);
                }
            } catch (_) { /* no-op */ }
            return this;
        }

        /**
         * 获取一个包含全部默认值的纯对象（便于外部直接覆盖/初始化）
         */
        static getDefaultObject() {
            try {
                const tmp = new DanmakuSettings({});
                const out = {};
                for (const k of Object.keys(tmp._schema)) out[k] = tmp._schema[k].def;
                return out;
            } catch (_) {
                return {};
            }
        }
    }

    /**
     * 工具：从原始对象创建并挂载
     */
    function createAndMountDanmakuSettings(raw) {
        // 若已存在全局实例：直接 patch 合并更新并返回，避免频繁 new 导致引用失效
        try {
            if (typeof window !== 'undefined') {
                const g = window[GLOBAL_NS$2] = window[GLOBAL_NS$2] || {};
                if (g.danmakuSettings instanceof DanmakuSettings) {
                    g.danmakuSettings.patch(raw || {});
                    return g.danmakuSettings;
                }
            }
        } catch (_) { }
        return new DanmakuSettings(raw).mountGlobal();
    }

    // 获取弹幕数据的独立函数，从 danmakuExt.js 中迁移
    // 依赖全局 ApiClient 与统一命名空间 __jfDanmakuGlobal__ (兼容旧 __jfWebPlayerState__ 指向同对象)
    const GLOBAL_NS$1 = '__jfDanmakuGlobal__';




    // 提交（保存）当前全局设置到服务器，并获取最新弹幕/设置返回
    // 步骤：
    // 1. 从 window.__jfDanmakuGlobal__.danmakuSettings 读取全部键值
    // 2. 构建 URLSearchParams 作为表单数据
    // 3. 调用同一接口 danmaku/comment?item_id=... 发送 POST（应用服务器端保存逻辑）
    // 4. 若返回含 settings 再次实例化全局（保持与获取逻辑一致）
    async function updateDanmakuSettings(logger, item_id, danmaku_id) {
        // item_id 仅使用显式传入参数，不再回退到播放器 mediaId
        const g = window[GLOBAL_NS$1] = window[GLOBAL_NS$1] || {};
        const gSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        if (!gSettings || typeof gSettings.toJSON !== 'function') {
            logger?.warn?.('无法保存设置：全局设置对象缺失');
            return null;
        }


        try {
            const settingsObj = gSettings.toJSON();
            const formParams = new URLSearchParams();
            for (const [k, v] of Object.entries(settingsObj)) {
                // 全部转为字符串
                formParams.append(k, String(v));
            }
            // 可附带一个动作字段(若后端需要)；此处仅示例，可按需开启
            // formParams.append('action', 'save_settings');

            // 构建查询参数（可选 item_id / danmaku_id）
            const queryParts = [];
            if (item_id) queryParts.push(`item_id=${encodeURIComponent(item_id)}`);
            if (danmaku_id) ;
            const query = queryParts.length ? `?${queryParts.join('&')}` : '';
            const url = ApiClient.getUrl(`danmaku/comment${query}`);
            // Jellyfin ApiClient.ajax 典型参数：type, url, data, dataType
            // data 传入 URL 编码字符串
            const result = await ApiClient.ajax({
                type: 'POST',
                url,
                data: formParams.toString(),
                contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
                dataType: 'json'
            });
            logger?.info?.('已提交弹幕设置并获取响应', { 服务器返回弹幕数: result.comments?.length ?? undefined });
            // 仅在存在 item_id 或 danmaku_id 的场景下应用响应（更新全局设置/弹幕/热力图）

            if (!result || typeof result !== 'object') return result;
            // settings
            if (result.settings && typeof result.settings === 'object') {
                try {
                    createAndMountDanmakuSettings(result.settings);
                    logger?.info?.('弹幕设置对象已更新');
                } catch (e) {
                    logger?.warn?.('弹幕设置对象更新失败', e);
                }
            }
            g.danmakuData = result;
            logger?.info?.('全局 danmakuData 已刷新', { 数量: result.comments?.length?? undefined });

            if (item_id || danmaku_id) {
                try {
                    // 若已有渲染器实例，使用无闪烁替换方法更新数据
                    if (g.danmakuRenderer && typeof g.danmakuRenderer.replaceComments === 'function') {
                        try {
                            g.danmakuRenderer.replaceComments(result.comments, { preserveState: true });
                            logger?.info?.('替换弹幕渲染器数据成功');
                        } catch (re) {
                            logger?.warn?.('替换弹幕渲染器数据失败', re);
                        }
                    }
                    // 若返回了热力图数据且有渲染器实例，更新热力图
                    if (result.heatmap_data && typeof result.heatmap_data === 'object') {
                        const heatmapValues = Object.values(result.heatmap_data);
                        if (g.heatmapRenderer && typeof g.heatmapRenderer.recalculate === 'function') {
                            try {
                                const video = document.querySelector('video');
                                const duration = video?.duration || 0;
                                g.heatmapRenderer.recalculate(heatmapValues, duration);
                                logger?.info?.('热力图数据已更新并重新计算');
                            } catch (he) {
                                logger?.warn?.('热力图更新失败', he);
                            }
                        }
                    }
                } catch (e) {
                    logger?.warn?.('刷新全局 danmakuData 失败', e);
                }
            } else {
                logger?.info?.('设置已保存：未提供 item_id / danmaku_id，服务器正常不返回弹幕数据');
            }
            return result;
        } catch (err) {
            logger?.warn?.('提交弹幕设置请求失败', err);
            throw err;
        }
    }

    // 仅获取（不覆盖）当前媒体的弹幕数据与设置
    // 用于页面初次加载或媒体切换后初始化，避免将本地默认值提交覆盖服务器
    async function fetchDanmakuData(logger, item_id, danmaku_id) {
        const g = window[GLOBAL_NS$1] = window[GLOBAL_NS$1] || {};
        try {
            // 构建查询参数（可选 item_id / danmaku_id）
            const queryParts = [];
            if (item_id) queryParts.push(`item_id=${encodeURIComponent(item_id)}`);
            if (danmaku_id) ;
            const query = queryParts.length ? `?${queryParts.join('&')}` : '';
            const url = ApiClient.getUrl(`danmaku/comment${query}`);
            const result = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            if (!result || typeof result !== 'object') return result;
            // settings
            if (result.settings && typeof result.settings === 'object') {
                try {
                    createAndMountDanmakuSettings(result.settings);
                    logger?.info?.('弹幕设置对象已加载');
                } catch (e) {
                    logger?.warn?.('弹幕设置对象加载失败', e);
                }
            }
            g.danmakuData = result;
            logger?.info?.('已获取弹幕数据', { 数量: result.comments?.length });

            // 更新渲染器/热力图
            try {
                if (g.danmakuRenderer && typeof g.danmakuRenderer.replaceComments === 'function' && Array.isArray(result.comments)) {
                    try {
                        g.danmakuRenderer.replaceComments(result.comments, { preserveState: true });
                        logger?.info?.('替换弹幕渲染器数据成功');
                    } catch (re) { logger?.warn?.('替换弹幕渲染器数据失败', re); }
                }
                if (result.heatmap_data && typeof result.heatmap_data === 'object') {
                    const heatmapValues = Object.values(result.heatmap_data);
                    if (g.heatmapRenderer && typeof g.heatmapRenderer.recalculate === 'function') {
                        try {
                            const video = document.querySelector('video');
                            const duration = video?.duration || 0;
                            g.heatmapRenderer.recalculate(heatmapValues, duration);
                            logger?.info?.('热力图数据已更新并重新计算');
                        } catch (he) { logger?.warn?.('热力图更新失败', he); }
                    }
                }
            } catch (_) { }
            return result;
        } catch (err) {
            logger?.warn?.('获取弹幕设置/数据失败', err);
            throw err;
        }
    }

    // 统一的保存工具（带防抖）
    // 用法：
    //   saveIfAutoOn(logger) -> Promise | undefined
    // 说明：
    // - 当 g.danmakuAutoSave 关闭时，直接返回 undefined，并清理挂起的定时器。
    // - 当开启时，进行尾随防抖（默认300ms，可通过 g.settingsSaveDebounceMs 或 g.saveDebounceMs 配置），
    //   多次快速调用会合并为一次保存，并返回同一个 pending Promise。



    const DEFAULT_SAVE_DEBOUNCE_MS = 300;
    let _saveTimer = null;
    let _pendingPromise = null;
    let _pendingResolve = null;
    let _pendingReject = null;
    let _lastLogger = null;

    function _clearPendingTimer() {
      if (_saveTimer) {
        try { clearTimeout(_saveTimer); } catch (_) {}
        _saveTimer = null;
      }
    }

    function _resetPendingState() {
      _clearPendingTimer();
      _pendingPromise = null;
      _pendingResolve = null;
      _pendingReject = null;
    }

    // 通用保存（带防抖合并）
    function saveIfAutoOn(logger = null) {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const enabled = !!g.danmakuAutoSave;

        if (!enabled) {
          // 关闭时清理任何挂起的保存任务；若已有挂起 Promise，则以已完成(undefined)结束，避免悬挂
          if (_pendingPromise) {
            _clearPendingTimer();
            try { _pendingResolve?.(undefined); } catch (_) {}
          }
          _resetPendingState();
          return;
        }

        // 记录最近一次 logger，用于真正执行时输出
        if (logger) _lastLogger = logger;

        const delay = DEFAULT_SAVE_DEBOUNCE_MS;

        // 若已有定时器，则刷新触发时间
        _clearPendingTimer();

        // 复用一个 pending Promise，使多次快速调用拿到同一个结果
        if (!_pendingPromise) {
          _pendingPromise = new Promise((resolve, reject) => {
            _pendingResolve = resolve;
            _pendingReject = reject;
          });
        }

        _saveTimer = setTimeout(() => {
          _saveTimer = null;
          // 取最新 mediaId 与 logger 执行
          const currentLogger = _lastLogger || logger;
          const mediaId = g.getMediaId?.();
          try {
            const ret = updateDanmakuSettings(currentLogger, mediaId);
            if (ret && typeof ret.then === 'function') {
              ret.then(val => {
                _pendingResolve?.(val);
                _resetPendingState();
              }).catch(err => {
                currentLogger?.warn?.('保存设置失败', err);
                _pendingReject?.(err);
                _resetPendingState();
              });
            } else {
              _pendingResolve?.(ret);
              _resetPendingState();
            }
          } catch (err) {
            currentLogger?.warn?.('保存设置失败', err);
            _pendingReject?.(err);
            _resetPendingState();
          }
        }, delay);

        return _pendingPromise;
      } catch (err) {
        logger?.warn?.('保存设置失败', err);
      }
    }

    // 检查当前设置的服务器字体是否已缓存，若未缓存则下载并保存到 Cache Storage
    // 返回 Promise<boolean> 表示是否已在缓存中（或已成功缓存）
    async function ensureCurrentServerFontCached(logger = null) {
      try {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const settings = g.danmakuSettings;
        const val = settings?.get?.('font_family');
        if (!val || typeof val !== 'string' || val.indexOf('/danmaku/font/') !== 0) return false;

        // 规范化绝对地址
        let absUrl = val.replace(/^\/+/, '');
        try { if (typeof ApiClient !== 'undefined' && ApiClient.getUrl) absUrl = ApiClient.getUrl(absUrl); } catch (_) {}

        if (typeof caches === 'undefined' || !caches?.open) return false; // 环境不支持 Cache Storage

        const cache = await caches.open('jfdanmaku-fonts-v1');
        const req = new Request(absUrl, { credentials: 'same-origin', mode: 'cors' });
        const hit = await cache.match(req);
        if (hit) return true;

        // 下载并写入缓存
        const resp = await fetch(req);
        if (!resp || !resp.ok) {
          logger?.warn?.('字体下载失败', absUrl, resp?.status);
          return false;
        }
        // 复制响应体，避免一次性消耗
        const cloned = resp.clone();
        await cache.put(req, cloned);
        return true;
      } catch (e) {
        logger?.warn?.('缓存服务器字体失败', e);
        return false;
      }
    }

    // 暴露到全局，方便无需模块导入时使用
    try { (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {}).ensureCurrentServerFontCached = ensureCurrentServerFontCached; } catch (_) {}

    var utils = /*#__PURE__*/Object.freeze({
        __proto__: null,
        ensureCurrentServerFontCached: ensureCurrentServerFontCached,
        saveIfAutoOn: saveIfAutoOn
    });

    // 基础设置分页：提供基础弹幕相关可视化与行为调节

    class BasicSettingsPage {
      constructor(opts = {}) { this.logger = opts.logger || null; }
      getKey() { return 'basic'; }
      getLabel() { return '基础设置'; }

      _createFontSizeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const current = settings?.get?.('font_size') ?? 25;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'font_size');
        row.setAttribute('data-type', 'number');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '字体大小 (px)';
        labelLine.appendChild(labelSpan);

        row.appendChild(labelLine);

        const sliderWrap = document.createElement('div');
        sliderWrap.style.display = 'flex';
        sliderWrap.style.alignItems = 'center';
        sliderWrap.style.gap = '8px';

        const range = document.createElement('input');
        range.type = 'range';
        range.min = '8';
        range.max = '80';
        range.step = '1';
        range.value = String(current);
        range.style.flex = '1 1 auto';

        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.min = '8';
        numberInput.max = '80';
        numberInput.step = '1';
        numberInput.value = String(current);
        numberInput.className = 'danmaku-setting-input';
        numberInput.style.width = '70px';

        const applyValue = (v, src) => {
          let nv = parseInt(v, 10);
          if (isNaN(nv)) return;
          if (nv < 8) nv = 8; else if (nv > 80) nv = 80;
          range.value = String(nv);
          numberInput.value = String(nv);
          try {
            const liveSettings = window.__jfDanmakuGlobal__.danmakuSettings;
            liveSettings?.set?.('font_size', nv);
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[BasicSettings] font_size ->', nv, '(from', src, ')');
        };

        range.addEventListener('input', () => applyValue(range.value, 'range'));
        numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
        numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));

        sliderWrap.appendChild(range);
        sliderWrap.appendChild(numberInput);
        row.appendChild(sliderWrap);

        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        // desc.textContent = '调整弹幕基础字号 (8 - 80px)。';
        row.appendChild(desc);

        return row;
      }

      _createOpacityRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const current = settings?.get?.('opacity') ?? 70; // 0-100
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'opacity');
        row.setAttribute('data-type', 'number');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '弹幕透明度 (%)';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const sliderWrap = document.createElement('div');
        sliderWrap.style.display = 'flex';
        sliderWrap.style.alignItems = 'center';
        sliderWrap.style.gap = '8px';
        const range = document.createElement('input');
        range.type = 'range'; range.min = '0'; range.max = '100'; range.step = '1';
        range.value = String(current);
        range.style.flex = '1 1 auto';
        const numberInput = document.createElement('input');
        numberInput.type = 'number'; numberInput.min = '0'; numberInput.max = '100'; numberInput.step = '1';
        numberInput.value = String(current); numberInput.className = 'danmaku-setting-input'; numberInput.style.width = '70px';

        const applyValue = (v, src) => {
          let nv = parseInt(v, 10);
          if (isNaN(nv)) return; if (nv < 0) nv = 0; else if (nv > 100) nv = 100;
          range.value = String(nv); numberInput.value = String(nv);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('opacity', nv);
            // 更新实时弹幕层透明度（如果存在）
            const layer = document.querySelector('#danmaku-layer');
            if (layer) layer.style.opacity = String(Math.min(1, Math.max(0, nv / 100)));
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[BasicSettings] opacity ->', nv, '(from', src, ')');
        };
        range.addEventListener('input', () => applyValue(range.value, 'range'));
        numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
        numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));
        sliderWrap.appendChild(range); sliderWrap.appendChild(numberInput); row.appendChild(sliderWrap);
        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        // desc.textContent = '调节弹幕整体透明度 (0-100)。';
        row.appendChild(desc);
        return row;
      }

      _createSpeedRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const current = settings?.get?.('speed') ?? 144; // 24-600
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'speed');
        row.setAttribute('data-type', 'number');
        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '弹幕速度';
        labelLine.appendChild(labelSpan);

        row.appendChild(labelLine);
        const sliderWrap = document.createElement('div'); sliderWrap.style.display = 'flex'; sliderWrap.style.alignItems = 'center'; sliderWrap.style.gap = '8px';
        const range = document.createElement('input'); range.type = 'range'; range.min = '24'; range.max = '600'; range.step = '1'; range.value = String(current); range.style.flex = '1 1 auto';
        const numberInput = document.createElement('input'); numberInput.type = 'number'; numberInput.min = '24'; numberInput.max = '600'; numberInput.step = '1'; numberInput.value = String(current); numberInput.className = 'danmaku-setting-input'; numberInput.style.width = '70px';
        const applyValue = (v, src) => {
          let nv = parseInt(v, 10); if (isNaN(nv)) return; if (nv < 24) nv = 24; else if (nv > 600) nv = 600;
          range.value = String(nv); numberInput.value = String(nv);
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const liveSettings = g.danmakuSettings;
            liveSettings?.set?.('speed', nv);
            // 直接写实例的 speed 属性
            try { g.danmakuRenderer.speed = nv; } catch (_) { }

            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[BasicSettings] speed ->', nv, '(from', src, ')');
        };
        range.addEventListener('input', () => applyValue(range.value, 'range'));
        numberInput.addEventListener('input', () => applyValue(numberInput.value, 'number'));
        numberInput.addEventListener('change', () => applyValue(numberInput.value, 'number-change'));
        sliderWrap.appendChild(range); sliderWrap.appendChild(numberInput); row.appendChild(sliderWrap);
        // const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '调节弹幕滚动速度 (24 - 600)。数值越大，移动越快。'; row.appendChild(desc);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      _createFontFamilyRow() {
      const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
      let current = settings?.get?.('font_family') || 'sans-serif';
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'font_family');
        row.setAttribute('data-type', 'string');
        // 确保只注入一次针对字体选择控件的样式
        try {
          if (!document.getElementById('danmaku-fontfamily-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'danmaku-fontfamily-style';
            styleEl.textContent = `
/* Font Family combo input + list */
.danmaku-setting-row[data-key="font_family"] .ff-combo { position: relative; width: 100%; }
.danmaku-setting-row[data-key="font_family"] .ff-input {
  width: 100%; background-color: rgba(30,30,30,.92); color: #fff;
  border: 1px solid rgba(255,255,255,.28); border-radius: 4px; outline: none;
  padding: 6px 8px; font-size: 12px;
}
.danmaku-setting-row[data-key="font_family"] .ff-input:focus { box-shadow: 0 0 0 2px rgba(255,255,255,.15); }
.danmaku-setting-row[data-key="font_family"] .ff-list {
  position: absolute; left: 0; right: 0; top: calc(100% + 6px);
  max-height: 220px; overflow: auto; background: #1e1e1e; color: #fff;
  border: 1px solid rgba(255,255,255,.28); border-radius: 6px; padding: 4px 0; z-index: 9999;
  display: none;
}
.danmaku-setting-row[data-key="font_family"] .ff-item {
  padding: 6px 10px; font-size: 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.danmaku-setting-row[data-key="font_family"] .ff-item:hover,
.danmaku-setting-row[data-key="font_family"] .ff-item.active { background: rgba(255,255,255,.12); }
`;
            document.head.appendChild(styleEl);
          }
        } catch (_) { }
        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '字体';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);
        // 组合控件：输入框 + 过滤列表
      const combo = document.createElement('div');
        combo.className = 'ff-combo';
      const input = document.createElement('input');
      input.className = 'ff-input danmaku-setting-input';
      input.type = 'text';
      const genericPlaceholder = '输入以筛选字体...';
      input.placeholder = genericPlaceholder;
        const list = document.createElement('div');
        list.className = 'ff-list';
        combo.appendChild(input);
        combo.appendChild(list);

        let allFonts = [];
        let filtered = [];
        let activeIndex = -1;
        const labelFor = (f) => {
          if (typeof f === 'string' && f.indexOf('/danmaku/font/') === 0) {
            const last = (f.split('/').pop() || f).split('?')[0];
            let decoded = last;
            try { decoded = decodeURIComponent(last); } catch (_) { /* ignore */ }
            return `服务器字体: ${decoded}`;
          }
          return f;
        };
        const openList = () => { list.style.display = 'block'; };
        const closeList = () => { list.style.display = 'none'; activeIndex = -1; };
        const renderList = () => {
          list.innerHTML = '';
          filtered.forEach((f, idx) => {
            const it = document.createElement('div');
            it.className = 'ff-item' + (idx === activeIndex ? ' active' : '');
            it.textContent = labelFor(f);
            it.dataset.val = f;
            it.addEventListener('mousedown', (e) => { e.preventDefault(); selectFont(f); });
            list.appendChild(it);
          });
          // 仅在输入框处于聚焦状态时才展开，避免首次加载默认展开
          if (filtered.length && document.activeElement === input) openList(); else closeList();
          // 尝试滚动到当前激活项
          if (activeIndex >= 0 && list.children[activeIndex]) {
            try { list.children[activeIndex].scrollIntoView({ block: 'nearest' }); } catch (_) {}
          }
        };
        const setFilter = (kw) => {
          // 统一规范化：NFKC、去空白、去重音、lowerCase，提升中英文与带符号名称匹配鲁棒性
          const normalize = (s) => {
            let t = (s ?? '').toString();
            try { t = t.normalize('NFKC'); } catch (_) {}
            t = t.toLowerCase();
            t = t.replace(/\s+/g, '');
            try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
            return t;
          };
          const qNorm = normalize(kw || '');

          filtered = allFonts.filter((f) => {
            const candidates = [];
            const fstr = (f || '').toString();
            // 原始值（可能是字体名或服务器 URL）
            candidates.push(fstr);
            // 可见标签（如“服务器字体: 文件名”），其中会对 URL 末段做 decode
            const lbl = labelFor(f);
            if (lbl) candidates.push(lbl);
            // 针对服务器字体 URL，额外加入“解码后的文件名”与“去扩展名”的候选，便于中文关键词检索
            if (typeof fstr === 'string' && fstr.indexOf('/danmaku/font/') === 0) {
              const last = (fstr.split('/').pop() || fstr).split('?')[0];
              let dec = last;
              try { dec = decodeURIComponent(last); } catch (_) {}
              candidates.push(dec);
              const noExt = dec.replace(/\.[a-z0-9]+$/i, '');
              candidates.push(noExt);
            }

            return candidates.some((c) => normalize(c).includes(qNorm));
          });

      // 保持自然顺序，仅将激活项定位到当前值
          activeIndex = filtered.length ? (Math.max(0, filtered.indexOf(current))) : -1;
          renderList();
        };
        const selectFont = async (val) => {
          if (!val) return;
          // 更新设置并失焦
          applyValue(val);
          // 若为服务器字体，则尝试预缓存
          try {
            if (typeof val === 'string' && val.indexOf('/danmaku/font/') === 0) {
              await ensureCurrentServerFontCached(this.logger);
            }
          } catch (_) {}
          current = val;
      input.value = '';
      input.placeholder = labelFor(val);
          closeList();
          try { input.blur(); } catch (_) {}
        };
        // 动态收集字体函数 -> 更新 allFonts
        const populateFonts = (fontList) => {
          const gset = new Set();
          fontList.forEach(f => { if (f) gset.add(f); });
          ['sans-serif', 'serif', 'monospace', 'system-ui'].forEach(f => gset.add(f));
          allFonts = Array.from(gset).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      if (current && !allFonts.includes(current)) allFonts.push(current);
      // 初始以占位符展示当前字体（虚化）
      input.value = '';
      input.placeholder = labelFor(current);
      setFilter('');
        };

        const detectViaLocalFontAccess = async () => {
          const fams = new Set();
          try {
            // 需权限，可能抛错
            if (navigator.fonts?.query) {
              // for await 迭代
              // 部分浏览器要求 https + 用户手势，失败即回退
              // eslint-disable-next-line no-restricted-syntax
              for await (const meta of navigator.fonts.query()) {
                if (meta.family) fams.add(meta.family);
              }
            }
          } catch (_) { /* 忽略 */ }
          return Array.from(fams);
        };

        const detectViaCanvas = () => {
          // 由于浏览器隐私限制无法真正枚举，只能用候选池测试是否存在
          const candidatePool = [
            'Arial', 'Helvetica', 'Segoe UI', 'Roboto', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei', 'SimSun', 'KaiTi', 'FangSong', 'Courier New', 'Consolas', 'Menlo', 'Monaco', 'Ubuntu', 'Ubuntu Mono', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman'
          ];
          const baseFonts = ['monospace', 'serif', 'sans-serif'];
          const testString = 'mmmmmmmmmwwwwwwwiiiilllOO0测试字样ABC123';
          const size = '72px';
          const span = document.createElement('span');
          span.style.position = 'absolute'; span.style.left = '-9999px'; span.style.fontSize = size; span.textContent = testString;
          document.body.appendChild(span);
          const baseMetrics = {};
          baseFonts.forEach(bf => { span.style.fontFamily = bf; baseMetrics[bf] = { w: span.offsetWidth, h: span.offsetHeight }; });
          const available = [];
          candidatePool.forEach(font => {
            let detected = false;
            for (const bf of baseFonts) {
              span.style.fontFamily = `'${font}',${bf}`;
              const w = span.offsetWidth, h = span.offsetHeight;
              if (w !== baseMetrics[bf].w || h !== baseMetrics[bf].h) { detected = true; break; }
            }
            if (detected) available.push(font);
          });
          document.body.removeChild(span);
          return available;
        };

        const detectViaServerFonts = async () => {
          try {
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) return [];
            const url = ApiClient.getUrl('danmaku/font/get_all');
            const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            if (!Array.isArray(res)) return [];
            // 返回 URL 路径（保持与渲染器协议一致）
            return res.map(x => x && typeof x.url === 'string' ? x.url : null).filter(Boolean);
          } catch (_) { return []; }
        };

        const runDetection = async () => {
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            if (Array.isArray(g.availableFontFamilies) && g.availableFontFamilies.length) {
              populateFonts(g.availableFontFamilies);
              // 尝试为当前服务器字体进行预缓存
              try { await ensureCurrentServerFontCached(this.logger); } catch (_) {}
              return;
            }
            let fonts = await detectViaLocalFontAccess();
            // 合并服务器字体
            try {
              const serverFonts = await detectViaServerFonts();
              if (serverFonts && serverFonts.length) {
                const merged = new Set([...(fonts || []), ...serverFonts]);
                fonts = Array.from(merged);
              }
            } catch (_) {}
            // 若 Local Font Access 得到过少结果，则回退 canvas 探测
            if (!fonts || fonts.length < 5) {
              const canvasFonts = detectViaCanvas();
              const merged = new Set([...(fonts || []), ...canvasFonts]);
              fonts = Array.from(merged);
            }
            g.availableFontFamilies = fonts;
            populateFonts(fonts);
            // 尝试为当前服务器字体进行预缓存
            try { await ensureCurrentServerFontCached(this.logger); } catch (_) {}
          } catch (e) {
            // 最终失败，使用最小集合
            populateFonts([current || 'sans-serif']);
          }
        };
        // 延迟微任务，等待元素插入再开始检测，减少阻塞
        Promise.resolve().then(runDetection);
        const applyValue = (nv) => {
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const liveSettings = g.danmakuSettings;
            liveSettings?.set?.('font_family', nv);
            // 如果选择的是服务器字体 URL，则预加载并用加载完成的家族名；否则直接应用
            const applyFam = (famName) => {
              const targetFam = famName ? `'${famName}', sans-serif` : nv;
              const layer = document.querySelector('#danmaku-layer');
              if (layer) layer.style.fontFamily = targetFam;
              if (g.danmakuRenderer?.container) {
                try { g.danmakuRenderer.container.style.fontFamily = targetFam; } catch (_) { }
              }
            };

            if (typeof nv === 'string' && nv.indexOf('/danmaku/font/') === 0) {
              // 使用渲染器暴露的加载器（若存在）
              const loader = g.ensureRemoteFontLoaded || (g.danmakuRenderer && g.danmakuRenderer.ensureRemoteFontLoaded);
              if (typeof loader === 'function') {
                loader(nv).then(fam => {
                  applyFam(fam || null);
                }).catch(() => applyFam(null));
              } else {
                // 尝试直接设置，浏览器会在未加载时自动回退
                applyFam(null);
              }
            } else {
              applyFam(null);
            }
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[BasicSettings] font_family ->', nv);
        };
        // 交互：输入即筛选；上下箭头/回车选择；失焦隐藏
        input.addEventListener('input', () => setFilter(input.value));
        input.addEventListener('focus', () => {
          // 聚焦时：如果当前输入为空，显示通用提示占位符
          if (!input.value) input.placeholder = genericPlaceholder;
          // 聚焦清空输入，打开并高亮当前项
          input.value = '';
          setFilter('');
          openList();
        });
        input.addEventListener('blur', () => {
          // 失焦：恢复为当前已选字体的占位符
          input.placeholder = labelFor(current);
        });
        input.addEventListener('keydown', (e) => {
          if (list.style.display !== 'block') return;
          if (e.key === 'ArrowDown') { activeIndex = Math.min(filtered.length - 1, activeIndex + 1); renderList(); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { activeIndex = Math.max(0, activeIndex - 1); renderList(); e.preventDefault(); }
          else if (e.key === 'Enter') { if (activeIndex >= 0 && filtered[activeIndex]) { selectFont(filtered[activeIndex]); e.preventDefault(); } }
          else if (e.key === 'Escape') { closeList(); }
        });
        document.addEventListener('click', (e) => { if (!combo.contains(e.target)) closeList(); });

        row.appendChild(combo);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '字体建议放在服务端的"/config/fonts"路径'; row.appendChild(desc);
        return row;
      }


      _createDisplayRangeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const topInit = settings?.get?.('display_top_pct');
        const bottomInit = settings?.get?.('display_bottom_pct');
        // 初始值：确保为 0-100 整数
        let topVal = (isFinite(topInit) ? Math.round(topInit) : 0);
        let bottomVal = (isFinite(bottomInit) ? Math.round(bottomInit) : 100);
        if (topVal < 0) topVal = 0; if (topVal > 99) topVal = 99;
        if (bottomVal <= topVal) bottomVal = Math.min(100, topVal + 1);
        if (bottomVal > 100) bottomVal = 100;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'display_range');
        row.setAttribute('data-type', 'range');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '显示范围';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        // 双拖动条容器
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.height = '32px';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.userSelect = 'none';

        const track = document.createElement('div');
        track.style.position = 'absolute';
        track.style.left = '0'; track.style.right = '0';
        track.style.top = '50%'; track.style.height = '4px';
        track.style.transform = 'translateY(-50%)';
        track.style.background = 'linear-gradient(90deg, rgba(255,255,255,.15), rgba(255,255,255,.15))';
        track.style.borderRadius = '2px';
        wrapper.appendChild(track);

        const activeRange = document.createElement('div');
        activeRange.style.position = 'absolute'; activeRange.style.top = '50%'; activeRange.style.height = '6px'; activeRange.style.transform = 'translateY(-50%)';
        activeRange.style.background = 'rgba(0,150,255,.6)'; activeRange.style.borderRadius = '3px';
        wrapper.appendChild(activeRange);

        function updateActiveRange() {
          activeRange.style.left = topVal + '%';
          activeRange.style.width = (bottomVal - topVal) + '%';
        }
        updateActiveRange();

        const handleStyle = (el) => {
          el.style.position = 'absolute';
          el.style.top = '50%'; el.style.transform = 'translate(-50%, -50%)';
          el.style.width = '14px'; el.style.height = '14px';
          el.style.borderRadius = '50%'; el.style.cursor = 'pointer';
          el.style.background = 'rgba(0,150,255,.9)';
          el.style.border = '1px solid rgba(255,255,255,.6)';
          el.style.boxShadow = '0 0 4px rgba(0,150,255,.7)';
          el.style.transition = 'background .15s, box-shadow .15s';
        };
        const handleTop = document.createElement('div'); handleStyle(handleTop);
        const handleBottom = document.createElement('div'); handleStyle(handleBottom);
        wrapper.appendChild(handleTop); wrapper.appendChild(handleBottom);

        function positionHandles() {
          handleTop.style.left = topVal + '%';
          handleBottom.style.left = bottomVal + '%';
        }
        positionHandles();

        function applyToSettings(src) {
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const liveSettings = g.danmakuSettings || settings;
            liveSettings?.set?.('display_top_pct', topVal);
            liveSettings?.set?.('display_bottom_pct', bottomVal);
            // 实时应用到 layer-inner
            const inner = document.getElementById('danmaku-layer');
            if (inner && inner.parentElement) {
              inner.style.top = topVal + '%';
              inner.style.height = (bottomVal - topVal) + '%';
            }
            g.danmakuRenderer?.resize();
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this?.logger?.info?.('[BasicSettings] display_range ->', topVal, bottomVal, 'from', src);
        }

        function clamp() {
          // 四舍五入并限制为整数
          topVal = Math.round(topVal); bottomVal = Math.round(bottomVal);
          if (topVal < 0) topVal = 0; if (topVal > 99) topVal = 99;
          if (bottomVal <= topVal) bottomVal = Math.min(100, topVal + 1);
          if (bottomVal > 100) bottomVal = 100;
        }

        let dragging = null; // 'top' | 'bottom'
        const onPointerDown = (e, which) => {
          dragging = which; e.preventDefault();
          document.addEventListener('pointermove', onPointerMove);
          document.addEventListener('pointerup', onPointerUp);
        };
        const onPointerMove = (e) => {
          if (!dragging) return;
          const rect = wrapper.getBoundingClientRect();
          const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
          if (dragging === 'top') topVal = Math.min(bottomVal - 1, Math.max(0, pct));
          else bottomVal = Math.max(topVal + 1, Math.min(100, pct));
          clamp(); positionHandles(); updateActiveRange(); applyToSettings.call(selfRef, 'drag');
        };
        const onPointerUp = () => {
          dragging = null;
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          applyToSettings.call(selfRef, 'release');
        };
        handleTop.addEventListener('pointerdown', e => onPointerDown(e, 'top'));
        handleBottom.addEventListener('pointerdown', e => onPointerDown(e, 'bottom'));

        // 点击轨道定位最近的手柄
        // 点击整个 wrapper（除手柄本身）时，移动最近手柄并直接进入拖动状态
        wrapper.addEventListener('pointerdown', e => {
          if (e.target === handleTop || e.target === handleBottom) return; // 由各自 handler 处理
          const rect = wrapper.getBoundingClientRect();
          const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
          const distTop = Math.abs(pct - topVal);
          const distBottom = Math.abs(pct - bottomVal);
          if (distTop <= distBottom) {
            topVal = Math.min(bottomVal - 1, Math.max(0, pct)); dragging = 'top';
          } else {
            bottomVal = Math.max(topVal + 1, Math.min(100, pct)); dragging = 'bottom';
          }
          clamp(); positionHandles(); updateActiveRange(); applyToSettings.call(selfRef, 'click-move');
          // 进入拖动监听
          document.addEventListener('pointermove', onPointerMove);
          document.addEventListener('pointerup', onPointerUp);
          e.preventDefault();
        });


        // activeRange 已在前面插入，无需重复追加
        row.appendChild(wrapper);

        // 悬停该设置区时，高亮视频上的弹幕层为半透明红色，离开后恢复
        const highlightOn = () => {
          try {
            const layer = document.getElementById('danmaku-layer');
            if (!layer) return;
            // 记录原始样式以便恢复
            if (typeof layer.__prevBgColor === 'undefined') layer.__prevBgColor = layer.style.backgroundColor;
            if (typeof layer.__prevTransition === 'undefined') layer.__prevTransition = layer.style.transition;
            const hasTransition = (layer.style.transition || '').trim().length > 0;
            layer.style.transition = hasTransition ? layer.style.transition + ', background-color .15s ease' : 'background-color .15s ease';
            layer.style.backgroundColor = 'rgba(64, 0, 255, 0.52)';
          } catch (_) { /* ignore */ }
        };
        const highlightOff = () => {
          try {
            const layer = document.getElementById('danmaku-layer');
            if (!layer) return;
            layer.style.backgroundColor = layer.__prevBgColor || '';
            if (typeof layer.__prevTransition !== 'undefined') layer.style.transition = layer.__prevTransition || '';
            try { delete layer.__prevBgColor; delete layer.__prevTransition; } catch (_) { /* ignore */ }
          } catch (_) { /* ignore */ }
        };
        row.addEventListener('mouseenter', highlightOn);
        row.addEventListener('mouseleave', highlightOff);

        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; desc.textContent = '限制弹幕垂直显示区域'; row.appendChild(desc);

        const selfRef = this; // for call
        return row;
      }

      _createChConvertRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const current = settings?.get?.('chConvert') ?? '0'; // '0' 不转换, '1' 简体, '2' 繁体
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'chConvert');
        row.setAttribute('data-type', 'enum');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '简繁转换';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const group = document.createElement('div');
        group.style.display = 'flex';
        group.style.width = '100%';
        group.style.gap = '6px';
        group.style.marginTop = '4px';

        const options = [
          { key: '0', label: '不转换' },
          { key: '1', label: '简体' },
          { key: '2', label: '繁体' }
        ];

        const applyValue = (val) => {
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const liveSettings = g.danmakuSettings || settings;
            liveSettings?.set?.('chConvert', val);
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[BasicSettings] chConvert ->', val);
        };

        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = opt.label;
          btn.dataset.val = opt.key;
          btn.style.flex = '1 1 0';
          btn.style.padding = '6px 4px';
          btn.style.fontSize = '12px';
          btn.style.lineHeight = '1.1';
          btn.style.borderRadius = '6px';
          btn.style.border = '1px solid rgba(255,255,255,.25)';
          btn.style.background = 'rgba(255,255,255,.08)';
          btn.style.color = '#fff';
          btn.style.cursor = 'pointer';
          btn.style.transition = 'background .15s, border-color .15s, box-shadow .15s';
          const setActiveState = () => {
            if (btn.dataset.val === String(currentVal)) {
              btn.style.background = '#3fa9ff';
              btn.style.borderColor = '#3fa9ff';
              btn.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
            } else {
              btn.style.background = 'rgba(255,255,255,.08)';
              btn.style.borderColor = 'rgba(255,255,255,.25)';
              btn.style.boxShadow = 'none';
            }
          };
          btn.addEventListener('mouseenter', () => { if (btn.dataset.val !== String(currentVal)) btn.style.background = 'rgba(255,255,255,.15)'; });
          btn.addEventListener('mouseleave', () => setActiveState());
          btn.addEventListener('click', () => {
            if (currentVal === opt.key) return;
            currentVal = opt.key;
            applyValue(currentVal);
            group.querySelectorAll('button').forEach(b => {
              const v = b.dataset.val;
              if (v === currentVal) {
                b.style.background = '#3fa9ff';
                b.style.borderColor = '#3fa9ff';
                b.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
              } else {
                b.style.background = 'rgba(255,255,255,.08)';
                b.style.borderColor = 'rgba(255,255,255,.25)';
                b.style.boxShadow = 'none';
              }
            });
          });
          group.appendChild(btn);
          // 延迟设置激活样式在 currentVal 初始化之后
          setTimeout(setActiveState, 0);
        });

        let currentVal = String(current);
        row.appendChild(group);
        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        // desc.textContent = '选择是否进行简繁体转换。';
        row.appendChild(desc);
        return row;
      }

      build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();

        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';
        list.appendChild(this._createFontSizeRow());
        list.appendChild(this._createOpacityRow());
        list.appendChild(this._createSpeedRow());
        list.appendChild(this._createFontFamilyRow());
        list.appendChild(this._createChConvertRow());
        list.appendChild(this._createDisplayRangeRow());
        panel.appendChild(list);
        return panel;
      }
    }

    // 弹幕合并设置分页（逐步实现中）
    class CombinedSettingsPage {
      constructor(opts = {}) { this.logger = opts.logger || null; }
      getKey() { return 'combine'; }
      getLabel() { return '弹幕合并'; }


      _ensureCombineUpdate() {
        try {
          const p = saveIfAutoOn(this.logger);
          if (p) p.then(() => this._updateCombineStats());
        } catch (_) { }
      }

      _updateCombineStats() {
        try {
          const data = window.__jfDanmakuGlobal__.danmakuData;
          if (this._combineStatsEl) {
            let original = data?.original_total;
            let merged = data?.count;
            if (merged == null && Array.isArray(data?.comments)) merged = data.comments.length;
            if (original == null && typeof data?.raw_total === 'number') original = data.raw_total;
            if (original == null && Array.isArray(data?.original_comments)) original = data.original_comments.length;
            if (original == null && Array.isArray(data?.comments_before_merge)) original = data.comments_before_merge.length;
            if (original == null && Array.isArray(data?.comments)) original = data.comments.length;
            if (typeof original === 'number' && typeof merged === 'number') {
              if (original !== merged) this._combineStatsEl.textContent = `${original} → ${merged}`;
              else this._combineStatsEl.textContent = String(merged);
            } else if (merged != null) {
              this._combineStatsEl.textContent = String(merged);
            } else {
              this._combineStatsEl.textContent = '--';
            }
          }
          if (this._pakkuTimeEl) {
            const rawTime = data?.pakku_time;
            const displayTime = (rawTime === '' || rawTime == null) ? '--' : String(rawTime);
            this._pakkuTimeEl.textContent = `合并耗时: ${displayTime}`;
          }
          if (this._removed_countStatsEl) {
            const rawremoved_count = data?.removed_count;
            const num = (rawremoved_count === '' || rawremoved_count == null) ? 0 : Number(rawremoved_count);
            const display = Number.isFinite(num) ? num : 0;
            this._removed_countStatsEl.textContent = `总击杀数: ${display}`;
          }
          if (this._pinyinStatsEl) {
            const raw = data?.merge_counts?.pinyin;
            // 兼容数字、数字字符串; 空/NaN/不可解析时显示0
            const num = (raw === '' || raw == null) ? 0 : Number(raw);
            const display = Number.isFinite(num) ? num : 0;
            this.logger?.debug?.('[CombineSettings] 更新拼音击杀数', raw, '->', display);
            this._pinyinStatsEl.textContent = `击杀数: ${display}`;
          }
          if (this._editDistanceStatsEl) {
            const raw = data?.merge_counts?.edit_distance;
            const num = (raw === '' || raw == null) ? 0 : Number(raw);
            const display = Number.isFinite(num) ? num : 0;
            this._editDistanceStatsEl.textContent = `击杀数: ${display}`;
          }
          if (this._vectorStatsEl) {
            const raw = data?.merge_counts?.vector;
            const num = (raw === '' || raw == null) ? 0 : Number(raw);
            const display = Number.isFinite(num) ? num : 0;
            this._vectorStatsEl.textContent = `击杀数: ${display}`;
          }
        } catch (_) {
          if (this._combineStatsEl) this._combineStatsEl.textContent = '--';
          if (this._pakkuTimeEl) this._pakkuTimeEl.textContent = '合并耗时: --';
          if (this._removed_countStatsEl) this._removed_countStatsEl.textContent = '总击杀数: 0';
          if (this._pinyinStatsEl) this._pinyinStatsEl.textContent = '击杀数: --';
          if (this._editDistanceStatsEl) this._editDistanceStatsEl.textContent = '击杀数: 0';
          if (this._vectorStatsEl) this._vectorStatsEl.textContent = '击杀数: 0';
        }
      }

      // 合并耗时展示行（无设置，仅展示 & 点击刷新统计）
      _createCombineTimeRow() {
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'combine_time');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';
        row.style.cursor = 'pointer';

        const label = document.createElement('span');
        label.style.fontSize = '14px';
        label.style.fontWeight = '500';
        label.style.userSelect = 'none';
        this._pakkuTimeEl = label;
        label.textContent = '合并耗时: --';

        const removed_count = document.createElement('span');
        // 与其它“击杀数”统计统一样式
        removed_count.style.fontSize = '14px';
        removed_count.style.fontWeight = '500';
        removed_count.style.userSelect = 'none';
        this._removed_countStatsEl = removed_count;
        removed_count.textContent = '总击杀数: 0';

        row.appendChild(label);
        row.appendChild(removed_count);
        row.addEventListener('click', () => this._updateCombineStats());
        setTimeout(() => this._updateCombineStats(), 0);
        return row;
      }

      // 显示合并标记：enable_mark (boolean)
      // 已移除：显示合并标记（enable_mark）

      // 合并计数标记样式：mark_style (string via <select>)
      _createMarkStyleRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('mark_style');
        if (typeof current !== 'string') current = 'default';
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'mark_style');
        row.setAttribute('data-type', 'select');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '合并计数标记样式';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        // 注入深色下拉样式
        try {
          if (!document.getElementById('danmaku-markstyle-style')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'danmaku-markstyle-style';
            styleEl.textContent = `
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input {
  background-color: rgba(30,30,30,.92) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255,255,255,.28) !important;
  border-radius: 4px !important;
  outline: none !important;
}
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input:focus {
  box-shadow: 0 0 0 2px rgba(255,255,255,.15);
}
.danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input option {
  background-color: #1e1e1e;
  color: #fff;
}
@media (prefers-color-scheme: dark) {
  .danmaku-setting-row[data-key="mark_style"] select.danmaku-setting-input option { background-color:#222; }
}
`; document.head.appendChild(styleEl);
          }
        } catch (_) { }

        const select = document.createElement('select');
        select.className = 'danmaku-setting-input';
        select.style.width = '140px';
        // 强制覆盖（与字体族一致）
        select.style.setProperty('background-color', 'rgba(30,30,30,.92)', 'important');
        select.style.setProperty('color', '#ffffff', 'important');
        select.style.setProperty('border', '1px solid rgba(255,255,255,.28)', 'important');
        select.style.borderRadius = '4px';
        select.style.padding = '4px 6px';
        select.style.fontSize = '12px';
        select.style.cursor = 'pointer';
        select.style.appearance = 'none';
        select.style.webkitAppearance = 'none';
        select.style.mozAppearance = 'none';

        const options = [
          { value: 'off', label: '关闭' },
          { value: 'sub_low', label: '小写下标' },
          { value: 'sub_pre', label: '前置下标' },
          { value: 'multiply', label: '乘号' },
        ];
        for (const opt of options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === current) o.selected = true;
          select.appendChild(o);
        }

        const applyValue = (val, src = 'ui') => {
          current = String(val || '');
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('mark_style', current);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] mark_style ->', current, 'from', src);
        };

        select.addEventListener('change', () => applyValue(select.value, 'change'));
        row.addEventListener('click', (e) => { if (select.contains(e.target)) return; select.focus(); });

        row.appendChild(title);
        row.appendChild(select);
        return row;
      }

      // 显示标记阈值：mark_threshold (1-20) 滑块
      _createMarkThresholdRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('mark_threshold');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 1;
        if (current < 1) current = 1; else if (current > 20) current = 20;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'mark_threshold');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '显示标记阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '20';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current);
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 1;
          if (n < 1) n = 1; else if (n > 20) n = 20;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('mark_threshold', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] mark_threshold ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      _createUsePinyinRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = !!settings?.get?.('use_pinyin');
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'use_pinyin');
        row.setAttribute('data-type', 'boolean');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '识别谐音弹幕';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';
        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        // 右侧统计
        const stats = document.createElement('span');
        stats.style.fontSize = '14px';
        stats.style.fontWeight = '500';
        stats.style.whiteSpace = 'nowrap';
        stats.style.flex = '0 0 auto';
        stats.style.maxWidth = '180px';
        stats.style.overflow = 'hidden';
        stats.style.textOverflow = 'ellipsis';
        stats.style.textAlign = 'center';
        this._pinyinStatsEl = stats;

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('use_pinyin', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] use_pinyin ->', current, 'from', src);
        };

        // 行级点击（排除点击开关自身避免双触发）
        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

        row.appendChild(leftWrap);
        row.appendChild(stats);
        setTimeout(() => this._updateCombineStats(), 0);
        return row;
      }

      // 放大合并弹幕：enlarge (boolean)
      _createEnlargeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = !!settings?.get?.('enlarge');
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'enlarge');
        row.setAttribute('data-type', 'boolean');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '放大合并弹幕';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';
        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('enlarge', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] enlarge ->', current, 'from', src);
        };

        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

        row.appendChild(leftWrap);
        return row;
      }

      // 编辑距离合并阈值：max_distance (0-20 整数) 滑块 + 击杀数(edit_distance)
      _createEditDistanceRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('max_distance');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
        if (current < 0) current = 0; else if (current > 20) current = 20;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'max_distance');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '编辑距离合并阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '20';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        // 数值显示（在滑块右侧）
        const valSpan = document.createElement('span');
        valSpan.textContent = String(current);
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const stats = document.createElement('span');
        stats.style.fontSize = '14px';
        stats.style.fontWeight = '500';
        stats.style.whiteSpace = 'nowrap';
        stats.style.maxWidth = '180px';
        stats.style.overflow = 'hidden';
        stats.style.textOverflow = 'ellipsis';
        stats.textContent = '击杀数: 0';
        this._editDistanceStatsEl = stats;

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 0;
          if (n < 0) n = 0; else if (n > 20) n = 20;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('max_distance', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] max_distance ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value; });
        // 行级点击：点击行聚焦到滑块
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        row.appendChild(stats);
        setTimeout(() => this._updateCombineStats(), 0);
        return row;
      }

      // 词频向量合并阈值：max_cosine (0-100 整数) 滑块 + 击杀数(vector)
      _createVectorRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('max_cosine');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
        if (current < 0) current = 0; else if (current > 100) current = 100;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'max_cosine');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '词频向量合并阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' %';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const stats = document.createElement('span');
        stats.style.fontSize = '14px';
        stats.style.fontWeight = '500';
        stats.style.whiteSpace = 'nowrap';
        stats.style.maxWidth = '180px';
        stats.style.overflow = 'hidden';
        stats.style.textOverflow = 'ellipsis';
        stats.textContent = '击杀数: 0';
        this._vectorStatsEl = stats;

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 0;
          if (n < 0) n = 0; else if (n > 100) n = 100;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('max_cosine', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] max_cosine ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + " %"; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + " %"; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        row.appendChild(stats);
        setTimeout(() => this._updateCombineStats(), 0);
        return row;
      }

      // 跨模式合并：cross_mode (boolean)
      _createCrossModeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = !!settings?.get?.('cross_mode');
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'cross_mode');
        row.setAttribute('data-type', 'boolean');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '跨模式合并';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';

        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('cross_mode', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] cross_mode ->', current, 'from', src);
        };

        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

        row.appendChild(leftWrap);
        return row;
      }

      // 文本规范化：同时设置 trim_ending / trim_space / trim_width (统一开关)
      _createNormalizeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const ending = !!settings?.get?.('trim_ending');
        const space = !!settings?.get?.('trim_space');
        const width = !!settings?.get?.('trim_width');
        // 只有全部为 true 才视为当前开启
        let current = ending && space && width;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'text_normalize');
        row.setAttribute('data-type', 'boolean-group');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '文本规范化';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';
        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('trim_ending', current);
            liveSettings?.set?.('trim_space', current);
            liveSettings?.set?.('trim_width', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] text_normalize ->', current, 'from', src);
        };

        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

        row.appendChild(leftWrap);
        return row;
      }

      // 合并时间窗口：threshold_seconds (1-30) 滑块
      _createThresholdSecondsRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('threshold_seconds');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 1;
        if (current < 1) current = 1; else if (current > 30) current = 30;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'threshold_seconds');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '合并时间窗口';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '30';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' 秒';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 1;
          if (n < 1) n = 1; else if (n > 30) n = 30;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('threshold_seconds', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] threshold_seconds ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 秒'; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 秒'; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      // 处理块最大数量：max_chunk_size (10-1000) 滑块
      _createMaxChunkSizeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('max_chunk_size');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 10;
        if (current < 10) current = 10; else if (current > 1000) current = 1000;
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'max_chunk_size');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '处理块最大数量';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '10';
        slider.max = '1000';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' 条';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 10;
          if (n < 10) n = 10; else if (n > 1000) n = 1000;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('max_chunk_size', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] max_chunk_size ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 条'; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 条'; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      // 总开关：enable_combine (boolean)
      _createEnableCombineRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = !!settings?.get?.('enable_combine');
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'enable_combine');
        row.setAttribute('data-type', 'boolean');
        // 居中布局
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        // 左侧容器 + 标题 + Switch 按钮
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        // 右侧统计元素
        const stats = document.createElement('span');
        stats.style.fontSize = '16px';
        stats.style.fontWeight = '600';
        stats.style.letterSpacing = '.5px';
        stats.style.whiteSpace = 'nowrap';
        stats.style.flex = '0 0 auto';
        stats.style.maxWidth = '180px';
        stats.style.overflow = 'hidden';
        stats.style.textOverflow = 'ellipsis';
        stats.style.textAlign = 'center';
        this._combineStatsEl = stats;

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('enable_combine', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            // 使用专属去抖保存 + 完成后刷新统计
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] enable_combine ->', current, 'from', src);
        };

        // 行级点击（排除按钮自身）
        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); }
        });
        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '合并总开关';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';

        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        row.appendChild(leftWrap);
        row.appendChild(stats);

        // 初始统计渲染
        setTimeout(() => this._updateCombineStats(), 0);

        return row;
      }

      // 合并后尽量显示为静态弹幕：mode_elevation (boolean)
      _createModeElevationRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = !!settings?.get?.('mode_elevation');
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'mode_elevation');
        row.setAttribute('data-type', 'boolean');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'switch');
        btn.setAttribute('aria-checked', String(current));
        btn.style.position = 'relative';
        btn.style.width = '48px';
        btn.style.height = '22px';
        btn.style.borderRadius = '22px';
        btn.style.border = '1px solid rgba(255,255,255,.3)';
        btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
        btn.style.cursor = 'pointer';
        btn.style.transition = 'background .2s, box-shadow .2s';
        btn.style.outline = 'none';
        btn.style.padding = '0';
        btn.style.marginTop = '6px';

        const knob = document.createElement('span');
        knob.style.position = 'absolute';
        knob.style.top = '50%';
        knob.style.transform = 'translateY(-50%)';
        knob.style.left = current ? '26px' : '4px';
        knob.style.width = '16px';
        knob.style.height = '16px';
        knob.style.borderRadius = '50%';
        knob.style.background = '#fff';
        knob.style.boxShadow = '0 2px 4px rgba(0,0,0,.4)';
        knob.style.transition = 'left .2s';
        btn.appendChild(knob);

        const leftWrap = document.createElement('div');
        leftWrap.style.display = 'flex';
        leftWrap.style.flexDirection = 'column';
        leftWrap.style.alignItems = 'center';
        leftWrap.style.flex = '0 0 auto';

        const title = document.createElement('span');
        title.textContent = '合并后尽量显示为静态';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.marginBottom = '4px';
        title.style.userSelect = 'none';
        leftWrap.appendChild(title);
        leftWrap.appendChild(btn);

        const applyValue = (val, src = 'ui') => {
          current = !!val;
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('mode_elevation', current);
            btn.setAttribute('aria-checked', String(current));
            btn.style.background = current ? 'linear-gradient(90deg,#3fa9ff,#0c82d8)' : 'rgba(255,255,255,.15)';
            knob.style.left = current ? '26px' : '4px';
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] mode_elevation ->', current, 'from', src);
        };

        row.addEventListener('click', (e) => { if (btn.contains(e.target)) return; applyValue(!current, 'row'); });
        btn.addEventListener('click', () => applyValue(!current, 'click'));
        btn.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyValue(!current, 'key'); } });

        row.appendChild(leftWrap);
        return row;
      }

      // 过宽静态弹幕转为滚动阈值：scroll_threshold (0-1920) 滑块 px
      _createScrollThresholdRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('scroll_threshold');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
        if (current < 0) current = 0; else if (current > 1920) current = 1920;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'scroll_threshold');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '过长静态弹幕转为滚动阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1920';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' px';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 0;
          if (n < 0) n = 0; else if (n > 1920) n = 1920;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('scroll_threshold', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] scroll_threshold ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' px'; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' px'; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      // 密度过高时，弹幕缩小阈值：shrink_threshold (0-500) 滑块 条
      _createShrinkThresholdRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('shrink_threshold');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
        if (current < 0) current = 0; else if (current > 500) current = 500;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'shrink_threshold');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '弹幕缩小阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '500';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' 条';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 0;
          if (n < 0) n = 0; else if (n > 500) n = 500;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('shrink_threshold', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] shrink_threshold ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 条'; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 条'; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      // 密度过高时，丢弃弹幕阈值：drop_threshold (0-500) 滑块 条
      _createDropThresholdRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        let current = settings?.get?.('drop_threshold');
        if (typeof current !== 'number' || !Number.isFinite(current)) current = 0;
        if (current < 0) current = 0; else if (current > 500) current = 500;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'drop_threshold');
        row.setAttribute('data-type', 'range');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '6px';
        row.style.textAlign = 'center';

        const title = document.createElement('span');
        title.textContent = '丢弃弹幕阈值';
        title.style.fontSize = '12px';
        title.style.opacity = '.85';
        title.style.userSelect = 'none';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '500';
        slider.step = '1';
        slider.value = String(current);
        slider.style.width = '140px';
        slider.style.cursor = 'pointer';
        slider.style.accentColor = '#3fa9ff';

        const valSpan = document.createElement('span');
        valSpan.textContent = String(current) + ' 条';
        valSpan.style.minWidth = '0';
        valSpan.style.textAlign = 'center';
        valSpan.style.fontSize = '12px';
        valSpan.style.opacity = '.85';
        valSpan.style.whiteSpace = 'nowrap';
        valSpan.style.overflow = 'hidden';
        valSpan.style.textOverflow = 'clip';
        valSpan.style.flex = '0 0 auto';
        valSpan.style.width = '140px';

        const sliderLine = document.createElement('div');
        sliderLine.style.display = 'flex';
        sliderLine.style.flexDirection = 'column';
        sliderLine.style.alignItems = 'center';
        sliderLine.style.gap = '4px';
        sliderLine.style.width = '100%';
        sliderLine.style.maxWidth = '190px';
        sliderLine.appendChild(valSpan);
        sliderLine.appendChild(slider);

        const applyValue = (val, src = 'ui') => {
          let n = parseInt(val, 10);
          if (!Number.isFinite(n)) n = 0;
          if (n < 0) n = 0; else if (n > 500) n = 500;
          current = n;
          slider.value = String(n);
          try {
            const liveSettings = window?.__jfDanmakuGlobal__?.danmakuSettings;
            liveSettings?.set?.('drop_threshold', n);
            this._ensureCombineUpdate();
          } catch (_) { }
          this.logger?.info?.('[CombineSettings] drop_threshold ->', current, 'from', src);
        };

        slider.addEventListener('input', () => { applyValue(slider.value, 'input'); valSpan.textContent = slider.value + ' 条'; });
        slider.addEventListener('change', () => { applyValue(slider.value, 'change'); valSpan.textContent = slider.value + ' 条'; });
        row.addEventListener('click', () => slider.focus());

        row.appendChild(title);
        row.appendChild(sliderLine);
        return row;
      }

      build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();

        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';
        // 两列网格布局
        list.style.display = 'grid';
        list.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        list.style.columnGap = '16px';
        list.style.rowGap = '14px';
        list.style.alignItems = 'stretch';
        list.style.width = '100%';
        const _stickyRow1 = this._createEnableCombineRow();
        const _stickyRow2 = this._createCombineTimeRow();
        // 顶部两栏固定在顶部（随页面滚动吸附），保持两列布局
        try {
          const stickyStyle = (el) => {
            el.style.position = 'sticky';
            el.style.top = '0px';
            el.style.zIndex = '10';
            // 背景与分隔线，避免下层内容透出
            el.style.background = 'rgba(30,30,30,0.92)';
            el.style.borderBottom = '1px solid rgba(255,255,255,.12)';
            // 轻微投影提升层次感
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,.25)';
          };
          stickyStyle(_stickyRow1);
          stickyStyle(_stickyRow2);
        } catch (_) { /* no-op */ }
        list.appendChild(_stickyRow1);
        list.appendChild(_stickyRow2);
        list.appendChild(this._createMarkStyleRow());
        list.appendChild(this._createMarkThresholdRow());
        list.appendChild(this._createThresholdSecondsRow());
        list.appendChild(this._createEnlargeRow());
        list.appendChild(this._createEditDistanceRow());
        list.appendChild(this._createVectorRow());
        list.appendChild(this._createUsePinyinRow());
        list.appendChild(this._createMaxChunkSizeRow());
        list.appendChild(this._createCrossModeRow());
        list.appendChild(this._createNormalizeRow());
        list.appendChild(this._createModeElevationRow());
        list.appendChild(this._createScrollThresholdRow());
        list.appendChild(this._createShrinkThresholdRow());
        list.appendChild(this._createDropThresholdRow());

        // 占位：后续将添加具体参数（阈值、白名单等）
        const placeholder = document.createElement('div');
        placeholder.style.padding = '6px 2px';
        placeholder.style.textAlign = 'center';
        placeholder.style.opacity = '.55';
        placeholder.style.fontSize = '12px';
        // placeholder.textContent = '更多弹幕合并细节参数后续补充...';
        // 占位内容跨两列
        placeholder.style.gridColumn = '1 / span 2';
        list.appendChild(placeholder);

        panel.appendChild(list);
        return panel;
      }
    }

    // 过滤规则设置分页：白名单 / 黑名单 / 替换名单
    // 按 BasicSettingsPage 的风格实现三个可折叠可编辑的列表表单。
    // 数据来源：window.__jfDanmakuGlobal__.danmakuSettings 键 white_list / black_list / force_list
    // white_list / black_list: [{ isRegex: false, pattern: '签到' }, { isRegex: true, pattern: '^.{1,2}$'}]
    // force_list (替换名单): [{ pattern: 'test', replace: '测试' }]
    class FilterSettingsPage {
      constructor(opts = {}) { this.logger = opts.logger || null; this._sectionUpdaters = []; }
      getKey() { return 'filter'; }
      getLabel() { return '过滤规则'; }



      _commit(key, value, trigger = 'manual') {
        try {
          const settings = window.__jfDanmakuGlobal__.danmakuSettings;
          // 规则字段 schema 是 string，需要序列化
          let toStore = value;
          if (Array.isArray(value)) {
            try { toStore = JSON.stringify(value); } catch (_) { toStore = '[]'; }
          }
          settings?.set?.(key, toStore);
          // 专属：确保并触发当前页的保存（完成后刷新统计）
          const p = saveIfAutoOn(this.logger);
          if (p) {p.then(() => { try { this._sectionUpdaters.forEach(fn => { try { fn(); } catch (_) { } }); } catch (_) { }; });}
          this.logger?.info?.('[FilterSettings]', key, 'updated via', trigger, value);

        } catch (e) {
          this.logger?.warn?.('[FilterSettings] commit failed', key, e);
        }
      }


      _createSection(opts) {
        const { key, label, type } = opts; // type: 'wl' | 'bl' | 'repl'
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', key);
        row.setAttribute('data-type', 'list');

        const header = document.createElement('div');
        header.className = 'danmaku-setting-row__label';
        header.style.cursor = 'pointer';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = label;
        header.appendChild(labelSpan);
        const countBadge = document.createElement('span');
        countBadge.style.fontSize = '11px';
        countBadge.style.opacity = '.75';
        countBadge.textContent = '0';
        header.appendChild(countBadge);
        const toggleIcon = document.createElement('span');
        toggleIcon.textContent = '▸';
        toggleIcon.style.marginLeft = '6px';
        toggleIcon.style.transition = 'transform .18s';
        header.appendChild(toggleIcon);
        row.appendChild(header);

        const container = document.createElement('div');
        container.style.marginTop = '6px';
        container.style.display = 'none'; // 折叠初始状态
        container.style.padding = '4px 2px 2px';
        container.style.borderTop = '1px solid rgba(255,255,255,.12)';
        container.style.display = 'none';

        const listWrap = document.createElement('div');
        listWrap.style.display = 'flex';
        listWrap.style.flexDirection = 'column';
        listWrap.style.gap = '4px';
        container.appendChild(listWrap);

        // 说明行
        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        desc.style.marginTop = '4px';
        desc.textContent = type === 'repl' ? '替换名单: 正则/纯文本 pattern 匹配后替换为 replace' : '支持纯文本或正则 (切换开关)。';
        container.appendChild(desc);

        row.appendChild(container);

        // 读取初始数据
        let dataRaw = [];
        try {
          const s = window?.__jfDanmakuGlobal__?.danmakuSettings || null;
          const rawVal = s?.get?.(key);
          if (Array.isArray(rawVal)) dataRaw = rawVal; // 理论上不会：schema 为 string
          else if (typeof rawVal === 'string') {
            const trimmed = rawVal.trim();
            if (trimmed) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) dataRaw = parsed;
              } catch (_) { /* ignore parse error */ }
            }
          }
          if (!Array.isArray(dataRaw)) dataRaw = [];
        } catch (_) { dataRaw = []; }

        let expanded = false;
        const toggle = () => {
          expanded = !expanded;
          container.style.display = expanded ? 'block' : 'none';
          toggleIcon.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
        };
        header.addEventListener('click', toggle);

        // 更新规则数 + 命中次数的 badge
        const updateHitBadge = () => {
          try {
            const g = window.__jfDanmakuGlobal__ || {};
            const rc = g?.danmakuData?.rule_counts;
            const map = { white_list: 'whitelist', black_list: 'blacklist', force_list: 'forcelist' };
            const rcKey = map[key];
            let hit = 0;
            if (rc && rcKey && rc[rcKey] != null) {
              const num = Number(rc[rcKey]);
              if (Number.isFinite(num)) hit = num; else if (typeof rc[rcKey] === 'string' && rc[rcKey].trim() !== '') {
                const n2 = Number(rc[rcKey].trim()); if (Number.isFinite(n2)) hit = n2;
              }
            }
            countBadge.textContent = `规则数:${dataRaw.length} 命中次数:${hit}`;
          } catch (_) {
            countBadge.textContent = `规则数:${dataRaw.length} 命中次数:0`;
          }
        };

        const rebuild = () => {
          listWrap.innerHTML = '';
          // 初步写入规则数，命中数稍后更新
          countBadge.textContent = `规则数:${dataRaw.length} 命中次数:--`;
          const makeAddRow = (position = 'bottom') => {
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.textContent = '+ 添加';
            addBtn.style.width = '100%';
            addBtn.style.padding = '6px 8px';
            addBtn.style.fontSize = '12px';
            addBtn.style.background = 'rgba(255,255,255,.08)';
            addBtn.style.color = '#fff';
            addBtn.style.border = '1px dashed rgba(255,255,255,.3)';
            addBtn.style.borderRadius = '6px';
            addBtn.style.cursor = 'pointer';
            addBtn.addEventListener('mouseenter', () => addBtn.style.background = 'rgba(255,255,255,.15)');
            addBtn.addEventListener('mouseleave', () => addBtn.style.background = 'rgba(255,255,255,.08)');
            addBtn.addEventListener('click', () => {
              if (type === 'repl') dataRaw.push({ pattern: '', replace: '' });
              else dataRaw.push({ isRegex: false, pattern: '' });
              this._commit(key, dataRaw, 'add');
              rebuild();
            });
            if (position === 'top') listWrap.appendChild(addBtn); else listWrap.appendChild(addBtn);
          };

          if (dataRaw.length === 0) {
            makeAddRow('top');
            return;
          }

          dataRaw.forEach((item, idx) => {
            const line = document.createElement('div');
            line.style.display = 'flex';
            line.style.alignItems = 'center';
            line.style.gap = '6px';
            line.style.padding = '6px 6px';
            line.style.background = 'rgba(255,255,255,.05)';
            line.style.border = '1px solid rgba(255,255,255,.15)';
            line.style.borderRadius = '6px';
            line.style.position = 'relative';

            if (type !== 'repl') {
              // isRegex switch
              const regexToggle = document.createElement('button');
              regexToggle.type = 'button';
              regexToggle.textContent = item.isRegex ? '正则' : '文本';
              regexToggle.style.minWidth = '44px';
              regexToggle.style.fontSize = '11px';
              regexToggle.style.padding = '4px 6px';
              regexToggle.style.border = '1px solid rgba(255,255,255,.25)';
              regexToggle.style.borderRadius = '4px';
              regexToggle.style.background = item.isRegex ? '#3fa9ff' : 'rgba(255,255,255,.12)';
              regexToggle.style.cursor = 'pointer';
              regexToggle.addEventListener('click', () => {
                item.isRegex = !item.isRegex;
                regexToggle.textContent = item.isRegex ? '正则' : '文本';
                regexToggle.style.background = item.isRegex ? '#3fa9ff' : 'rgba(255,255,255,.12)';
                this._commit(key, dataRaw, 'toggle');
              });
              line.appendChild(regexToggle);
            }

            const patternInput = document.createElement('input');
            patternInput.type = 'text';
            patternInput.placeholder = 'pattern';
            patternInput.value = item.pattern || '';
            patternInput.className = 'danmaku-setting-input';
            patternInput.style.flex = '1 1 auto';
            patternInput.style.minWidth = '120px';
            patternInput.addEventListener('input', () => { item.pattern = patternInput.value; });
            patternInput.addEventListener('change', () => { this._commit(key, dataRaw, 'pattern-change'); });
            line.appendChild(patternInput);

            if (type === 'repl') {
              const replaceInput = document.createElement('input');
              replaceInput.type = 'text';
              replaceInput.placeholder = 'replace';
              replaceInput.value = item.replace || '';
              replaceInput.className = 'danmaku-setting-input';
              replaceInput.style.flex = '1 1 auto';
              replaceInput.style.minWidth = '120px';
              replaceInput.addEventListener('input', () => { item.replace = replaceInput.value; });
              replaceInput.addEventListener('change', () => { this._commit(key, dataRaw, 'replace-change'); });
              line.appendChild(replaceInput);
            }

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.textContent = '✕';
            delBtn.title = '删除';
            delBtn.style.padding = '4px 6px';
            delBtn.style.fontSize = '12px';
            delBtn.style.background = 'rgba(255,80,80,.25)';
            delBtn.style.border = '1px solid rgba(255,80,80,.4)';
            delBtn.style.borderRadius = '4px';
            delBtn.style.cursor = 'pointer';
            delBtn.addEventListener('mouseenter', () => delBtn.style.background = 'rgba(255,80,80,.4)');
            delBtn.addEventListener('mouseleave', () => delBtn.style.background = 'rgba(255,80,80,.25)');
            delBtn.addEventListener('click', () => {
              dataRaw.splice(idx, 1);
              this._commit(key, dataRaw, 'delete');
              rebuild();
            });
            line.appendChild(delBtn);

            listWrap.appendChild(line);
          });

          // 添加按钮放到底部
          makeAddRow('bottom');
          // 重建后刷新命中次数
          updateHitBadge();
        };

        rebuild();
        // 注册全局刷新器（用于保存后统一刷新）
        this._sectionUpdaters.push(updateHitBadge);
        // 初始异步刷新一次（确保 rule_counts 可能稍后写入）
        setTimeout(updateHitBadge, 0);
        return row;
      }

      build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();

        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';

        list.appendChild(this._createSection({ key: 'white_list', label: '白名单', type: 'wl' }));
        list.appendChild(this._createSection({ key: 'black_list', label: '黑名单', type: 'bl' }));
        list.appendChild(this._createSection({ key: 'force_list', label: '替换名单', type: 'repl' }));

        // 全局说明：显示白/黑名单的命中处理逻辑
        const footerNote = document.createElement('div');
        footerNote.className = 'danmaku-setting-row__desc';
        footerNote.style.marginTop = '8px';
        footerNote.style.opacity = '.85';
        footerNote.innerHTML = '白名单: 命中时无视合并规则<br>黑名单: 命中时直接删除<br>替换名单: 命中时替换文本后继续处理<br>需要开启弹幕合并总开关才能生效';
        list.appendChild(footerNote);

        panel.appendChild(list);
        return panel;
      }
    }

    // 弹幕池分页：来源统计 -> 物理小球（拖拽/碰撞/重力）


    class CommentPoolPage {
      constructor(opts = {}) {
        this.logger = opts.logger || null;
        this._balls = [];
        this._raf = null;
        this._lastT = 0;
        this._boxEl = null;
        this._panel = null;
        this._resizeOb = null; // ResizeObserver
        this._activeMo = null; // MutationObserver for data-active
        this._trashZoneEl = null;
      }
      getKey() { return 'commentpool'; }
      getLabel() { return '弹幕池'; }

      _readStats() {
        try {
          const g = window.__jfDanmakuGlobal__ || {};
          const stats = g?.danmakuData?.source_stats;
          if (!stats || typeof stats !== 'object') return null;
          const entries = Object.entries(stats)
            .map(([name, v]) => ({ name, count: Number(v) || 0 }))
            .filter(e => e.count > 0);
          if (!entries.length) return null;
          return entries;
        } catch (_) { return null; }
      }

      _readInitialBlacklist() {
        try {
          const g = window.__jfDanmakuGlobal__ || {};
          const raw = g?.danmakuData?.settings?.black_source_list;
          let arr = [];
          if (Array.isArray(raw)) {
            arr = raw;
          } else if (typeof raw === 'string') {
            const s = raw.trim();
            if (s) {
              try {
                const parsed = JSON.parse(s);
                if (Array.isArray(parsed)) arr = parsed; else arr = s.split(',');
              } catch (_) { arr = s.split(','); }
            }
          }
          const list = arr.map(x => String(x).trim()).filter(Boolean);
          const set = new Set(list.map(x => x.toLowerCase()));
          return { list, set };
        } catch (_) { return { list: [], set: new Set() }; }
      }

      _createBox() {
        const box = document.createElement('div');
        box.style.position = 'relative';
        box.style.width = '100%';
        box.style.height = '260px';
        box.style.background = 'rgba(255,255,255,.05)';
        box.style.border = '1px solid rgba(255,255,255,.15)';
        box.style.borderRadius = '10px';
        box.style.overflow = 'hidden';
        // 触屏优化：允许纵向滚动页面（在主框空白区域上下滑动可滚动）
        // 拖拽小球本身仍通过小球元素的 touch-action:none 阻止页面滚动
        box.style.touchAction = 'pan-y';
        box.style.userSelect = 'none';
        return box;
      }

      _makeBallEl(label, color) {
        // 解析名称与计数
        const parts = String(label ?? '').split('\n');
        const name = (parts[0] || '').trim();
        const countText = (parts[1] || '').trim();
        const initial = name ? name[0] : '·';

        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = '0px';
        el.style.top = '0px';
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.borderRadius = '50%';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.color = '#fff';
        el.style.textAlign = 'center';
        el.style.padding = '4px';
        el.style.boxSizing = 'border-box';
        el.style.cursor = 'grab';
        // 触屏优化：禁用浏览器手势滚动/缩放，避免拖动时页面滚动
        el.style.touchAction = 'none';
        el.style.willChange = 'transform';
        el.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,.35), rgba(255,255,255,.05) 35%), ${color}`;
        el.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
        el.title = name ? `${name} (${countText || '0'})` : (countText || '');

        // 背景水印（名称首字母/首字）
        const bg = document.createElement('div');
        bg.className = 'jf-ball-bg';
        bg.style.position = 'absolute';
        bg.style.inset = '0';
        bg.style.display = 'flex';
        bg.style.alignItems = 'center';
        bg.style.justifyContent = 'center';
        bg.style.pointerEvents = 'none';
        bg.style.userSelect = 'none';
        bg.style.fontWeight = '800';
        bg.style.lineHeight = '1';
        bg.style.letterSpacing = '0';
        bg.style.color = 'rgba(255,255,255,.12)';
        bg.style.textShadow = '0 1px 2px rgba(0,0,0,.2)';
        bg.style.zIndex = '0';
        bg.textContent = initial;

        // 前景：只显示计数，字号固定（不随球大小变化）
        const fg = document.createElement('div');
        fg.className = 'jf-ball-count';
        fg.style.position = 'relative';
        fg.style.zIndex = '1';
        fg.style.fontSize = '12px';
        fg.style.fontWeight = '600';
        fg.style.textShadow = '0 1px 2px rgba(0,0,0,.35)';
        fg.textContent = countText || '';

        el.appendChild(bg);
        el.appendChild(fg);
        // 保存引用，方便外部依据半径设定字号
        el._bgWatermark = bg;
        return el;
      }

      _colorForIndex(i) {
        const palette = [
          'linear-gradient(135deg,#3fa9ff,#0c82d8)',
          'linear-gradient(135deg,#ff7a59,#ff3d6e)',
          'linear-gradient(135deg,#6bd06b,#2fbf71)',
          'linear-gradient(135deg,#a78bfa,#6d28d9)',
          'linear-gradient(135deg,#fbbf24,#f59e0b)',
          'linear-gradient(135deg,#34d399,#10b981)',
          'linear-gradient(135deg,#f472b6,#ec4899)'
        ];
        return palette[i % palette.length];
      }

      _initBalls(stats) {
        const rect = this._boxEl.getBoundingClientRect();
        const W = Math.max(50, rect.width);
        const H = Math.max(50, rect.height);
        const max = Math.max(...stats.map(s => s.count));
        const minR = 14, maxR = 44;
        this._balls = stats.map((s, i) => {
          const r = minR + (max > 0 ? (maxR - minR) * (s.count / max) : 0);
          const el = this._makeBallEl(`${s.name}\n${s.count}`, this._colorForIndex(i));
          el.style.width = `${Math.round(r * 2)}px`;
          el.style.height = `${Math.round(r * 2)}px`;
          // 背景水印字号 ~ 1.1 × 半径，最小 12px
          const bgFS = Math.max(12, Math.round(r * 1.1));
          if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
          this._boxEl.appendChild(el);
          // 随机放置，避免重叠：尝试多次
          let x = r + Math.random() * (W - 2 * r);
          let y = r + Math.random() * (H - 2 * r);
          let tries = 0;
          const temp = { x, y, r };
          while (tries++ < 50 && this._balls?.length) {
            let overlap = false;
            for (const b of this._balls) {
              const dx = temp.x - b.x; const dy = temp.y - b.y;
              if (Math.hypot(dx, dy) < temp.r + b.r + 2) { overlap = true; break; }
            }
            if (!overlap) break;
            temp.x = r + Math.random() * (W - 2 * r);
            temp.y = r + Math.random() * (H - 2 * r);
          }
          x = temp.x; y = temp.y;
          // 基于半径设定质量（二维近似：m ∝ r^2，密度取 1）
          const mass = r * r;
          // 初始化平滑随机漂移（力向量，缓慢变化）
          const _driftAng = Math.random() * Math.PI * 2;
          const _DRIFT_FORCE_MIN = 40, _DRIFT_FORCE_MAX = 120;
          const _driftMag = _DRIFT_FORCE_MIN + Math.random() * (_DRIFT_FORCE_MAX - _DRIFT_FORCE_MIN);
          const ball = {
            el, name: s.name, count: s.count, x, y,
            vx: 0, vy: 0, r, mass,
            dragging: false, _px: 0, _py: 0, _pt: 0,
            // 漂移力当前值与目标值、下次切换时间
            _driftFx: 0, _driftFy: 0,
            _driftTargetFx: Math.cos(_driftAng) * _driftMag,
            _driftTargetFy: Math.sin(_driftAng) * _driftMag,
            _driftNext: performance.now() + (150 + Math.random() * 200)
          };
          this._attachDrag(ball);
          return ball;
        });
      }

      _attachDrag(ball) {
        const onDown = (e) => {
          // 仅响应左键拖拽；右键在此截断，避免冒泡到外层导致面板关闭
          if (typeof e.button === 'number' && e.button !== 0) {
            try { e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.(); } catch (_) { }
            return;
          }
          try { ball.el.setPointerCapture?.(e.pointerId); } catch (_) { }
          ball.dragging = true;
          ball.el.style.cursor = 'grabbing';
          ball.vx = 0; ball.vy = 0;
          // 在垃圾桶内与在主容器内，偏移计算不同
          if (ball.inTrash) {
            // 使用幽灵球随鼠标移动，隐藏原球
            const r = ball.r;
            if (!ball._ghostEl) this._createGhostEl(ball);
            ball.el.style.visibility = 'hidden';
            ball._ghostEl.style.left = `${Math.round(e.clientX - r)}px`;
            ball._ghostEl.style.top = `${Math.round(e.clientY - r)}px`;
            const now = performance.now();
            ball._pt = now; ball._px = e.clientX; ball._py = e.clientY;
          } else {
            const p = this._toLocal(e.clientX, e.clientY);
            ball._offsetX = p.x - ball.x;
            ball._offsetY = p.y - ball.y;
            ball._px = p.x; ball._py = p.y; ball._pt = performance.now();
          }
          e.preventDefault?.(); e.stopPropagation?.();
        };
        const onMove = (e) => {
          if (!ball.dragging) return;
          // 触屏拖动时阻止页面滚动/回弹
          try { e.preventDefault?.(); } catch (_) { }
          if (ball.inTrash) {
            // 幽灵球跟随
            if (!ball._ghostEl) this._createGhostEl(ball);
            const r = ball.r;
            const nx = Math.round(e.clientX - r);
            const ny = Math.round(e.clientY - r);
            ball._ghostEl.style.left = `${nx}px`;
            ball._ghostEl.style.top = `${ny}px`;
          } else {
            // 主框内拖拽 + 框外幽灵球
            const inside = this._isPointInBox(e.clientX, e.clientY);
            if (inside) {
              // 回到框内：移除幽灵球、显示原球并按原逻辑更新
              if (ball._ghostEl) this._removeGhostEl(ball);
              if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
              const p = this._toLocal(e.clientX, e.clientY);
              const x = p.x - ball._offsetX; const y = p.y - ball._offsetY;
              const rect = this._boxEl.getBoundingClientRect();
              const W = rect.width, H = rect.height; const r = ball.r;
              ball.x = Math.max(r, Math.min(W - r, x));
              ball.y = Math.max(r, Math.min(H - r, y));
              // 估算拖拽速度以便松手后“掷出”
              const now = performance.now();
              const dt = Math.max(1, now - (ball._pt || now));
              ball.vx = (p.x - (ball._px || p.x)) / dt * 16;
              ball.vy = (p.y - (ball._py || p.y)) / dt * 16;
              ball._px = p.x; ball._py = p.y; ball._pt = now;
            } else {
              // 框外：隐藏原球，显示幽灵球跟随鼠标（以中心对准指针）
              if (!ball._ghostEl) {
                this._createGhostEl(ball);
              }
              if (ball.el.style.visibility !== 'hidden') ball.el.style.visibility = 'hidden';
              const r = ball.r;
              const nx = Math.round(e.clientX - r);
              const ny = Math.round(e.clientY - r);
              ball._ghostEl.style.left = `${nx}px`;
              ball._ghostEl.style.top = `${ny}px`;
            }
          }
          // 顶部垃圾桶命中检测（基于指针屏幕坐标）
          if (this._trashZoneEl) {
            try {
              const rct = this._trashZoneEl.getBoundingClientRect();
              const over = e.clientX >= rct.left && e.clientX <= rct.right && e.clientY >= rct.top && e.clientY <= rct.bottom;
              ball._overTrash = !!over;
              this._trashZoneEl.style.outlineColor = over ? 'rgba(255,80,80,.95)' : 'rgba(255,255,255,.25)';
              this._trashZoneEl.style.background = over ? 'linear-gradient(135deg, rgba(255,64,64,.25), rgba(255,0,0,.12))' : 'rgba(255,255,255,.04)';
            } catch (_) { }
          }
        };
        const onUp = async (e) => {
          const wasDragging = ball.dragging;
          ball.dragging = false;
          ball.el.style.cursor = 'grab';
          try { ball.el.releasePointerCapture?.(e.pointerId); } catch (_) { }
          // 根据松手位置决定逻辑
          if (!wasDragging) return;
          const overTrash = this._isPointInTrash(e.clientX, e.clientY);
          // 触屏增加“命中松弛”，让靠近主框边缘也视为命中，方便从黑名单拖出
          const slack = (e.pointerType === 'touch') ? Math.max(24, Math.min(48, Math.round(ball.r))) : 0;
          const overBox = this._isPointInBox(e.clientX, e.clientY);
          const nearBox = slack > 0 ? this._isPointNearBox(e.clientX, e.clientY, slack) : false;
          // 清理临时样式（若来自垃圾桶视口拖拽）
          if (ball._prevPosStyle != null) {
            // 恢复为相对排版（若仍在垃圾桶）或交由盒子物理渲染
            ball.el.style.position = ball._prevPosStyle;
            ball.el.style.left = ball._prevLeft || '';
            ball.el.style.top = ball._prevTop || '';
            ball.el.style.transform = ball._prevTransform || '';
            ball._prevPosStyle = null; ball._prevLeft = null; ball._prevTop = null; ball._prevTransform = null;
          }
          // 情况1：从主盒拖到垃圾桶
          if (!ball.inTrash && overTrash) {
            if (ball._ghostEl) this._removeGhostEl(ball);
            if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
            await this._moveBallToTrash(ball);
            return;
          }
          // 情况2：从垃圾桶拖回主盒
          if (ball.inTrash && (overBox || nearBox)) {
            if (ball._ghostEl) this._removeGhostEl(ball);
            if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
            await this._moveBallBackToBox(ball, e.clientX, e.clientY);
            return;
          }
          // 情况2.1：仍在垃圾桶或框外松手 -> 保留在垃圾桶，清理幽灵球并恢复可见
          if (ball.inTrash && !overBox) {
            if (ball._ghostEl) this._removeGhostEl(ball);
            if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
            return;
          }
          // 情况3：主盒拖拽，松手在盒内 -> 依靠现有位置即可
          if (!ball.inTrash && overBox) {
            if (ball._ghostEl) this._removeGhostEl(ball);
            if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
            return;
          }
          // 情况4：主盒拖拽，松手在盒外且不在垃圾桶 -> 还原显示（位置保持最近一次盒内位置）
          if (!ball.inTrash && !overTrash && !overBox) {
            if (ball._ghostEl) this._removeGhostEl(ball);
            if (ball.el.style.visibility === 'hidden') ball.el.style.visibility = 'visible';
            return;
          }
          // 其他：回到原位（主盒由下一帧渲染，垃圾桶维持布局）
        };
        // 当触控被系统手势中断（pointercancel），按松手处理，防止卡住
        const onCancel = (e) => { try { onUp(e); } catch (_) { } };
        // 悬停暂停（仅限鼠标）
        const onEnter = (e) => {
          try {
            if ((e.pointerType || 'mouse') !== 'mouse') return;
            if (ball.dragging || ball.inTrash) return;
            ball.hoverPause = true;
            // 记录当前速度并清零，避免在暂停时残余移动
            ball._preHoverVx = ball.vx; ball._preHoverVy = ball.vy;
            ball.vx = 0; ball.vy = 0;
          } catch (_) { }
        };
        const onLeave = (e) => {
          try {
            if ((e.pointerType || 'mouse') !== 'mouse') return;
            ball.hoverPause = false;
            // 不恢复速度，保持静止，由系统力再次缓慢推动
          } catch (_) { }
        };
        // 右键菜单：阻止默认并显示自定义菜单
        const onCtx = (e) => {
          try { e.preventDefault?.(); e.stopPropagation?.(); } catch (_) { }
          this._showBallMenu(ball, e.clientX, e.clientY);
        };
        ball.el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('pointercancel', onCancel, { passive: true });
        ball.el.addEventListener('pointerenter', onEnter);
        ball.el.addEventListener('pointerleave', onLeave);
        // 捕获阶段拦截，确保外层不会先关闭面板
        ball.el.addEventListener('contextmenu', onCtx, { capture: true });
        // 保存引用以便销毁时解绑
        ball._onDown = onDown;
        ball._onMove = onMove;
        ball._onUp = onUp;
        ball._onCancel = onCancel;
        ball._onEnter = onEnter;
        ball._onLeave = onLeave;
        ball._onCtx = onCtx;
        // 记录以便未来销毁（此处简化不做 remove，页面重建会释放元素引用）
      }

      _showBallMenu(ball, x, y) {
        try { this._closeMenu(); } catch (_) { }
        const menu = document.createElement('div');
        // 在面板内使用绝对定位，坐标以面板为参考系
        menu.style.position = 'absolute';
        // 初始定位占位，稍后根据尺寸再校正
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.style.background = 'rgba(20,20,20,.96)';
        menu.style.backdropFilter = 'blur(4px)';
        menu.style.border = '1px solid rgba(255,255,255,.15)';
        menu.style.borderRadius = '8px';
        menu.style.boxShadow = '0 8px 24px rgba(0,0,0,.45)';
        menu.style.padding = '6px';
        menu.style.minWidth = '160px';
        menu.style.color = '#fff';
        menu.style.zIndex = '999999';
        menu.style.fontSize = '12px';
        menu.style.userSelect = 'none';

        const mkItem = (label, handler, { danger = false, disabled = false } = {}) => {
          const it = document.createElement('div');
          it.textContent = label;
          it.style.padding = '8px 10px';
          it.style.borderRadius = '6px';
          it.style.cursor = disabled ? 'not-allowed' : 'pointer';
          it.style.opacity = disabled ? '.45' : '1';
          it.style.color = danger ? 'rgb(255,120,120)' : '#fff';
          it.addEventListener('mouseenter', () => { if (!disabled) it.style.background = 'rgba(255,255,255,.08)'; });
          it.addEventListener('mouseleave', () => { it.style.background = 'transparent'; });
          if (!disabled && typeof handler === 'function') {
            it.addEventListener('click', async () => {
              try { await handler(); } finally { this._closeMenu(); }
            });
          }
          menu.appendChild(it);
          return it;
        };

        // 动态加入/移出黑名单
        if (ball.inTrash) {
          mkItem('移出黑名单', async () => {
            // 若在垃圾桶，回到主框，位置使用菜单触发坐标
            await this._moveBallBackToBox(ball, x, y);
          });
        } else {
          mkItem('加入黑名单', async () => {
            await this._moveBallToTrash(ball, true);
          }, { danger: true });
        }
        // 占位项（暂未实现功能）
        mkItem('查看来源信息（暂未实现）', () => { }, { disabled: true });
        mkItem('更多操作（暂未实现）', () => { }, { disabled: true });
        mkItem('取消', () => { });

        // 将菜单作为设置面板的一部分，避免触发面板的“点击外部关闭”
        const host = this._panel || document.body;
        host.appendChild(menu);
        // 阻止菜单内部的指针与点击事件向上冒泡，避免外层捕获到并关闭面板
        const stopCap = (ev) => { try { ev.stopPropagation(); ev.stopImmediatePropagation?.(); } catch (_) { } };
        const stopBub = (ev) => { try { ev.stopPropagation(); } catch (_) { } };
        // 捕获阶段阻断指针类事件，防止外层关闭
        menu.addEventListener('pointerdown', stopCap, { capture: true });
        menu.addEventListener('pointerup', stopCap, { capture: true });
        menu.addEventListener('contextmenu', stopCap, { capture: true });
        // 冒泡阶段阻断 click（允许目标点击处理器先执行，再阻断向外层冒泡）
        menu.addEventListener('click', stopBub, { capture: false });
        this._stopMenuCap = stopCap;
        this._stopMenuBubble = stopBub;
        // 在面板内校正坐标，避免超出面板可视范围
        try {
          const w = menu.offsetWidth || 160;
          const h = menu.offsetHeight || 10;
          const hostRect = host.getBoundingClientRect();
          // 将屏幕坐标转换为面板内坐标
          let nx = x - hostRect.left;
          let ny = y - hostRect.top;
          nx = Math.min(Math.max(8, nx), Math.max(8, (hostRect.width - w - 8)));
          ny = Math.min(Math.max(8, ny), Math.max(8, (hostRect.height - h - 8)));
          menu.style.left = `${nx}px`;
          menu.style.top = `${ny}px`;
        } catch (_) { }

        const onDocDown = (ev) => {
          try { if (!menu.contains(ev.target)) this._closeMenu(); } catch (_) { }
        };
        const onKey = (ev) => { if (ev.key === 'Escape') this._closeMenu(); };
        const onScroll = () => { this._closeMenu(); };
        setTimeout(() => { // 延迟绑定以避免立即触发
          document.addEventListener('pointerdown', onDocDown, { passive: true, capture: true });
          window.addEventListener('scroll', onScroll, { passive: true });
          window.addEventListener('resize', onScroll, { passive: true });
          window.addEventListener('keydown', onKey, { passive: true });
        }, 0);

        this._menuEl = menu;
        this._menuBallRef = ball;
        this._onMenuDocDown = onDocDown;
        this._onMenuScroll = onScroll;
        this._onMenuKey = onKey;
      }

      _closeMenu() {
        try {
          if (this._menuEl?.parentElement) {
            try {
              // 解除菜单上为阻止冒泡/捕获绑定的监听
              if (this._stopMenuCap) {
                this._menuEl.removeEventListener('pointerdown', this._stopMenuCap, { capture: true });
                this._menuEl.removeEventListener('pointerup', this._stopMenuCap, { capture: true });
                this._menuEl.removeEventListener('contextmenu', this._stopMenuCap, { capture: true });
              }
              if (this._stopMenuBubble) {
                this._menuEl.removeEventListener('click', this._stopMenuBubble, { capture: false });
              }
            } catch (_) { }
            this._menuEl.parentElement.removeChild(this._menuEl);
          }
        } catch (_) { }
        try {
          if (this._onMenuDocDown) document.removeEventListener('pointerdown', this._onMenuDocDown, { capture: true });
        } catch (_) { }
        try { if (this._onMenuScroll) window.removeEventListener('scroll', this._onMenuScroll); } catch (_) { }
        try { if (this._onMenuScroll) window.removeEventListener('resize', this._onMenuScroll); } catch (_) { }
        try { if (this._onMenuKey) window.removeEventListener('keydown', this._onMenuKey); } catch (_) { }
        this._menuEl = null; this._menuBallRef = null; this._stopMenuBubble = null; this._stopMenuCap = null;
        this._onMenuDocDown = null; this._onMenuScroll = null; this._onMenuKey = null;
      }

      _isPointInTrash(clientX, clientY) {
        try {
          if (!this._trashZoneEl) return false;
          const r = this._trashZoneEl.getBoundingClientRect();
          return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        } catch (_) { return false; }
      }

      _isPointInBox(clientX, clientY) {
        try {
          if (!this._boxEl) return false;
          const r = this._boxEl.getBoundingClientRect();
          return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
        } catch (_) { return false; }
      }

      // 触屏松弛命中：允许在主框边缘 slack 像素内判为“接近命中”
      _isPointNearBox(clientX, clientY, slack = 24) {
        try {
          if (!this._boxEl) return false;
          const r = this._boxEl.getBoundingClientRect();
          const rs = { left: r.left - slack, top: r.top - slack, right: r.right + slack, bottom: r.bottom + slack };
          return clientX >= rs.left && clientX <= rs.right && clientY >= rs.top && clientY <= rs.bottom;
        } catch (_) { return false; }
      }

      _createGhostEl(ball) {
        try {
          const g = document.createElement('div');
          const size = Math.round(ball.r * 2);
          g.style.position = 'fixed';
          g.style.left = '0px';
          g.style.top = '0px';
          g.style.width = `${size}px`;
          g.style.height = `${size}px`;
          g.style.borderRadius = '50%';
          g.style.pointerEvents = 'none';
          g.style.backdropFilter = 'none';
          g.style.filter = 'none';
          g.style.opacity = '0.7';
          g.style.boxShadow = '0 6px 16px rgba(0,0,0,.35)';
          // 复制背景和一个简单的文本（仅来源名，不显示数量以避免过密）
          g.style.background = ball.el.style.background || 'rgba(255,255,255,.2)';
          g.style.display = 'flex';
          g.style.alignItems = 'center';
          g.style.justifyContent = 'center';
          g.style.color = '#fff';
          g.style.fontSize = '11px';
          g.style.userSelect = 'none';
          g.style.zIndex = '999999';
          g.textContent = ball.name || '';
          document.body.appendChild(g);
          ball._ghostEl = g;
        } catch (_) { }
      }

      _removeGhostEl(ball) {
        try {
          if (ball?._ghostEl?.parentElement) {
            ball._ghostEl.parentElement.removeChild(ball._ghostEl);
          }
        } catch (_) { }
        ball._ghostEl = null;
      }

      async _moveBallToTrash(ball, persist = true) {
        try {
          this._closeMenu();
          // 标记并移入垃圾桶容器，暂停物理与渲染
          ball.inTrash = true;
          ball.vx = 0; ball.vy = 0;
          if (ball._ghostEl) this._removeGhostEl(ball);
          ball.el.style.visibility = 'visible';
          if (this._trashZoneEl && ball.el?.parentElement !== this._trashZoneEl) {
            this._trashZoneEl.appendChild(ball.el);
          }
          // 作为列表项布局
          ball.el.style.position = 'relative';
          ball.el.style.transform = 'none';
          ball.el.style.left = 'auto'; ball.el.style.top = 'auto';
          ball.el.style.margin = '4px';
          ball.el.style.zIndex = '1'; // 置于背景水印之上
          // 更新设置：加入黑名单
          if (persist) {
            await this._blacklistUpdate(ball.name, true);
          }
        } catch (e) {
          this.logger?.warn?.('[CommentPool] 移入垃圾桶失败', e);
        } finally {
          if (this._trashZoneEl) {
            this._trashZoneEl.style.outlineColor = 'rgba(255,255,255,.25)';
            this._trashZoneEl.style.background = 'rgba(255,255,255,.04)';
          }
        }
      }

      async _moveBallBackToBox(ball, clientX, clientY) {
        try {
          this._closeMenu();
          // 从垃圾桶恢复到主容器，恢复物理
          ball.inTrash = false;
          if (this._boxEl && ball.el?.parentElement !== this._boxEl) {
            this._boxEl.appendChild(ball.el);
          }
          ball.el.style.margin = '0';
          ball.el.style.position = 'absolute';
          ball.el.style.zIndex = ''; // 清理垃圾桶内的叠放样式
          // 依据半径重新设置水印字号
          try {
            const r = ball.r;
            const bgFS = Math.max(12, Math.round(r * 1.1));
            if (ball.el && ball.el._bgWatermark) ball.el._bgWatermark.style.fontSize = `${bgFS}px`;
          } catch (_) { }
          // 设置回盒子坐标
          const p = this._toLocal(clientX, clientY);
          const rect = this._boxEl.getBoundingClientRect();
          const W = rect.width, H = rect.height; const r = ball.r;
          ball.x = Math.max(r, Math.min(W - r, p.x));
          ball.y = Math.max(r, Math.min(H - r, p.y));
          // 移除 transform 由渲染循环接管
          // 黑名单移除
          await this._blacklistUpdate(ball.name, false);
        } catch (e) {
          this.logger?.warn?.('[CommentPool] 恢复至主框失败', e);
        } finally {
          if (this._trashZoneEl) {
            this._trashZoneEl.style.outlineColor = 'rgba(255,255,255,.25)';
            this._trashZoneEl.style.background = 'rgba(255,255,255,.04)';
          }
        }
      }

      async _blacklistUpdate(name, add) {
        try {
          const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
          const s = g.danmakuSettings;
          if (!(s?.get && s?.set)) return;
          const raw = s.get('black_source_list') || '';
          let arr = [];
          if (typeof raw === 'string' && raw.trim()) {
            try { const parsed = JSON.parse(raw.trim()); if (Array.isArray(parsed)) arr = parsed; } catch (_) {
              arr = raw.split(',').map(x => x.trim()).filter(Boolean);
            }
          }
          const key = String(name || '').trim().toLowerCase();
          const lower = arr.map(x => String(x).toLowerCase());
          if (add) {
            if (!lower.includes(key)) arr.push(key);
          } else {
            arr = arr.filter(x => String(x).toLowerCase() !== key);
          }
          s.set('black_source_list', JSON.stringify(arr));
          try { saveIfAutoOn(this.logger); } catch (e) { this.logger?.warn?.('[CommentPool] 保存 black_source_list 失败', e); }
          this.logger?.info?.(`[CommentPool] ${add ? '已加入' : '已移除'}黑名单来源`, key);
        } catch (e) {
          this.logger?.warn?.('[CommentPool] 更新黑名单失败', e);
        }
      }

      _toLocal(clientX, clientY) {
        const rect = this._boxEl.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      }

      _step = (t) => {
        if (!this._boxEl?.isConnected) { this._raf = null; return; }
        // 不可见（当前tab未激活）则暂停动画，待激活时由观察器恢复
        if (this._panel && this._panel.getAttribute('data-active') !== 'true') {
          this._raf = null;
          return;
        }
        const dt = Math.min(32, (t - (this._lastT || t))) || 16; // ms
        this._lastT = t;
        const rect = this._boxEl.getBoundingClientRect();
        const W = rect.width, H = rect.height;
        // 已移除重力
        // 空气阻力“力”系数基准：线性 c1（~Stokes，∝r），二次 c2（∝截面积∝r^2）
        // 实际加速度 a = F/m，因此分量加速度：-(c1*r*v + c2*r^2*v|v|)/m
        const c1 = 0.06;   // 线性阻力基准
        const c2 = 0.0008; // 二次阻力基准（保持与改动前量级一致）
        const bounce = 0.9;
        // 质量中心吸引力（主框内球朝系统质心靠拢）
        let sumM = 0, cx = 0, cy = 0, activeCount = 0;
        for (const b of this._balls) {
          if (b.inTrash) continue;
          const m = b.mass || (b.r * b.r) || 1;
          sumM += m; cx += (b.x || 0) * m; cy += (b.y || 0) * m; activeCount++;
        }
        if (sumM > 0) {
          // 添加位于框中心的虚拟质量点，质量为所有（主框内）球的一半
          const virtM = sumM * 0.5;
          const totM = sumM + virtM;
          const cxc = W / 2, cyc = H / 2;
          cx = (cx + cxc * virtM) / totM;
          cy = (cy + cyc * virtM) / totM;
        } else {
          cx = W / 2; cy = H / 2;
        }
        const kCoh = 0.045; // 吸引强度（越大越快收拢）
        // 积分 & 边界
        for (const b of this._balls) {
          if (!b.dragging && !b.inTrash && !b.hoverPause) {
            // 空气阻力：基于半径与质量的线性+二次模型
            const m = b.mass || (b.r * b.r) || 1;
            const r = b.r;
            const axDrag = -((c1 * r) * b.vx + (c2 * r * r) * b.vx * Math.abs(b.vx)) / m;
            const ayDrag = -((c1 * r) * b.vy + (c2 * r * r) * b.vy * Math.abs(b.vy)) / m;
            b.vx += axDrag * dt;
            b.vy += ayDrag * dt;
            // 平滑随机漂移力（缓慢变化，带插值），按质量转为加速度
            const DRIFT_LERP_TAU = 1000; // ms，越大越平滑
            const DRIFT_SWITCH_MIN = 1500, DRIFT_SWITCH_MAX = 3500; // 切换周期范围
            if (typeof b._driftNext !== 'number') b._driftNext = t + (1500 + Math.random() * 2000);
            if (t >= b._driftNext) {
              const ang = Math.random() * Math.PI * 2;
              const FMIN = 0.4, FMAX = 1.2;
              const mag = FMIN + Math.random() * (FMAX - FMIN);
              b._driftTargetFx = Math.cos(ang) * mag;
              b._driftTargetFy = Math.sin(ang) * mag;
              b._driftNext = t + (DRIFT_SWITCH_MIN + Math.random() * (DRIFT_SWITCH_MAX - DRIFT_SWITCH_MIN));
            }
            const alpha = Math.min(1, dt / DRIFT_LERP_TAU);
            b._driftFx = (b._driftFx || 0) + ((b._driftTargetFx || 0) - (b._driftFx || 0)) * alpha;
            b._driftFy = (b._driftFy || 0) + ((b._driftTargetFy || 0) - (b._driftFy || 0)) * alpha;
            b.vx += ((b._driftFx || 0) / m) * dt;
            b.vy += ((b._driftFy || 0) / m) * dt;
            // 质量中心吸引：沿与质量中心连线顺时针偏转70°的方向施力（右侧70度）
            // 原始方向 v = (cx - b.x, cy - b.y)，旋转公式（顺时针θ）：
            // v' = [ v.x*cos(-θ) - v.y*sin(-θ), v.x*sin(-θ) + v.y*cos(-θ) ]
            // 注意：当仅有一个球时也生效，以虚拟质量点影响其轨迹
            if (activeCount >= 1) {
              const dxC = (cx - b.x);
              const dyC = (cy - b.y);
              const theta = -Math.PI * 70 / 180; // -70°，顺时针
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              const rx = dxC * cosT - dyC * sinT;
              const ry = dxC * sinT + dyC * cosT;
              b.vx += (kCoh * rx / m) * dt;
              b.vy += (kCoh * ry / m) * dt;
            }
            // 低速阈值截断，避免无限抖动
            if (Math.abs(b.vx) < 0.001) b.vx = 0;
            if (Math.abs(b.vy) < 0.001) b.vy = 0;
            b.x += b.vx * dt / 16; b.y += b.vy * dt / 16;
          }
          // 边界碰撞
          if (!b.inTrash) {
            if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * bounce; }
            if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * bounce; }
            if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * bounce; }
            if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * bounce; b.vx *= 0.285; }
          }
        }
        // 球-球碰撞（朴素 O(n^2)）
        for (let i = 0; i < this._balls.length; i++) {
          for (let j = i + 1; j < this._balls.length; j++) {
            const a = this._balls[i], c = this._balls[j];
            if (a.inTrash || c.inTrash) continue;
            const dx = c.x - a.x, dy = c.y - a.y; const dist = Math.hypot(dx, dy) || 0.0001;
            const minDist = a.r + c.r;
            if (dist < minDist) {
              const nx = dx / dist, ny = dy / dist; // 碰撞法线
              const overlap = (minDist - dist);
              // 质量权重：拖拽或悬停视为无限质量（invMass=0）
              const invA = (a.dragging || a.hoverPause) ? 0 : 1 / (a.mass || (a.r * a.r) || 1);
              const invC = (c.dragging || c.hoverPause) ? 0 : 1 / (c.mass || (c.r * c.r) || 1);
              const invSum = invA + invC;
              // 位置校正按逆质量比例分配
              if (invSum > 0) {
                const corr = overlap / invSum;
                a.x -= nx * (corr * invA);
                a.y -= ny * (corr * invA);
                c.x += nx * (corr * invC);
                c.y += ny * (corr * invC);
              }
              // 速度沿法线分离（可恢复系数 e=bounce）
              const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
              const rel = rvx * nx + rvy * ny;
              if (rel < 0 && invSum > 0) {
                const jImp = -1.9 * rel / invSum;
                const impX = jImp * nx, impY = jImp * ny;
                if (invA > 0) { a.vx -= impX * invA; a.vy -= impY * invA; }
                if (invC > 0) { c.vx += impX * invC; c.vy += impY * invC; }
              }
            }
          }
        }
        // 渲染
        for (const b of this._balls) {
          if (b.inTrash) continue; // 垃圾桶中由布局/拖拽样式控制
          const x = b.x - b.r, y = b.y - b.r;
          b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        }
        this._raf = requestAnimationFrame(this._step);
      }

      build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();
        this._panel = panel;

        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        const label = document.createElement('div');
        label.className = 'danmaku-setting-row__label';
        const title = document.createElement('span');
        title.className = 'danmaku-setting-row__labelText';
        title.textContent = '弹幕来源';
        label.appendChild(title);
        row.appendChild(label);

        // 辅助函数：创建可放置小球的区域（垃圾桶）
        const makeZone = (label, align = 'left') => {
          const z = document.createElement('div');
          z.style.flex = '1';
          z.style.minHeight = '48px';
          z.style.border = '1px dashed rgba(255,255,255,.25)';
          z.style.borderRadius = '8px';
          z.style.display = 'flex';
          z.style.alignItems = 'center';
          z.style.justifyContent = align === 'left' ? 'flex-start' : 'flex-end';
          z.style.padding = '8px 10px';
          z.style.background = 'rgba(255,255,255,.04)';
          z.style.outline = '2px solid transparent';
          z.style.outlineColor = 'rgba(255,255,255,.25)';
          z.style.flexWrap = 'wrap';
          z.style.gap = '6px';
          z.style.position = 'relative';
          // 背景水印文字
          const bg = document.createElement('div');
          bg.style.position = 'absolute';
          bg.style.left = '0';
          bg.style.top = '0';
          bg.style.right = '0';
          bg.style.bottom = '0';
          bg.style.display = 'flex';
          bg.style.alignItems = 'center';
          bg.style.justifyContent = 'center';
          bg.style.pointerEvents = 'none';
          bg.style.userSelect = 'none';
          bg.style.fontSize = '30px';
          bg.style.fontWeight = '700';
          bg.style.letterSpacing = '0.3em';
          bg.style.color = 'rgba(255,255,255,.12)';
          bg.style.textShadow = '0 1px 2px rgba(0,0,0,.2)';
          bg.style.zIndex = '0';
          bg.textContent = label;
          z.appendChild(bg);
          return z;
        };
        const box = this._createBox();
        this._boxEl = box;
        row.appendChild(box);
        // 将垃圾桶区域移动到主框下方（背景显示“黑名单”）
        this._trashZoneEl = makeZone('黑名单', 'left');
        // 触屏优化：垃圾桶区域允许纵向滚动，但拖拽小球本身会阻止默认
        this._trashZoneEl.style.touchAction = 'pan-y';
        this._trashZoneEl.style.margin = '8px 0 0 0';
        row.appendChild(this._trashZoneEl);
        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        // 图例：颜色-名称-数量 对照
        desc.textContent = '';
        const legendTitle = document.createElement('div');
        legendTitle.style.fontWeight = '600';
        legendTitle.style.margin = '2px 0 6px';
        const legendWrap = document.createElement('div');
        legendWrap.style.display = 'flex';
        legendWrap.style.flexWrap = 'wrap';
        legendWrap.style.gap = '8px 14px';
        legendWrap.style.alignItems = 'center';
        legendWrap.style.opacity = '0.95';
        desc.appendChild(legendTitle);
        desc.appendChild(legendWrap);
        // 渲染函数：从 this._balls 生成图例项
        const renderLegend = () => {
          try {
            if (!legendWrap) return;
            legendWrap.innerHTML = '';
            const balls = Array.isArray(this._balls) ? this._balls : [];
            for (const b of balls) {
              const item = document.createElement('div');
              item.style.display = 'inline-flex';
              item.style.alignItems = 'center';
              item.style.lineHeight = '1.3';
              const dot = document.createElement('span');
              dot.style.width = '12px';
              dot.style.height = '12px';
              dot.style.borderRadius = '50%';
              dot.style.display = 'inline-block';
              dot.style.marginRight = '6px';
              dot.style.boxShadow = '0 0 0 1px rgba(255,255,255,.25) inset, 0 0 4px rgba(0,0,0,.35)';
              // 直接复用小球背景（包含高光与渐变）
              try { dot.style.background = b?.el?.style?.background || '#999'; } catch (_) { dot.style.background = '#999'; }
              const txt = document.createElement('span');
              txt.style.fontSize = '12px';
              txt.style.opacity = '0.95';
              // const name = (b?.name ?? '').toString();
              // const count = Number(b?.count || 0);
              txt.textContent = (b?.name ?? '').toString();;
              item.appendChild(dot);
              item.appendChild(txt);
              legendWrap.appendChild(item);
            }
          } catch (_) { /* 忽略图例渲染异常 */ }
        };
        row.appendChild(desc);

        list.appendChild(row);
        panel.appendChild(list);

        // 数据与启动
        const stats = this._readStats();
        if (!stats) {
          const empty = document.createElement('div');
          empty.className = 'danmaku-setting-row__desc';
          empty.style.opacity = '.8';
          empty.textContent = '暂无来源统计数据。';
          list.appendChild(empty);
          return panel;
        }
        this._initBalls(stats);
        // 初始化完小球后渲染一次图例
        try { renderLegend(); } catch (_) { }
        // 按初始黑名单将对应来源放入垃圾桶（仅视觉，不触发保存）
        try {
          const initialBlack = this._readInitialBlacklist();
          if (initialBlack && initialBlack.set && initialBlack.set.size) {
            for (const b of this._balls) {
              const key = String(b.name || '').trim().toLowerCase();
              if (initialBlack.set.has(key)) {
                // 异步放入垃圾桶（仅视觉），不阻塞构建
                this._moveBallToTrash(b, false).catch(() => { });
              }
            }
            // 对于黑名单中但不在当前统计的数据源，创建计数为 0 的小球并放入垃圾桶
            const present = new Set(this._balls.map(x => String(x.name || '').trim().toLowerCase()));
            let extraIdx = 0;
            for (const rawName of initialBlack.list) {
              const key = String(rawName || '').trim().toLowerCase();
              if (!key || present.has(key)) continue;
              const r = 14; // 最小半径
              const color = this._colorForIndex(this._balls.length + (extraIdx++));
              const el = this._makeBallEl(`${rawName}\n0`, color);
              el.style.width = `${r * 2}px`;
              el.style.height = `${r * 2}px`;
              const bgFS = Math.max(12, Math.round(r * 1.1));
              if (el._bgWatermark) el._bgWatermark.style.fontSize = `${bgFS}px`;
              // 直接加入垃圾桶容器并按列表项布局
              if (this._trashZoneEl) this._trashZoneEl.appendChild(el);
              el.style.position = 'relative';
              el.style.transform = 'none';
              el.style.left = 'auto'; el.style.top = 'auto';
              el.style.margin = '4px';
              el.style.zIndex = '1';
              // 初始化带漂移属性的小球（虽然在垃圾桶内不会参与物理，但便于拖回时直接生效）
              const _ang = Math.random() * Math.PI * 2;
              const _FMIN = 0.4, _FMAX = 1.2;
              const _mag = _FMIN + Math.random() * (_FMAX - _FMIN);
              const ball = {
                el, name: rawName, count: 0, x: r, y: r,
                vx: 0, vy: 0, r, mass: r * r, dragging: false, _px: 0, _py: 0, _pt: 0, inTrash: true,
                _driftFx: 0, _driftFy: 0,
                _driftTargetFx: Math.cos(_ang) * _mag,
                _driftTargetFy: Math.sin(_ang) * _mag,
                _driftNext: performance.now() + (1500 + Math.random() * 2000)
              };
              this._attachDrag(ball);
              this._balls.push(ball);
            }
            // 黑名单额外小球加入后，刷新图例
            try { renderLegend(); } catch (_) { }
          }
        } catch (_) { /* 忽略初始化黑名单异常 */ }
        // 监听可见性变化：tab 切换时自动暂停/恢复
        try {
          this._activeMo = new MutationObserver(() => {
            if (!this._panel?.isConnected) return;
            const active = this._panel.getAttribute('data-active') === 'true';
            if (active && !this._raf) {
              this._lastT = 0;
              this._raf = requestAnimationFrame(this._step);
            }
          });
          this._activeMo.observe(panel, { attributes: true, attributeFilter: ['data-active'] });
        } catch (_) { /* 忽略 */ }
        // 自适应尺寸变化：收缩时收拢到容器内
        try {
          this._resizeOb = new ResizeObserver(() => {
            if (!this._boxEl) return;
            const { width: W, height: H } = this._boxEl.getBoundingClientRect();
            for (const b of this._balls) {
              b.x = Math.max(b.r, Math.min(W - b.r, b.x));
              b.y = Math.max(b.r, Math.min(H - b.r, b.y));
            }
          });
          this._resizeOb.observe(this._boxEl);
        } catch (_) { /* 忽略 */ }
        // 初始若可见则启动动画
        if (panel.getAttribute('data-active') === 'true') {
          this._raf = requestAnimationFrame(this._step);
        }
        return panel;
      }

      // 清理资源，供上层在页面销毁/对话框关闭时调用
      destroy() {
        try { if (this._raf) cancelAnimationFrame(this._raf); } catch (_) { }
        this._raf = null;
        this._lastT = 0;
        try { this._activeMo?.disconnect(); } catch (_) { }
        this._activeMo = null;
        try { this._resizeOb?.disconnect(); } catch (_) { }
        this._resizeOb = null;
        // 解绑 window 事件
        for (const b of this._balls) {
          if (b?._onDown) { try { b.el.removeEventListener('pointerdown', b._onDown); } catch (_) { } }
          if (b?._onMove) { try { window.removeEventListener('pointermove', b._onMove); } catch (_) { } }
          if (b?._onUp) { try { window.removeEventListener('pointerup', b._onUp); } catch (_) { } }
          if (b?._onCancel) { try { window.removeEventListener('pointercancel', b._onCancel); } catch (_) { } }
          if (b?._onEnter) { try { b.el.removeEventListener('pointerenter', b._onEnter); } catch (_) { } }
          if (b?._onLeave) { try { b.el.removeEventListener('pointerleave', b._onLeave); } catch (_) { } }
          if (b?._onCtx) { try { b.el.removeEventListener('contextmenu', b._onCtx); } catch (_) { } }
          // 清理幽灵球
          if (b?._ghostEl) { try { this._removeGhostEl(b); } catch (_) { } }
          b._onMove = null; b._onUp = null; b._onCancel = null;
        }
        try { this._closeMenu(); } catch (_) { }
        this._trashZoneEl = null;
      }
    }

    // 密度图设置分页：仅包含“弹幕密度图”开关/模式
    class HeatmapSettingsPage {
      constructor(opts = {}) { this.logger = opts.logger || null; }
      getKey() { return 'heatmap'; }
      getLabel() { return '密度图'; }

      // 读取并解析 heatmap_style JSON（带默认值与兜底）
      _getStyle() {
        try {
          const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
          const s = g.danmakuSettings;
          const raw = s?.get?.('heatmap_style');
          const def = { lineWidth: 1, lineColor: '#3498db', gradientColorStart: 'rgba(52, 152, 219, 0.08)', gradientColorEnd: 'rgba(52, 152, 219, 0.25)' };
          if (!raw || typeof raw !== 'string') return def;
          try {
            const obj = JSON.parse(raw);
            return { ...def, ...(obj || {}) };
          } catch (_) { return def; }
        } catch (_) {
          return { lineWidth: 1, lineColor: '#3498db', gradientColorStart: 'rgba(52, 152, 219, 0.08)', gradientColorEnd: 'rgba(52, 152, 219, 0.25)' };
        }
      }

      // 持久化部分样式变更，并实时更新渲染器
      _setStyle(partial = {}) {
        try {
          const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
          const s = g.danmakuSettings;
          const current = this._getStyle();
          const merged = { ...current, ...(partial || {}) };
          s?.set?.('heatmap_style', JSON.stringify(merged));
          // 实时更新渲染器
          try { g.heatmapRenderer?.updateStyles?.({
            lineWidth: merged.lineWidth,
            lineColor: merged.lineColor,
            gradientColorStart: merged.gradientColorStart,
            gradientColorEnd: merged.gradientColorEnd,
          }); } catch (_) { }
          // 自动保存（若开启）
          try { Promise.resolve().then(function () { return utils; }).then(m => m.saveIfAutoOn?.(this.logger)); } catch (_) { }
        } catch (_) { }
      }

      _createLineWidthRow() {
        const style = this._getStyle();
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'heatmap_lineWidth');
        row.setAttribute('data-type', 'number');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '线条粗细';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '8px';

      const range = document.createElement('input');
      range.type = 'range'; range.min = '0.1'; range.max = '4.0'; range.step = '0.1';
      range.value = String(Number(style.lineWidth ?? 1));
      range.style.flex = '1 1 auto';
      range.style.height = '24px';

      const val = document.createElement('div');
      val.textContent = `${String(Number(style.lineWidth ?? 1))} px`;
      val.style.minWidth = '48px';
      val.style.textAlign = 'center';
      val.style.opacity = '.9';

        const apply = (valStr, src) => {
          let v = parseFloat(valStr);
          if (!isFinite(v)) return;
          if (v < 0.1) v = 0.1; else if (v > 4.0) v = 4.0;
          range.value = String(v);
          try { val.textContent = `${v} px`; } catch (_) {}
          this._setStyle({ lineWidth: v });
          this.logger?.info?.('[HeatmapSettings] lineWidth ->', v, '(from', src, ')');
        };

        range.addEventListener('input', () => apply(range.value, 'range'));

        wrap.appendChild(range);
        wrap.appendChild(val);
        row.appendChild(wrap);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      _createLineColorRow() {
        const style = this._getStyle();
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'heatmap_lineColor');
        row.setAttribute('data-type', 'color');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '线条颜色';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '8px';

        const color = document.createElement('input');
        color.type = 'color';
        // 尝试解析为十六进制；若为 rgba 则转换为 hex（忽略 alpha）
        const toHex = (col) => {
          if (typeof col !== 'string' || !col) return '#3498db';
          const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
          if (hexMatch) return '#' + hexMatch[1].toLowerCase();
          const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
          if (rgba) {
            const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
            const hex = (n) => n.toString(16).padStart(2, '0');
            return '#' + hex(r) + hex(g) + hex(b);
          }
          return '#3498db';
        };
        color.value = toHex(style.lineColor);
        color.className = 'danmaku-setting-input';
        color.style.width = '44px'; color.style.padding = '0'; color.style.height = '24px';

        const text = document.createElement('input');
        text.type = 'text'; text.value = style.lineColor || '#3498db';
        text.className = 'danmaku-setting-input';
        text.style.flex = '1 1 auto';

        const apply = (val, src) => {
          if (!val || typeof val !== 'string') return;
          this._setStyle({ lineColor: val });
          // 同步两个输入的表现
          try { color.value = toHex(val); } catch (_) {}
          try { text.value = val; } catch (_) {}
          this.logger?.info?.('[HeatmapSettings] lineColor ->', val, '(from', src, ')');
        };

        color.addEventListener('input', () => apply(color.value, 'color'));
        text.addEventListener('change', () => apply(text.value.trim(), 'text'));

        wrap.appendChild(color); wrap.appendChild(text);
        row.appendChild(wrap);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      _createGradientColorsRow() {
        const style = this._getStyle();
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'heatmap_gradientColors');
        row.setAttribute('data-type', 'color');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '渐变颜色（起/止）';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const wrap = document.createElement('div');
        wrap.style.display = 'grid';
        wrap.style.gridTemplateColumns = 'auto 1fr auto 1fr';
        wrap.style.gap = '8px';
        wrap.style.alignItems = 'center';

        const toHex = (col, fallback = '#3498db') => {
          if (typeof col !== 'string' || !col) return fallback;
          const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
          if (hexMatch) return '#' + hexMatch[1].toLowerCase();
          const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
          if (rgba) {
            const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
            const hex = (n) => n.toString(16).padStart(2, '0');
            return '#' + hex(r) + hex(g) + hex(b);
          }
          return fallback;
        };
        const getAlpha = (col, fallback) => {
          const m = (typeof col === 'string') && col.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)/i);
          if (m) {
            const a = parseFloat(m[1]);
            return isFinite(a) ? Math.max(0, Math.min(1, a)) : fallback;
          }
          return fallback;
        };
        const makeRgba = (hex, alpha = 1) => {
          const h = (hex || '').replace('#', '');
          if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
          const r = parseInt(h.slice(0, 2), 16);
          const g = parseInt(h.slice(2, 4), 16);
          const b = parseInt(h.slice(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const startAlpha = getAlpha(style.gradientColorStart, 0.08);
        const endAlpha = getAlpha(style.gradientColorEnd, 0.25);

        const startColor = document.createElement('input'); startColor.type = 'color'; startColor.className = 'danmaku-setting-input'; startColor.style.width = '44px'; startColor.style.height = '24px'; startColor.style.padding = '0'; startColor.value = toHex(style.gradientColorStart, '#3498db');
        const startText = document.createElement('input'); startText.type = 'text'; startText.className = 'danmaku-setting-input'; startText.style.width = '100%'; startText.value = style.gradientColorStart || 'rgba(52, 152, 219, 0.08)';

        const endColor = document.createElement('input'); endColor.type = 'color'; endColor.className = 'danmaku-setting-input'; endColor.style.width = '44px'; endColor.style.height = '24px'; endColor.style.padding = '0'; endColor.value = toHex(style.gradientColorEnd, '#3498db');
        const endText = document.createElement('input'); endText.type = 'text'; endText.className = 'danmaku-setting-input'; endText.style.width = '100%'; endText.value = style.gradientColorEnd || 'rgba(52, 152, 219, 0.25)';

        const applyStart = (srcVal, src) => {
          let val = srcVal || '';
          if (src === 'color') { // 从色板将 hex 合成带 alpha 的 rgba，沿用当前 alpha
            val = makeRgba(startColor.value, startAlpha);
            startText.value = val;
          }
          this._setStyle({ gradientColorStart: val });
          this.logger?.info?.('[HeatmapSettings] gradientColorStart ->', val, '(from', src, ')');
        };
        const applyEnd = (srcVal, src) => {
          let val = srcVal || '';
          if (src === 'color') {
            val = makeRgba(endColor.value, endAlpha);
            endText.value = val;
          }
          this._setStyle({ gradientColorEnd: val });
          this.logger?.info?.('[HeatmapSettings] gradientColorEnd ->', val, '(from', src, ')');
        };

        startColor.addEventListener('input', () => applyStart(startColor.value, 'color'));
        startText.addEventListener('change', () => applyStart(startText.value.trim(), 'text'));
        endColor.addEventListener('input', () => applyEnd(endColor.value, 'color'));
        endText.addEventListener('change', () => applyEnd(endText.value.trim(), 'text'));

        // 布局：起色板 + 起文本 + 止色板 + 止文本
        wrap.appendChild(startColor); wrap.appendChild(startText); wrap.appendChild(endColor); wrap.appendChild(endText);
        row.appendChild(wrap);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      // 合并三个颜色选择为同一栏：线条颜色 + 渐变开始 + 渐变结束（下方显示只读文本）
      _createColorsRow() {
        const style = this._getStyle();
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'heatmap_colors');
        row.setAttribute('data-type', 'color');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span'); labelSpan.className = 'danmaku-setting-row__labelText'; labelSpan.textContent = '颜色设置';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gridTemplateColumns = '1fr 1fr';
      wrap.style.gap = '12px';
      wrap.style.alignItems = 'center';

        const toHex = (col, fallback = '#3498db') => {
          if (typeof col !== 'string' || !col) return fallback;
          const hexMatch = col.match(/^#([0-9a-f]{6})$/i);
          if (hexMatch) return '#' + hexMatch[1].toLowerCase();
          const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
          if (rgba) {
            const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
            const hex = (n) => n.toString(16).padStart(2, '0');
            return '#' + hex(r) + hex(g) + hex(b);
          }
          return fallback;
        };
        const getAlpha = (col, fallback) => {
          const m = (typeof col === 'string') && col.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9]*\.?[0-9]+)\s*\)/i);
          if (m) {
            const a = parseFloat(m[1]);
            return isFinite(a) ? Math.max(0, Math.min(1, a)) : fallback;
          }
          return fallback;
        };
        const makeRgba = (hex, alpha = 1) => {
          const h = (hex || '').replace('#', '');
          if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
          const r = parseInt(h.slice(0, 2), 16);
          const g = parseInt(h.slice(2, 4), 16);
          const b = parseInt(h.slice(4, 6), 16);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // 线条颜色（2:1 预览块 + 弹出选择器）
      const lineWrap = document.createElement('div'); lineWrap.style.display = 'flex'; lineWrap.style.flexDirection = 'column'; lineWrap.style.gap = '6px'; lineWrap.style.position = 'relative';
        const lineLabel = document.createElement('div'); lineLabel.style.fontSize = '11px'; lineLabel.style.opacity = '.85'; lineLabel.textContent = '线条颜色';

      const lineBlock = document.createElement('div');
      lineBlock.style.width = '100%';
      lineBlock.style.maxWidth = '280px';
      lineBlock.style.aspectRatio = '2 / 1';
      lineBlock.style.borderRadius = '6px';
      lineBlock.style.border = '1px solid rgba(255,255,255,.25)';
      lineBlock.style.cursor = 'pointer';
      lineBlock.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.2)';
      lineBlock.style.position = 'relative';

        const updateLineBlock = () => {
          const st = this._getStyle();
          const col = st.lineColor || '#3498db';
          lineBlock.style.background = col; // 支持 hex 或 rgba
        };
        updateLineBlock();

        // 覆盖在色块上的原生颜色选择器（透明）
        const linePickerOverlay = document.createElement('input');
        linePickerOverlay.type = 'color';
        linePickerOverlay.style.position = 'absolute';
        linePickerOverlay.style.inset = '0';
        linePickerOverlay.style.width = '100%';
        linePickerOverlay.style.height = '100%';
        linePickerOverlay.style.opacity = '0';
        linePickerOverlay.style.cursor = 'pointer';
        linePickerOverlay.style.border = 'none';
        linePickerOverlay.style.padding = '0';
        linePickerOverlay.style.margin = '0';
        linePickerOverlay.style.zIndex = '1';
        linePickerOverlay.value = toHex(style.lineColor, '#3498db');
        linePickerOverlay.addEventListener('input', () => {
          const hex = linePickerOverlay.value;
          // 保留当前 alpha
          const currentAlpha = getAlpha(this._getStyle().lineColor, 1);
          const rgba = makeRgba(hex, currentAlpha);
          this._setStyle({ lineColor: rgba });
          updateLineBlock();
          this.logger?.info?.('[HeatmapSettings] lineColor ->', rgba, '(from overlay picker, keep alpha)');
        });

        lineWrap.appendChild(lineLabel);
        lineWrap.appendChild(lineBlock);
        lineBlock.appendChild(linePickerOverlay);

        // 线条颜色透明度竖向滑块（覆盖在右侧，不改变总尺寸）
      const lineAlphaWrap = document.createElement('div');
      lineAlphaWrap.style.position = 'absolute';
      lineAlphaWrap.style.right = '4px';
      lineAlphaWrap.style.top = '0';
      lineAlphaWrap.style.width = '24px';
      lineAlphaWrap.style.height = '100%'; // 与色块等高
      lineAlphaWrap.style.display = 'flex';
      lineAlphaWrap.style.alignItems = 'center';
      lineAlphaWrap.style.justifyContent = 'center';
      lineAlphaWrap.style.zIndex = '3';

        const lineAlpha = document.createElement('input');
      lineAlpha.type = 'range';
      lineAlpha.min = '0'; lineAlpha.max = '1'; lineAlpha.step = '0.01';
      lineAlpha.value = String(getAlpha(style.lineColor, 1));
      // 垂直滑块，长度=容器高度
      lineAlpha.style.appearance = 'slider-vertical';
      lineAlpha.style.WebkitAppearance = 'slider-vertical';
      lineAlpha.style.MozAppearance = 'slider-vertical';
      lineAlpha.style.writingMode = 'bt-lr';
      lineAlpha.style.height = '100%';
      lineAlpha.style.width = '16px';
      lineAlpha.style.cursor = 'pointer';
        lineAlpha.addEventListener('input', () => {
          const a = Math.max(0, Math.min(1, parseFloat(lineAlpha.value)));
          const st = this._getStyle();
          const hex = toHex(st.lineColor, toHex(style.lineColor, '#3498db'));
          const rgba = makeRgba(hex, a);
          this._setStyle({ lineColor: rgba });
          updateLineBlock();
          this.logger?.info?.('[HeatmapSettings] lineAlpha ->', a);
        });
        lineAlphaWrap.appendChild(lineAlpha);
        lineBlock.appendChild(lineAlphaWrap);

        // 渐变预览 + 弹出选择器（点击预览同时修改两个颜色：结束在上，开始在下）
      getAlpha(style.gradientColorStart, 0.08);
      getAlpha(style.gradientColorEnd, 0.25);

        const gradientWrap = document.createElement('div');
        gradientWrap.style.display = 'flex';
        gradientWrap.style.flexDirection = 'column';
        gradientWrap.style.gap = '6px';
        gradientWrap.style.position = 'relative';

        const gradLabel = document.createElement('div');
        gradLabel.style.fontSize = '11px';
        gradLabel.style.opacity = '.85';
        gradLabel.textContent = '渐变填充颜色';

        const gradientBlock = document.createElement('div');
        gradientBlock.style.width = '100%';
        gradientBlock.style.maxWidth = '280px';
        gradientBlock.style.aspectRatio = '2 / 1'; // 2:1 长宽比
        gradientBlock.style.borderRadius = '6px';
        gradientBlock.style.border = '1px solid rgba(255,255,255,.25)';
        gradientBlock.style.cursor = 'pointer';
        gradientBlock.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.2)';

        const updateGradientBlock = () => {
          const st = this._getStyle();
          const start = st.gradientColorStart || 'rgba(52, 152, 219, 0.08)';
          const end = st.gradientColorEnd || 'rgba(52, 152, 219, 0.25)';
          // 结束颜色在上方，开始颜色在下方
          gradientBlock.style.background = `linear-gradient(to bottom, ${end} 0%, ${start} 100%)`;
        };
        updateGradientBlock();

        const toHexSafe = (col, fb = '#3498db') => {
          if (typeof col !== 'string' || !col) return fb;
          const m = col.match(/^#([0-9a-f]{6})$/i);
          if (m) return '#' + m[1].toLowerCase();
          const rgba = col.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
          if (rgba) {
            const r = Math.max(0, Math.min(255, parseInt(rgba[1], 10)));
            const g = Math.max(0, Math.min(255, parseInt(rgba[2], 10)));
            const b = Math.max(0, Math.min(255, parseInt(rgba[3], 10)));
            const hex = (n) => n.toString(16).padStart(2, '0');
            return '#' + hex(r) + hex(g) + hex(b);
          }
          return fb;
        };
        // 覆盖在渐变块上的两个原生选择器：上半=结束颜色，下半=开始颜色，并在中间绘制虚线
        gradientBlock.style.position = 'relative';

      const divider = document.createElement('div');
        divider.style.position = 'absolute';
        divider.style.left = '8px';
        divider.style.right = '8px';
        divider.style.top = '50%';
        divider.style.transform = 'translateY(-0.5px)';
        divider.style.borderTop = '1px dashed rgba(255,255,255,.5)';
        divider.style.pointerEvents = 'none';

        const endPickerOverlay = document.createElement('input');
        endPickerOverlay.type = 'color';
        endPickerOverlay.style.position = 'absolute';
        endPickerOverlay.style.left = '0';
        endPickerOverlay.style.right = '0';
        endPickerOverlay.style.top = '0';
      endPickerOverlay.style.width = '100%';
        endPickerOverlay.style.height = '50%';
        endPickerOverlay.style.opacity = '0';
        endPickerOverlay.style.cursor = 'pointer';
        endPickerOverlay.style.border = 'none';
        endPickerOverlay.style.padding = '0';
        endPickerOverlay.style.margin = '0';
        endPickerOverlay.style.zIndex = '1';
        endPickerOverlay.value = toHexSafe(style.gradientColorEnd, '#3498db');
        endPickerOverlay.addEventListener('input', () => {
          const hex = endPickerOverlay.value;
          const currentA = getAlpha(this._getStyle().gradientColorEnd, 0.25);
          const rgba = makeRgba(hex, currentA);
          this._setStyle({ gradientColorEnd: rgba });
          updateGradientBlock();
          this.logger?.info?.('[HeatmapSettings] gradientColorEnd ->', rgba, '(from overlay picker)');
        });

        const startPickerOverlay = document.createElement('input');
        startPickerOverlay.type = 'color';
        startPickerOverlay.style.position = 'absolute';
        startPickerOverlay.style.left = '0';
        startPickerOverlay.style.right = '0';
        startPickerOverlay.style.bottom = '0';
      startPickerOverlay.style.width = '100%';
        startPickerOverlay.style.height = '50%';
        startPickerOverlay.style.opacity = '0';
        startPickerOverlay.style.cursor = 'pointer';
        startPickerOverlay.style.border = 'none';
        startPickerOverlay.style.padding = '0';
        startPickerOverlay.style.margin = '0';
        startPickerOverlay.style.zIndex = '1';
        startPickerOverlay.value = toHexSafe(style.gradientColorStart, '#3498db');
        startPickerOverlay.addEventListener('input', () => {
          const hex = startPickerOverlay.value;
          const currentA = getAlpha(this._getStyle().gradientColorStart, 0.08);
          const rgba = makeRgba(hex, currentA);
          this._setStyle({ gradientColorStart: rgba });
          updateGradientBlock();
          this.logger?.info?.('[HeatmapSettings] gradientColorStart ->', rgba, '(from overlay picker)');
        });

      gradientWrap.appendChild(gradLabel);
      gradientWrap.appendChild(gradientBlock);
      gradientBlock.appendChild(divider);
      gradientBlock.appendChild(endPickerOverlay);
      gradientBlock.appendChild(startPickerOverlay);

        // 渐变颜色透明度竖向滑块：上半（结束色）+下半（开始色），各占一半高度
      const gradAlphaTopWrap = document.createElement('div');
      gradAlphaTopWrap.style.position = 'absolute';
      gradAlphaTopWrap.style.right = '4px';
      gradAlphaTopWrap.style.top = '0';
      gradAlphaTopWrap.style.width = '24px';
      gradAlphaTopWrap.style.height = '50%'; // 与上半色块等高
      gradAlphaTopWrap.style.display = 'flex';
      gradAlphaTopWrap.style.alignItems = 'center';
      gradAlphaTopWrap.style.justifyContent = 'center';
      gradAlphaTopWrap.style.zIndex = '3';

        const gradAlphaTop = document.createElement('input');
      gradAlphaTop.type = 'range';
      gradAlphaTop.min = '0'; gradAlphaTop.max = '1'; gradAlphaTop.step = '0.01';
      gradAlphaTop.value = String(getAlpha(style.gradientColorEnd, 0.25));
      // 垂直滑块，长度=上半容器高度
      gradAlphaTop.style.appearance = 'slider-vertical';
      gradAlphaTop.style.WebkitAppearance = 'slider-vertical';
      gradAlphaTop.style.MozAppearance = 'slider-vertical';
      gradAlphaTop.style.writingMode = 'bt-lr';
      gradAlphaTop.style.height = '100%';
      gradAlphaTop.style.width = '16px';
      gradAlphaTop.style.cursor = 'pointer';
        gradAlphaTop.addEventListener('input', () => {
          const a = Math.max(0, Math.min(1, parseFloat(gradAlphaTop.value)));
          const st = this._getStyle();
          const hex = toHexSafe(st.gradientColorEnd, '#3498db');
          const rgba = makeRgba(hex, a);
          this._setStyle({ gradientColorEnd: rgba });
          updateGradientBlock();
          this.logger?.info?.('[HeatmapSettings] gradientEndAlpha ->', a);
        });
        gradAlphaTopWrap.appendChild(gradAlphaTop);
        gradientBlock.appendChild(gradAlphaTopWrap);

      const gradAlphaBottomWrap = document.createElement('div');
      gradAlphaBottomWrap.style.position = 'absolute';
      gradAlphaBottomWrap.style.right = '4px';
      gradAlphaBottomWrap.style.bottom = '0';
      gradAlphaBottomWrap.style.width = '24px';
      gradAlphaBottomWrap.style.height = '50%'; // 与下半色块等高
      gradAlphaBottomWrap.style.display = 'flex';
      gradAlphaBottomWrap.style.alignItems = 'center';
      gradAlphaBottomWrap.style.justifyContent = 'center';
      gradAlphaBottomWrap.style.zIndex = '3';

        const gradAlphaBottom = document.createElement('input');
      gradAlphaBottom.type = 'range';
      gradAlphaBottom.min = '0'; gradAlphaBottom.max = '1'; gradAlphaBottom.step = '0.01';
      gradAlphaBottom.value = String(getAlpha(style.gradientColorStart, 0.08));
      // 垂直滑块，长度=下半容器高度
      gradAlphaBottom.style.appearance = 'slider-vertical';
      gradAlphaBottom.style.WebkitAppearance = 'slider-vertical';
      gradAlphaBottom.style.MozAppearance = 'slider-vertical';
      gradAlphaBottom.style.writingMode = 'bt-lr';
      gradAlphaBottom.style.height = '100%';
      gradAlphaBottom.style.width = '16px';
      gradAlphaBottom.style.cursor = 'pointer';
        gradAlphaBottom.addEventListener('input', () => {
          const a = Math.max(0, Math.min(1, parseFloat(gradAlphaBottom.value)));
          const st = this._getStyle();
          const hex = toHexSafe(st.gradientColorStart, '#3498db');
          const rgba = makeRgba(hex, a);
          this._setStyle({ gradientColorStart: rgba });
          updateGradientBlock();
          this.logger?.info?.('[HeatmapSettings] gradientStartAlpha ->', a);
        });
        gradAlphaBottomWrap.appendChild(gradAlphaBottom);
        gradientBlock.appendChild(gradAlphaBottomWrap);

        wrap.appendChild(lineWrap);
        wrap.appendChild(gradientWrap);
        row.appendChild(wrap);

        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      _createHeatmapModeRow() {
        const settings = window?.__jfDanmakuGlobal__?.danmakuSettings;
        const current = settings?.get?.('enable_heatmap') ?? 'combined'; // 'off' | 'combined' | 'original'
        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'enable_heatmap');
        row.setAttribute('data-type', 'enum');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '弹幕密度图';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const group = document.createElement('div');
        group.style.display = 'flex';
        group.style.width = '100%';
        group.style.gap = '6px';
        group.style.marginTop = '4px';

        const options = [
          { key: 'off', label: '关闭' },
          { key: 'combined', label: '合并后' },
          { key: 'original', label: '原始数据' }
        ];

        const applyValue = (val) => {
          try {
            const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
            const liveSettings = g.danmakuSettings || settings;
            liveSettings?.set?.('enable_heatmap', val);
            // 实时应用到热力图
            try {
              if (val === 'off') {
                if (g.heatmapRenderer && typeof g.heatmapRenderer.hide === 'function') {
                  g.heatmapRenderer.hide();
                } else {
                  const c = document.getElementById('danmaku-heatmap-canvas');
                  if (c) c.style.display = 'none';
                }
              } else {
                let shown = false;
                if (g.heatmapRenderer && typeof g.heatmapRenderer.show === 'function') {
                  g.heatmapRenderer.show();
                  shown = true;
                }
                const canvas = document.getElementById('danmaku-heatmap-canvas');
                if (!shown && canvas) { canvas.style.display = 'block'; shown = true; }
                if (!shown) {
                  try { g.getExt?.()?._generateHeatmap?.(); } catch (_) { }
                }
              }
            } catch (_) { }
            saveIfAutoOn(this.logger);
          } catch (_) { }
          this.logger?.info?.('[HeatmapSettings] enable_heatmap ->', val);
        };

        options.forEach(opt => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = opt.label;
          btn.dataset.val = opt.key;
          btn.style.flex = '1 1 0';
          btn.style.padding = '6px 4px';
          btn.style.fontSize = '12px';
          btn.style.lineHeight = '1.1';
          btn.style.borderRadius = '6px';
          btn.style.border = '1px solid rgba(255,255,255,.25)';
          btn.style.background = 'rgba(255,255,255,.08)';
          btn.style.color = '#fff';
          btn.style.cursor = 'pointer';
          btn.style.transition = 'background .15s, border-color .15s, box-shadow .15s';
          const setActiveState = () => {
            if (btn.dataset.val === String(currentVal)) {
              btn.style.background = '#3fa9ff';
              btn.style.borderColor = '#3fa9ff';
              btn.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
            } else {
              btn.style.background = 'rgba(255,255,255,.08)';
              btn.style.borderColor = 'rgba(255,255,255,.25)';
              btn.style.boxShadow = 'none';
            }
          };
          btn.addEventListener('mouseenter', () => { if (btn.dataset.val !== String(currentVal)) btn.style.background = 'rgba(255,255,255,.15)'; });
          btn.addEventListener('mouseleave', () => setActiveState());
          btn.addEventListener('click', () => {
            if (currentVal === opt.key) return;
            currentVal = opt.key;
            applyValue(currentVal);
            group.querySelectorAll('button').forEach(b => {
              const v = b.dataset.val;
              if (v === currentVal) {
                b.style.background = '#3fa9ff';
                b.style.borderColor = '#3fa9ff';
                b.style.boxShadow = '0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6)';
              } else {
                b.style.background = 'rgba(255,255,255,.08)';
                b.style.borderColor = 'rgba(255,255,255,.25)';
                b.style.boxShadow = 'none';
              }
            });
          });
          group.appendChild(btn);
          setTimeout(setActiveState, 0);
        });

        let currentVal = String(current);
        row.appendChild(group);
        const desc = document.createElement('div');
        desc.className = 'danmaku-setting-row__desc';
        row.appendChild(desc);
        return row;
      }

      // 取样间隔（1-20，整型，滑块调整）
      _createIntervalRow() {
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const settings = g.danmakuSettings;
        let cur = settings?.get?.('heatmap_interval');
        let value = (typeof cur === 'number' && isFinite(cur)) ? Math.max(1, Math.min(20, Math.round(cur))) : 5;

        const row = document.createElement('div');
        row.className = 'danmaku-setting-row';
        row.setAttribute('data-key', 'heatmap_interval');
        row.setAttribute('data-type', 'number');

        const labelLine = document.createElement('div');
        labelLine.className = 'danmaku-setting-row__label';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'danmaku-setting-row__labelText';
        labelSpan.textContent = '取样间隔';
        labelLine.appendChild(labelSpan);
        row.appendChild(labelLine);

        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '8px';

        const range = document.createElement('input');
      range.type = 'range';
        range.min = '1';
        range.max = '20';
        range.step = '1';
        range.value = String(value);
      range.style.flex = '1 1 auto';
      range.style.height = '24px';

      const val = document.createElement('div');
      val.textContent = `${String(value)} 秒`;
      val.style.minWidth = '48px';
        val.style.textAlign = 'center';
        val.style.opacity = '.9';

        const apply = (v) => {
          let n = parseInt(v, 10);
          if (!isFinite(n)) return;
          if (n < 1) n = 1; else if (n > 20) n = 20;
          value = n;
          range.value = String(n);
      val.textContent = `${String(n)} 秒`;
          try { settings?.set?.('heatmap_interval', n); } catch (_) {}
          try { saveIfAutoOn(this.logger); } catch (_) {}
          // 若已启用热力图，尝试重新生成以反映变化（如果渲染器实现了对该设置的支持）
          try { g.getExt?.()?._generateHeatmap?.(); } catch (_) {}
          this.logger?.info?.('[HeatmapSettings] heatmap_interval ->', n);
        };

        range.addEventListener('input', () => apply(range.value));

        wrap.appendChild(range);
        wrap.appendChild(val);
        row.appendChild(wrap);
        const desc = document.createElement('div'); desc.className = 'danmaku-setting-row__desc'; row.appendChild(desc);
        return row;
      }

      build() {
        const panel = document.createElement('div');
        panel.className = 'danmaku-settings-tabPanel';
        panel.dataset.key = this.getKey();

        const list = document.createElement('div');
        list.className = 'danmaku-settings-list';
      // 第一项：弹幕密度图
      list.appendChild(this._createHeatmapModeRow());
      // 第二项：取样间隔
      list.appendChild(this._createIntervalRow());
      // 第三项：线条粗细
      list.appendChild(this._createLineWidthRow());
      // 颜色栏：线条 + 渐变起止
      list.appendChild(this._createColorsRow());
        panel.appendChild(list);
        return panel;
      }
    }

    // 搜索弹幕分页：首页顶部信息框 + 远端匹配数据获取
    // 约定接口：getKey/getLabel/build/destroy

    class SearchDanmakuPage {
        constructor(opts = {}) {
            this.logger = opts.logger || null;
            this._panel = null;
            this._modalHost = null;
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

            // 统一弹窗宿主（固定在面板内，阻止滚动）
            const modalHost = document.createElement('div');
            modalHost.style.position = 'relative';
            modalHost.style.zIndex = '0';
            this._modalHost = modalHost;

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
        // 不随右侧内容拉伸高度，保持按图片自身高度，但在父容器中垂直居中
        leftWrap.style.alignSelf = 'center';
            const img = document.createElement('img');
            img.alt = '海报';
            img.style.display = 'block';
            // 宽度占列的 100%，高度自适应以保持长宽比
            img.style.width = '100%';
            img.style.height = 'auto';
            try { img.style.objectFit = 'contain'; } catch (_) { }
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
            // ep_id 展示
            const epIdNode = document.createElement('span');
            try {
                const gInit2 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                const eid0 = gInit2?.danmakuData?.episodeId;
                epIdNode.textContent = (eid0 === undefined || eid0 === null || eid0 === '') ? '--' : String(eid0);
            } catch (_) { epIdNode.textContent = '--'; }
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
                    // 根据返回 Promise 结果刷新“本集标题”和 ep_id
                    try {
                        if (p && typeof p.then === 'function') {
                            p.then(val => {
                                if (val) {
                                    try {
                                        const g2 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                        const newEpTitle = g2?.danmakuData?.episodeTitle || '--';
                                        if (this._episodeTitleEl) this._episodeTitleEl.textContent = newEpTitle;
                                        const newEpId = g2?.danmakuData?.episodeId;
                                        if (this._epIdValEl) this._epIdValEl.textContent = (newEpId === undefined || newEpId === null || newEpId === '') ? '--' : String(newEpId);
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
            rightWrap.appendChild(idLine.line);
            rightWrap.appendChild(offsetLine.line);
            // 将“本集标题”和“ep_id”移动到“集数偏移”下方，且“本集标题”在“ep_id”之上
            rightWrap.appendChild(epTitleLine.line);
            rightWrap.appendChild(epIdLine.line);
            header.appendChild(rightWrap);

            // 内容容器（为后续搜索 UI 预留）
            const list = document.createElement('div');
            list.className = 'danmaku-settings-list';
            // 先只放顶部信息框
            list.appendChild(header);

            // 信息栏与搜索栏之间：删除已匹配结果（整栏可点击，红色）
            const deleteBar = document.createElement('div');
            deleteBar.textContent = '删除已匹配结果';
            deleteBar.style.marginTop = '10px';
            deleteBar.style.height = '36px';
            deleteBar.style.lineHeight = '36px';
            deleteBar.style.textAlign = 'center';
            deleteBar.style.color = '#fff';
            deleteBar.style.fontSize = '13px';
            deleteBar.style.fontWeight = '600';
            deleteBar.style.background = 'rgba(220, 53, 69, 0.95)'; // 红色
            deleteBar.style.border = '1px solid rgba(255,255,255,.18)';
            deleteBar.style.borderRadius = '8px';
            deleteBar.style.cursor = 'pointer';
            deleteBar.style.userSelect = 'none';
            deleteBar.style.transition = 'filter .12s ease, opacity .12s ease';
            deleteBar.addEventListener('mouseenter', () => { try { deleteBar.style.filter = 'brightness(1.05)'; } catch (_) { } });
            deleteBar.addEventListener('mouseleave', () => { try { deleteBar.style.filter = 'none'; } catch (_) { } });

            const onDeleteClick = async () => {
                try {
                    // 统一样式确认框
                    const ok = await this._showConfirm({
                        title: '确认删除',
                        message: '确认删除已匹配结果？此操作将清空信息栏数据。',
                        confirmText: '删除',
                        cancelText: '取消'
                    });
                    if (!ok) return;
                    if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
                        this.logger?.warn?.('[Search] 无法删除：缺少 ApiClient');
                        return;
                    }
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    const item_id = g.getMediaId?.();
                    if (!item_id) {
                        this.logger?.warn?.('[Search] 无法删除：缺少 item_id');
                        return;
                    }
                    const prevText = deleteBar.textContent;
                    deleteBar.textContent = '处理中…';
                    deleteBar.style.opacity = '0.85';
                    deleteBar.style.pointerEvents = 'none';
                    const url = ApiClient.getUrl(`danmaku/del_match?item_id=${encodeURIComponent(String(item_id))}`);
                    // 无需解析返回体
                    await ApiClient.ajax({ type: 'GET', url });
                    // 成功后清空信息栏数据
                    this._clearHeaderInfo();
                    this.logger?.info?.('[Search] 已删除匹配结果', { item_id });
                } catch (e) {
                    this.logger?.warn?.('[Search] 删除匹配结果失败', e);
                } finally {
                    try {
                        deleteBar.textContent = '删除已匹配结果';
                        deleteBar.style.opacity = '';
                        deleteBar.style.pointerEvents = '';
                    } catch (_) { }
                }
            };
            deleteBar.addEventListener('click', onDeleteClick);
            this._unbinds.push(() => { try { deleteBar.removeEventListener('click', onDeleteClick); } catch (_) { } });
            list.appendChild(deleteBar);

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

            // modalHost 放顶部，承载居中弹窗层
            panel.appendChild(this._modalHost);
            panel.appendChild(list);
            this._listWrap = list;
            // 绑定搜索事件
            this._bindSearchActions();

            // 异步获取匹配数据，并从全局应用 ep_id
            Promise.resolve().then(() => { this._fetchMatchData(); this._applyEpIdFromGlobal(); });
            return panel;
        }

        _ensureModalLayer() {
            // 创建覆盖层和容器，固定定位在 panel 内部中央
            if (!this._panel) return null;
            let overlay = this._panel.querySelector?.('.danmaku-modal-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'danmaku-modal-overlay';
                overlay.style.position = 'fixed';
                overlay.style.inset = '0';
                overlay.style.display = 'none';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.style.background = 'rgba(0,0,0,.45)';
                overlay.style.zIndex = '9999';
                overlay.style.backdropFilter = 'blur(2px)';
                this._panel.appendChild(overlay);
            }
            return overlay;
        }

        _showConfirm({ title = '确认', message = '确定执行该操作吗？', confirmText = '确定', cancelText = '取消' } = {}) {
            return new Promise((resolve) => {
                try {
                    const overlay = this._ensureModalLayer();
                    if (!overlay) { resolve(window.confirm?.(message)); return; }

                    overlay.innerHTML = '';
                    const wrap = document.createElement('div');
                    wrap.style.maxWidth = '420px';
                    wrap.style.width = 'min(90vw, 420px)';
                    wrap.style.background = 'rgba(30,30,30,.98)';
                    wrap.style.border = '1px solid rgba(255,255,255,.16)';
                    wrap.style.borderRadius = '10px';
                    wrap.style.boxShadow = '0 10px 30px rgba(0,0,0,.4)';
                    wrap.style.padding = '14px 16px 12px';
                    wrap.style.color = '#fff';
                    wrap.style.transform = 'scale(.96)';
                    wrap.style.opacity = '0';
                    wrap.style.transition = 'transform .15s ease, opacity .15s ease';

                    const h = document.createElement('div');
                    h.textContent = title;
                    h.style.fontSize = '15px';
                    h.style.fontWeight = '700';
                    h.style.marginBottom = '8px';

                    const msg = document.createElement('div');
                    msg.textContent = message;
                    msg.style.fontSize = '13px';
                    msg.style.opacity = '.92';
                    msg.style.lineHeight = '1.6';
                    msg.style.marginBottom = '12px';

                    const btnRow = document.createElement('div');
                    btnRow.style.display = 'flex';
                    btnRow.style.justifyContent = 'flex-end';
                    btnRow.style.gap = '8px';

                    const cancel = document.createElement('button');
                    cancel.type = 'button';
                    cancel.textContent = cancelText;
                    cancel.style.padding = '6px 12px';
                    cancel.style.fontSize = '12px';
                    cancel.style.borderRadius = '6px';
                    cancel.style.border = '1px solid rgba(255,255,255,.20)';
                    cancel.style.background = 'rgba(255,255,255,.08)';
                    cancel.style.color = '#fff';

                    const ok = document.createElement('button');
                    ok.type = 'button';
                    ok.textContent = confirmText;
                    ok.style.padding = '6px 12px';
                    ok.style.fontSize = '12px';
                    ok.style.borderRadius = '6px';
                    ok.style.border = '1px solid rgba(76,175,80,.7)';
                    ok.style.background = 'rgba(76,175,80,.25)';
                    ok.style.color = '#c8f0c8';

                    btnRow.appendChild(cancel);
                    btnRow.appendChild(ok);

                    wrap.appendChild(h);
                    wrap.appendChild(msg);
                    wrap.appendChild(btnRow);
                    overlay.appendChild(wrap);

                    let prevOverflow = null;
                    try { prevOverflow = document.body && document.body.style ? document.body.style.overflow : null; } catch (_) { }

                    const close = (val) => {
                        try {
                            wrap.style.transform = 'scale(.96)';
                            wrap.style.opacity = '0';
                            setTimeout(() => {
                                overlay.style.display = 'none';
                                overlay.innerHTML = '';
                                // 恢复滚动
                                try { if (document.body && document.body.style) document.body.style.overflow = prevOverflow || ''; } catch (_) { }
                                try { document.removeEventListener('keydown', onKey); } catch (_) { }
                                resolve(val);
                            }, 140);
                        } catch (_) { overlay.style.display = 'none'; resolve(val); }
                    };

                    const onKey = (e) => {
                        if (e.key === 'Escape') { e.preventDefault?.(); close(false); }
                        if (e.key === 'Enter') { e.preventDefault?.(); close(true); }
                    };

                    cancel.addEventListener('click', () => close(false));
                    ok.addEventListener('click', () => close(true));
                    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
                    document.addEventListener('keydown', onKey);

                    overlay.style.display = 'flex';
                    // 禁止背景滚动
                    try { if (document.body && document.body.style) document.body.style.overflow = 'hidden'; } catch (_) { }
                    // 动画进入
                    requestAnimationFrame(() => {
                        wrap.style.transform = 'scale(1)';
                        wrap.style.opacity = '1';
                    });
                } catch (_) { resolve(false); }
            });
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

        _applyEpIdFromGlobal() {
            try {
                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                const newEpId = g?.danmakuData?.episodeId;
                if (this._epIdValEl) this._epIdValEl.textContent = (newEpId === undefined || newEpId === null || newEpId === '') ? '--' : String(newEpId);
            } catch (_) { try { if (this._epIdValEl) this._epIdValEl.textContent = '--'; } catch (__) { } }
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
                aidText.textContent = `将 ${curAnimeId} 作为本季id,集数偏移:`;
                aidText.style.fontSize = '12px';
                aidText.style.opacity = '.95';

                // 左侧编号块（样式与下方分集行保持一致）
                const left = document.createElement('div');
                left.style.flex = '0 0 auto';
                left.style.display = 'flex';
                left.style.alignItems = 'center';
                left.style.justifyContent = 'center';
                left.style.padding = '0 8px';
                const num = document.createElement('div');
                const aidStr = (curAnimeId ?? '').toString();
                num.textContent = aidStr.toUpperCase();
                num.style.fontSize = '18px';
                num.style.fontWeight = '700';
                num.style.letterSpacing = '.5px';
                num.style.opacity = '.95';
                left.appendChild(num);

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

                // 原“确认”按钮删除：仍创建一个离屏按钮对象以复用原有逻辑，但不插入 DOM
                const confirmBtn = document.createElement('button');
                confirmBtn.type = 'button';
                confirmBtn.textContent = '确认';

                // 右侧容器，承载文案与输入框，保证布局与分集行类似
                const right = document.createElement('div');
                right.style.flex = '1 1 auto';
                right.style.display = 'flex';
                right.style.alignItems = 'center';
                right.style.gap = '10px';
                right.appendChild(aidText);
                right.appendChild(seasonOffsetInput);

                actionBar.appendChild(left);
                actionBar.appendChild(right);
                // actionBar 可点击以提交
                actionBar.style.cursor = 'pointer';
                actionBar.addEventListener('mouseenter', () => { try { actionBar.style.filter = 'brightness(1.02)'; } catch (_) { } });
                actionBar.addEventListener('mouseleave', () => { try { actionBar.style.filter = ''; } catch (_) { } });
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

                        // 触发自动保存后的刷新“本集标题”和 ep_id
                        try {
                            const p = saveIfAutoOn(this.logger);
                            if (p && typeof p.then === 'function') {
                                p.then(val => {
                                    if (val) {
                                        try {
                                            const g3 = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                            const newEpTitle = g3?.danmakuData?.episodeTitle || '--';
                                            if (this._episodeTitleEl) this._episodeTitleEl.textContent = newEpTitle;
                                            const newEpId = g3?.danmakuData?.episodeId;
                                            if (this._epIdValEl) this._epIdValEl.textContent = (newEpId === undefined || newEpId === null || newEpId === '') ? '--' : String(newEpId);
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
                // 点击表单本体触发确认框后执行原逻辑；点击输入框本身不触发
                const onActionBarClick = async (e) => {
                    try {
                        if (e && (e.target === seasonOffsetInput || seasonOffsetInput.contains?.(e.target))) return;
                        const ok = await this._showConfirm({
                            title: '设置全季',
                            message: '确认将该 id 设为全季id，并应用当前 offset 吗？',
                            confirmText: '确定',
                            cancelText: '取消'
                        });
                        if (!ok) return;
                    } catch (_) { }
                    onConfirm();
                };
                actionBar.addEventListener('click', onActionBarClick);
                this._detailUnbinds.push(() => { try { actionBar.removeEventListener('click', onActionBarClick); } catch (_) { } });

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
                            // 删除每行按钮：仍保留一个离屏按钮对象以复用逻辑，但不插入 DOM
                            const actionWrap = document.createElement('div');
                            actionWrap.style.flex = '0 0 auto';
                            const setBtn = document.createElement('button');
                            setBtn.type = 'button';
                            setBtn.textContent = '设置单集ID';

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
                                    // 行忙碌态
                                    const prevOpacity = row.style.opacity;
                                    const prevPointer = row.style.pointerEvents;
                                    row.style.opacity = '0.85';
                                    row.style.pointerEvents = 'none';
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
                                    try {
                                        setBtn.disabled = false;
                                        row.style.opacity = prevOpacity;
                                        row.style.pointerEvents = prevPointer;
                                    } catch (_) { }
                                }
                            };
                            // 点击整行触发确认后执行原逻辑
                            row.style.cursor = 'pointer';
                            row.addEventListener('mouseenter', () => { try { row.style.filter = 'brightness(1.02)'; } catch (_) { } });
                            row.addEventListener('mouseleave', () => { try { row.style.filter = ''; } catch (_) { } });
                            const onRowClick = async () => {
                                try {
                                    const ok = await this._showConfirm({
                                        title: '设置单集ID',
                                        message: '确认将该分集设置为当前单集ID吗？(仅本集生效,优先级大于全季ID)',
                                        confirmText: '确定',
                                        cancelText: '取消'
                                    });
                                    if (!ok) return;
                                } catch (_) { }
                                onSet();
                            };
                            row.addEventListener('click', onRowClick);
                            this._detailUnbinds.push(() => { try { row.removeEventListener('click', onRowClick); } catch (_) { } });

                            row.appendChild(left);
                            row.appendChild(right);
                            // 不再追加每行的按钮容器，实现整行可点击
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

        // 透明背景

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

        _clearHeaderInfo() {
            try {
                this._matchData = null;
                if (this._titleValEl) this._titleValEl.textContent = '--';
                if (this._episodeTitleEl) this._episodeTitleEl.textContent = '--';
                if (this._idValEl) this._idValEl.textContent = '--';
                if (this._offsetInput) this._offsetInput.value = '0';
                if (this._epIdValEl) this._epIdValEl.textContent = '--';
                if (this._imgEl) {
                    try { this._imgEl.removeAttribute('src'); } catch (_) { }
                }
                try {
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    g.danmakuMatchData = null;
                    g.danmakuEpId = null;
                } catch (_) { }
            } catch (_) { }
        }

        async _fetchEpId() { this._applyEpIdFromGlobal(); }

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

    class DanmakuSettingsPanel {
        constructor({ logger } = {}) {
            this.logger = logger || null;
            this.el = null;
            this._styleInjected = false;
            this._id = 'danmakuSettingsPanel';
            this._followRaf = null; // requestAnimationFrame id
            this._followAnchor = null;
            this._lastPosKey = '';
            this._wheelListener = null;
            this._keyboardListener = null;
            this._currentTab = null;
            this._pinned = false; // 图钉固定状态
        this._vvListener = null; // visualViewport 监听器
        }

        getElement() {
            if (this.el) return this.el;
            this._injectStyles();
            const wrap = document.createElement('div');
            wrap.id = this._id;
            wrap.className = 'danmaku-settings-panel';
            wrap.setAttribute('role', 'dialog');
            wrap.setAttribute('aria-hidden', 'true');
            wrap.setAttribute('data-open', 'false');
            // 构建内容骨架（仅样式 / 结构，不含功能逻辑）
            wrap.appendChild(this._buildContent());
            this._installWheelInterceptor(wrap);
            this._installKeyboardInterceptor(wrap);
            this.el = wrap;
            return wrap;
        }

        show(anchorEl) {
            try {
                const el = this.getElement();
                if (!el.parentElement) {
                    (document.body || document.documentElement).appendChild(el);
                }
                // 初始化一次小屏 vh 变量，避免移动端 100vh 偏差
                this._updatePanelVhVar();
                this._position(anchorEl);
                el.removeAttribute('data-closing');
                el.setAttribute('data-open', 'true');
                el.setAttribute('aria-hidden', 'false');
                this._beginFollow(anchorEl);
            } catch (err) { this.logger?.warn?.('显示设置面板失败', err); }
        }

        hide() {
            try {
                const el = this.el;
                if (!el) return;
                if (el.getAttribute('data-open') !== 'true') return;
                // 标记关闭过渡
                el.setAttribute('data-closing', 'true');
                el.setAttribute('data-open', 'false');
                this._stopFollow();
                const done = () => {
                    try { el.setAttribute('aria-hidden', 'true'); el.removeAttribute('data-closing'); } catch (_) { }
                    try { el.removeEventListener('transitionend', done); } catch (_) { }
                };
                try { el.addEventListener('transitionend', done); } catch (_) { }
                setTimeout(done, 300); // 兜底
            } catch (_) { }
        }

        toggle(anchorEl) {
            if (!this.el || this.el.getAttribute('data-open') !== 'true') {
                this.show(anchorEl);
            } else {
                this.hide();
            }
        }

        _position(anchorEl) {
            if (!this.el || !anchorEl || typeof anchorEl.getBoundingClientRect !== 'function') return;
            try {
                const rect = anchorEl.getBoundingClientRect();
                const h = this.el.offsetHeight || 0;
                this.el.style.position = 'absolute';
                this.el.style.zIndex = 9999;
                this.el.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
                this.el.style.top = `${Math.round(rect.top - h)}px`;
                this._lastPosKey = `${rect.left},${rect.top},${h}`;
                this._ensureInViewport();
            } catch (_) { }
        }

        _beginFollow(anchorEl) {
            this._followAnchor = anchorEl || this._followAnchor;
            if (!this._followAnchor) return;
            if (this._followRaf) return; // 已在跟随
            this._anchorInvisible = false;
            this._reacquireTick = 0;
        // 首次进入也刷新一次 vh 变量
        this._updatePanelVhVar();
            const isAnchorVisible = (el) => {
                if (!el) return false;
                if (!el.isConnected) return false; // 不在文档
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return false;
                const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
                if (style) {
                    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return false;
                }
                return true;
            };
            const reacquireAnchor = () => {
                try {
                    const cand = document.querySelector('.danmaku-settings-btn, .btnDanmakuSettings');
                    if (cand) {
                        this._followAnchor = cand;
                        this._position(cand);
                        this._anchorInvisible = !isAnchorVisible(cand);
                    }
                } catch (_) { }
            };
            const step = () => {
                this._followRaf = null;
                try {
                    if (!this.el || this.el.getAttribute('data-open') !== 'true') { this._stopFollow(); return; }
                    if (!this._followAnchor || !this._followAnchor.isConnected) {
                        // 尝试重新获取锚点，不隐藏面板
                        if ((this._reacquireTick++ % 30) === 0) reacquireAnchor();
                    } else {
                        // 锚点存在但可能暂时不可见（控制条自动隐藏）
                        const visible = isAnchorVisible(this._followAnchor);
                        if (!visible) {
                            this._anchorInvisible = true; // 冻结位置
                        } else {
                            // 从不可见恢复
                            const rect = this._followAnchor.getBoundingClientRect();
                            const h = this.el.offsetHeight || 0;
                            const key = `${rect.left},${rect.top},${h}`;
                            if (key !== this._lastPosKey) {
                                this.el.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
                                this.el.style.top = `${Math.round(rect.top - h)}px`;
                                this._lastPosKey = key;
                                this._ensureInViewport();
                            }
                            this._anchorInvisible = false;
                        }
                    }
                } catch (_) { }
                this._followRaf = requestAnimationFrame(step);
            };
            this._followRaf = requestAnimationFrame(step);
            // 监听窗口 resize 以强制一次定位
            if (!this._resizeListener) {
                this._resizeListener = () => { try { this._updatePanelVhVar(); this._position(this._followAnchor); this._ensureInViewport(); } catch (_) { } };
                try { window.addEventListener('resize', this._resizeListener, { passive: true }); } catch (_) { }
            }
            // 监听 visualViewport（移动端地址栏/软键盘变化更灵敏）
            if (!this._vvListener && window.visualViewport) {
                this._vvListener = () => { try { this._updatePanelVhVar(); this._ensureInViewport(); } catch (_) { } };
                try { window.visualViewport.addEventListener('resize', this._vvListener, { passive: true }); } catch (_) { }
                try { window.visualViewport.addEventListener('scroll', this._vvListener, { passive: true }); } catch (_) { }
            }
        }

        _stopFollow() {
            if (this._followRaf) { try { cancelAnimationFrame(this._followRaf); } catch (_) { } this._followRaf = null; }
            if (this._resizeListener) { try { window.removeEventListener('resize', this._resizeListener); } catch (_) { } this._resizeListener = null; }
            if (this._vvListener && window.visualViewport) {
                try { window.visualViewport.removeEventListener('resize', this._vvListener); } catch (_) { }
                try { window.visualViewport.removeEventListener('scroll', this._vvListener); } catch (_) { }
                this._vvListener = null;
            }
        }

        _injectStyles() {
            if (this._styleInjected) return;
            if (typeof document === 'undefined') return;
            const id = 'danmakuSettingsPanelStyles';
            if (document.getElementById(id)) { this._styleInjected = true; return; }
            const style = document.createElement('style');
            style.id = id;
            // 带淡入/上滑 & 淡出/下滑 动画的样式实现
            style.textContent = `
        .danmaku-settings-panel { 
            display:block; box-sizing:border-box; position:absolute; 
            background:rgba(0,0,0,.78); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
            color:#fff; font-size:12px; line-height:1.4; padding:10px 14px 12px; 
            border:1px solid rgba(255,255,255,.18); border-radius:10px; 
            /* 自适应宽度：在较窄窗口下自动收缩，保证不超出；使用 clamp 设定范围 */
            width:clamp(320px, 70vw, 400px); max-width:90vw; min-width:0; 
            /* 高度策略：空间充足固定 600px；小屏降级为可视高度的 90% */
            height:min(600px, calc(var(--danmaku-vh, 1vh) * 90));
            max-height:none;
            opacity:0; transform:translate(-50%, 8px) scale(.94); 
            transition:opacity .18s ease, transform .22s cubic-bezier(.215,.61,.355,1); 
            pointer-events:none; will-change:opacity,transform; 
            box-shadow:0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5);
            font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
            overflow:hidden; display:flex; flex-direction:column;
            /* 防止滚动冒泡到页面 */
            overscroll-behavior:contain;
        }
        .danmaku-settings-panel[data-open="true"] { opacity:1; transform:translate(-50%, 0) scale(1); pointer-events:auto; }
        .danmaku-settings-panel[data-closing="true"] { pointer-events:none; }
    .danmaku-settings-pinBtn { position:absolute; top:6px; right:34px; width:22px; height:22px; border:0; background:rgba(255,255,255,.08); color:#ddd; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition:background .18s ease, color .18s ease, box-shadow .18s ease; }
    .danmaku-settings-pinBtn:hover { background:rgba(255,255,255,.18); color:#fff; }
    .danmaku-settings-pinBtn svg { width:14px; height:14px; fill:currentColor; pointer-events:none; }
    .danmaku-settings-panel[data-pinned="true"] .danmaku-settings-pinBtn { background:#3fa9ff; color:#fff; box-shadow:0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6); }
    .danmaku-settings-panel[data-pinned="true"] .danmaku-settings-pinBtn:hover { background:#56b4ff; }
    .danmaku-settings-closeBtn { position:absolute; top:6px; right:6px; width:22px; height:22px; border:0; background:rgba(255,0,0,.14); color:#ff6b6b; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; transition:background .18s ease, color .18s ease, box-shadow .18s ease; }
    .danmaku-settings-closeBtn:hover { background:rgba(255,0,0,.22); color:#fff; }
    .danmaku-settings-closeBtn svg { width:14px; height:14px; fill:currentColor; pointer-events:none; }
        .danmaku-settings-panel__title { font-size:14px; font-weight:600; margin:0 0 6px; letter-spacing:.5px; }
        .danmaku-settings-tabs { display:flex; gap:6px; margin:0 0 8px; flex-wrap:wrap; }
        .danmaku-settings-tab { border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.06); color:#fff; padding:4px 10px; border-radius:16px; font-size:12px; cursor:pointer; line-height:1; position:relative; }
        .danmaku-settings-tab:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.35); }
        .danmaku-settings-tab[data-active="true"] { background:#3fa9ff; border-color:#3fa9ff; box-shadow:0 0 0 1px rgba(63,169,255,.6),0 2px 6px -2px rgba(63,169,255,.6); }
    .danmaku-settings-panel__inner { flex:1 1 auto; display:flex; flex-direction:column; overflow:hidden; }
    .danmaku-settings-scroll { flex:1 1 auto; overflow:auto; padding-right:6px; }
        .danmaku-settings-tabPanels { position:relative; }
        .danmaku-settings-tabPanel { display:none; animation:fadeIn .18s ease; }
        .danmaku-settings-tabPanel[data-active="true"] { display:block; }
    .danmaku-settings-list { display:flex; flex-direction:column; gap:8px; }
        .danmaku-setting-row { display:flex; flex-direction:column; gap:3px; padding:6px 8px 7px; border:1px solid rgba(255,255,255,.08); border-radius:6px; background:rgba(255,255,255,.05); position:relative; min-width:0; }
        .danmaku-setting-row[data-type="boolean"] { cursor:pointer; }
        .danmaku-setting-row:hover { border-color:rgba(255,255,255,.22); background:rgba(255,255,255,.09); }
        .danmaku-setting-row__label { font-size:12px; font-weight:500; display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .danmaku-setting-row__desc { font-size:10px; opacity:.55; line-height:1.25; }
        .danmaku-setting-input { width:100%; box-sizing:border-box; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.25); color:#fff; border-radius:4px; padding:3px 6px; font-size:12px; line-height:1.3; outline:none; }
        .danmaku-setting-input:focus { border-color:#3fa9ff; box-shadow:0 0 0 1px rgba(63,169,255,.45); }
        .danmaku-setting-textarea { resize:vertical; min-height:52px; }
        .danmaku-setting-switch { width:30px; height:16px; border-radius:16px; background:rgba(255,255,255,.35); position:relative; flex-shrink:0; }
        .danmaku-setting-switch::after { content:""; position:absolute; left:2px; top:2px; width:12px; height:12px; background:#fff; border-radius:50%; transition:transform .18s ease, background-color .18s ease; }
        .danmaku-setting-row[data-enabled="true"] .danmaku-setting-switch { background:#3fa9ff; }
        .danmaku-setting-row[data-enabled="true"] .danmaku-setting-switch::after { transform:translateX(14px); }
    .danmaku-settings-footer { padding:8px 2px 0; font-size:10px; opacity:.55; text-align:right; }
    .danmaku-settings-actions { display:flex; gap:8px; justify-content:flex-end; padding:10px 0 0; margin-top:8px; background:transparent; border-top:1px solid rgba(255,255,255,.15); }
    .danmaku-settings-actions button { font:500 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; padding:6px 14px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.10); color:#fff; cursor:pointer; letter-spacing:.5px; transition:background-color .15s ease, border-color .15s ease, transform .15s ease; }
    .danmaku-settings-actions button:hover:not([data-busy="true"]) { background:rgba(255,255,255,.18); border-color:rgba(255,255,255,.4); }
    .danmaku-settings-actions button:active:not([data-busy="true"]) { transform:translateY(1px); }
    .danmaku-settings-actions button[data-type="primary"] { background:#3fa9ff; border-color:#3fa9ff; color:#fff; box-shadow:0 2px 8px -2px rgba(63,169,255,.6); }
    .danmaku-settings-actions button[data-type="primary"]:hover:not([data-busy="true"]) { background:#56b4ff; }
    .danmaku-settings-actions button[data-busy="true"] { opacity:.6; cursor:default; }
        /* 滚动条微样式 */
    .danmaku-settings-scroll::-webkit-scrollbar { width:8px; }
    .danmaku-settings-scroll::-webkit-scrollbar-track { background:transparent; }
    .danmaku-settings-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,.25); border-radius:4px; }
    .danmaku-settings-scroll::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.38); }
        @media (max-width:860px) { .danmaku-settings-grid { grid-template-columns:repeat(3,1fr);} }
        @media (max-width:680px) { .danmaku-settings-grid { grid-template-columns:repeat(2,1fr);} }
        @media (max-width:520px) { .danmaku-settings-grid { grid-template-columns:repeat(1,1fr);} }
        @media (prefers-reduced-motion: reduce) { .danmaku-settings-panel { transition:none!important; } .danmaku-setting-switch::after { transition:none!important; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px);} to { opacity:1; transform:translateY(0);} }
    /* 确认框样式 */
    .danmaku-confirm-mask { position:absolute; inset:0; background:rgba(0,0,0,.35); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); z-index:10000; }
    .danmaku-confirm { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); min-width:280px; max-width:90%; background:rgba(0,0,0,.86); color:#fff; border:1px solid rgba(255,255,255,.18); border-radius:10px; box-shadow:0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5); padding:12px 14px; z-index:10001; }
    .danmaku-confirm__title { font-size:14px; font-weight:600; margin:0 0 6px; letter-spacing:.5px; }
    .danmaku-confirm__msg { font-size:12px; opacity:.9; line-height:1.4; }
    .danmaku-confirm__actions { display:flex; gap:8px; justify-content:flex-end; padding-top:10px; margin-top:10px; border-top:1px solid rgba(255,255,255,.15); }
    .danmaku-confirm__actions button { font:500 12px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; padding:6px 14px 7px; border-radius:6px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.10); color:#fff; cursor:pointer; letter-spacing:.5px; transition:background-color .15s ease, border-color .15s ease, transform .15s ease; }
    .danmaku-confirm__actions button:hover { background:rgba(255,255,255,.18); border-color:rgba(255,255,255,.4); }
    .danmaku-confirm__actions button:active { transform:translateY(1px); }
    .danmaku-confirm__actions button[data-type="primary"] { background:#ff6363; border-color:#ff6363; color:#fff; box-shadow:0 2px 8px -2px rgba(255,99,99,.6); }
    .danmaku-confirm__actions button[data-type="primary"]:hover { background:#ff7a7a; }
        `;
            try { (document.head || document.documentElement).appendChild(style); this._styleInjected = true; } catch (_) { }
        }

        _buildContent() {
            const inner = document.createElement('div');
            inner.className = 'danmaku-settings-panel__inner';
            const title = document.createElement('h3');
            title.className = 'danmaku-settings-panel__title';
            title.textContent = '弹幕设置';
            // 图钉按钮
            const pinBtn = document.createElement('button');
            pinBtn.type = 'button';
            pinBtn.className = 'danmaku-settings-pinBtn';
            pinBtn.setAttribute('aria-label', '固定/取消固定 面板');
            pinBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14.53 2.53 12 0 9.47 2.53a5.5 5.5 0 0 0-1.61 3.9v4.17l-3.2 3.2a1 1 0 0 0 .7 1.7H11v6.5a1 1 0 0 0 2 0V15.5h5.64a1 1 0 0 0 .7-1.7l-3.2-3.2V6.43a5.5 5.5 0 0 0-1.61-3.9Z"/></svg>';
            pinBtn.addEventListener('click', () => { try { this.togglePin(); } catch (_) { } });
            inner.appendChild(title);
            inner.appendChild(pinBtn);
            // 关闭按钮（红叉）
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'danmaku-settings-closeBtn';
            closeBtn.setAttribute('aria-label', '关闭设置面板');
            closeBtn.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.9a1 1 0 0 0 1.41-1.41L13.41 12l4.9-4.89a1 1 0 0 0-.01-1.4Z"/></svg>';
            closeBtn.addEventListener('click', (ev) => {
                try {
                    ev.stopPropagation();
                    ev.stopImmediatePropagation?.();
                    ev.preventDefault?.();
                } catch (_) { }
                try { this.hide(); } catch (_) { }
            });
            inner.appendChild(closeBtn);
            const tabsWrap = document.createElement('div');
            tabsWrap.className = 'danmaku-settings-tabs';
            inner.appendChild(tabsWrap);
            // 可滚动主体容器
            const scrollWrap = document.createElement('div');
            scrollWrap.className = 'danmaku-settings-scroll';
            inner.appendChild(scrollWrap);
            // 新的分页类集合（新增“密度图”分页，移动自基础设置）
            this._pages = [
                new BasicSettingsPage({ logger: this.logger }),
                new CombinedSettingsPage({ logger: this.logger }),
                new FilterSettingsPage({ logger: this.logger }),
                new HeatmapSettingsPage({ logger: this.logger }),
                new SearchDanmakuPage({ logger: this.logger }),
                new CommentPoolPage({ logger: this.logger })
            ];
            const panelsWrap = document.createElement('div');
            panelsWrap.className = 'danmaku-settings-tabPanels';
            scrollWrap.appendChild(panelsWrap);
            const switchTab = (tabKey) => {
                if (this._currentTab === tabKey) return;
                this._currentTab = tabKey;
                tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.setAttribute('data-active', btn.dataset.key === tabKey ? 'true' : 'false'));
                panelsWrap.querySelectorAll('.danmaku-settings-tabPanel').forEach(p => p.setAttribute('data-active', p.dataset.key === tabKey ? 'true' : 'false'));
            };
            // 生成按钮与面板（显示全部分页）
            this._pages.forEach(page => {
                const key = page.getKey();
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'danmaku-settings-tab';
                btn.dataset.key = key;
                btn.textContent = page.getLabel();
                btn.setAttribute('data-active', 'false');
                btn.addEventListener('click', () => switchTab(key));
                tabsWrap.appendChild(btn);
                const panelEl = page.build();
                panelsWrap.appendChild(panelEl);
            });
            // 默认选中第一个分页
            if (this._pages.length) switchTab(this._pages[0].getKey());
            const footer = document.createElement('div');
            footer.className = 'danmaku-settings-footer';
            scrollWrap.appendChild(footer);
            // 操作按钮栏（重置 / 保存）保持在底部，不随内容滚动
            inner.appendChild(this._buildActionBar());
            return inner;
        }

        _renderRow(key, label) { /* 已拆分到各分页类，占位方法保留避免调用错误 */ return document.createElement('div'); }

        _buildActionBar() {
            const bar = document.createElement('div');
            bar.className = 'danmaku-settings-actions';
            // 让左右分布：左侧调试开关，右侧按钮组
            bar.style.justifyContent = 'space-between';
            // 左侧调试模式开关
            const debugWrap = document.createElement('label');
            debugWrap.style.display = 'flex';
            debugWrap.style.alignItems = 'center';
            debugWrap.style.gap = '4px';
            debugWrap.style.fontSize = '11px';
            debugWrap.style.opacity = '.85';
            debugWrap.style.cursor = 'pointer';
            const debugCb = document.createElement('input');
            debugCb.type = 'checkbox';
            debugCb.style.margin = 0;
            // 从 localStorage 读取持久化调试模式（不上传服务器）
            let storedDebug = null;
            try { storedDebug = localStorage.getItem('danmaku_debug_enabled'); } catch (_) { }
            const storedBool = storedDebug === '1';
            // 若本地存储存在则优先使用；否则用当前 logger 状态
            let initialDebug = storedDebug != null ? storedBool : !!this.logger?.getDebug?.();
            debugCb.checked = initialDebug;
            // 同步 logger 状态（若 logger 当前不同）
            try { if (this.logger && this.logger.getDebug && this.logger.getDebug() !== initialDebug) { this.logger.setDebug(initialDebug); } } catch (_) { }
            const debugText = document.createElement('span');
            debugText.textContent = '调试模式';
            debugWrap.appendChild(debugCb);
            debugWrap.appendChild(debugText);
            debugCb.addEventListener('change', () => {
                try {
                    this.logger?.setDebug?.(debugCb.checked);
                    // 写入 localStorage 记忆
                    try { localStorage.setItem('danmaku_debug_enabled', debugCb.checked ? '1' : '0'); } catch (_) { }
                } catch (_) { }
            });
            bar.appendChild(debugWrap);
            // 右侧按钮容器
            const rightGroup = document.createElement('div');
            rightGroup.style.display = 'flex';
            rightGroup.style.alignItems = 'center';
            rightGroup.style.gap = '8px';
            // 重置按钮
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.textContent = '重置';
            resetBtn.addEventListener('click', async () => {
                try {
                    const ok = await this._showConfirm({
                        title: '恢复默认设置',
                        message: '确定将所有设置恢复为默认值吗？此操作会覆盖当前自定义设置。',
                        confirmText: '重置',
                        cancelText: '取消'
                    });
                    if (!ok) return;
                    const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                    const settings = g.danmakuSettings;
                    if (!settings || typeof settings.resetToDefaults !== 'function') {
                        this.logger?.warn?.('重置失败：设置对象缺失或不支持重置');
                        return;
                    }
                    settings.resetToDefaults();
                    this.logger?.info?.('已重置为默认设置（本地）');
                    try {
                        const mediaId = g.getMediaId?.();
                        if (mediaId) await updateDanmakuSettings(this.logger, mediaId);
                        else await updateDanmakuSettings(this.logger);
                        this.logger?.info?.('默认设置已提交保存');
                    } catch (e) { this.logger?.warn?.('默认设置保存失败', e); }
                    try { this._refreshPagesUI(); } catch (_) { }
                } catch (e) {
                    this.logger?.warn?.('执行重置时出错', e);
                }
            });
            // 保存按钮
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = '保存';
            saveBtn.dataset.type = 'primary';
            const setBusy = (busy) => {
                if (busy) {
                    saveBtn.setAttribute('data-busy', 'true');
                    saveBtn.textContent = '保存中…';
                } else {
                    saveBtn.removeAttribute('data-busy');
                    saveBtn.textContent = '保存';
                }
            };
            saveBtn.addEventListener('click', async () => {
                if (saveBtn.getAttribute('data-busy') === 'true') return; // 防重复
                try {
                    const mediaId = window?.__jfDanmakuGlobal__?.getMediaId?.();
                    if (!mediaId) {
                        this.logger?.warn?.('保存失败：缺少 mediaId');
                        return;
                    }
                    setBusy(true);
                    await updateDanmakuSettings(this.logger, mediaId);
                    this.logger?.info?.('弹幕设置已保存');
                } catch (e) {
                    this.logger?.warn?.('保存弹幕设置出错', e);
                } finally {
                    setBusy(false);
                }
            });
            rightGroup.appendChild(resetBtn);
            rightGroup.appendChild(saveBtn);
            // 实时保存开关
            const autoWrap = document.createElement('label');
            autoWrap.style.display = 'flex';
            autoWrap.style.alignItems = 'center';
            autoWrap.style.gap = '4px';
            autoWrap.style.marginLeft = '8px';
            autoWrap.style.fontSize = '11px';
            autoWrap.style.opacity = '.85';
            const autoCb = document.createElement('input');
            autoCb.type = 'checkbox';
            autoCb.style.margin = 0;
            // 初始状态：仅读取本地持久化；未设置时默认开启
            try {
                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                let persisted = null;
                try { persisted = localStorage.getItem('danmaku_auto_save'); } catch (_) { }
                const persistedBool = (persisted === 'true') ? true : (persisted === 'false' ? false : null);
                g.danmakuAutoSave = (persistedBool != null) ? persistedBool : true;
                autoCb.checked = g.danmakuAutoSave;


            } catch (_) { }
            const autoText = document.createElement('span');
            autoText.textContent = '实时';
            autoWrap.appendChild(autoCb);
            autoWrap.appendChild(autoText);


        autoCb.addEventListener('change', () => {
                try {
                    try { localStorage.setItem('danmaku_auto_save', autoCb.checked ? 'true' : 'false'); } catch (_) { }
                    if (autoCb.checked) {
                        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                        g.danmakuAutoSave = true;
                        localStorage.setItem('danmaku_auto_save', 'true');
                        this.logger?.info?.('实时保存已开启');
                    } else {
                        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                        g.danmakuAutoSave = false;
                        localStorage.setItem('danmaku_auto_save', 'false');
                        this.logger?.info?.('实时保存已关闭');
                    }
                } catch (_) { }
            });
            rightGroup.appendChild(autoWrap);
            bar.appendChild(rightGroup);
            return bar;
        }

        // 重新构建分页以同步 UI 到当前全局设置值（尽量轻量，不销毁面板容器）
        _refreshPagesUI() {
            try {
                if (!this.el) return;
                const panelsWrap = this.el.querySelector('.danmaku-settings-tabPanels');
                const tabsWrap = this.el.querySelector('.danmaku-settings-tabs');
                if (!panelsWrap || !tabsWrap) return;
                const activeKey = this._currentTab || (this._pages?.[0]?.getKey?.());
                // 先销毁旧分页，释放资源（如 RAF/全局事件）
                if (Array.isArray(this._pages)) {
                    try { this._pages.forEach(p => p?.destroy?.()); } catch (_) { }
                }
                // 清空旧内容
                panelsWrap.innerHTML = '';
                tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.remove());
                // 重新实例化分页（保持 logger），并重建 tabs + panels（含“密度图”分页）
                this._pages = [
                    new BasicSettingsPage({ logger: this.logger }),
                    new CombinedSettingsPage({ logger: this.logger }),
                    new FilterSettingsPage({ logger: this.logger }),
                    new HeatmapSettingsPage({ logger: this.logger }),
                    new SearchDanmakuPage({ logger: this.logger }),
                    new CommentPoolPage({ logger: this.logger })
                ];
                const switchTab = (tabKey) => {
                    if (this._currentTab === tabKey) return;
                    this._currentTab = tabKey;
                    tabsWrap.querySelectorAll('.danmaku-settings-tab').forEach(btn => btn.setAttribute('data-active', btn.dataset.key === tabKey ? 'true' : 'false'));
                    panelsWrap.querySelectorAll('.danmaku-settings-tabPanel').forEach(p => p.setAttribute('data-active', p.dataset.key === tabKey ? 'true' : 'false'));
                };
                this._pages.forEach(page => {
                    const key = page.getKey();
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'danmaku-settings-tab';
                    btn.dataset.key = key;
                    btn.textContent = page.getLabel();
                    btn.setAttribute('data-active', 'false');
                    btn.addEventListener('click', () => switchTab(key));
                    tabsWrap.appendChild(btn);
                    const panelEl = page.build();
                    panelsWrap.appendChild(panelEl);
                });
                if (this._pages.length) {
                    const exists = this._pages.some(p => p.getKey() === activeKey);
                    const key = exists ? activeKey : this._pages[0].getKey();
                    // 确保初次切换不会因“当前等于目标”而早退，导致未设置 data-active
                    this._currentTab = null;
                    switchTab(key);
                }
            } catch (_) { }
        }

        destroy() {
            try { this.el?.parentElement?.removeChild(this.el); } catch (_) { }
            this.el = null;
            // 销毁所有分页实例，释放资源
            if (Array.isArray(this._pages)) {
                try { this._pages.forEach(p => p?.destroy?.()); } catch (_) { }
            }
            this._stopFollow();
            if (this._wheelListener) {
                try { window.removeEventListener('wheel', this._wheelListener, true); } catch (_) { }
                this._wheelListener = null;
            }
            if (this._keyboardListener) {
                try { document.removeEventListener('keydown', this._keyboardListener, true); } catch (_) { }
                this._keyboardListener = null;
            }
        }

        _installWheelInterceptor(rootEl) {
            if (this._wheelListener) return;
            this._wheelListener = (e) => {
                try {
                    if (!this.el || this.el.getAttribute('data-open') !== 'true') return;
                    // 仅当指针位于面板内部时拦截（包含任意子元素）
                    if (this.el.contains(e.target)) {
                        // 阻止向外层播放器的冒泡，避免调整音量或其它快捷行为
                        e.stopPropagation();
                        e.stopImmediatePropagation?.();
                        // 不调用 preventDefault，保留面板内部滚动
                    }
                } catch (_) { }
            };
            try { window.addEventListener('wheel', this._wheelListener, { capture: true, passive: true }); } catch (_) { }
        }

        _installKeyboardInterceptor(rootEl) {
            if (this._keyboardListener) return;
            this._keyboardListener = (ev) => {
                try {
                    if (!this.el || this.el.getAttribute('data-open') !== 'true') return;
                    // 仅当事件来自设置面板内部（包含其后代）时处理
                    if (!this.el.contains(ev.target)) return;
                    // Esc: 关闭面板但不阻断（或阻断后自行处理）。这里阻断播放器，再执行关闭
                    if (ev.key === 'Escape') {
                        ev.stopPropagation();
                        ev.stopImmediatePropagation?.();
                        this.hide();
                        return;
                    }
                    // 允许组合键 (Ctrl/Meta/Alt 任意) 交给浏览器/系统，不拦截
                    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
                    // 放行 Enter（可能有提交/确认用途）
                    if (ev.key === 'Enter') return;
                    // 其它键统一阻断（含空格/方向键/F/C/M等播放器快捷键）
                    ev.stopPropagation();
                    ev.stopImmediatePropagation?.();
                    // Space 防止页面滚动 & 播放切换
                    if (ev.key === ' ' || ev.code === 'Space') {
                        ev.preventDefault();
                    }
                } catch (_) { }
            };
            try { document.addEventListener('keydown', this._keyboardListener, true); } catch (_) { }
        }
        // 统一确认框
        _showConfirm({ title = '确认', message = '确定执行此操作吗？', confirmText = '确定', cancelText = '取消' } = {}) {
            return new Promise(resolve => {
                try {
                    const host = this.el || document.body;
                    const mask = document.createElement('div');
                    mask.className = 'danmaku-confirm-mask';
                    const box = document.createElement('div');
                    box.className = 'danmaku-confirm';
                    const h = document.createElement('div'); h.className = 'danmaku-confirm__title'; h.textContent = title; box.appendChild(h);
                    const p = document.createElement('div'); p.className = 'danmaku-confirm__msg'; p.textContent = message; box.appendChild(p);
                    const actions = document.createElement('div'); actions.className = 'danmaku-confirm__actions';
                    const btnCancel = document.createElement('button'); btnCancel.type = 'button'; btnCancel.textContent = cancelText; actions.appendChild(btnCancel);
                    const btnOk = document.createElement('button'); btnOk.type = 'button'; btnOk.textContent = confirmText; btnOk.dataset.type = 'primary'; actions.appendChild(btnOk);
                    box.appendChild(actions);
                    // 交互
                    const cleanup = (val) => {
                        try { host.removeChild(mask); } catch (_) { }
                        try { host.removeChild(box); } catch (_) { }
                        resolve(!!val);
                    };
                    btnCancel.addEventListener('click', () => cleanup(false));
                    btnOk.addEventListener('click', () => cleanup(true));
                    mask.addEventListener('click', () => cleanup(false));
                    // Esc 关闭，阻断冒泡到播放器
                    const keyHandler = (ev) => {
                        try {
                            if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); cleanup(false); }
                            if (ev.key === 'Enter') { ev.stopPropagation(); ev.preventDefault(); cleanup(true); }
                        } catch (_) { }
                    };
                    document.addEventListener('keydown', keyHandler, true);
                    const unbind = () => { try { document.removeEventListener('keydown', keyHandler, true); } catch (_) { } };
                    const _origCleanup = cleanup;
                    // 包装以确保移除监听
                    const cleanupWrapped = (val) => { unbind(); _origCleanup(val); };
                    // 替换引用
                    // 重新绑定
                    btnCancel.onclick = () => cleanupWrapped(false);
                    btnOk.onclick = () => cleanupWrapped(true);
                    mask.onclick = () => cleanupWrapped(false);
                    // 注入 DOM
                    host.appendChild(mask);
                    host.appendChild(box);
                    // 初始聚焦
                    setTimeout(() => { try { btnOk.focus(); } catch (_) { } }, 0);
                } catch (_) { resolve(false); }
            });
        }
        // 确保面板在视口内：调整 left(中心) 和 top，留 8px 边距
        _ensureInViewport() {
            if (!this.el) return;
            try {
                const margin = 8;
                const vw = window.innerWidth || document.documentElement.clientWidth || 0;
                // 优先使用 visualViewport 的高度以应对移动端地址栏/键盘
                const vh = (window.visualViewport?.height) || window.innerHeight || document.documentElement.clientHeight || 0;
                const rect = this.el.getBoundingClientRect();
                if (!rect || rect.width === 0) return;
                let centerX = rect.left + rect.width / 2; // 因 translate(-50%) left 为中心
                let changed = false;
                if (rect.left < margin) { centerX += (margin - rect.left); changed = true; }
                if (rect.right > vw - margin) { centerX -= (rect.right - (vw - margin)); changed = true; }
                if (changed) this.el.style.left = `${Math.round(centerX)}px`;
                let newTop = null;
                if (rect.top < margin) newTop = margin; else if (rect.bottom > vh - margin) newTop = Math.max(margin, vh - margin - rect.height);
                if (newTop !== null) this.el.style.top = `${Math.round(newTop)}px`;
            } catch (_) { }
        }
        // 刷新小屏 vh 变量，解决 iOS/安卓 100vh 偏差；按 1vh 的像素值设置
        _updatePanelVhVar() {
            try {
                const vv = window.visualViewport;
                const h = Math.max(0, (vv?.height) || window.innerHeight || document.documentElement.clientHeight || 0);
                const oneVhPx = h / 100;
                const host = this.el || document.documentElement;
                host.style.setProperty('--danmaku-vh', `${oneVhPx}px`);
            } catch (_) { }
        }
        // 图钉固定状态切换
        togglePin() {
            this._pinned = !this._pinned;
            try { this.el?.setAttribute('data-pinned', this._pinned ? 'true' : 'false'); } catch (_) { }
            this.logger?.info?.(`设置面板已${this._pinned ? '固定 (不再自动关闭)' : '取消固定 (恢复自动关闭)'}`);
            // 取消固定后立即尝试触发一次视口检查防止位置偏移
            if (!this._pinned) { try { this._ensureInViewport(); } catch (_) { } }
        }
        isPinned() { return !!this._pinned; }
    }

    // 该文件现仅负责：
    // 1. 生成按钮组 DOM 结构与事件逻辑
    // 2. 注入必要样式（SVG mask 等）
    // 不再负责：插入到控制条 / 轮询 / Mutation 监控（统一由 danmakuExt.js 的存在性监控完成）


    class DanmakuButtonsGroup {
        constructor({ logger } = {}) {
            this.logger = logger || null;
            this.el = null;
            this.toggleButton = null;
            this.settingsButton = null;
            this.settingsPanel = new DanmakuSettingsPanel({ logger: this.logger });
            this._globalKeyInterceptor = null; // 聚焦输入时的全局快捷键拦截器
        this._enabled = false; // 当前开关状态（从设置 enable_danmaku 恢复）
            this._toggleRetryTimer = null; // 全局渲染器未就绪时的延迟重试
            this._onToggle = this._onToggle.bind(this);
            this._onOpenSettings = this._onOpenSettings.bind(this);
            this._onSettingsHoverOpen = this._onSettingsHoverOpen.bind(this);
            this._onDocumentClick = this._onDocumentClick.bind(this);
            this._onSettingsButtonMouseLeave = this._onSettingsButtonMouseLeave.bind(this);
            this._onPanelMouseEnter = this._onPanelMouseEnter.bind(this);
            this._onPanelMouseLeave = this._onPanelMouseLeave.bind(this);
            this._settingsHoverTimer = null;
            this._settingsAutoCloseTimer = null; // 面板自动关闭计时器
            this._restored = false; // 是否已尝试恢复
            this._freezeClickUntil = 0; // 悬停打开后的一段时间内禁止点击立即关闭
        // 设置面板内输入/焦点状态
        this._panelHasFocus = false; // 面板内是否存在聚焦元素
        this._imeComposing = false; // 是否处于输入法合成中
        }

        // 对外：获取（惰性创建）元素
        getElement() {
            if (this.el) return this.el;
            this._injectStylesIfNeeded();
            const group = document.createElement('div');
            group.setAttribute('data-danmaku-buttons', 'true');
            group.className = 'flex align-items-center flex-direction-row danmakuButtonsGroup';
            group.setAttribute('dir', 'ltr');
            group.setAttribute('data-enabled', 'false');

            // 文本输入框（位于最左侧）
            const inputEl = this._createTextInput();
            const toggleBtn = this._createToggleButton();
            const settingsBtn = this._createSettingsButton();
            toggleBtn.setAttribute('aria-label', '切换弹幕');
            settingsBtn.setAttribute('aria-label', '弹幕设置');
            try { toggleBtn.addEventListener('click', this._onToggle, { passive: true }); } catch (_) { }
            try { settingsBtn.addEventListener('click', this._onOpenSettings, { passive: true }); } catch (_) { }
            // 悬停 500ms 打开
            try { settingsBtn.addEventListener('mouseenter', this._onSettingsHoverOpen, { passive: true }); } catch (_) { }
            try { settingsBtn.addEventListener('mouseleave', this._onSettingsButtonMouseLeave, { passive: true }); } catch (_) { }
            group.appendChild(inputEl);
            group.appendChild(toggleBtn);
            group.appendChild(settingsBtn);

            this.el = group;
            this.inputEl = inputEl;
            this.toggleButton = toggleBtn;
            this.settingsButton = settingsBtn;

        // 初次创建后尝试从设置恢复开关状态
        this._restoreEnabledStateFromSettings();
            // 应用 UI 标记（不触发日志）
            try {
                group.setAttribute('data-enabled', String(this._enabled));
                this.toggleButton?.setAttribute('aria-pressed', this._enabled ? 'true' : 'false');
            } catch (_) { }
            // 若是开启状态，尝试联动显示（可能 renderer 还没好，使用与 _onToggle 相似的重试逻辑）
            if (this._enabled) {
                this._applyVisibilityWithRetry();
            }
            return group;
        }

        _onToggle() {
            this._enabled = !this._enabled;
            this.logger?.info?.(`弹幕开关: ${this._enabled ? '开启' : '关闭'}`);
            try {
                this.el?.setAttribute('data-enabled', String(this._enabled));
                this.toggleButton?.setAttribute('aria-pressed', this._enabled ? 'true' : 'false');
            } catch (_) { /* no-op */ }

            // 写回设置
            try {
                const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                if (g?.danmakuSettings?.set) {
                    g.danmakuSettings.set('enable_danmaku', !!this._enabled);
                    updateDanmakuSettings(this.logger || null).catch((err) => {
                        this.logger?.warn?.('保存设置失败', err);
                    });
                }
            } catch (_) { /* ignore */ }

            // 与全局弹幕渲染器联动 show/hide
            this._applyVisibilityWithRetry();
        }

        _applyVisibilityWithRetry() {
            const applyVisibility = () => {
                try {
                    const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                    const renderer = g?.danmakuRenderer;
                    if (!renderer) return false;
                    if (this._enabled) {
                        try { renderer.show?.(); } catch (e) { this.logger?.warn?.('调用 renderer.show 失败', e); }
                    } else {
                        try { renderer.hide?.(); } catch (e) { this.logger?.warn?.('调用 renderer.hide 失败', e); }
                    }
                    return true;
                } catch (err) {
                    this.logger?.warn?.('切换弹幕显示状态失败', err);
                    return true; // 避免重复重试
                }
            };
            const ok = applyVisibility();
            if (!ok && this._enabled) {
                if (this._toggleRetryTimer) { try { clearTimeout(this._toggleRetryTimer); } catch (_) { } }
                this._toggleRetryTimer = setTimeout(() => {
                    this._toggleRetryTimer = null;
                    applyVisibility();
                }, 1200);
            }
        }

        _restoreEnabledStateFromSettings() {
            if (this._restored) return; // 只尝试一次
            this._restored = true;
            try {
                const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                const enabled = (g?.danmakuSettings?.asBool?.('enable_danmaku'));
                if (typeof enabled === 'boolean') {
                    this._enabled = enabled;
                } else {
                    // 若缺失设置则使用默认 true
                    this._enabled = true;
                }
            } catch (_) { /* ignore */ }
        }

        _onOpenSettings() {
            // 悬停刚打开后 1 秒内点击忽略（防止意外闪烁关闭）
            if (this._freezeClickUntil && Date.now() < this._freezeClickUntil) {
                this.logger?.info?.('设置面板点击切换已被冻结 (hover 冷却中)');
                return;
            }
            // 点击：切换设置面板
            this.logger?.info?.('打开/关闭弹幕设置面板 (点击)');
            try { this.settingsPanel.toggle(this.settingsButton); } catch (_) { }
            this._ensureOutsideClickBinding();
            this._afterMaybeOpened();
        }

        _onSettingsHoverOpen() {
            if (this._settingsHoverTimer) { try { clearTimeout(this._settingsHoverTimer); } catch (_) { } }
            this._settingsHoverTimer = setTimeout(() => {
                this._settingsHoverTimer = null;
                // 仅当未打开时才通过 hover 打开
                const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
                if (!open) {
                    this.logger?.info?.('打开弹幕设置面板 (悬停)');
                    try { this.settingsPanel.show(this.settingsButton); } catch (_) { }
                    this._ensureOutsideClickBinding();
                    this._afterMaybeOpened();
                    // 设置 1 秒冷却期
                    this._freezeClickUntil = Date.now() + 1000;
                }
            }, 100);
        }

        _afterMaybeOpened() {
            // 如果已打开，绑定面板 hover 事件；如果关闭，清理自动关闭计时器
            const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
            if (open) {
                this._bindPanelHoverHandlers();
                this._bindPanelFocusHandlers();
                this._clearSettingsAutoClose();
            } else {
                this._clearSettingsAutoClose();
            }
        }

        _bindPanelHoverHandlers() {
            if (!this.settingsPanel?.el) return;
            if (this._panelHoverBound) return;
            try { this.settingsPanel.el.addEventListener('mouseenter', this._onPanelMouseEnter, { passive: true }); } catch (_) { }
            try { this.settingsPanel.el.addEventListener('mouseleave', this._onPanelMouseLeave, { passive: true }); } catch (_) { }
            this._panelHoverBound = true;
        }

        _onSettingsButtonMouseLeave() {
            // 清除悬停打开计时
            if (this._settingsHoverTimer) { try { clearTimeout(this._settingsHoverTimer); } catch (_) { } this._settingsHoverTimer = null; }
            // 若面板已打开，开始 5 秒自动关闭计时（如未进入面板区域将关闭）
            this._scheduleSettingsAutoClose();
        }

        _onPanelMouseEnter() {
            this._clearSettingsAutoClose();
        }

        _onPanelMouseLeave() {
            this._scheduleSettingsAutoClose();
        }

        _scheduleSettingsAutoClose() {
            const open = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
            if (!open) return;
            // 固定状态下不自动关闭
            if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return;
            // 面板内存在焦点或处于输入法合成中时，不自动关闭
            try {
                const hasFocusInPanel = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
                if (hasFocusInPanel) { return; }
            } catch (_) { /* ignore */ }
            if (this._imeComposing) return;
            this._clearSettingsAutoClose();
            this._settingsAutoCloseTimer = setTimeout(() => {
                // 再次确认是否仍未悬停
                const stillOpen = this.settingsPanel?.el && this.settingsPanel.el.getAttribute('data-open') === 'true';
                if (!stillOpen) return;
                if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return; // pinned 期间不关闭
                // 输入法合成或面板内焦点期间不关闭
                try {
                    const hasFocusInPanel2 = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
                    if (hasFocusInPanel2) { this._scheduleSettingsAutoClose(); return; }
                } catch (_) { }
                if (this._imeComposing) { this._scheduleSettingsAutoClose(); return; }
                // 如果鼠标当前在按钮或面板上则取消
                try {
                    const btnHover = this._isElementHovered(this.settingsButton);
                    const panelHover = this._isElementHovered(this.settingsPanel.el);
                    if (btnHover || panelHover) { this._scheduleSettingsAutoClose(); return; }
                } catch (_) { }
                try { this.settingsPanel.hide(); } catch (_) { }
            }, 100);
        }

        _clearSettingsAutoClose() {
            if (this._settingsAutoCloseTimer) { try { clearTimeout(this._settingsAutoCloseTimer); } catch (_) { } this._settingsAutoCloseTimer = null; }
        }

        _isElementHovered(el) {
            if (!el) return false;
            try {
                return el.parentElement && Array.from((el.ownerDocument || document).querySelectorAll(':hover')).includes(el);
            } catch (_) { return false; }
        }

        _ensureOutsideClickBinding() {
            try {
                if (!this._outsideClickBound) {
                    document.addEventListener('mousedown', this._onDocumentClick, true);
                    this._outsideClickBound = true;
                }
            } catch (_) { }
        }

        _onDocumentClick(e) {
            try {
                if (!this.settingsPanel?.el) return;
                const open = this.settingsPanel.el.getAttribute('data-open') === 'true';
                if (!open) return;
                // 固定状态下，点击外部不关闭
                if (this.settingsPanel?.isPinned && this.settingsPanel.isPinned()) return;
                // 输入法候选面板期间或面板内存在焦点时，不因外部点击立即关闭（避免误触）
                try {
                    const hasFocusInPanel = this.settingsPanel?.el?.contains?.((this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement);
                    if (this._imeComposing || hasFocusInPanel) {
                        // 若点击目标确实是完全外部区域，则仅在合成结束后再评估
                        // 这里放行点击，但不主动关闭
                        return;
                    }
                } catch (_) { }
                if (this.settingsPanel.el.contains(e.target) || this.settingsButton.contains(e.target)) return;
                this.settingsPanel.hide();
                this._clearSettingsAutoClose();
            } catch (_) { }
        }

        _bindPanelFocusHandlers() {
            if (!this.settingsPanel?.el) return;
            if (this._panelFocusBound) return;
            const panelEl = this.settingsPanel.el;
            // 定义回调（惰性创建）
            if (!this._onPanelFocusIn) {
                this._onPanelFocusIn = () => {
                    this._panelHasFocus = true;
                    this._clearSettingsAutoClose();
                };
            }
            if (!this._onPanelFocusOut) {
                this._onPanelFocusOut = () => {
                    // 延迟检查当前 activeElement 是否仍位于面板
                    setTimeout(() => {
                        try {
                            const ae = (this.el && this.el.ownerDocument) ? this.el.ownerDocument.activeElement : document.activeElement;
                            this._panelHasFocus = !!this.settingsPanel?.el?.contains?.(ae);
                            if (!this._panelHasFocus) {
                                this._scheduleSettingsAutoClose();
                            }
                        } catch (_) { /* ignore */ }
                    }, 50);
                };
            }
            if (!this._onCompositionStart) {
                this._onCompositionStart = () => {
                    this._imeComposing = true;
                    this._clearSettingsAutoClose();
                };
            }
            if (!this._onCompositionEnd) {
                this._onCompositionEnd = () => {
                    this._imeComposing = false;
                    // 合成结束后，若鼠标不在面板/按钮且无焦点，再次评估是否需要关闭
                    this._scheduleSettingsAutoClose();
                };
            }
            // 使用捕获阶段监听，保证能接收到内部控件事件
            try {
                panelEl.addEventListener('focusin', this._onPanelFocusIn, true);
                panelEl.addEventListener('focusout', this._onPanelFocusOut, true);
                panelEl.addEventListener('compositionstart', this._onCompositionStart, true);
                panelEl.addEventListener('compositionend', this._onCompositionEnd, true);
            } catch (_) { /* ignore */ }
            this._panelFocusBound = true;
        }

        _injectStylesIfNeeded() {
            if (typeof document === 'undefined') return;
            const id = 'danmakuButtonsStyles';
            if (document.getElementById(id)) return;
            // 局部：生成 data-uri
            const svgDataUri = (svg) => {
                try {
                    const encoded = encodeURIComponent(svg)
                        .replace(/'/g, '%27')
                        .replace(/\(/g, '%28')
                        .replace(/\)/g, '%29');
                    return `data:image/svg+xml;charset=UTF-8,${encoded}`;
                } catch (_) { return ''; }
            };
            const SVG_TOGGLE_OFF = `<svg id="Layer_1" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" data-name="Layer 1"><path d="m2.422 7.365 13.5 13.5c-.357.042-.717.08-1.075.108-.767.849-2.159 1.977-2.767 2.023-.76.042-2.069-1.124-2.927-2.023-2.545-.201-5.219-.806-5.338-.833-.333-.076-.604-.316-.719-.638-.011-.03-1.096-3.112-1.096-7.457 0-1.809.196-3.421.422-4.68zm20.139 13.074-1.486-1.486c.308-1.072.925-3.629.925-6.908 0-4.174-1.043-7.309-1.088-7.44-.109-.322-.375-.567-.705-.65-.156-.039-3.871-.955-8.208-.955-2.505 0-4.781.303-6.309.57l-2.129-2.131c-.586-.586-1.535-.586-2.121 0-.586.585-.586 1.536 0 2.121l18.999 19.001c.586.586 1.535.586 2.121 0 .586-.585.586-1.536 0-2.121z"/></svg>`;
            const SVG_TOGGLE_ON = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" id="Layer_1" data-name="Layer 1" viewBox="0 0 24 24">\n  <path d="M21.795,2.883c-.11-.32-.375-.562-.703-.644-.172-.043-4.259-1.047-9.092-1.047C7.254,1.192,3.088,2.196,2.913,2.238c-.332,.082-.6,.327-.71,.651-.049,.145-1.203,3.605-1.203,8.151s1.154,8.006,1.203,8.151c.11,.326,.38,.572,.715,.652,.109,.026,2.649,.628,5.954,.907,1.32,1.184,2.582,1.897,2.639,1.929,.151,.085,.32,.128,.489,.128,.162,0,.324-.04,.473-.119,.054-.029,1.274-.689,2.652-1.933,3.372-.277,5.858-.888,5.966-.915,.33-.082,.596-.326,.705-.647,.049-.144,1.204-3.579,1.204-8.153,0-4.614-1.156-8.015-1.205-8.157ZM7.437,5.846h3.096c.553,0,1,.448,1,1s-.447,1-1,1h-3.096c-.553,0-1-.448-1-1s.447-1,1-1Zm9.127,10.042H7.437c-.553,0-1-.448-1-1s.447-1,1-1h9.127c.553,0,1,.448,1,1s-.447,1-1,1Zm1-4.021H6.437c-.553,0-1-.448-1-1s.447-1,1-1h11.127c.553,0,1,.448,1,1s-.447,1-1,1Z"/>\n</svg>`;
            const SVG_SETTINGS = `<svg id=\"Layer_1\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" data-name=\"Layer 1\"><path d=\"m21.977 2.786c-.083-.381-.381-.679-.762-.762-.19-.042-4.713-1.023-9.214-1.023s-9.025.98-9.215 1.022c-.381.083-.679.381-.762.762-.042.19-1.023 4.713-1.023 9.214s.981 9.024 1.023 9.214c.083.381.381.679.762.762.19.042 4.713 1.023 9.214 1.023s9.024-.981 9.214-1.023c.381-.083.679-.381.762-.762.042-.19 1.023-4.713 1.023-9.214s-.981-9.024-1.023-9.214zm-4.119 14.677c-.533-.077-1.165-.159-1.857-.232v.77c0 .552-.448 1-1 1s-1-.448-1-1v-.935c-.654-.039-1.327-.065-2-.065-1.724 0-3.749.161-5.857.465-.535.081-1.056-.297-1.133-.847-.079-.547.3-1.054.847-1.133 2.233-.322 4.299-.486 6.143-.486.674 0 1.345.024 2 .061v-1.061c0-.552.448-1 1-1s1 .448 1 1v1.22c.803.082 1.536.175 2.143.263.547.079.926.586.847 1.132-.079.547-.587.923-1.132.847zm0-8c-1.464-.211-3.669-.462-5.857-.462-.627 0-1.304.029-2 .07v.93c0 .552-.448 1-1 1s-1-.448-1-1v-.764c-.609.065-1.227.139-1.857.229-.535.081-1.056-.297-1.133-.847-.079-.547.3-1.054.847-1.133.736-.106 1.446-.189 2.143-.26v-1.226c0-.552.448-1 1-1s1 .448 1 1v1.066c.689-.039 1.362-.066 2-.066 2.307 0 4.614.263 6.143.483.547.079.926.586.847 1.132-.079.547-.587.923-1.132.847z\"/></svg>`;
            const ICON_TOGGLE_OFF = svgDataUri(SVG_TOGGLE_OFF);
            const ICON_TOGGLE_ON = svgDataUri(SVG_TOGGLE_ON);
            const ICON_SETTINGS = svgDataUri(SVG_SETTINGS);
            const css = `
        /* 尽量贴近 Jellyfin：最小化覆盖，仅定义图标 span 的显示与 mask */
        [data-danmaku-buttons] .danmaku-input-wrapper { display:flex; align-items:center; }
        [data-danmaku-buttons] .danmaku-text-input {
            width: 80px; max-width:200px; height:24px; box-sizing:border-box;
            background: rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.25); color:#fff;
            border-radius:4px; padding:0 6px; font-size:12px; line-height:22px; outline:none;
            transition: width .25s ease, border-color .2s ease;
        }
        [data-danmaku-buttons] .danmaku-text-input:focus { border-color:#3fa9ff; }
        [data-danmaku-buttons][data-enabled="false"] .danmaku-text-input { opacity:.7; }
        [data-danmaku-buttons] .danmaku-input-wrapper.active .danmaku-text-input { width:160px; }
        [data-danmaku-buttons] .danmaku-send-btn { display:none; margin-left:4px; background:rgba(63,169,255,0.15); border:1px solid rgba(63,169,255,0.6); color:#fff; border-radius:4px; padding:0 6px; height:24px; font-size:12px; cursor:pointer; }
        [data-danmaku-buttons] .danmaku-send-btn:hover { background:rgba(63,169,255,0.25); }
        [data-danmaku-buttons] .danmaku-input-wrapper.active .danmaku-send-btn { display:inline-flex; align-items:center; }
        [data-danmaku-buttons] .danmaku-btn {
            background: none;
            border: 0;
            color: inherit;
            cursor: pointer;
        }
        [data-danmaku-buttons] .danmaku-icon {
            display: inline-block;
            width: 24px; height: 24px;
            background-color: currentColor;
            -webkit-mask-position: center; mask-position: center;
            -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
            -webkit-mask-size: 24px 24px; mask-size: 24px 24px;
        }
        [data-danmaku-buttons] .danmaku-settings-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_SETTINGS});
            mask-image: url(${ICON_SETTINGS});
        }
        [data-danmaku-buttons] .danmaku-toggle-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_TOGGLE_OFF});
            mask-image: url(${ICON_TOGGLE_OFF});
        }
        [data-danmaku-buttons][data-enabled="true"] .danmaku-toggle-btn .danmaku-icon {
            -webkit-mask-image: url(${ICON_TOGGLE_ON});
            mask-image: url(${ICON_TOGGLE_ON});
        }
        `;
            const style = document.createElement('style');
            style.id = id;
            style.appendChild(document.createTextNode(css));
            try { (document.head || document.documentElement).appendChild(style); } catch (_) { }
        }

        _createToggleButton() {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '';
            // 适配控制条原生按钮的结构标记，避免被样式隐藏
            btn.setAttribute('is', 'paper-icon-button-light');
            btn.className = 'paper-icon-button-light autoSize danmaku-btn danmaku-toggle-btn btnDanmakuToggle';
            btn.setAttribute('data-danmaku-btn', 'toggle');
            btn.setAttribute('title', '弹幕开关');
            btn.setAttribute('aria-pressed', 'false');
            // 内层 span，贴近 Jellyfin DOM 结构
            const icon = document.createElement('span');
            icon.className = 'xlargePaperIconButton material-icons danmaku-icon';
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
            return btn;
        }

        _createTextInput() {
            const wrap = document.createElement('div');
            wrap.className = 'danmaku-input-wrapper';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '发送弹幕';
            input.className = 'danmaku-text-input';
            input.setAttribute('data-danmaku-input', 'text');
            input.id = 'danmakuInputField';
            input.name = 'danmakuInput';
            input.setAttribute('aria-label', '弹幕输入');
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.textContent = '发送';
            sendBtn.className = 'danmaku-send-btn';
            sendBtn.setAttribute('aria-label', '发送弹幕');
            // Enter 时简单记录日志（未来可接入真实发送逻辑）
            try {
                const sendCurrent = (keepFocus = true) => {
                    const txt = input.value.trim();
                    if (!txt) return;
                    // 获取全局 danmakuRenderer
                    let emitted = false;
                    try {
                        const g = (typeof window !== 'undefined') ? window.__jfDanmakuGlobal__ : null;
                        const renderer = g?.danmakuRenderer;
                        if (renderer) {
                            // 选择时间：优先使用绑定媒体的 currentTime；否则使用 0
                            const t = (renderer.media && !isNaN(renderer.media.currentTime)) ? renderer.media.currentTime : 0;
                            renderer.emit({
                                text: txt,
                                time: t,
                                mode: 'rtl',
                                style: {
                                    font: '25px sans-serif',
                                    fillStyle: '#FFFFFF',
                                    strokeStyle: '#000',
                                    lineWidth: 2,
                                    textBaseline: 'bottom'
                                }
                            });
                            // 确保显示/播放
                            try { renderer.show && renderer.show(); } catch (_) { }
                            emitted = true;
                        }
                    } catch (err) {
                        this.logger?.warn?.('发送弹幕失败(emit异常)', err);
                    }
                    if (emitted) {
                        this.logger?.info?.('发送弹幕: ' + txt);
                    } else {
                        this.logger?.info?.('发送弹幕失败: 找不到全局 danmakuRenderer');
                    }
                    input.value = '';
                    // 发送后保持展开
                    wrap.classList.add('active');
                    if (keepFocus) {
                        try { input.focus(); } catch (_) { }
                    }
                };
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        sendCurrent(true); // Enter 保持焦点
                    }
                });
                input.addEventListener('focus', () => {
                    wrap.classList.add('active');
                    // 安装全局快捷键拦截
                    if (!this._globalKeyInterceptor) {
                        this._globalKeyInterceptor = (ev) => {
                            // 只在当前输入框保持焦点时拦截
                            if (document.activeElement === input) {
                                // 允许的按键（不拦截）：组合键(含Ctrl/Alt/Meta)、Tab、Escape 让其正常冒泡
                                if (ev.key === 'Escape') { return; }
                                if (ev.ctrlKey || ev.metaKey || ev.altKey) { return; }
                                // 放行 Enter 以便输入框自身监听处理发送
                                if (ev.key === 'Enter') { return; }
                                // 其它按键阻断到播放器的全局监听
                                ev.stopPropagation();
                                ev.stopImmediatePropagation?.();
                                // Space 防止页面滚动
                                if (ev.key === ' ' || ev.code === 'Space') {
                                    ev.preventDefault();
                                }
                            }
                        };
                    }
                    try { document.addEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
                });
                input.addEventListener('blur', (e) => {
                    // 若为空则收起（延迟允许点击按钮）
                    setTimeout(() => {
                        if (!input.value.trim()) wrap.classList.remove('active');
                        // 失焦解除拦截
                        try { document.removeEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
                    }, 120);
                });
                sendBtn.addEventListener('click', () => {
                    if (!input.value.trim()) { wrap.classList.remove('active'); return; }
                    sendCurrent(false); // 点击发送后不保留焦点
                    try { input.blur(); } catch (_) { }
                });
            } catch (_) { }
            wrap.appendChild(input);
            wrap.appendChild(sendBtn);
            return wrap;
        }

        _createSettingsButton() {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '';
            // 适配控制条原生按钮的结构标记，避免被样式隐藏
            btn.setAttribute('is', 'paper-icon-button-light');
            btn.className = 'paper-icon-button-light autoSize danmaku-btn danmaku-settings-btn btnDanmakuSettings';
            btn.setAttribute('data-danmaku-btn', 'settings');
            btn.setAttribute('title', '弹幕设置');
            const icon = document.createElement('span');
            icon.className = 'xlargePaperIconButton material-icons danmaku-icon';
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
            return btn;
        }
        // 销毁（供外部在 destroy 时调用）
        destroy() {
            if (this._toggleRetryTimer) { try { clearTimeout(this._toggleRetryTimer); } catch (_) { } this._toggleRetryTimer = null; }
            try { this.toggleButton?.removeEventListener('click', this._onToggle); } catch (_) { }
            try { this.settingsButton?.removeEventListener('click', this._onOpenSettings); } catch (_) { }
            try { this.settingsButton?.removeEventListener('mouseenter', this._onSettingsHoverOpen); } catch (_) { }
            try { this.settingsButton?.removeEventListener('mouseleave', this._onSettingsButtonMouseLeave); } catch (_) { }
            try { this.inputEl?.querySelector?.('input')?.removeEventListener?.('keydown'); } catch (_) { }
            try { document.removeEventListener('keydown', this._globalKeyInterceptor, true); } catch (_) { }
            try { document.removeEventListener('mousedown', this._onDocumentClick, true); } catch (_) { }
            // 粗略清理自定义事件（直接置空 wrapper 即可被 GC）
            try { this.el?.parentElement?.removeChild(this.el); } catch (_) { }
            if (this.settingsPanel?.el) {
                try { this.settingsPanel.el.removeEventListener('mouseenter', this._onPanelMouseEnter); } catch (_) { }
                try { this.settingsPanel.el.removeEventListener('mouseleave', this._onPanelMouseLeave); } catch (_) { }
                try { this.settingsPanel.el.removeEventListener('focusin', this._onPanelFocusIn, true); } catch (_) { }
                try { this.settingsPanel.el.removeEventListener('focusout', this._onPanelFocusOut, true); } catch (_) { }
                try { this.settingsPanel.el.removeEventListener('compositionstart', this._onCompositionStart, true); } catch (_) { }
                try { this.settingsPanel.el.removeEventListener('compositionend', this._onCompositionEnd, true); } catch (_) { }
            }
            this._clearSettingsAutoClose();
            try { this.settingsPanel?.destroy?.(); } catch (_) { }
            this.el = null;
            this.inputEl = null;
            this.toggleButton = null;
            this.settingsButton = null;
        }
    }

    /**
     * 弹幕热力图渲染器类
     * 用于生成弹幕密度的可视化热力图
     * 
     */

    // 通过 ES Module 导出，便于 Rollup 打包。
    class DanmakuHeatmapRenderer {
        /**
        * 构造函数
        * @param {Object} options - 配置选项
        * @param {number} options.height - Canvas高度，默认60
        * @param {boolean} options.debug - 是否开启调试模式，默认false
        * @param {boolean} options.autoResize - 是否自动响应父容器宽度变化，默认true
        * @param {number} options.resizeThreshold - 重新渲染的宽度变化阈值，默认50像素
        * @param {number} options.resizeDebounceDelay - 宽度变化防抖延迟时间（毫秒），默认300
        * @param {number} options.lineWidth - 线条宽度，默认1
        * @param {string} options.lineColor - 线条颜色，默认 '#3498db'
        * @param {string} options.gradientColorStart - 渐变起始色，默认 'rgba(52, 152, 219, 0.08)'
        * @param {string} options.gradientColorEnd - 渐变结束色，默认 'rgba(52, 152, 219, 0.25)'
        * @param {string} options.canvasId - 生成的Canvas元素ID，默认 'danmaku-heatmap-canvas'
        */
        constructor(options = {}) {
            this.options = {
                // width 已弃用：始终使用父容器宽度
                height: options.height || 60,
                debug: options.debug || false,
                // 默认启用
                autoResize: options.autoResize !== false,

                // 线条样式配置
                lineWidth: options.lineWidth || 1,
                // 直接使用传入颜色（无预设），提供默认值
                lineColor: options.lineColor ?? '#3498db',
                gradientColorStart: options.gradientColorStart ?? 'rgba(52, 152, 219, 0.08)',
                gradientColorEnd: options.gradientColorEnd ?? 'rgba(52, 152, 219, 0.25)',
                canvasId: options.canvasId || 'danmaku-heatmap-canvas',

                ...options
            };

            this.canvas = null;
            this.ctx = null;
            // 逻辑宽度（CSS 像素），由父容器决定
            this.logicalWidth = 0;
            this.rawData = [];          // 原始热力图数据
            this.processedData = [];    // 处理后的数据
            this.actualDuration = 0;    // 视频实际时长（秒）
            this.maxDensity = 0;
            this.minDensity = 0;
            this.resizeObserver = null; // ResizeObserver实例
            this.parentContainer = null; // 父容器引用

            // 缓存和性能优化相关
            this.lastRenderedWidth = 0;                              // 上次渲染的宽度
            this.resizeThreshold = options.resizeThreshold || 10;    // 重新渲染的宽度变化阈值
            this.cachedCanvas = null;                                // 缓存的Canvas内容

            // 防抖相关属性
            this.resizeDebounceTimer = null;                         // 防抖计时器
            this.resizeDebounceDelay = options.resizeDebounceDelay || 300; // 防抖延迟时间（毫秒）
            this.pendingWidth = null;                                // 等待处理的宽度值

            if (options.width != null) {
                this.debugLog('提示：width 选项已弃用，将忽略并使用父容器宽度');
            }
            this.debugLog('热力图渲染器已初始化');
            this.debugLog('样式配置:', {
                lineWidth: this.options.lineWidth,
                lineColor: this.options.lineColor,
                gradientColorStart: this.options.gradientColorStart,
                gradientColorEnd: this.options.gradientColorEnd,
                autoResize: this.options.autoResize
            });
        }

        /**
         * 调试日志输出
         * @param {string} message - 日志消息
         * @param {...any} args - 额外参数
         */
        debugLog(message, ...args) {
            if (this.options.debug) {
                console.log(`[弹幕热力图] ${message}`, ...args);
            }
        }

        /**
         * 设置热力图原始数据
         * @param {Array} data - 热力图数据数组
         * @param {number} data[].start_time_seconds - 开始时间（秒）
         * @param {number} data[].end_time_seconds - 结束时间（秒）
         * @param {number} data[].average_density - 平均密度
         */
        setHeatmapData(data) {
            // 允许 data 为空或未定义：视为“无数据”正常场景
            if (data == null) data = [];
            if (!Array.isArray(data)) {
                throw new Error('热力图数据必须是数组格式');
            }

            // 空数组保持 rawData = []，后续流程会创建空白 Canvas
            if (data.length === 0) {
                this.rawData = [];
                this.debugLog('设置热力图数据：空数组（正常化处理）');
                return this;
            }

            this.rawData = data.map(item => ({
                start_time_seconds: Number(item.start_time_seconds),
                end_time_seconds: Number(item.end_time_seconds),
                average_density: Number(item.average_density)
            }));

            this.debugLog('设置热力图数据，共', this.rawData.length, '个数据段');
            this.debugLog('原始数据详情:', JSON.stringify(this.rawData, null, 2));
            return this;
        }

        /**
         * 设置视频实际时长
         * @param {number} duration - 视频时长（秒）
         */
        setActualDuration(duration) {
            this.actualDuration = Number(duration);
            this.debugLog('设置视频实际时长:', this.actualDuration, '秒');
            return this;
        }

        /**
         * 预处理热力图数据
         * 根据视频实际时长调整数据范围和填充
         */
        preprocessData() {
            if (this.rawData.length === 0) {
                this.debugLog('没有原始数据，跳过预处理');
                return this;
            }

            // 1. 排序数据
            let data = [...this.rawData].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
            this.debugLog('排序后数据:', JSON.stringify(data, null, 2));

            // 2. 获取数据时长
            const dataDuration = data[data.length - 1].end_time_seconds;
            this.debugLog('数据时长:', dataDuration, '秒');

            if (this.actualDuration <= 0) {
                this.debugLog('未设置视频时长，使用原始数据');
                this.processedData = data;
                this.debugLog('最终处理数据:', JSON.stringify(this.processedData, null, 2));
                return this;
            }

            // 3. 根据实际时长调整数据
            data = this.adjustDataByDuration(data, dataDuration, this.actualDuration);

            // 4. 填充起始缺口与段间缺口为 0 密度片段
            data = this.fillGapsWithZeroSegments(data, this.actualDuration);

            this.processedData = data;

            this.debugLog('数据预处理完成，最终数据段数量:', this.processedData.length);
            this.debugLog('最终处理数据:', JSON.stringify(this.processedData, null, 2));
            return this;
        }

        /**
         * 根据实际时长调整数据
         * @param {Array} data - 数据数组
         * @param {number} dataDuration - 数据时长
         * @param {number} actualDuration - 实际时长
         * @returns {Array} 调整后的数据
         */
        adjustDataByDuration(data, dataDuration, actualDuration) {
            const timeDiff = dataDuration - actualDuration;
            this.debugLog('时间差:', timeDiff, '秒');
            this.debugLog('调整前数据:', JSON.stringify(data, null, 2));

            if (timeDiff > 0) {
                // 数据时长比视频总时长长，删除多余数据
                this.debugLog('删除超出视频时长的数据');
                const originalLength = data.length;
                data = data.filter(item => item.start_time_seconds < actualDuration);
                this.debugLog(`过滤后: ${originalLength} -> ${data.length} 个数据段`);

                // 调整最后一个数据的结束时间
                if (data.length > 0) {
                    const lastItem = data[data.length - 1];
                    if (lastItem.end_time_seconds > actualDuration) {
                        const oldEndTime = lastItem.end_time_seconds;
                        lastItem.end_time_seconds = actualDuration;
                        this.debugLog(`调整最后一个数据的结束时间: ${oldEndTime} -> ${actualDuration}`);
                    }
                }
            } else if (timeDiff < -2) {
                // 数据时长比视频总时长短2秒以上，添加填充数据
                this.debugLog('添加填充数据到视频结尾');

                // 第一个填充数据：密度为0，持续1秒
                const firstPadding = {
                    start_time_seconds: dataDuration,
                    end_time_seconds: dataDuration + 1,
                    average_density: 0
                };
                data.push(firstPadding);
                this.debugLog('添加第一个填充数据:', JSON.stringify(firstPadding, null, 2));

                // 第二个填充数据：密度为0，到视频结尾
                const secondPadding = {
                    start_time_seconds: dataDuration + 1,
                    end_time_seconds: actualDuration,
                    average_density: 0
                };
                data.push(secondPadding);
                this.debugLog('添加第二个填充数据:', JSON.stringify(secondPadding, null, 2));

                this.debugLog('添加了2个填充数据段');
            }

            this.debugLog('调整后数据:', JSON.stringify(data, null, 2));
            return data;
        }

        /**
         * 填充起始与段间缺口为密度 0 的片段
         * 规则：
         * - 如果首段 start_time_seconds > 0，则添加 [0, first.start) 密度为 0 的片段
         * - 如果前一段的 end_time_seconds 与后一段的 start_time_seconds 不连续，则在二者之间添加 [prev.end, next.start) 密度为 0 的片段
         * - 自动丢弃无效片段（end <= start）并保持按开始时间排序
         * @param {Array} data
         * @param {number} actualDuration
         * @returns {Array}
         */
        fillGapsWithZeroSegments(data, actualDuration) {
            if (!Array.isArray(data) || data.length === 0) return data || [];

            // 确保按开始时间排序
            const sorted = [...data].sort((a, b) => a.start_time_seconds - b.start_time_seconds);
            const result = [];

            const clampToDuration = (t) => {
                if (typeof actualDuration === 'number' && isFinite(actualDuration) && actualDuration > 0) {
                    return Math.max(0, Math.min(t, actualDuration));
                }
                return Math.max(0, t);
            };

            // 起始缺口
            const first = sorted[0];
            if (first.start_time_seconds > 0) {
                const start = clampToDuration(0);
                const end = clampToDuration(first.start_time_seconds);
                if (end > start) {
                    result.push({ start_time_seconds: start, end_time_seconds: end, average_density: 0 });
                    this.debugLog(`起始缺口填充: [${start}, ${end}) -> 0`);
                }
            }

            // 逐段处理，填补段间缺口
            result.push(first);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];

                const gapStart = clampToDuration(prev.end_time_seconds);
                const gapEnd = clampToDuration(curr.start_time_seconds);

                if (gapEnd > gapStart) {
                    result.push({ start_time_seconds: gapStart, end_time_seconds: gapEnd, average_density: 0 });
                    this.debugLog(`段间缺口填充: [${gapStart}, ${gapEnd}) -> 0`);
                }

                result.push(curr);
            }

            // 过滤无效片段并重新排序
            const filtered = result.filter(s =>
                typeof s.start_time_seconds === 'number' && typeof s.end_time_seconds === 'number' &&
                s.end_time_seconds > s.start_time_seconds
            ).sort((a, b) => a.start_time_seconds - b.start_time_seconds);

            this.debugLog('缺口填充后数据:', JSON.stringify(filtered, null, 2));
            return filtered;
        }

        /**
         * 计算密度范围
         */
        calculateDensityRange() {
            if (this.processedData.length === 0) return;

            this.maxDensity = Math.max(...this.processedData.map(d => d.average_density));
            this.minDensity = Math.min(...this.processedData.map(d => d.average_density));

            // 确保有一定的范围，即使所有值相同
            if (this.maxDensity === this.minDensity) {
                this.maxDensity += 1;
            }

            this.debugLog('密度范围:', this.minDensity, '到', this.maxDensity);
        }

        /**
         * 设置ResizeObserver来监听父容器尺寸变化
         */
        setupResizeObserver() {
            if (!this.canvas) return;

            // 检查浏览器是否支持ResizeObserver
            if (typeof ResizeObserver === 'undefined') {
                this.debugLog('浏览器不支持ResizeObserver，跳过自动调整大小功能');
                return;
            }

            // 获取父容器
            this.parentContainer = this.canvas.parentElement;
            if (!this.parentContainer) {
                this.debugLog('未找到父容器，等待Canvas插入DOM后再设置ResizeObserver');
                return;
            }

            this.debugLog('设置ResizeObserver，监听父容器:', this.parentContainer);

            // 创建ResizeObserver
            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    this.handleResize(entry);
                }
            });

            // 开始监听父容器
            this.resizeObserver.observe(this.parentContainer);

            // 立即进行一次尺寸调整
            this.updateCanvasSize();
        }

        /**
         * 处理容器尺寸变化（带防抖功能）
         * @param {ResizeObserverEntry} entry - ResizeObserver条目
         */
        handleResize(entry) {
            const newWidth = Math.floor(entry.contentRect.width);

            if (newWidth !== this.logicalWidth && newWidth > 0) {
                this.debugLog(`容器宽度变化检测: ${this.logicalWidth}px -> ${newWidth}px`);

                // 立即更新Canvas尺寸以保持视觉连续性
                this.logicalWidth = newWidth;
                this.updateCanvasSize();

                // 立即进行临时的缩放渲染，避免热力图消失
                this.performQuickResize();

                // 存储待处理的宽度值
                this.pendingWidth = newWidth;

                // 清除之前的防抖计时器
                if (this.resizeDebounceTimer) {
                    clearTimeout(this.resizeDebounceTimer);
                    this.debugLog('清除之前的防抖计时器');
                }

                // 设置新的防抖计时器
                this.resizeDebounceTimer = setTimeout(() => {
                    this.processResizeChange();
                }, this.resizeDebounceDelay);

                this.debugLog(`设置防抖计时器，${this.resizeDebounceDelay}ms后执行重新计算`);
            }
        }

        /**
         * 快速调整尺寸 - 使用缓存内容进行简单缩放
         */
        performQuickResize() {
            if (this.cachedCanvas) {
                // 使用缓存的内容进行快速缩放
                this.ctx.clearRect(0, 0, this.logicalWidth, this.options.height);

                // 计算设备像素比
                const devicePixelRatio = window.devicePixelRatio || 1;

                // 计算缓存内容的逻辑尺寸
                const cacheLogicalWidth = this.cachedCanvas.width / devicePixelRatio;
                const cacheLogicalHeight = this.cachedCanvas.height / devicePixelRatio;

                // 直接缩放绘制缓存内容到新尺寸
                this.ctx.drawImage(
                    this.cachedCanvas,
                    0, 0, this.cachedCanvas.width, this.cachedCanvas.height,
                    0, 0, this.logicalWidth, this.options.height
                );

                this.debugLog(`使用缓存内容进行快速缩放: ${cacheLogicalWidth}x${cacheLogicalHeight} -> ${this.logicalWidth}x${this.options.height}`);
            } else if (this.processedData && this.processedData.length > 0) {
                // 如果没有缓存，进行快速重绘
                this.drawHeatmap();
                this.debugLog('执行快速重绘');
            }
        }

        /**
         * 处理防抖后的尺寸变化
         */
        processResizeChange() {
            if (this.pendingWidth === null) return;

            const widthDifference = Math.abs(this.pendingWidth - this.lastRenderedWidth);

            this.debugLog(`防抖处理完成，最终宽度: ${this.pendingWidth}px`);
            this.debugLog(`与上次渲染宽度(${this.lastRenderedWidth}px)差值: ${widthDifference}px, 阈值: ${this.resizeThreshold}px`);

            // 检查是否需要重新渲染
            if (widthDifference >= this.resizeThreshold) {
                this.debugLog('宽度变化超过阈值，执行重新渲染');
                this.redraw();
                this.lastRenderedWidth = this.pendingWidth;
                this.cacheCanvas(); // 缓存新的渲染结果
            } else {
                this.debugLog('宽度变化未超过阈值，使用缓存内容');
                this.restoreFromCache();
            }

            // 清理
            this.pendingWidth = null;
            this.resizeDebounceTimer = null;
        }

        /**
         * 更新Canvas尺寸
         */
        updateCanvasSize() {
            if (!this.canvas) return;

            // 获取设备像素比，确保高清显示
            const devicePixelRatio = window.devicePixelRatio || 1;

            // 计算父容器宽度
            const container = this.canvas.parentElement || this.parentContainer;
            let measuredWidth = 0;
            if (container) {
                measuredWidth = Math.floor(container.clientWidth || container.getBoundingClientRect().width || 0);
            }
            if (!measuredWidth) measuredWidth = Math.floor(this.canvas.getBoundingClientRect().width || 0);
            if (!measuredWidth) measuredWidth = this.logicalWidth || 800;
            this.logicalWidth = measuredWidth;

            this.debugLog('更新Canvas尺寸:', this.logicalWidth, 'x', this.options.height, '设备像素比:', devicePixelRatio);

            // 设置Canvas的内部分辨率（考虑设备像素比）
            this.canvas.width = this.logicalWidth * devicePixelRatio;
            this.canvas.height = this.options.height * devicePixelRatio;

            // 设置Canvas的CSS显示尺寸（宽度使用 100% 以跟随父容器）
            this.canvas.style.width = '100%';
            this.canvas.style.height = this.options.height + 'px';

            // 重新获取上下文（Canvas尺寸变化后上下文会重置）
            this.ctx = this.canvas.getContext('2d');

            // 缩放上下文以匹配设备像素比
            this.ctx.scale(devicePixelRatio, devicePixelRatio);

            this.debugLog('Canvas分辨率已设置为:', this.canvas.width, 'x', this.canvas.height);
            this.debugLog('Canvas显示尺寸:', this.canvas.style.width, 'x', this.canvas.style.height);
        }

        /**
         * 重新绘制热力图
         */
        redraw() {
            if (!this.processedData || this.processedData.length === 0) {
                this.debugLog('没有处理过的数据，跳过重绘');
                return;
            }

            this.debugLog('重新绘制热力图');

            // 重新应用缩放（因为updateCanvasSize会重置上下文）
            const devicePixelRatio = window.devicePixelRatio || 1;
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换
            this.ctx.scale(devicePixelRatio, devicePixelRatio);

            this.calculateDensityRange();
            this.drawHeatmap();

            // 重绘完成后缓存新内容
            this.cacheCanvas();
        }

        /**
         * 销毁ResizeObserver和清理资源
         */
        destroy() {
            // 清理防抖计时器
            if (this.resizeDebounceTimer) {
                clearTimeout(this.resizeDebounceTimer);
                this.resizeDebounceTimer = null;
                this.debugLog('防抖计时器已清理');
            }

            if (this.resizeObserver) {
                this.resizeObserver.disconnect();
                this.resizeObserver = null;
                this.debugLog('ResizeObserver已销毁');
            }

            // 清理缓存和待处理状态
            this.cachedCanvas = null;
            this.pendingWidth = null;
        }

        /**
         * 缓存当前Canvas内容
         */
        cacheCanvas() {
            if (!this.canvas) return;

            try {
                // 创建缓存Canvas
                this.cachedCanvas = document.createElement('canvas');
                this.cachedCanvas.width = this.canvas.width;
                this.cachedCanvas.height = this.canvas.height;

                const cacheCtx = this.cachedCanvas.getContext('2d');
                cacheCtx.drawImage(this.canvas, 0, 0);

                this.debugLog('Canvas内容已缓存，尺寸:', this.canvas.width, 'x', this.canvas.height);
            } catch (error) {
                this.debugLog('缓存Canvas失败:', error);
                this.cachedCanvas = null;
            }
        }

        /**
         * 从缓存恢复Canvas内容
         */
        restoreFromCache() {
            if (!this.cachedCanvas || !this.canvas || !this.ctx) {
                this.debugLog('无法从缓存恢复：缓存不存在或Canvas未初始化');
                return false;
            }

            try {
                // 清空当前Canvas
                this.ctx.clearRect(0, 0, this.logicalWidth, this.options.height);

                // 计算缩放比例以适应新的Canvas尺寸
                const scaleX = this.logicalWidth / (this.cachedCanvas.width / (window.devicePixelRatio || 1));
                const scaleY = this.options.height / (this.cachedCanvas.height / (window.devicePixelRatio || 1));

                // 保存当前状态
                this.ctx.save();

                // 应用缩放
                this.ctx.scale(scaleX, scaleY);

                // 绘制缓存的内容
                this.ctx.drawImage(this.cachedCanvas, 0, 0, this.cachedCanvas.width / (window.devicePixelRatio || 1), this.cachedCanvas.height / (window.devicePixelRatio || 1));

                // 恢复状态
                this.ctx.restore();

                this.debugLog('从缓存恢复Canvas内容，缩放比例:', scaleX.toFixed(2), 'x', scaleY.toFixed(2));
                return true;
            } catch (error) {
                this.debugLog('从缓存恢复失败:', error);
                return false;
            }
        }

        /**
         * 创建并渲染Canvas元素
         * @param {Object} styleOptions - 样式选项
         * @returns {HTMLCanvasElement} 渲染好的Canvas元素
         */
        createCanvas(styleOptions = {}) {
            // 允许 processedData 为空：返回空白（透明）Canvas，供外层正常挂载
            const noData = !this.processedData || this.processedData.length === 0;

            // 获取设备像素比，确保高清显示
            const devicePixelRatio = window.devicePixelRatio || 1;

            // 创建Canvas元素
            this.canvas = document.createElement('canvas');
            this.canvas.id = this.options.canvasId; // 使用可自定义的ID

            // 初始内部分辨率（等待插入 DOM 后再由父容器宽度决定实际尺寸）
            this.canvas.width = Math.max(1, (this.logicalWidth || 1) * devicePixelRatio);
            this.canvas.height = this.options.height * devicePixelRatio;

            // 应用默认样式
            const defaultStyle = {
                width: '100%',
                height: '40px',
                display: 'block',
                margin: '0',
                padding: '0',
                borderRadius: '4px',
                background: 'transparent',
                pointerEvents: 'none',
                position: 'absolute',
                top: '-47px',
                left: '0',
                zIndex: '1',
                opacity: '0.8'
            };

            const finalStyle = { ...defaultStyle, ...styleOptions };
            Object.assign(this.canvas.style, finalStyle);

            // 自适应宽度
            this.canvas.style.width = '100%';
            this.canvas.style.height = this.options.height + 'px';

            this.ctx = this.canvas.getContext('2d');

            // 缩放上下文以匹配设备像素比
            this.ctx.scale(devicePixelRatio, devicePixelRatio);

            // 如果启用了自动调整大小，设置ResizeObserver
            if (this.options.autoResize) {
                // 延迟设置，确保Canvas已插入DOM
                setTimeout(() => {
                    this.setupResizeObserver();
                    // 初始化一次尺寸并尝试绘制
                    this.updateCanvasSize();
                    if (!noData) {
                        this.calculateDensityRange();
                        this.drawHeatmap();
                        this.cacheCanvas();
                        this.lastRenderedWidth = this.logicalWidth;
                    }
                }, 0);
            }
            if (noData) {
                // 空数据：不绘制，仅返回空白透明画布
                this.debugLog('空数据：创建空白热力图 Canvas');
            }

            this.debugLog('Canvas创建完成');
            return this.canvas;
        }

        /**
         * 绘制热力图
         */
        drawHeatmap() {
            if (!this.ctx || this.processedData.length === 0) return;

            // 清空画布
            this.ctx.clearRect(0, 0, this.logicalWidth, this.options.height);

            const paddingVertical = 5;  // 只保留上下边距
            const graphWidth = this.logicalWidth;  // 使用完整宽度，不减去左右边距
            const graphHeight = this.options.height - 2 * paddingVertical;

            // 计算数据点坐标 - 基于时间
            const points = [];
            for (const seg of this.processedData) {
                const toX = (timeSec) => (timeSec / this.actualDuration) * graphWidth;
                const toY = (density) => {
                    const normalized = (density - this.minDensity) / (this.maxDensity - this.minDensity);
                    return paddingVertical + graphHeight - (normalized * graphHeight);
                };

                if (seg.average_density === 0) {
                    // 对于 0 密度片段，按边界生成两个“贴地”锚点
                    const startX = toX(seg.start_time_seconds);
                    const endX = toX(seg.end_time_seconds);
                    const y0 = toY(0);
                    points.push({ x: startX, y: y0, density: 0, midTime: seg.start_time_seconds });
                    points.push({ x: endX, y: y0, density: 0, midTime: seg.end_time_seconds });
                } else {
                    // 非 0 片段使用中点
                    const midTime = (seg.start_time_seconds + seg.end_time_seconds) / 2;
                    const x = toX(midTime);
                    const y = toY(seg.average_density);
                    points.push({ x, y, density: seg.average_density, midTime });
                }
            }

            // 保证按 X 轴排序，避免 dx=0 造成斜率问题
            points.sort((a, b) => a.x - b.x);

            // 添加起始点和结束点的延伸（避免与已存在的边界点重复）
            if (points.length >= 2) {
                const epsilon = 0.5; // 判定边界的容差（像素）
                const hasStartAtZero = Math.abs(points[0].x - 0) < epsilon;
                const hasEndAtWidth = Math.abs(points[points.length - 1].x - graphWidth) < epsilon;

                // 起点延伸
                if (!hasStartAtZero) {
                    const p1 = points[0];
                    const p2 = points[1];
                    const slope = (p2.y - p1.y) / (p2.x - p1.x);
                    let startY = p1.y - slope * p1.x;
                    startY = Math.max(paddingVertical, Math.min(paddingVertical + graphHeight, startY));
                    const startPoint = { x: 0, y: startY, density: p1.density, midTime: 0, isExtended: true };
                    points.unshift(startPoint);
                    this.debugLog(`添加延伸起点: 时间0s -> 坐标(${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)})`);
                }

                // 终点延伸
                if (!hasEndAtWidth) {
                    const pn2 = points[points.length - 2];
                    const pn1 = points[points.length - 1];
                    const endSlope = (pn1.y - pn2.y) / (pn1.x - pn2.x);
                    let endY = pn1.y + endSlope * (graphWidth - pn1.x);
                    endY = Math.max(paddingVertical, Math.min(paddingVertical + graphHeight, endY));
                    const endPoint = { x: graphWidth, y: endY, density: pn1.density, midTime: this.actualDuration, isExtended: true };
                    points.push(endPoint);
                    this.debugLog(`添加延伸终点: 时间${this.actualDuration}s -> 坐标(${endPoint.x.toFixed(1)}, ${endPoint.y.toFixed(1)})`);
                }
            }

            this.debugLog('坐标点映射详情:');
            points.forEach((point, index) => {
                if (point.isExtended) {
                    this.debugLog(`点${index}: [延伸点] 时间${point.midTime}s -> 坐标(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
                } else {
                    this.debugLog(`点${index}: 时间${point.midTime}s, 密度${point.density} -> 坐标(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
                }
            });

            // 绘制填充区域
            this.drawFillArea(points, paddingVertical, graphHeight);

            // 绘制平滑曲线
            this.drawSmoothCurve(points);

            this.debugLog('热力图绘制完成');

            // 更新缓存
            this.cacheCanvas();
        }

        /**
         * 绘制填充区域
         * @param {Array} points - 数据点数组
         * @param {number} paddingVertical - 上下边距
         * @param {number} graphHeight - 图表高度
         */
        drawFillArea(points, paddingVertical, graphHeight) {
            if (points.length === 0) return;

            // 确保填充区域不影响线条渲染
            this.ctx.save();  // 保存当前状态

            // 使用渐变填充
            const gradient = this.ctx.createLinearGradient(0, paddingVertical + graphHeight, 0, paddingVertical);
            gradient.addColorStop(0, this.options.gradientColorStart);  // 使用用户配置的渐变起始颜色
            gradient.addColorStop(1, this.options.gradientColorEnd);    // 使用用户配置的渐变结束颜色

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.moveTo(Math.round(points[0].x), paddingVertical + graphHeight);
            this.ctx.lineTo(Math.round(points[0].x), Math.round(points[0].y));

            this.drawMonotonicSpline(points);

            this.ctx.lineTo(Math.round(points[points.length - 1].x), paddingVertical + graphHeight);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.restore();  // 恢复状态
        }

        /**
         * 绘制平滑曲线
         * @param {Array} points - 数据点数组
         */
        drawSmoothCurve(points) {
            if (points.length === 0) return;

            // 优化Canvas渲染设置
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';

            // 设置曲线样式 - 使用用户配置的颜色和线宽
            this.ctx.strokeStyle = this.options.lineColor;
            this.ctx.lineWidth = this.options.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            // 确保没有阴影效果
            this.ctx.shadowColor = 'transparent';
            this.ctx.shadowBlur = 0;
            this.ctx.shadowOffsetX = 0;
            this.ctx.shadowOffsetY = 0;

            this.ctx.beginPath();
            this.ctx.moveTo(Math.round(points[0].x), Math.round(points[0].y));  // 使用整数坐标
            this.drawMonotonicSpline(points);
            this.ctx.stroke();
        }

        /**
         * 绘制单调样条曲线
         * @param {Array} points - 数据点数组
         */
        drawMonotonicSpline(points) {
            if (points.length < 3) {
                for (let i = 1; i < points.length; i++) {
                    // 使用整数坐标避免线条模糊
                    this.ctx.lineTo(Math.round(points[i].x), Math.round(points[i].y));
                }
                return;
            }

            const slopes = this.calculateMonotonicSlopes(points);

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const m1 = slopes[i];
                const m2 = slopes[i + 1];

                // 计算插值步数：对于延伸点使用固定步数，对于数据点使用时间长度
                let steps;
                if (p1.isExtended || p2.isExtended) {
                    // 延伸点使用固定步数
                    steps = 10;
                } else {
                    // 数据点：根据时间段长度动态计算插值步数
                    const dataIndex1 = points[0].isExtended ? i - 1 : i;
                    const dataIndex2 = points[0].isExtended ? i : i + 1;

                    if (dataIndex1 >= 0 && dataIndex2 < this.processedData.length) {
                        const currentData = this.processedData[dataIndex1];
                        const nextData = this.processedData[dataIndex2];
                        const timeDuration = Math.abs(nextData.start_time_seconds - currentData.start_time_seconds);
                        steps = Math.max(5, Math.min(20, Math.ceil(timeDuration / 5)));
                    } else {
                        steps = 10; // 默认步数
                    }
                }

                for (let t = 0; t <= steps; t++) {
                    const u = t / steps;
                    const point = this.hermiteInterpolation(p1, p2, m1, m2, u);
                    // 使用整数坐标避免线条模糊
                    this.ctx.lineTo(Math.round(point.x), Math.round(point.y));
                }
            }
        }

        /**
         * 计算单调样条的斜率
         * @param {Array} points - 数据点数组
         * @returns {Array} 斜率数组
         */
        calculateMonotonicSlopes(points) {
            const slopes = new Array(points.length);

            for (let i = 0; i < points.length; i++) {
                if (i === 0) {
                    slopes[i] = {
                        x: (points[1].x - points[0].x),
                        y: (points[1].y - points[0].y) / (points[1].x - points[0].x)
                    };
                } else if (i === points.length - 1) {
                    slopes[i] = {
                        x: (points[i].x - points[i - 1].x),
                        y: (points[i].y - points[i - 1].y) / (points[i].x - points[i - 1].x)
                    };
                } else {
                    const dx1 = points[i].x - points[i - 1].x;
                    const dy1 = points[i].y - points[i - 1].y;
                    const dx2 = points[i + 1].x - points[i].x;
                    const dy2 = points[i + 1].y - points[i].y;

                    const w1 = dx2 / (dx1 + dx2);
                    const w2 = dx1 / (dx1 + dx2);

                    slopes[i] = {
                        x: dx1,
                        y: w1 * (dy1 / dx1) + w2 * (dy2 / dx2)
                    };

                    const slope1 = dy1 / dx1;
                    const slope2 = dy2 / dx2;

                    if (slope1 * slope2 <= 0) {
                        slopes[i].y = 0;
                    } else {
                        const minSlope = Math.min(Math.abs(slope1), Math.abs(slope2));
                        const sign = Math.sign(slopes[i].y);
                        slopes[i].y = sign * Math.min(Math.abs(slopes[i].y), 3 * minSlope);
                    }
                }
            }

            return slopes;
        }

        /**
         * Hermite插值计算
         * @param {Object} p1 - 起始点
         * @param {Object} p2 - 结束点
         * @param {Object} m1 - 起始点切线
         * @param {Object} m2 - 结束点切线
         * @param {number} t - 插值参数 [0,1]
         * @returns {Object} 插值点坐标
         */
        hermiteInterpolation(p1, p2, m1, m2, t) {
            const t2 = t * t;
            const t3 = t2 * t;

            const h00 = 2 * t3 - 3 * t2 + 1;
            const h10 = t3 - 2 * t2 + t;
            const h01 = -2 * t3 + 3 * t2;
            const h11 = t3 - t2;

            const dx = p2.x - p1.x;

            return {
                x: p1.x + t * dx,
                y: h00 * p1.y + h10 * dx * m1.y + h01 * p2.y + h11 * dx * m2.y
            };
        }

        /**
         * 显示错误信息
         * @param {string} message - 错误消息
         */
        showError(message = '热力图渲染失败') {
            if (!this.ctx) return;

            this.ctx.clearRect(0, 0, this.logicalWidth, this.options.height);
            this.ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
            this.ctx.fillRect(0, 0, this.logicalWidth, this.options.height);

            this.ctx.fillStyle = '#dc3545';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(message, this.logicalWidth / 2, this.options.height / 2);
        }

        /**
         * 一键处理：设置数据、预处理、创建Canvas
         * @param {Array} heatmapData - 热力图数据
         * @param {number} videoDuration - 视频时长
         * @param {Object} styleOptions - 样式选项
         * @returns {HTMLCanvasElement} 渲染好的Canvas元素
         */
        process(heatmapData, videoDuration, styleOptions = {}) {
            try {
                // 允许 heatmapData 为空：内部将生成空白 Canvas
                if (heatmapData == null) heatmapData = [];
                return this
                    .setHeatmapData(heatmapData)
                    .setActualDuration(videoDuration)
                    .preprocessData()
                    .createCanvas(styleOptions);
            } catch (error) {
                this.debugLog('处理失败:', error);
                this.showError(error.message);
                return this.canvas;
            }
        }

        /**
         * 重新计算和绘制热力图
         * - 可选传入新数据和/或新时长，内部会自动规范化
         * @param {Array} [newData] 可选的新原始数据（同 setHeatmapData 的输入）
         * @param {number} [newDuration] 可选的新视频时长（秒）
         * @returns {DanmakuHeatmapRenderer} 返回自身以支持链式调用
         */
        recalculate(newData, newDuration) {
            try {
                if (!this.canvas) {
                    this.debugLog('Canvas未创建，无法重新计算');
                    return this;
                }

                // 如提供新数据/时长，则优先更新
                if (typeof newDuration === 'number' && isFinite(newDuration) && newDuration > 0) {
                    this.setActualDuration(newDuration);
                }
                if (Array.isArray(newData)) {
                    // 使用标准入口规范化，而不是直接赋值 rawData
                    this.setHeatmapData(newData);
                }

                if (!this.rawData || this.rawData.length === 0) {
                    // 无数据：清空画布并缓存空状态
                    this.debugLog('没有原始数据：清空画布并保持空白');
                    this.ctx.clearRect(0, 0, this.logicalWidth, this.options.height);
                    this.cacheCanvas();
                    return this;
                }

                this.debugLog('开始重新计算热力图');

                // 重新预处理数据
                this.preprocessData();

                // 重新计算密度范围
                this.calculateDensityRange();

                // 重新绘制
                this.drawHeatmap();

                // 更新缓存
                this.lastRenderedWidth = this.logicalWidth;
                this.cacheCanvas();

                this.debugLog('重新计算完成');
                return this;

            } catch (error) {
                this.debugLog('重新计算失败:', error);
                this.showError('重新计算失败: ' + error.message);
                return this;
            }
        }

        /**
         * 实时更新样式并立即重绘
         * @param {Object} styles
         * @param {number} [styles.lineWidth] 线条宽度
         * @param {string} [styles.lineColor] 线条颜色
         * @param {string} [styles.gradientColorStart] 渐变起始颜色
         * @param {string} [styles.gradientColorEnd] 渐变结束颜色
         * @returns {DanmakuHeatmapRenderer}
         */
        updateStyles(styles = {}) {
            if (!styles || typeof styles !== 'object') return this;

            const { lineWidth, lineColor, gradientColorStart, gradientColorEnd } = styles;

            if (typeof lineWidth === 'number' && isFinite(lineWidth) && lineWidth > 0) {
                this.options.lineWidth = lineWidth;
            }
            if (typeof lineColor === 'string' && lineColor) {
                this.options.lineColor = lineColor;
            }
            if (typeof gradientColorStart === 'string' && gradientColorStart) {
                this.options.gradientColorStart = gradientColorStart;
            }
            if (typeof gradientColorEnd === 'string' && gradientColorEnd) {
                this.options.gradientColorEnd = gradientColorEnd;
            }

            this.debugLog('样式已更新:', {
                lineWidth: this.options.lineWidth,
                lineColor: this.options.lineColor,
                gradientColorStart: this.options.gradientColorStart,
                gradientColorEnd: this.options.gradientColorEnd
            });

            // 如果已有画布，立即重绘以实时生效
            if (this.canvas && this.ctx) {
                this.redraw();
            }

            return this;
        }

        /**
         * 隐藏热力图
         * @returns {DanmakuHeatmapRenderer} 返回自身以支持链式调用
         */
        hide() {
            if (!this.canvas) {
                this.debugLog('Canvas未创建，无法隐藏');
                return this;
            }

            this.canvas.style.display = 'none';
            this.debugLog('热力图已隐藏');
            return this;
        }

        /**
         * 显示热力图
         * @returns {DanmakuHeatmapRenderer} 返回自身以支持链式调用
         */
        show() {
            if (!this.canvas) {
                this.debugLog('Canvas未创建，无法显示');
                return this;
            }

            this.canvas.style.display = 'block';
            this.debugLog('热力图已显示');
            return this;
        }
    }

    // 如果在Node.js环境中
    // （可选）保留全局暴露逻辑：由入口 index.js 再次挂载到命名空间，避免不必要的全局污染。
    // 如需直接全局访问，可解除下面注释。
    // if (typeof window !== 'undefined') {
    //     window.DanmakuHeatmapRenderer = DanmakuHeatmapRenderer;
    // }

    /**
     * 自动检测浏览器支持的CSS Transform属性
     * 兼容不同浏览器的前缀版本
     */
    ((function () {
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
    })());

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

    // 提取样式字符串中的远程字体 URL（/danmaku/font/...）
    function extractRemoteFontUrl(styleFont) {
      try {
        if (!styleFont || typeof styleFont !== 'string') return null;
        var m = styleFont.match(/\/danmaku\/font\/[^"',)\s]+/);
        return m ? m[0] : null;
      } catch (_) { return null; }
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
      if (newRate <= 0 || Math.abs(newRate - oldRate) < 1e-6) {
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
      // 收集来源：
      // 1) 传入 comments 的 style.font 中引用的 /danmaku/font/
      // 2) 全局设置中的 font_family 若为 /danmaku/font/
      var fontUrls = [];
      try {
        for (var fi = 0; fi < this.comments.length; fi++) {
          var fstyle = this.comments[fi] && this.comments[fi].style;
          var fu = fstyle && extractRemoteFontUrl(fstyle.font);
          if (fu) fontUrls.push(fu);
        }
      } catch (_) { }
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
        }
      }

      // 可选重建右键菜单（通常不需要）
      if (opt.resetCopyMenu && this._.enableCopyMenu) {
        try { this._setupCopyContextMenu(); } catch (_) { }
      }
      return this;
    };

    /**
     * Danmaku 操作集合
     * 暴露三个创建方法：attachButtonsGroup, generateHeatmap, renderDanmaku
     */


    const GLOBAL_NS = '__jfDanmakuGlobal__';
    function getGlobal() {
        if (typeof window === 'undefined') return {};
        window[GLOBAL_NS] = window[GLOBAL_NS] || {};
        return window[GLOBAL_NS];
    }

    // 可见性判断
    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent !== null) return true;
        try {
            const cs = window.getComputedStyle(el);
            return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        } catch (_) { return false; }
    }

    // 获取当前活跃的 OSD 根节点（优先包含当前 video 的且可见的 data-type=video-osd 容器）
    function getActiveOsdRoot() {
        const video = document.querySelector('video.htmlvideoplayer');
        const roots = Array.from(document.querySelectorAll("div[data-type='video-osd']"));
        const visibleRoots = roots.filter(isVisible);
        if (video) {
            const owner = visibleRoots.find(r => r.contains(video));
            if (owner) return owner;
        }
        return visibleRoots[0] || roots[0] || null;
    }

    // 在活跃 OSD 内查找热力图可挂载的进度条容器（更鲁棒的选择器集）
    function findHeatmapContainer() {
        const root = getActiveOsdRoot() || document;
        const candidates = [
            '.sliderMarkerContainer',
            '.osdProgressInner .sliderMarkerContainer',
            '.osdProgressInner',
            '.positionSlider',
            '.emby-slider',
            '.noUi-target',
            '[role="slider"]',
            'input[type="range"]'
        ];
        for (const sel of candidates) {
            const nodes = Array.from(root.querySelectorAll(sel));
            for (const n of nodes) {
                let el = n;
                // 如果命中的是 slider 控件本体，倾向使用其父容器
                if (el.tagName === 'INPUT' || el.getAttribute('role') === 'slider') {
                    el = el.parentElement || el;
                }
                if (isVisible(el) && (el.offsetWidth || el.scrollWidth)) {
                    return el;
                }
            }
        }
        // 全局兜底
        const fallback = document.querySelector('.sliderMarkerContainer');
        return fallback || null;
    }

    // 查找播放器按钮容器（优先在活跃 OSD 根内）
    function findButtonsContainer() {
        const osdRoot = getActiveOsdRoot();
        const searchIn = (root) => {
            if (!root) return null;
            const anchors = ['.btnVideoOsdSettings', '.btnVideoOsd', '.pause'];
            for (const sel of anchors) {
                const nodes = root.querySelectorAll(sel);
                for (const n of nodes) {
                    if (!isVisible(n)) continue;
                    const container = n.closest('.buttons.focuscontainer-x');
                    if (container && isVisible(container)) return container;
                }
            }
            const list = root.querySelectorAll('.buttons.focuscontainer-x');
            for (const el of list) { if (isVisible(el)) return el; }
            return list[0] || null;
        };

        // 先在活跃 OSD 内找；找不到再全局兜底
        return searchIn(osdRoot) || searchIn(document);
    }

    /**
     * 创建并插入“弹幕按钮组”。
     * 返回 { status: 'created'|'exists'|'no-container', instance?, element? }
     */
    function attachButtonsGroup(logger = null) {
        const container = findButtonsContainer();
        if (!container) {
            logger?.debug?.('按钮容器未就绪');
            return { status: 'no-container' };
        }

        const g = getGlobal();
        // 幂等：优先复用现有实例（如存在则只移动，不重建）
        const existing = g.danmakuButtonsGroup;
        const existingEl = existing?.getElement?.();
        const insertIndex = 1;
        const beforeNode = container.children && container.children.length > insertIndex ? container.children[insertIndex] : null;

        if (existing && existingEl) {
            // 移除同容器内除现有元素之外的重复项
            try {
                container.querySelectorAll('[data-danmaku-buttons]')?.forEach(node => {
                    if (node !== existingEl) { try { node.remove(); } catch (_) { } }
                });
            } catch (_) { }
            // 不同父容器：移动现有元素
            if (existingEl.parentElement !== container) {
                try { container.insertBefore(existingEl, beforeNode); } catch (_) { try { container.appendChild(existingEl); } catch (_) { } }
                logger?.info?.('弹幕按钮组已移动到当前容器');
                return { status: 'moved', instance: existing, element: existingEl };
            }
            // 相同父容器但索引不同：调整位置
            const currentIndex = Array.prototype.indexOf.call(container.children, existingEl);
            if (currentIndex !== insertIndex) {
                try { container.insertBefore(existingEl, beforeNode); } catch (_) { }
            }
            return { status: 'exists', instance: existing, element: existingEl };
        }

        // 不存在则创建
        const group = new DanmakuButtonsGroup({ logger });
        const el = group.getElement();
        el?.setAttribute?.('data-danmaku-buttons', 'true');
        try {
            container.querySelectorAll('[data-danmaku-buttons]')?.forEach(node => { if (node !== el) { try { node.remove(); } catch (_) { } } });
        } catch (_) { }
        try { container.insertBefore(el, beforeNode); } catch (_) { try { container.appendChild(el); } catch (_) { } }
        g.danmakuButtonsGroup = group;
        logger?.info?.('弹幕按钮组已插入');
        return { status: 'created', instance: group, element: el };
    }

    /**
     * 创建热力图 Canvas 并追加到进度条容器
     * 返回 { status: 'created'|'exists'|null, canvas? }
     */
    function generateHeatmap(logger = null) {
        const g = getGlobal();
        const heatmapData = g?.danmakuData?.heatmap_data;
        const heatmapArray = heatmapData ? Object.values(heatmapData) : [];
        const CANVAS_ID = 'danmaku-heatmap-canvas';
        const container = findHeatmapContainer();
        const video = document.querySelector('video');
        const duration = video?.duration || 0;
        if (!container || !video) {
            logger?.debug?.('热力图容器/视频未就绪');
            return null;
        }

        // 若已存在 renderer 或 canvas：优先移动到当前容器，避免重建闪烁
        const existingCanvas = document.getElementById(CANVAS_ID);
        if (existingCanvas) {
            if (!container.contains(existingCanvas)) {
                try { container.appendChild(existingCanvas); } catch (_) { }
                logger?.info?.('热力图已移动到当前容器');
                return { status: 'moved', canvas: existingCanvas };
            }
            return { status: 'exists', canvas: existingCanvas };
        }
        if (!duration || !isFinite(duration) || duration <= 0) {
            try {
                logger?.debug?.('video.duration 未就绪，等待 loadedmetadata 再生成热力图');
                const once = () => {
                    try { video.removeEventListener('loadedmetadata', once); } catch (_) { }
                    try { generateHeatmap(logger); } catch (_) { }
                };
                video.addEventListener('loadedmetadata', once, { once: true });
            } catch (_) { }
            return null;
        }

        const checkAgain = document.getElementById(CANVAS_ID);
        if (checkAgain && checkAgain.parentNode) {
            return { status: 'exists', canvas: checkAgain };
        }

        try {
            // 若已有 renderer，复用实例，仅 process 生成画布
            if (!g.heatmapRenderer) {
                // 读取样式配置（可选），仅合入已定义的键
                let cfg = {};
                try {
                    const raw = g.danmakuSettings?.get?.('heatmap_style');
                    cfg = raw && raw.trim() ? JSON.parse(raw) : {};
                } catch (_) { /* ignore */ }

                const styleOpts = ['lineWidth', 'lineColor', 'gradientColorStart', 'gradientColorEnd']
                    .reduce((o, k) => (cfg?.[k] != null ? (o[k] = cfg[k], o) : o), {});

                g.heatmapRenderer = new DanmakuHeatmapRenderer({
                    resizeThreshold: 50,
                    resizeDebounceDelay: 100,
                    debug: false,
                    canvasId: CANVAS_ID,
                    ...styleOpts
                });
            }

            // 初始化后再次确保样式应用（兼容运行中修改样式的场景）
            try {
                const raw = g.danmakuSettings?.get?.('heatmap_style');
                const cfg = raw && raw.trim() ? JSON.parse(raw) : null;
                if (cfg) {
                    const styleOpts = ['lineWidth', 'lineColor', 'gradientColorStart', 'gradientColorEnd']
                        .reduce((o, k) => (cfg?.[k] != null ? (o[k] = cfg[k], o) : o), {});
                    g.heatmapRenderer.updateStyles(styleOpts);
                }
            } catch (_) { /* ignore */ }

            const canvas = g.heatmapRenderer.process(heatmapArray, duration);
            canvas.id = CANVAS_ID;
            canvas.setAttribute('data-danmaku-heatmap', 'true');
            container.appendChild(canvas);
            logger?.info?.('热力图创建成功');
            return { status: 'created', canvas };
        } catch (err) {
            logger?.warn?.('热力图绘制异常', err);
            return null;
        }
    }

    /**
     * 渲染弹幕到视频上方
     * 返回 { status: 'created'|null, comments?: number }
     */
    function renderDanmaku(logger = null) {
        const g = getGlobal();
        const comments = g?.danmakuData?.comments || [];
        logger?.info?.('开始渲染弹幕', { 弹幕数量: comments.length });

        const videoEl = document.querySelector('video');
        if (!videoEl || !videoEl.parentElement) {
            logger?.debug?.('视频元素未就绪');
            return null;
        }

        const parent = videoEl.parentElement;
        const cs = window.getComputedStyle(parent);
        if (!/(relative|absolute|fixed|sticky)/.test(cs.position)) {
            parent.style.position = 'relative';
        }
        const layerId = 'danmaku-layer';
        const existing = document.getElementById(layerId);
        if (existing) {
            if (existing.parentElement !== parent) {
                // 仅搬移，不销毁重建
                try { parent.appendChild(existing); } catch (_) { }
            }
            // 若渲染器已存在，仅刷新尺寸
            if (g.danmakuRenderer) {
                try { g.danmakuRenderer.resize?.(); } catch (_) { }
                return { status: 'exists', comments: comments.length };
            }
            // 没有渲染器但有图层：继续在现有层上创建实例
        }

        // 复用现有图层或新建（改为单层结构，直接作为 Danmaku 容器）
        let layer = existing;
        if (!layer) {
            layer = document.createElement('div');
            layer.setAttribute('data-danmaku-layer', 'true');
            layer.id = layerId;
            try { parent.appendChild(layer); } catch (_) { }
        }

        // 直接在图层上应用显示范围（取消内层 wrapper）
        const displayTop = (() => { try { return Number(g?.danmakuSettings?.get('display_top_pct')); } catch (_) { return 0; } })();
        const displayBottom = (() => { try { return Number(g?.danmakuSettings?.get('display_bottom_pct')); } catch (_) { return 100; } })();
        const topPct = isFinite(displayTop) ? Math.min(99, Math.max(0, displayTop)) : 0;
        const bottomPct = isFinite(displayBottom) ? Math.min(100, Math.max(topPct + 1, displayBottom)) : 100;
        layer.style.cssText = [
            'position:absolute',
            `top:${topPct}%`,
            `height:${bottomPct - topPct}%`,
            'left:0', 'right:0',
            'overflow:hidden',
            'width:100%',
            'pointer-events:none'
        ].join(';');
        // 不把透明度写入 cssText，避免被覆盖；单独设置
        try {
            const opacitySetting = g?.danmakuSettings?.get('opacity');
            const opacity = Math.min(1, Math.max(0, (opacitySetting ?? 70) / 100));
            layer.style.opacity = String(opacity);
        } catch (_) {
            layer.style.opacity = '0.7';
        }

        // 仅在不存在实例时创建，避免反复销毁/重建
        if (!g.danmakuRenderer) {
            const danmakuInstance = g.danmakuRenderer = new Danmaku({
                container: layer,
                media: videoEl,
                comments: comments,
                speed: (() => {
                    try {
                        const v = g.danmakuSettings?.get('speed');
                        const num = Number(v);
                        if (!Number.isFinite(num)) return 144;
                        return Math.min(600, Math.max(24, num));
                    } catch (_) { return 144; }
                })(),
            });

            // 应用“是否显示”改为使用设置项 enable_danmaku
            try {
                const enabled = (g?.danmakuSettings?.asBool?.('enable_danmaku') ?? true);
                if (enabled) {
                    try { danmakuInstance.show?.(); } catch (_) { }
                    logger?.info?.('读取设置: 弹幕初始显示');
                } else {
                    try { danmakuInstance.hide?.(); } catch (_) { }
                    logger?.info?.('读取设置: 弹幕初始隐藏');
                }
            } catch (_) { }

            // 尺寸自适应
            if (typeof ResizeObserver !== 'undefined') {
                const resizeDebounceDelay = 50;
                let resizeTimer = null;
                const ro = new ResizeObserver(() => {
                    if (!g.danmakuRenderer) return;
                    if (resizeTimer) clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        try { g.danmakuRenderer.resize(); } catch (_) { }
                    }, resizeDebounceDelay);
                });
                try { ro.observe(parent); } catch (_) { }
                // 存到全局，便于 index.js 主流程在销毁时断开
                g.__danmakuResizeObserver = ro;
                g.__danmakuResizeTimerCancel = () => { if (resizeTimer) { try { clearTimeout(resizeTimer); } catch (_) { } resizeTimer = null; } };
            } else {
                const handleWindowResize = () => { try { g.danmakuRenderer?.resize?.(); } catch (_) { } };
                window.addEventListener('resize', handleWindowResize);
                g.__danmakuWindowResizeHandler = handleWindowResize;
            }

            logger?.info?.('弹幕渲染器创建完成');
            return { status: 'created', comments: comments.length };
        }
        // 已有实例场景
        return { status: 'exists', comments: comments.length };
    }

    // 提供少量辅助清理（可选使用）——非必须接口
    function cleanupAll(logger = null) {
        const g = getGlobal();
        try { g.danmakuButtonsGroup?.destroy?.(); } catch (_) { }
        g.danmakuButtonsGroup = null;

        try { g.danmakuRenderer?.destroy?.(); } catch (_) { }
        g.danmakuRenderer = null;
        try {
            const layer = document.getElementById('danmaku-layer');
            if (layer?.parentElement) layer.parentElement.removeChild(layer);
        } catch (_) { }

        try { g.heatmapRenderer?.destroy?.(); } catch (_) { }
        g.heatmapRenderer = null;
        try {
            const canvas = document.getElementById('danmaku-heatmap-canvas');
            if (canvas?.parentElement) canvas.parentElement.removeChild(canvas);
        } catch (_) { }

        try { g.__danmakuResizeObserver?.disconnect?.(); } catch (_) { }
        g.__danmakuResizeObserver = null;
        try { g.__danmakuResizeTimerCancel?.(); } catch (_) { }
        g.__danmakuResizeTimerCancel = null;
        try {
            if (g.__danmakuWindowResizeHandler) {
                window.removeEventListener('resize', g.__danmakuWindowResizeHandler);
            }
        } catch (_) { }
        g.__danmakuWindowResizeHandler = null;
        logger?.info?.('已清理弹幕相关 UI/实例');
    }

    /**
     * Logger - 轻量日志器
     * 用于在调试模式下输出日志；非调试模式静默。
     */
    class Logger {
      constructor({ debug = false, prefix = 'Danmaku', maxLines = 100 } = {}) {
        this._debug = !!debug;
        this._prefix = prefix;
        this._maxLines = maxLines;
        this._overlay = null; // DOM 节点
      this._overlayWrap = null; // 外层包裹，用于正确显示/隐藏
        this._buffer = []; // 在 overlay 未就绪前暂存的日志
        this._lastOverlayTsMs = 0; // 上一条覆盖层日志的时间戳
        this._altFlip = false; // 覆盖层行配色交替开关
        if (this._debug) this._ensureOverlay();
      }

      setDebug(v) {
        const next = !!v;
        if (this._debug === next) return;
        this._debug = next;
        if (this._debug) {
          this._ensureOverlay();
          this.info('调试:开启');
        } else {
          this.info('调试:关闭');
          this._hideOverlay();
        }
      }
      getDebug() { return this._debug; }
      setPrefix(p) { this._prefix = String(p || ''); }

      _fmt(args) {
        try {
          return [`[${this._prefix}]`, ...args];
        } catch (_) {
          return args;
        }
      }

      _stringify(arg) {
        const t = typeof arg;
        if (arg == null || t === 'number' || t === 'boolean' || t === 'bigint' || t === 'symbol') {
          return String(arg);
        }
        if (t === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch (_) {
          try { return String(arg); } catch (_) { return '[Unserializable]'; }
        }
      }

      _appendToOverlay(level, args) {
        if (!this._debug) return;
        this._ensureOverlay();
        if (!this._overlay) return;
        const now = new Date();
        const nowMs = now.getTime();
        const pad2 = (n) => String(n).padStart(2, '0');
        const ts = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
        const delta = this._lastOverlayTsMs ? (nowMs - this._lastOverlayTsMs) : 0;
        this._lastOverlayTsMs = nowMs;
        // 覆盖层：不显示前缀，显示时间(无毫秒) + 与上一条的间隔毫秒
        const line = `${ts}(${delta}ms) ${level.toUpperCase()} ${args.map(a => this._stringify(a)).join(' ')}`;

        // 如果 overlay 还未挂载，缓冲
        if (!this._overlay._ready) {
          this._buffer.push(line);
          return;
        }

        const pre = document.createElement('div');
        pre.textContent = line;
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-word';
        if (level === 'warn') {
          pre.style.color = '#ffda6b';
        } else if (level === 'error') {
          pre.style.color = '#ff6b6b';
        } else {
          // 普通级别交替颜色，提升可读性
          this._altFlip = !this._altFlip;
          pre.style.color = this._altFlip ? '#dbffb9ff' : '#9ec7f0ff';
        }
        this._overlay.appendChild(pre);

        // 截断到最大行数
        while (this._overlay.childNodes.length > this._maxLines) {
          this._overlay.removeChild(this._overlay.firstChild);
        }
        this._overlay.scrollTop = this._overlay.scrollHeight;
      }

      _ensureOverlay() {
        if (this._overlay) {
          // 仅重新显示外层容器
          try {
            (this._overlayWrap || this._overlay.parentElement)?.style && ((this._overlayWrap || this._overlay.parentElement).style.display = 'block');
          } catch (_) { }
          return;
        }
        const mount = () => {
          if (this._overlay) return;
          const wrap = document.createElement('div');
          wrap.setAttribute('data-danmaku-debug', 'overlay');
          wrap.style.position = 'fixed';
          wrap.style.top = '8px';
          wrap.style.right = '8px';
          wrap.style.width = '320px';
          wrap.style.height = '180px';
          // 允许拖动底部调整高度（浏览器原生）
          wrap.style.resize = 'vertical';
          wrap.style.minHeight = '14px';
          wrap.style.maxHeight = '90vh';
          wrap.style.padding = '6px 8px';
          wrap.style.background = 'rgba(0,0,0,0.7)';
          wrap.style.border = '1px solid rgba(255,255,255,0.2)';
          wrap.style.borderRadius = '6px';
          wrap.style.color = '#9ef09e';
          wrap.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, Monospace';
          wrap.style.fontSize = '12px';
          wrap.style.lineHeight = '1.25';
          wrap.style.zIndex = '2147483647';
          wrap.style.overflow = 'auto';
          wrap.style.pointerEvents = 'auto';
          wrap.style.userSelect = 'text';
          wrap.style.boxShadow = '0 2px 12px rgba(0,0,0,0.4)';

          // 标题栏（拖拽和清理可以后续再做，这里仅标题）
          const title = document.createElement('div');
          title.textContent = 'Danmaku Debug Logs';
          title.style.fontWeight = '600';
          title.style.marginBottom = '4px';
          title.style.color = '#d1ffe2';
          title.style.cursor = 'pointer';
          title.title = '点击收起/展开';
          wrap.appendChild(title);

          // 内容容器
          const content = document.createElement('div');
          content.style.height = 'calc(100% - 20px)';
          content.style.overflow = 'auto';
          wrap.appendChild(content);

          // 折叠/展开逻辑（点击标题切换）
          let __collapsed = false;
          let __prevHeight = '';
          let __prevResize = '';
          let __prevMinHeight = '';
          const setCollapsed = (next) => {
            __collapsed = !!next;
            if (__collapsed) {
              __prevHeight = wrap.style.height;
              __prevResize = wrap.style.resize;
              __prevMinHeight = wrap.style.minHeight;
              content.style.display = 'none';
              try {
                wrap.style.resize = 'none';
                wrap.style.minHeight = '14px';
                wrap.style.height = '14px';
              } catch (_) { }
            } else {
              content.style.display = 'block';
              try {
                wrap.style.resize = __prevResize || 'vertical';
                wrap.style.minHeight = __prevMinHeight || '200px';
                wrap.style.height = __prevHeight || '640px';
              } catch (_) { }
            }
          };
          try { title.addEventListener('click', () => setCollapsed(!__collapsed)); } catch (_) { }

          // 将内容容器作为 overlay 主体
      this._overlay = content;
      this._overlayWrap = wrap;
          this._overlay._ready = true;
          document.body ? document.body.appendChild(wrap) : document.documentElement.appendChild(wrap);

          // 刷新缓冲
          if (this._buffer.length) {
            for (const line of this._buffer) {
              const div = document.createElement('div');
              div.textContent = line;
              this._overlay.appendChild(div);
            }
            this._buffer.length = 0;
            this._overlay.scrollTop = this._overlay.scrollHeight;
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
        } else {
          mount();
        }
      }

      _hideOverlay() {
      const container = this._overlayWrap || this._overlay?.parentElement;
      if (container) container.style.display = 'none';
      }

      clear() {
        if (this._overlay) this._overlay.innerHTML = '';
        this._buffer.length = 0;
        this._altFlip = false;
      }

      log(...args) {
      this._appendToOverlay('log', args);
      }
      info(...args) {
      this._appendToOverlay('info', args);
      }
      warn(...args) {
      this._appendToOverlay('warn', args);
      }
      error(...args) {
      this._appendToOverlay('error', args);
      }
    }

    /*
     * Jellyfin Web Player State Detector
     * - 判定条件：DOM 中是否存在 <video class="htmlvideoplayer">
     * - 策略：低频轮询 + DOM 变动监听（MutationObserver）
     * - 判断是否为视频页并在激活时创建按钮组/热力图/弹幕
     */

    (function () {

        const NS = '__jfDanmakuGlobal__';
        if (typeof window !== 'undefined') {
            const existing = window[NS];
            if (existing && existing.__webPlayerStateInstalled) {
                return; // 已安装
            }
        }

        const POLL_INTERVAL_MS = 3000; // 低频轮询，3s 一次
        const MUTATION_DEBOUNCE_MS = 120; // DOM 变动去抖

        const state = {
            isActive: null, // null=未知，true/false=已判定
            pollTimer: null,
            observer: null,
            mediaItemId: null, // 从 PlaybackInfo 抓到的媒体 ID
        };

        // 日志器（默认关闭调试，优先读取本地存储的开关）
        let __initialDebug = false;
        try {
            // 仅当运行在浏览器环境且可访问 localStorage 时读取
            const v = (typeof window !== 'undefined' && window.localStorage)
                ? window.localStorage.getItem('danmaku_debug_enabled')
                : null;
            if (v === '1') __initialDebug = true;
            else if (v === '0') __initialDebug = false;
            // 其它/缺失情况保持默认 false
        } catch (_) { /* ignore storage access issues */ }
        const logger = new Logger({ debug: __initialDebug, prefix: 'JF-Danmaku' });

        // 记录是否已在当前会话中创建过 UI（进入时创建，退出时销毁）
        let uiActive = false;

        // 辅助：判断元素是否可见
        function isVisible(el) {
            if (!el) return false;
            if (el.offsetParent !== null) return true;
            try {
                const cs = window.getComputedStyle(el);
                return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
            } catch (_) { return false; }
        }

        // 获取当前活跃的 OSD 根（优先包含当前 video 的且可见的 data-type=video-osd 容器）
        function getActiveOsdRoot() {
            const video = document.querySelector('video.htmlvideoplayer');
            const roots = Array.from(document.querySelectorAll("div[data-type='video-osd']"));
            const visibleRoots = roots.filter(isVisible);
            if (video) {
                const owner = visibleRoots.find(r => r.contains(video));
                if (owner) return owner;
            }
            return visibleRoots[0] || roots[0] || null;
        }

        function activateUI() {
            if (uiActive) return;
            const g = (typeof window !== 'undefined') ? (window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {}) : {};

            // 根据媒体ID按需加载设置与数据（与按钮插入解耦）
            const maybeLoadForMedia = (id) => {
                if (!id) return;
                try {
                    if (!g.__lastSettingsLoadedForId) g.__lastSettingsLoadedForId = null;
                    if (g.__lastSettingsLoadedForId === id) return;
                    if (!g.danmakuSettings) {
                        createAndMountDanmakuSettings({});
                        logger.debug && logger.debug('已初始化默认弹幕设置');
                    }
                    g.__lastSettingsLoadedForId = id; // 先占位，避免短时间重复触发
                    Promise.resolve(fetchDanmakuData(logger, id)).then(() => {
                        // 数据到位后，尽力补齐渲染（容器未就绪时各自函数会自处理）
                        try { generateHeatmap(logger); } catch (_) { }
                        try { renderDanmaku(logger); } catch (_) { }
                    }).catch((e) => {
                        logger.warn && logger.warn('updateDanmakuSettings 失败', e);
                        // 失败时回滚标记以便后续重试
                        try { if (g.__lastSettingsLoadedForId === id) g.__lastSettingsLoadedForId = null; } catch (_) {}
                    });
                } catch (e) { /* ignore */ }
            };

            // 去重：清理多余的按钮/热力图
            const cleanupDuplicates = () => {
                try {
                    const root = getActiveOsdRoot();
                    if (root) {
                        const buttons = Array.from(root.querySelectorAll('[data-danmaku-buttons]'));
                        if (buttons.length > 1) {
                            buttons.slice(1).forEach(n => { try { n.remove(); } catch (_) {} });
                            logger.info(`清理冗余按钮组: ${buttons.length - 1}`);
                        }
                    }
                } catch (_) {}
                try {
                    const root = getActiveOsdRoot();
                    if (root) {
                        const canvases = Array.from(root.querySelectorAll('#danmaku-heatmap-canvas'));
                        if (canvases.length > 1) {
                            canvases.slice(1).forEach(n => { try { n.remove(); } catch (_) {} });
                            logger.info(`清理冗余热力图: ${canvases.length - 1}`);
                        }
                    }
                } catch (_) {}
            };

            // 单次初始化尝试
            const isButtonsReady = () => {
                const root = getActiveOsdRoot();
                return !!(root && root.querySelector('[data-danmaku-buttons]'));
            };
            const isHeatmapReady = () => {
                const root = getActiveOsdRoot();
                return !!(root && root.querySelector('#danmaku-heatmap-canvas'));
            };
            const isDanmakuReady = () => {
                const video = document.querySelector('video.htmlvideoplayer');
                const layer = document.getElementById('danmaku-layer');
                return !!(video && layer && layer.parentElement === video.parentElement);
            };
            const allReady = () => isButtonsReady() && isHeatmapReady() && isDanmakuReady();

            const tryInitOnce = () => {
                const video = document.querySelector('video.htmlvideoplayer');
                if (!video) return false;
                cleanupDuplicates();

                // 仅在未就绪时尝试插入/生成，避免频繁 resize / 重建
                let btnRes = { status: 'skipped' };
                if (!isButtonsReady()) {
                    btnRes = attachButtonsGroup(logger);
                }
                if (!isHeatmapReady()) {
                    generateHeatmap(logger);
                }
                if (!isDanmakuReady()) {
                    renderDanmaku(logger);
                }

                // 以“至少按钮插入成功”作为激活条件；所有组件就绪交给持久监听继续完成
                return btnRes && btnRes.status !== 'no-container';
            };

            // 尝试一次；若未完成则开启短期观察+防抖重试
            let done = false;
            try { done = tryInitOnce(); } catch (e) { logger.warn && logger.warn('初始化尝试异常', e); }

        const finishAndLoadData = () => {
                if (uiActive) return;
                uiActive = true;
                logger.info('弹幕 UI 已激活');
                // 准备设置与数据
                try {
            const itemId = (typeof g.getMediaId === 'function') ? g.getMediaId() : state.mediaItemId;
            if (itemId) maybeLoadForMedia(itemId);
            else logger.warn && logger.warn('未能获取媒体ID，等待 XHR 嗅探再加载');
                } catch (e) {
                    logger.warn && logger.warn('激活后加载全局数据失败', e);
                }
            };

            // 短期 -> 持久化观察器：等待关键锚点出现后再次尝试（直到全部就绪）
            const debounce = (fn, delay) => {
                let t = null; return (...args) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
            };
            const debouncedTry = debounce(() => {
                try {
                    const res = tryInitOnce();
                    if (!done && res) {
                        done = true;
                        finishAndLoadData();
                    }
                    // 保持监听至整个活跃期结束（deactivateUI 中统一清理），以便 OSD DOM 重建时自愈
                } catch (_) { /* ignore */ }
            }, 150);

            // 安装持久化监听与增强触发
            const setupPersistentWatchers = () => {
                // 1) MutationObserver：childList + attributes(style/class)，直到 allReady()
                try {
                    const obs = new MutationObserver(() => {
                        try { if (allReady()) return; } catch (_) {}
                        debouncedTry();
                    });
                    obs.observe(document.body, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['class', 'style']
                    });
                    g.__uiInitObserver = obs;
                } catch (e) {
                    logger.warn && logger.warn('附加持久观察失败', e);
                }

                // 2) 周期轮询：每 1s 尝试一次，直至 allReady()
                try {
                    g.__uiInitInterval = setInterval(() => {
                        if (allReady()) {
                            try { clearInterval(g.__uiInitInterval); } catch (_) {}
                            g.__uiInitInterval = null;
                            return;
                        }
                        debouncedTry();
                    }, 1000);
                } catch (_) { }

                // 3) 一次性 mousemove：控制条显隐常依赖鼠标，首次移动强制重试
                try {
                    const onMove = () => { debouncedTry(); try { document.removeEventListener('mousemove', onMove); } catch (_) {} g.__uiInitMouseMove = null; };
                    document.addEventListener('mousemove', onMove, { once: true });
                    g.__uiInitMouseMove = onMove;
                } catch (_) { }
            };

            // 若首次已达成“激活”条件，立即加载数据，但仍继续观察直至所有组件到位
            if (done) {
                finishAndLoadData();
            }
            // 即便未完成，也尝试基于当前已知媒体ID加载数据
            try { const idNow = state.mediaItemId; if (idNow) maybeLoadForMedia(idNow); } catch (_) { }
            setupPersistentWatchers();
        }

        function deactivateUI() {
            if (!uiActive) return;
            try { cleanupAll(logger); } catch (_) { }
            uiActive = false;
            logger.info('弹幕 UI 已销毁');
            // 清理持久化初始化监听
            try {
                const g = window.__jfDanmakuGlobal__ || {};
                try { g.__uiInitObserver?.disconnect?.(); } catch (_) {}
                g.__uiInitObserver = null;
                try { if (g.__uiInitInterval) clearInterval(g.__uiInitInterval); } catch (_) {}
                g.__uiInitInterval = null;
                try { if (g.__uiInitMouseMove) document.removeEventListener('mousemove', g.__uiInitMouseMove); } catch (_) {}
                g.__uiInitMouseMove = null;
            } catch (_) { }
        }

        // 拦截 XHR，监听 PlaybackInfo 响应以提取媒体 Id，并在ID变化时重建扩展实例
        function installXHRSniffer() {
            try {
                const proto = XMLHttpRequest?.prototype;
                if (!proto) return;
                if (proto.open && proto.open.__jfPlaybackPatched) return;

                const originalOpen = proto.open;
                proto.open = function (method, url, ...rest) {
                    this.addEventListener('load', () => {
                        const u = String(url || '');
                        if (!u.endsWith('PlaybackInfo')) return;
                        try {
                            const res = JSON.parse(this.responseText);
                            const id = res?.MediaSources?.[0]?.Id;
                            if (!id) return;
                            const prevId = state.mediaItemId;
                            state.mediaItemId = id;
                            if (prevId !== id) logger.info('PlaybackInfo 媒体ID', id);
                            // 捕获到媒体ID后优先尝试加载数据（不依赖 UI 激活完成）
                            try {
                                const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
                                if (!g.__maybeLoadForMedia) {
                                    // 复用 activateUI 中的实现：简版保险（避免引用闭包）
                                    g.__maybeLoadForMedia = (mid, loggerRef) => {
                                        if (!mid) return;
                                        try {
                                            if (!g.__lastSettingsLoadedForId) g.__lastSettingsLoadedForId = null;
                                            if (g.__lastSettingsLoadedForId === mid) return;
                                            if (!g.danmakuSettings) { try { createAndMountDanmakuSettings({}); } catch (_) {} }
                                            g.__lastSettingsLoadedForId = mid;
                                            Promise.resolve(fetchDanmakuData(loggerRef || logger, mid)).then(() => {
                                                try { generateHeatmap(loggerRef || logger); } catch (_) {}
                                                try { renderDanmaku(loggerRef || logger); } catch (_) {}
                                            }).catch(() => { try { if (g.__lastSettingsLoadedForId === mid) g.__lastSettingsLoadedForId = null; } catch (_) {} });
                                        } catch (_) { }
                                    };
                                }
                                g.__maybeLoadForMedia(id, logger);
                            } catch (_) { }
                            // 媒体 ID 变化时，做一次轻量的 UI 重建（清理后再激活）
                            if (uiActive) { deactivateUI(); activateUI(); }
                        } catch (_) { /* ignore parse errors */ }
                    }, { once: true });
                    return originalOpen.apply(this, [method, url, ...rest]);
                };
                proto.open.__jfPlaybackPatched = true;
                logger.info('已安装 XMLHttpRequest 嗅探');
            } catch (err) {
                logger.warn && logger.warn('安装 XHR 嗅探失败', err);
            }
        }

        function ensureExt(active) {
            if (active) activateUI(); else deactivateUI();
        }

        function isInWebPlayer() {
        // 需要同时存在视频元素与OSD容器，避免路由过渡时误判
        const videoEl = document.querySelector('video.htmlvideoplayer');
        const osdEl = document.querySelector("div[data-type='video-osd']");
        return !!(videoEl && osdEl);
        }

        function handleStateChange(newState) {
            if (state.isActive === newState) return;
            state.isActive = newState;
            // 控制扩展实例的存活
            ensureExt(newState);
            logger.info('状态变更', { 是否激活: newState });
        }

        function runCheck() {
            const active = isInWebPlayer();
            handleStateChange(active);
        }

        // DOM 变动去抖
        function debounce(fn, delay) {
            let timer = null;
            function wrapped(...args) {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                    timer = null;
                    try { fn.apply(this, args); } catch (_) { /* no-op */ }
                }, delay);
            }
            wrapped.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
            return wrapped;
        }
        const debouncedRunCheck = debounce(runCheck, MUTATION_DEBOUNCE_MS);

        function start() {
            // 安装 XHR 嗅探
            installXHRSniffer();
            // 低频轮询
            state.pollTimer = setInterval(runCheck, POLL_INTERVAL_MS);
            logger.info('轮询已启动');

            // DOM 变动监听
            if ('MutationObserver' in window) {
                state.observer = new MutationObserver(() => {
                    debouncedRunCheck();
                });
                const target = document.documentElement || document.body;
                if (target) {
                    state.observer.observe(target, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['class', 'style'],
                    });
                    logger.info('DOM 变动监听已附加');
                }
            }

            // 立即做一次初判
            runCheck();
        }

        function ready(fn) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', fn, { once: true });
            } else {
                fn();
            }
        }

        // 暴露少量调试 API
        if (typeof window !== 'undefined') {
            const g = window[NS] = window[NS] || {};
            Object.assign(g, {
                start,
                isInWebPlayer,
                getState: () => state.isActive,
                getExt: () => ({ uiActive }),
                getMediaId: () => state.mediaItemId,
                spawnExt: () => { try { deactivateUI(); } catch (_) {} try { activateUI(); } catch (_) {} },
                setDebug: (v) => logger.setDebug(v),
                getDebug: () => logger.getDebug(),
                getLogger: () => logger,
                __webPlayerStateInstalled: true
            });
        }

        // 自启动
        ready(start);
    })();

})();
//# sourceMappingURL=jellyfin-danmaku.js.map
