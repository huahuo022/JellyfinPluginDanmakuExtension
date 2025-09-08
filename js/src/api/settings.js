/**
 * DanmakuSettings - 弹幕 / 热力图 参数设置类
 * - 负责：类型规范化、默认值填充、更新验证、序列化
 * - 用法：
 *   const s = new DanmakuSettings(rawSettingsObject);
 *   s.set('font_size', 30); s.enable_heatmap = 'combined';
 */

const GLOBAL_NS = '__jfDanmakuGlobal__';

export class DanmakuSettings {
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
            mark_style:         { def: "dynamic",  type: 'string'  },
            mark_threshold:     { def: 1,          type: 'number'  },
            mode_elevation:     { def: true,       type: 'boolean' },
            enlarge:            { def: false,       type: 'boolean' },
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
        const g = window[GLOBAL_NS] = window[GLOBAL_NS] || {};
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
export function createAndMountDanmakuSettings(raw) {
    // 若已存在全局实例：直接 patch 合并更新并返回，避免频繁 new 导致引用失效
    try {
        if (typeof window !== 'undefined') {
            const g = window[GLOBAL_NS] = window[GLOBAL_NS] || {};
            if (g.danmakuSettings instanceof DanmakuSettings) {
                g.danmakuSettings.patch(raw || {});
                return g.danmakuSettings;
            }
        }
    } catch (_) { }
    return new DanmakuSettings(raw).mountGlobal();
}
