var BADGE_COLOR_STOPS = [
    { value: 2, color: 'rgba(103, 167, 199, 1)' }, // 蓝
    { value: 5, color: '#72cc2e' }, // 绿
    { value: 10, color: '#e67e22' }, // 橙
    { value: 30, color: '#e74c3c' }, // 红（封顶）
];

/**
 * 颜色插值函数
 */
function lerpColor(color1, color2, t) {
    // 将颜色转换为RGB数组
    var rgb1 = parseColor(color1);
    var rgb2 = parseColor(color2);
    
    // 线性插值
    var r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * t);
    var g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * t);
    var b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * t);
    var a = (rgb1.a + (rgb2.a - rgb1.a) * t).toFixed(2);
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * 解析颜色字符串为RGB值
 */
function parseColor(color) {
    if (color.startsWith('#')) {
        // 处理十六进制颜色
        color = color.replace('#', '');
        if (color.length === 3) {
            color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
        }
        return {
            r: parseInt(color.substring(0, 2), 16),
            g: parseInt(color.substring(2, 4), 16),
            b: parseInt(color.substring(4, 6), 16),
            a: 1
        };
    } else if (color.startsWith('rgba')) {
        // 处理rgba格式
        var match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            return {
                r: parseInt(match[1]),
                g: parseInt(match[2]),
                b: parseInt(match[3]),
                a: match[4] ? parseFloat(match[4]) : 1
            };
        }
    } else if (color.startsWith('rgb')) {
        // 处理rgb格式
        var match = color.match(/rgb?\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            return {
                r: parseInt(match[1]),
                g: parseInt(match[2]),
                b: parseInt(match[3]),
                a: 1
            };
        }
    }
    
    // 默认返回白色
    return { r: 255, g: 255, b: 255, a: 1 };
}

/**
 * 根据停止点获取颜色
 */
function getBadgeColorByStops(val) {
    if (!Array.isArray(BADGE_COLOR_STOPS) || BADGE_COLOR_STOPS.length === 0) return '#ffffff';
    
    // 边界：小于最小值/大于最大值直接返回端点色
    if (val <= BADGE_COLOR_STOPS[0].value) return BADGE_COLOR_STOPS[0].color;
    var last = BADGE_COLOR_STOPS[BADGE_COLOR_STOPS.length - 1];
    if (val >= last.value) return last.color;
    
    // 在相邻停靠点之间线性插值
    for (var i = 1; i < BADGE_COLOR_STOPS.length; i++) {
        var left = BADGE_COLOR_STOPS[i - 1];
        var right = BADGE_COLOR_STOPS[i];
        if (val <= right.value) {
            var span = Math.max(1e-6, right.value - left.value);
            var t = (val - left.value) / span;
            return lerpColor(left.color, right.color, t);
        }
    }
    return last.color;
}

/**
 * 更新颜色停止点
 */
function updateBadgeColorStops(newStops) {
    if (Array.isArray(newStops)) {
        BADGE_COLOR_STOPS = newStops;
    }
}

/**
 * 获取当前颜色停止点
 */
function getBadgeColorStops() {
    return BADGE_COLOR_STOPS;
}