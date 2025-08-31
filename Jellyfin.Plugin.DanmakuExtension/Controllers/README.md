# Jellyfin 弹幕插件 API 文档

## 概述

Jellyfin 弹幕插件提供了强大的弹幕获取和处理功能，支持多种弹幕源、智能合并、过滤规则等高级特性。

## 🚀 快速开始

### 基础请求示例

```bash
GET /danmaku/comment?danmaku_id=190010001&chConvert=1&withRelated=true
Authorization: MediaBrowser Token="YOUR_API_TOKEN"
```

## 📖 API 端点详解

### GET `/danmaku/comment` - 获取弹幕评论

获取指定视频的弹幕数据，支持智能合并、过滤和多种处理选项。

#### 🔑 认证参数

- **Authorization**: `MediaBrowser Token="YOUR_API_TOKEN"`
  - 必须：是
  - 说明：Jellyfin API 访问令牌

#### 📝 基础参数

| 参数名 | 类型 | 必须 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `item_id` | GUID | 条件必须* | - | Jellyfin 媒体项 ID |
| `danmaku_id` | string | 条件必须* | - | 弹幕 ID（直接指定） |
| `chConvert` | string | 否 | "0" | 简繁转换：`0`=不转换，`1`=繁体转简体，`2`=简体转繁体 |
| `withRelated` | string | 否 | "true" | 是否包含第三方弹幕：`true`/`false` |
| `enable_pakku` | boolean | 否 | true | 是否启用 Pakku 弹幕智能处理 |

> *注意：`item_id` 和 `danmaku_id` 至少需要提供一个

#### ⚙️ Pakku 核心配置参数

| 参数名 | 类型 | 默认值 | 范围 | 说明 |
|--------|------|--------|------|------|
| `threshold_seconds` | double | 2.0 | 0.1-10.0 | 时间阈值（秒），在此时间窗口内的弹幕才会被合并 |
| `max_distance` | int | 2 | 0-10 | 最大编辑距离，文本相似度判断阈值 |
| `max_cosine` | int | 80 | 0-100 | 最大余弦相似度阈值，超过此值认为相似 |
| `use_pinyin` | boolean | true | - | 是否启用拼音相似度匹配（如：你好 ≈ nihao） |
| `cross_mode` | boolean | false | - | 是否启用跨模式合并（滚动、顶部、底部弹幕互相合并） |

#### 🧹 文本预处理参数

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `trim_ending` | boolean | true | 去除文本末尾的标点符号（如：`哈哈哈！` → `哈哈哈`） |
| `trim_space` | boolean | true | 去除多余空格和制表符 |
| `trim_width` | boolean | true | 统一全角半角字符（如：`１２３` → `123`） |

#### 🎯 过滤规则参数（Base64 编码）

| 参数名 | 类型 | 说明 | JSON 格式示例 |
|--------|------|------|----------------|
| `forcelist_base64` | string | 强制替换规则列表（Base64 编码） | `[{"pattern": "test", "replace": "测试"}]` |
| `whitelist_base64` | string | 白名单规则（Base64 编码） | `[{"isRegex": false, "pattern": "精彩"}]` |
| `blacklist_base64` | string | 黑名单规则（Base64 编码） | `[{"isRegex": true, "pattern": "^.{1,2}$"}]` |

#### 🏷️ 标记显示参数

| 参数名 | 类型 | 默认值 | 可选值 | 说明 |
|--------|------|--------|--------|------|
（已移除）计数标记相关参数改为由后端提供 `mark_count` 字段，前端自行渲染显示样式。
| `mark_threshold` | int | 1 | ≥1 | 标记阈值，合并数量超过此值才显示标记 |

#### 🚀 优化增强参数

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `mode_elevation` | boolean | true | 模式提升：滚动弹幕优先级高于顶部/底部弹幕 |
| `enlarge` | boolean | true | 放大高热度弹幕（合并数量多的弹幕） |

#### 📊 密度控制参数

