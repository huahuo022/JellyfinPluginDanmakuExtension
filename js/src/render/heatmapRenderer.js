/**
 * 弹幕热力图渲染器类
 * 用于生成弹幕密度的可视化热力图
 * 
 */

// 通过 ES Module 导出，便于 Rollup 打包。
export class DanmakuHeatmapRenderer {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     * @param {number} options.width - Canvas宽度，默认800（如果autoResize为true则会被覆盖）
     * @param {number} options.height - Canvas高度，默认60
     * @param {boolean} options.debug - 是否开启调试模式，默认false
     * @param {boolean} options.autoResize - 是否自动响应父容器宽度变化，默认false
     * @param {number} options.resizeThreshold - 重新渲染的宽度变化阈值，默认50像素
     * @param {number} options.resizeDebounceDelay - 宽度变化防抖延迟时间（毫秒），默认300
     * @param {number} options.lineWidth - 线条宽度，默认1
     * @param {string} options.color - 颜色方案，可选：'blue', 'red', 'green', 'purple', 'orange'，默认'blue'
    * @param {string} options.canvasId - 生成的Canvas元素ID，默认 'danmaku-heatmap-canvas'
     */
    constructor(options = {}) {
        // 颜色预设方案
        const colorPresets = {
            blue: {
                lineColor: '#3498db',
                gradientColorStart: 'rgba(52, 152, 219, 0.08)',
                gradientColorEnd: 'rgba(52, 152, 219, 0.25)'
            },
            red: {
                lineColor: '#e74c3c',
                gradientColorStart: 'rgba(231, 76, 60, 0.1)',
                gradientColorEnd: 'rgba(231, 76, 60, 0.4)'
            },
            green: {
                lineColor: '#27ae60',
                gradientColorStart: 'rgba(39, 174, 96, 0.1)',
                gradientColorEnd: 'rgba(39, 174, 96, 0.3)'
            },
            purple: {
                lineColor: '#8e44ad',
                gradientColorStart: 'rgba(142, 68, 173, 0.15)',
                gradientColorEnd: 'rgba(142, 68, 173, 0.45)'
            },
            orange: {
                lineColor: '#f39c12',
                gradientColorStart: 'rgba(243, 156, 18, 0.1)',
                gradientColorEnd: 'rgba(243, 156, 18, 0.3)'
            }
        };

        // 获取颜色方案
        const colorScheme = options.color || 'blue';
        const selectedColors = colorPresets[colorScheme] || colorPresets.blue;

        this.options = {
            width: options.width || 800,
            height: options.height || 60,
            debug: options.debug || false,
            autoResize: options.autoResize || false,

            // 线条样式配置
            lineWidth: options.lineWidth || 1,
            color: colorScheme,

            // 从预设方案中获取的颜色配置
            lineColor: selectedColors.lineColor,
            gradientColorStart: selectedColors.gradientColorStart,
            gradientColorEnd: selectedColors.gradientColorEnd,
            canvasId: options.canvasId || 'danmaku-heatmap-canvas',

            ...options
        };

        this.canvas = null;
        this.ctx = null;
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

        this.debugLog('热力图渲染器已初始化');
        this.debugLog('样式配置:', {
            lineWidth: this.options.lineWidth,
            color: this.options.color,
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

        if (newWidth !== this.options.width && newWidth > 0) {
            this.debugLog(`容器宽度变化检测: ${this.options.width}px -> ${newWidth}px`);

            // 立即更新Canvas尺寸以保持视觉连续性
            this.options.width = newWidth;
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
            this.ctx.clearRect(0, 0, this.options.width, this.options.height);

            // 计算设备像素比
            const devicePixelRatio = window.devicePixelRatio || 1;

            // 计算缓存内容的逻辑尺寸
            const cacheLogicalWidth = this.cachedCanvas.width / devicePixelRatio;
            const cacheLogicalHeight = this.cachedCanvas.height / devicePixelRatio;

            // 直接缩放绘制缓存内容到新尺寸
            this.ctx.drawImage(
                this.cachedCanvas,
                0, 0, this.cachedCanvas.width, this.cachedCanvas.height,
                0, 0, this.options.width, this.options.height
            );

            this.debugLog(`使用缓存内容进行快速缩放: ${cacheLogicalWidth}x${cacheLogicalHeight} -> ${this.options.width}x${this.options.height}`);
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

        this.debugLog('更新Canvas尺寸:', this.options.width, 'x', this.options.height, '设备像素比:', devicePixelRatio);

        // 设置Canvas的内部分辨率（考虑设备像素比）
        this.canvas.width = this.options.width * devicePixelRatio;
        this.canvas.height = this.options.height * devicePixelRatio;

        // 设置Canvas的CSS显示尺寸
        this.canvas.style.width = this.options.width + 'px';
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
            this.ctx.clearRect(0, 0, this.options.width, this.options.height);

            // 计算缩放比例以适应新的Canvas尺寸
            const scaleX = this.options.width / (this.cachedCanvas.width / (window.devicePixelRatio || 1));
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

        // 设置Canvas的内部分辨率（考虑设备像素比）
        this.canvas.width = this.options.width * devicePixelRatio;
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

        // 确保CSS显示尺寸正确
        this.canvas.style.width = this.options.width + 'px';
        this.canvas.style.height = this.options.height + 'px';

        this.ctx = this.canvas.getContext('2d');

        // 缩放上下文以匹配设备像素比
        this.ctx.scale(devicePixelRatio, devicePixelRatio);

        // 如果启用了自动调整大小，设置ResizeObserver
        if (this.options.autoResize) {
            // 延迟设置，确保Canvas已插入DOM
            setTimeout(() => {
                this.setupResizeObserver();
            }, 0);
        }

        if (noData) {
            // 空数据：不绘制，仅返回空白透明画布
            this.debugLog('空数据：创建空白热力图 Canvas');
        } else {
            // 计算密度范围并绘制
            this.calculateDensityRange();
            this.debugLog('绘制前数据点映射:');
            this.debugLog('- 数据段数量:', this.processedData.length);
            this.debugLog('- 密度范围:', this.minDensity, '到', this.maxDensity);
            this.debugLog('- Canvas尺寸:', this.options.width, 'x', this.options.height);
            this.debugLog('- Canvas分辨率:', this.canvas.width, 'x', this.canvas.height);
            this.debugLog('- 设备像素比:', devicePixelRatio);
            this.drawHeatmap();
        }

        // 记录初始渲染宽度并缓存结果
        this.lastRenderedWidth = this.options.width;
        this.cacheCanvas();

        this.debugLog('Canvas创建完成');
        return this.canvas;
    }

    /**
     * 绘制热力图
     */
    drawHeatmap() {
        if (!this.ctx || this.processedData.length === 0) return;

        // 清空画布
        this.ctx.clearRect(0, 0, this.options.width, this.options.height);

        const paddingVertical = 5;  // 只保留上下边距
        const graphWidth = this.options.width;  // 使用完整宽度，不减去左右边距
        const graphHeight = this.options.height - 2 * paddingVertical;

        // 计算数据点坐标 - 基于时间而不是索引
        const points = this.processedData.map((dataPoint, index) => {
            const normalizedDensity = (dataPoint.average_density - this.minDensity) /
                (this.maxDensity - this.minDensity);

            // 基于时间计算X坐标：使用数据段的中点时间
            const midTime = (dataPoint.start_time_seconds + dataPoint.end_time_seconds) / 2;
            const x = (midTime / this.actualDuration) * graphWidth;  // 基于时间比例计算X坐标
            const y = paddingVertical + graphHeight - (normalizedDensity * graphHeight);

            return { x, y, density: dataPoint.average_density, midTime };
        });

        // 添加起始点和结束点的延伸
        if (points.length >= 2) {
            // 计算开头的延伸点（x=0）
            const p1 = points[0];
            const p2 = points[1];
            const slope = (p2.y - p1.y) / (p2.x - p1.x);
            let startY = p1.y - slope * p1.x;  // 延伸到x=0时的y坐标

            // 限制起始点Y坐标在合理范围内
            startY = Math.max(paddingVertical, Math.min(paddingVertical + graphHeight, startY));
            const startPoint = { x: 0, y: startY, density: p1.density, midTime: 0, isExtended: true };

            // 计算结尾的延伸点（x=graphWidth）
            const pn2 = points[points.length - 2];
            const pn1 = points[points.length - 1];
            const endSlope = (pn1.y - pn2.y) / (pn1.x - pn2.x);
            let endY = pn1.y + endSlope * (graphWidth - pn1.x);  // 延伸到x=graphWidth时的y坐标

            // 限制结束点Y坐标在合理范围内
            endY = Math.max(paddingVertical, Math.min(paddingVertical + graphHeight, endY));
            const endPoint = { x: graphWidth, y: endY, density: pn1.density, midTime: this.actualDuration, isExtended: true };

            // 插入起始点和结束点
            points.unshift(startPoint);
            points.push(endPoint);

            this.debugLog('添加了延伸点:');
            this.debugLog(`起始点: 时间0s -> 坐标(${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)})`);
            this.debugLog(`结束点: 时间${this.actualDuration}s -> 坐标(${endPoint.x.toFixed(1)}, ${endPoint.y.toFixed(1)})`);
        }

        this.debugLog('坐标点映射详情:');
        points.forEach((point, index) => {
            if (point.isExtended) {
                this.debugLog(`点${index}: [延伸点] 时间${point.midTime}s -> 坐标(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
            } else {
                // 对于非延伸点，需要考虑延伸点的偏移
                const dataIndex = points[0].isExtended ? index - 1 : index;
                if (dataIndex >= 0 && dataIndex < this.processedData.length) {
                    const dataPoint = this.processedData[dataIndex];
                    this.debugLog(`点${index}: 时间${dataPoint.start_time_seconds}-${dataPoint.end_time_seconds}s(中点${point.midTime}s), 密度${dataPoint.average_density} -> 坐标(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`);
                }
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

        this.ctx.clearRect(0, 0, this.options.width, this.options.height);
        this.ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
        this.ctx.fillRect(0, 0, this.options.width, this.options.height);

        this.ctx.fillStyle = '#dc3545';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(message, this.options.width / 2, this.options.height / 2);
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
                this.ctx.clearRect(0, 0, this.options.width, this.options.height);
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
            this.lastRenderedWidth = this.options.width;
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
