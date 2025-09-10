// 时间偏移设置对话框
import { saveIfAutoOn } from "../../api/utils";

export class TimeShiftDialog {
  constructor(logger = null) {
    this.logger = logger;
  }

  async show(ball, panel = null) {
    try {
      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0,0,0,.5)';
      overlay.style.zIndex = '1000000';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      // 创建对话框
      const dialog = document.createElement('div');
      dialog.style.background = 'rgba(20,20,20,.96)';
      dialog.style.backdropFilter = 'blur(8px)';
      dialog.style.border = '1px solid rgba(255,255,255,.2)';
      dialog.style.borderRadius = '12px';
      dialog.style.boxShadow = '0 12px 32px rgba(0,0,0,.6)';
      dialog.style.padding = '24px';
      dialog.style.minWidth = '320px';
      dialog.style.maxWidth = '400px';
      dialog.style.color = '#fff';
      dialog.style.fontSize = '14px';

      // 标题
      const title = document.createElement('div');
      title.textContent = `设置时间轴偏移 - ${ball.name}`;
      title.style.fontSize = '16px';
      title.style.fontWeight = '600';
      title.style.marginBottom = '16px';
      title.style.color = '#fff';
      dialog.appendChild(title);


      // 设置代码样式
      setTimeout(() => {
        try {
          const codeElements = examples.querySelectorAll('code');
          codeElements.forEach(code => {
            code.style.background = 'rgba(255,255,255,.1)';
            code.style.padding = '1px 4px';
            code.style.borderRadius = '2px';
            code.style.fontFamily = 'monospace';
            code.style.fontSize = '10px';
          });
        } catch (_) { }
      }, 0);

      // 创建拖拽滑块
      const { sliderWrap, input } = this._createSlider(dialog);
      dialog.appendChild(sliderWrap);

  // 输入框容器（隐藏，仅保留逻辑用，不显示“框”）
  const inputWrap = document.createElement('div');
  inputWrap.style.marginBottom = '20px';
  inputWrap.style.display = 'none';
      
      input.style.width = '100%';
      input.style.padding = '8px 12px';
      input.style.border = '1px solid rgba(255,255,255,.3)';
      input.style.borderRadius = '6px';
      input.style.background = 'rgba(255,255,255,.1)';
      input.style.color = '#fff';
      input.style.fontSize = '14px';
      input.style.boxSizing = 'border-box';
      input.style.outline = 'none';
      
      // 获取当前值并格式化显示
      await this._loadCurrentShift(ball, input);
      
      // 创建提交函数
      const submitShift = this._createSubmitFunction(ball, input, inputWrap, dialog);

      // 设置输入框事件
      this._setupInputEvents(input, submitShift);
      
      inputWrap.appendChild(input);
      dialog.appendChild(inputWrap);

      // 创建按钮组
      const btnWrap = this._createButtons(input, submitShift, overlay);
      dialog.appendChild(btnWrap);

      overlay.appendChild(dialog);

      // 设置关闭逻辑
      this._setupCloseEvents(overlay, dialog);

      // 添加到页面
      const host = panel || document.body;
      host.appendChild(overlay);
      
      // 聚焦输入框
      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);

    } catch (e) {
      this.logger?.warn?.('[TimeShiftDialog] 显示时间偏移对话框失败', e);
    }
  }

  _createSlider(dialog) {
    // 外层容器
    const sliderWrap = document.createElement('div');
    sliderWrap.style.marginBottom = '16px';
    sliderWrap.style.display = 'flex';
    sliderWrap.style.flexDirection = 'column';
    sliderWrap.style.gap = '8px';

    // 顶部标签（显示当前值）
    const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.flexDirection = 'column';
  topRow.style.justifyContent = 'center';
  topRow.style.alignItems = 'center';
  topRow.style.gap = '4px';
    const label = document.createElement('div');
    label.textContent = '时间偏移';
    label.style.color = 'rgba(255,255,255,.8)';
    label.style.fontSize = '12px';
  const valueEl = document.createElement('div');
  valueEl.textContent = '00:00';
  valueEl.style.color = '#fff';
  valueEl.style.fontSize = '28px';
  valueEl.style.fontWeight = '700';
  valueEl.style.fontFamily = 'monospace';
  valueEl.style.textAlign = 'center';
  valueEl.style.lineHeight = '1.2';
  valueEl.style.letterSpacing = '0.5px';
  valueEl.style.cursor = 'text';
  valueEl.style.outline = 'none';
  valueEl.tabIndex = 0; // 允许获得焦点，便于编辑
    topRow.appendChild(label);
    topRow.appendChild(valueEl);
    sliderWrap.appendChild(topRow);

  // 自定义“回中间”动态控制条
  const BAR_HEIGHT = 28;
  const TRACK_HEIGHT = 6;
  const THUMB_SIZE = 16;
  const MIN_SEC = -Infinity; // 无限制
  const MAX_SEC = Infinity;  // 无限制
  const MAX_RATE = 120; // 边缘处变更速度（秒/秒）
  const EXPONENT = 1.3; // 越远越快的非线性指数

  // 包裹条
  const bar = document.createElement('div');
  bar.style.position = 'relative';
  bar.style.width = '100%';
  bar.style.height = `${BAR_HEIGHT}px`;
  bar.style.userSelect = 'none';
  bar.style.cursor = 'ew-resize';

  // 轨道
  const track = document.createElement('div');
  track.style.position = 'absolute';
  track.style.left = '0';
  track.style.right = '0';
  track.style.top = '50%';
  track.style.transform = 'translateY(-50%)';
  track.style.height = `${TRACK_HEIGHT}px`;
  track.style.background = 'rgba(255,255,255,.2)';
  track.style.borderRadius = '3px';

  // 中心刻度
  const centerTick = document.createElement('div');
  centerTick.style.position = 'absolute';
  centerTick.style.left = '50%';
  centerTick.style.top = '50%';
  centerTick.style.transform = 'translate(-50%, -50%)';
  centerTick.style.width = '2px';
  centerTick.style.height = '14px';
  centerTick.style.background = 'rgba(255,255,255,.35)';
  centerTick.style.borderRadius = '1px';

  // 拇指（拖动句柄）
  const thumb = document.createElement('div');
  thumb.style.position = 'absolute';
  thumb.style.top = '50%';
  thumb.style.left = '50%';
  thumb.style.width = `${THUMB_SIZE}px`;
  thumb.style.height = `${THUMB_SIZE}px`;
  thumb.style.borderRadius = '50%';
  thumb.style.transform = 'translate(-50%, -50%)';
  thumb.style.background = 'linear-gradient(135deg, #ffffff, #d9d9d9)';
  thumb.style.boxShadow = '0 2px 6px rgba(0,0,0,.4)';
  thumb.style.border = '1px solid rgba(0,0,0,.25)';

  // 组装
  bar.appendChild(track);
  bar.appendChild(centerTick);
  bar.appendChild(thumb);
  sliderWrap.appendChild(bar);

    // 输入框（与原实现保持接口一致）
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '0 或 00:01 或 -00:05';

    // 当前值（单位：秒），和拖动状态
    let currentSeconds = 0;
    let dragging = false;
    let norm = 0; // [-1,1]，相对中心的位移比例
    let rafId = null;
    let lastTs = 0;

    // 工具：限制范围
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // 从秒同步到输入框与显示
    const syncFromSeconds = (seconds) => {
      const sec = clamp(Math.round(seconds), MIN_SEC, MAX_SEC);
      const v = this._msToTimeFormat(sec * 1000);
      if (input.value !== v) {
        input.value = v;
        // 通知其他监听，保持与原行为一致
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
      }
      valueEl.textContent = v;
    };

    // 从输入框同步到 currentSeconds
    const syncFromInput = () => {
      try {
        const ms = this._timeFormatToMs(input.value || '0');
        currentSeconds = clamp(Math.round(ms / 1000), MIN_SEC, MAX_SEC);
        valueEl.textContent = this._msToTimeFormat(currentSeconds * 1000);
      } catch (_) {
        // 忽略，待提交时校验
      }
    };

    // 拖动时根据距离计算速度（秒/秒）
    const computeRate = (n) => {
      const s = Math.sign(n);
      const mag = Math.pow(Math.abs(n), EXPONENT); // 非线性加速
      return s * MAX_RATE * mag;
    };

    const updateThumbVisual = () => {
  // 将 norm [-1,1] 映射为百分比位移
      const pct = 50 + norm * 50;
      thumb.style.left = `${pct}%`;
    };

    const snapToCenter = () => {
      norm = 0;
      updateThumbVisual();
    };

    const onPointerMove = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const half = rect.width / 2;
      norm = clamp((clientX - centerX) / half, -1, 1);
      updateThumbVisual();
    };

    const tick = (ts) => {
      if (!dragging) return;
      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;
      // 积分更新当前秒数
      const rate = computeRate(norm);
      currentSeconds = clamp(currentSeconds + rate * dt, MIN_SEC, MAX_SEC);
      syncFromSeconds(currentSeconds);
      rafId = window.requestAnimationFrame(tick);
    };

    const endDrag = async () => {
      if (!dragging) return;
      dragging = false;
      lastTs = 0;
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = null; }
      snapToCenter();
      // 松开时提交
      if (this._submitShift) {
        await this._submitShift(input.value, 'drag-release');
      }
    };

    // 指针事件绑定（鼠标/触摸统一）
    bar.addEventListener('pointerdown', (e) => {
      try { bar.setPointerCapture?.(e.pointerId); } catch (_) {}
      dragging = true;
      lastTs = 0;
      onPointerMove(e.clientX);
      updateThumbVisual();
      rafId = window.requestAnimationFrame(tick);
    });

    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      onPointerMove(e.clientX);
    });

    const cancelEvents = ['pointerup', 'pointercancel', 'pointerleave'];
    cancelEvents.forEach(ev => bar.addEventListener(ev, () => { endDrag(); }));

    // 文本输入时同步当前值
    input.addEventListener('input', syncFromInput);

    // 内联编辑（点击 valueEl 即可编辑 MM:SS，不显示输入框）
    let editing = false;
    let prevText = valueEl.textContent;

    const placeCaretAtEnd = (el) => {
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    };

    const enterEdit = () => {
      if (editing) return;
      editing = true;
      prevText = valueEl.textContent;
      valueEl.contentEditable = 'true';
      valueEl.focus();
      // 选中全部文本，便于直接输入
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(valueEl);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) { placeCaretAtEnd(valueEl); }
    };

    const commitEdit = async () => {
      if (!editing) return;
      const raw = (valueEl.textContent || '').trim();
      try {
        const ms = this._timeFormatToMs(raw || '0');
        const normalized = this._msToTimeFormat(ms);
        // 同步到隐藏 input，保持原有逻辑
        input.value = normalized;
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        valueEl.textContent = normalized;
        // 自动提交，贴合原先 input blur 的行为
        if (this._submitShift) {
          await this._submitShift(input.value, 'value-edit');
        }
      } catch (err) {
        // 无效则还原并闪红提示
        valueEl.textContent = prevText;
        const old = valueEl.style.color;
        valueEl.style.color = 'rgba(255,120,120,0.95)';
        setTimeout(() => { valueEl.style.color = old || '#fff'; }, 900);
      } finally {
        editing = false;
        valueEl.contentEditable = 'false';
      }
    };

    const cancelEdit = () => {
      if (!editing) return;
      valueEl.textContent = prevText;
      editing = false;
      valueEl.contentEditable = 'false';
    };

    valueEl.addEventListener('click', () => enterEdit());
    valueEl.addEventListener('keydown', (e) => {
      if (!editing) return;
      if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    });
    valueEl.addEventListener('blur', () => { if (editing) commitEdit(); });

    // 初始化
    syncFromSeconds(0);
    snapToCenter();

    // 为兼容上层返回结构，返回 bar 作为 slider
  return { sliderWrap, input, slider: bar };
  }

  _msToTimeFormat(ms) {
    const isNegative = ms < 0;
    const absMs = Math.abs(ms);
    const totalSeconds = Math.floor(absMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return isNegative ? `-${formatted}` : formatted;
  }

  _timeFormatToMs(input) {
    const trimmed = input.trim();
    if (!trimmed) return 0;
    
    const isNegative = trimmed.startsWith('-');
    const cleanInput = isNegative ? trimmed.substring(1) : trimmed;
    
  // 检查是否为时间格式 (MM:SS)，分钟不限位数
  const timeMatch = cleanInput.match(/^(\d+):(\d{2})$/);
    if (timeMatch) {
      const minutes = parseInt(timeMatch[1], 10);
      const seconds = parseInt(timeMatch[2], 10);
      if (seconds >= 60) {
        throw new Error('秒数不能超过59');
      }
      const totalMs = (minutes * 60 + seconds) * 1000;
      return isNegative ? -totalMs : totalMs;
    }
    
    // 纯数字，当作秒处理
    const numValue = parseFloat(cleanInput);
    if (isNaN(numValue)) {
      throw new Error('输入格式无效');
    }
    const totalMs = numValue * 1000;
    return isNegative ? -totalMs : totalMs;
  }

  async _loadCurrentShift(ball, input) {
    try {
      const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
      const itemId = g.getMediaId?.();
      if (itemId && typeof ApiClient !== 'undefined' && ApiClient.getUrl) {
        const url = ApiClient.getUrl(`danmaku/source_shift?item_id=${encodeURIComponent(itemId)}`);
        const response = await ApiClient.ajax({
          type: 'GET',
          url,
          dataType: 'json'
        });
        
        if (Array.isArray(response)) {
          const existingShift = response.find(item => item.SourceName === ball.name);
          if (existingShift && existingShift.Shift !== 0) {
            input.value = this._msToTimeFormat(existingShift.Shift);
            try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
          }
        }
      }
    } catch (e) {
      this.logger?.warn?.('[TimeShiftDialog] 获取时间偏移失败', e);
    }
  }

  _createSubmitFunction(ball, input, inputWrap, dialog) {
    const submitShift = async (newValue, source = 'manual') => {
      try {
        let shiftValue;
        try {
          shiftValue = this._timeFormatToMs(newValue);
        } catch (formatError) {
          // 显示格式错误提示
          input.style.borderColor = 'rgba(255, 80, 80, 0.8)';
          input.style.background = 'rgba(255, 80, 80, 0.1)';
          
          // 创建错误提示
          let errorTip = dialog.querySelector('.error-tip');
          if (!errorTip) {
            errorTip = document.createElement('div');
            errorTip.className = 'error-tip';
            errorTip.style.color = 'rgba(255, 120, 120, 0.9)';
            errorTip.style.fontSize = '11px';
            errorTip.style.marginTop = '4px';
            inputWrap.appendChild(errorTip);
          }
          errorTip.textContent = formatError.message || '输入格式错误';
          
          // 3秒后清除错误状态
          setTimeout(() => {
            input.style.borderColor = 'rgba(255,255,255,.3)';
            input.style.background = 'rgba(255,255,255,.1)';
            if (errorTip) {
              errorTip.remove();
            }
          }, 3000);
          
          return false;
        }
        
        const g = window.__jfDanmakuGlobal__ = window.__jfDanmakuGlobal__ || {};
        const itemId = g.getMediaId?.();
        
        if (!itemId) {
          this.logger?.warn?.('[TimeShiftDialog] 无法提交时间偏移：缺少 item_id');
          return false;
        }
        
        if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) {
          this.logger?.warn?.('[TimeShiftDialog] 无法提交时间偏移：缺少 ApiClient');
          return false;
        }

        const url = ApiClient.getUrl('danmaku/source_shift');
        
        const form = new URLSearchParams();
        form.append('item_id', String(itemId));
        form.append('source_name', ball.name);
        form.append('shift', String(shiftValue));
        
        await ApiClient.ajax({
          type: 'POST',
          url,
          data: form.toString(),
          contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
          dataType: 'json'
        });
        
        this.logger?.info?.('[TimeShiftDialog] 时间偏移设置成功', { 
          source: ball.name, 
          shift: shiftValue,
          displayValue: newValue,
          triggerSource: source
        });
        
        // 触发自动保存
        try { 
          await saveIfAutoOn(this.logger); 
        } catch (e) { 
          this.logger?.warn?.('[TimeShiftDialog] 自动保存失败', e); 
        }
        
        return true;
        
      } catch (e) {
        this.logger?.warn?.('[TimeShiftDialog] 提交时间偏移失败', e);
        return false;
      }
    };

    // 保存submitShift引用以供滑块使用
    this._submitShift = submitShift;
    
    return submitShift;
  }

  _setupInputEvents(input, submitShift) {
    // 输入框失去焦点时自动提交
    let lastValue = input.value;
    input.addEventListener('blur', async () => {
      if (input.value !== lastValue) {
        const success = await submitShift(input.value, 'blur');
        if (success) {
          lastValue = input.value;
        }
      }
    });

    // 回车键也触发提交
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        input.blur(); // 触发blur事件来提交
      }
    });
  }

  _createButtons(input, submitShift, overlay) {
    // 按钮容器
    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.gap = '12px';
    btnWrap.style.justifyContent = 'space-between'; // 改为两端对齐
    btnWrap.style.marginTop = '16px';

    // 重置按钮 (放在左边)
    const resetButton = document.createElement('button');
    resetButton.textContent = '重置';
    resetButton.style.padding = '8px 16px';
    resetButton.style.border = '1px solid rgba(255,255,255,.3)';
    resetButton.style.borderRadius = '6px';
    resetButton.style.background = 'rgba(255,80,80,.2)'; // 淡红色背景区分重置功能
    resetButton.style.color = '#fff';
    resetButton.style.cursor = 'pointer';
    resetButton.style.fontSize = '14px';
    resetButton.style.transition = 'all 0.2s ease';
    
    resetButton.addEventListener('mouseenter', () => {
      resetButton.style.background = 'rgba(255,80,80,.3)';
    });
    
    resetButton.addEventListener('mouseleave', () => {
      resetButton.style.background = 'rgba(255,80,80,.2)';
    });
    
    resetButton.addEventListener('click', async () => {
      input.value = '00:00';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const success = await submitShift('00:00', 'reset');
      if (success) {
        // Update lastValue if needed
      }
    });

    // 右侧按钮组容器
    const rightBtnGroup = document.createElement('div');
    rightBtnGroup.style.display = 'flex';
    rightBtnGroup.style.gap = '12px';

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid rgba(255,255,255,.3)';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.background = 'transparent';
    cancelBtn.style.color = '#fff';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.fontSize = '14px';

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '确认';
    confirmBtn.style.padding = '8px 16px';
    confirmBtn.style.border = 'none';
    confirmBtn.style.borderRadius = '6px';
    confirmBtn.style.background = 'linear-gradient(135deg,#3fa9ff,#0c82d8)';
    confirmBtn.style.color = '#fff';
    confirmBtn.style.cursor = 'pointer';
    confirmBtn.style.fontSize = '14px';

    rightBtnGroup.appendChild(cancelBtn);
    rightBtnGroup.appendChild(confirmBtn);
    
    btnWrap.appendChild(resetButton);
    btnWrap.appendChild(rightBtnGroup);

    const closeDialog = () => {
      try {
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      } catch (_) { }
    };

    // 取消按钮事件
    cancelBtn.addEventListener('click', closeDialog);
    
    // 确认按钮事件
    confirmBtn.addEventListener('click', async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '提交中...';
        
        const success = await submitShift(input.value, 'confirm');
        if (success) {
          closeDialog();
        }
        
      } catch (e) {
        this.logger?.warn?.('[TimeShiftDialog] 确认按钮提交失败', e);
      } finally {
        try {
          confirmBtn.disabled = false;
          confirmBtn.textContent = '确认';
        } catch (_) { }
      }
    });

    return btnWrap;
  }

  _setupCloseEvents(overlay, dialog) {
    const closeDialog = () => {
      try {
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
      } catch (_) { }
    };

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });

    // ESC键关闭
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);
  }
}