| 参数名 | 类型 | 默认值 | 范围 | 说明 |
|--------|------|--------|------|------|
| `scroll_threshold` | int | 0 | ≥0 | 滚动弹幕密度阈值，超过则转换为顶部弹幕 |
| `shrink_threshold` | int | 0 | ≥0 | 缩小弹幕密度阈值，超过则缩小字体 |
| `drop_threshold` | int | 0 | ≥0 | 丢弃弹幕密度阈值，超过则直接丢弃 |

#### 🔧 性能优化参数

| 参数名 | 类型 | 默认值 | 范围 | 说明 |
|--------|------|--------|------|------|
| `max_chunk_size` | int | 1000 | 100-10000 | 每个处理块的最大弹幕数量 |

## 💡 JavaScript Base64 编码示例

### 基础编码函数

```javascript
// Base64 编码函数（支持中文）
function encodeJsonToBase64(data) {
    const jsonStr = JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(jsonStr)));
}

// Base64 解码函数
function decodeBase64ToJson(base64Str) {
    const jsonStr = decodeURIComponent(escape(atob(base64Str)));
    return JSON.parse(jsonStr);
}
```

### 过滤规则编码示例

```javascript
// 1. 强制替换规则
const forcelist = [
    {"pattern": "test", "replace": "测试"},
    {"pattern": "demo", "replace": "演示"},
    {"pattern": "hello", "replace": "你好"}
];
const forcelistBase64 = encodeJsonToBase64(forcelist);

// 2. 白名单规则
const whitelist = [
    {"isRegex": true, "pattern": "\\d+"},      // 匹配数字
    {"isRegex": false, "pattern": "精彩"},      // 精确匹配"精彩"
    {"isRegex": false, "pattern": "好评"}       // 精确匹配"好评"
];
const whitelistBase64 = encodeJsonToBase64(whitelist);

// 3. 黑名单规则
const blacklist = [
    {"isRegex": false, "pattern": "广告"},      // 屏蔽"广告"
    {"isRegex": false, "pattern": "垃圾"},      // 屏蔽"垃圾"
    {"isRegex": true, "pattern": "^.{1,2}$"},  // 屏蔽1-2个字符的弹幕
    {"isRegex": false, "pattern": "666"}       // 屏蔽"666"
];
const blacklistBase64 = encodeJsonToBase64(blacklist);
```

### 完整 API 请求示例

```javascript
async function fetchDanmaku() {
    // 构建查询参数
    const params = new URLSearchParams({
        danmaku_id: "190010001",
        chConvert: "1",
        withRelated: "true",
        enable_pakku: "true",
        
        // Pakku 核心配置
        threshold_seconds: "2.0",
        max_distance: "2",
        max_cosine: "80",
        use_pinyin: "true",
        cross_mode: "false",
        
        // 文本预处理
        trim_ending: "true",
        trim_space: "true",
        trim_width: "true",
        
        // 过滤规则（Base64 编码）
        forcelist_base64: forcelistBase64,
        whitelist_base64: whitelistBase64,
        blacklist_base64: blacklistBase64,
        
    // 标记显示（后端不再提供样式参数，前端依据 mark_count 渲染）
        mark_threshold: "1",
        
        // 优化增强
        mode_elevation: "true",
        enlarge: "true"
    });

    try {
        const response = await fetch(`https://your-jellyfin-server.com/danmaku/comment?${params}`, {
            method: 'GET',
            headers: {
                'Authorization': 'MediaBrowser Token="YOUR_API_TOKEN"'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('弹幕数据:', data);
            console.log(`原始弹幕: ${data.original_count}, 处理后: ${data.count}`);
            return data;
        } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('请求失败:', error);
        throw error;
    }
}

// 调用示例
fetchDanmaku()
    .then(data => {
        console.log('弹幕获取成功:', data);
    })
    .catch(error => {
        console.error('弹幕获取失败:', error);
    });
```

## 📊 响应数据格式

### 成功响应示例

```json
{
    "count": 4219,
    "original_count": 6068,
    "removed_count": 1849,
    "data": [
        {
            "time": 10.5,
            "type": 1,
            "color": 16777215,
            "author": "user123",
            "text": "精彩的开场！",
            "mark_count": 3
        }
    ],
    "timings": {
        "total_ms": 856,
        "download_ms": 234,
        "pakku_processing_ms": 622
    },
    "merge_counts": {
        "identical": 1203,
        "edit_distance": 387,
        "pinyin": 142,
        "vector": 117
    },
    "merge_settings": {
        "threshold_seconds": 2.0,
        "max_distance": 2,
        "use_pinyin": true,
        "forcelist_count": 3,
        "whitelist_count": 3,
        "blacklist_count": 4
    }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `count` | int | 处理后的弹幕数量 |
| `original_count` | int | 原始弹幕数量 |
| `removed_count` | int | 被移除的弹幕数量 |
| `data` | array | 弹幕数据数组 |
| `timings` | object | 性能统计信息 |
| `merge_counts` | object | 各类型合并统计 |
| `merge_settings` | object | 生效的配置参数 |

## 🛠️ 高级用法

### 1. 自定义过滤策略

```javascript
// 游戏直播弹幕过滤
const gameStreamFilter = {
    // 强制替换常见缩写
    forcelist: [
        {"pattern": "gg", "replace": "Good Game"},
        {"pattern": "wp", "replace": "Well Played"},
        {"pattern": "gl", "replace": "Good Luck"}
    ],
    
    // 只保留游戏相关内容
    whitelist: [
        {"isRegex": true, "pattern": "(技能|装备|等级|经验)"},
        {"isRegex": false, "pattern": "厉害"},
        {"isRegex": false, "pattern": "牛逼"}
    ],
    
    // 屏蔽无意义内容
    blacklist: [
        {"isRegex": true, "pattern": "^[!！]{3,}$"},  // 多个感叹号
        {"isRegex": true, "pattern": "^[哈h]{3,}$"},   // 重复的"哈"
        {"isRegex": false, "pattern": "刷屏"}
    ]
};
```

### 2. 密度控制策略

```javascript
// 高密度场景优化
const params = new URLSearchParams({
    // ... 其他参数
    scroll_threshold: "50",    // 滚动弹幕密度超过50则转顶部
    shrink_threshold: "100",   // 密度超过100则缩小字体
    drop_threshold: "200",     // 密度超过200则直接丢弃
    max_chunk_size: "2000"     // 大量弹幕时分块处理
});
```

### 3. 性能监控

```javascript
async function fetchWithMonitoring() {
    const startTime = performance.now();
    
    try {
        const data = await fetchDanmaku();
        const endTime = performance.now();
        
        console.log('🚀 性能统计:');
        console.log(`  总耗时: ${endTime - startTime}ms`);
        console.log(`  服务器处理: ${data.timings?.total_ms}ms`);
        console.log(`  Pakku 处理: ${data.timings?.pakku_processing_ms}ms`);
        console.log(`  压缩率: ${((1 - data.count / data.original_count) * 100).toFixed(1)}%`);
        
        return data;
    } catch (error) {
        console.error('请求失败:', error);
        throw error;
    }
}
```

## 🔧 故障排除

### 常见错误码

| 状态码 | 错误信息 | 解决方案 |
|--------|----------|----------|
| 400 | `Either danmaku_id or item_id is required` | 提供 danmaku_id 或 item_id |
| 400 | `danmaku_id not found for this item` | 检查媒体项是否关联了弹幕ID |
| 401 | `Unauthorized` | 检查 API Token 是否正确 |
| 404 | `Item not found` | 检查 item_id 是否存在 |
| 500 | `Error fetching danmaku comments` | 检查网络连接和弹幕源 |

### 调试技巧

1. **启用详细日志**：在 Jellyfin 管理界面中启用插件日志
2. **检查缓存状态**：使用 `/danmaku/cache_stats` 端点查看缓存统计
3. **验证 Base64 编码**：使用在线工具验证 Base64 字符串格式
4. **分步测试**：先不启用 Pakku，然后逐步添加参数

## 📚 相关文档

- [Jellyfin API 文档](https://api.jellyfin.org/)
- [Pakku 弹幕合并算法](https://github.com/xmcp/pakku)
- [JavaScript Base64 编码详解](https://developer.mozilla.org/zh-CN/docs/Web/API/btoa)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个插件！

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。
