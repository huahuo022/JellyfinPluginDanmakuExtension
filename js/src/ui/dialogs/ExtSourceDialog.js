// 添加弹幕源编辑对话框
import { saveIfAutoOn } from "../../api/utils";

export class ExtSourceDialog {
    constructor(logger = null) {
        this.logger = logger;
    }

    async show(opts = {}, panel = null) {
        const { itemId, item = null, onSaved } = opts || {};
        try {
            if (!itemId) return;
            if (typeof ApiClient === 'undefined' || !ApiClient.getUrl) return;

                        // 注入一次性样式：统一下拉框与选项为深色底白字，避免白底白字
                        try {
                                if (!document.getElementById('danmaku-extsrc-style')) {
                                        const styleEl = document.createElement('style');
                                        styleEl.id = 'danmaku-extsrc-style';
                                        styleEl.textContent = `
.danmaku-extsrc-dialog select {
    background-color: rgba(30,30,30,.92) !important;
    color: #fff !important;
    border: 1px solid rgba(255,255,255,.28) !important;
    border-radius: 6px !important;
    padding: 4px 6px !important;
    font-size: 12px !important;
}
.danmaku-extsrc-dialog select:focus {
    outline: none !important;
    box-shadow: 0 0 0 2px rgba(255,255,255,.15) !important;
}
.danmaku-extsrc-dialog option {
    background-color: #1e1e1e !important;
    color: #fff !important;
}
/* 上传区域背景提示 */
.danmaku-extsrc-drop { position: relative; }
.danmaku-extsrc-drop::before {
    content: '点击选择或将文件拖拽到此处';
    position: absolute;
    left: 12px; right: 12px;
    top: 50%; transform: translateY(-50%);
    color: rgba(255,255,255,.45);
    font-size: 12px;
    pointer-events: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.danmaku-extsrc-drop[data-hasfile="true"]::before { content: ''; }
`;
                                        document.head.appendChild(styleEl);
                                }
                        } catch (_) { /* ignore */ }

            // 遮罩
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

            // 对话框（参照 settingsPanel 的尺寸与样式）
            const dialog = document.createElement('div');
            dialog.className = 'danmaku-extsrc-dialog';
            dialog.style.background = 'rgba(0,0,0,.86)';
            dialog.style.backdropFilter = 'blur(6px)';
            dialog.style.border = '1px solid rgba(255,255,255,.18)';
            dialog.style.borderRadius = '10px';
            dialog.style.boxShadow = '0 8px 28px -6px rgba(0,0,0,.55), 0 4px 10px -2px rgba(0,0,0,.5)';
            dialog.style.padding = '12px 14px';
            dialog.style.color = '#fff';
            dialog.style.fontSize = '12px';
            dialog.style.width = 'clamp(320px, 70vw, 380px)';
            dialog.style.maxWidth = '90vw';
            dialog.style.boxSizing = 'border-box';
            dialog.style.maxHeight = 'min(70vh, 520px)';
            dialog.style.overflowY = 'auto';

            // 标题
            const title = document.createElement('div');
            title.textContent = item ? `编辑弹幕源 - ${item.SourceName}` : '新增弹幕源';
            title.style.fontSize = '14px';
            title.style.fontWeight = '600';
            title.style.marginBottom = '8px';
            title.style.color = '#fff';
            dialog.appendChild(title);

            // 表单行
            const createRow = (labelText) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '10px';
                row.style.marginBottom = '10px';
                const lab = document.createElement('div');
                lab.style.minWidth = '96px';
                lab.style.opacity = '.9';
                lab.textContent = labelText;
                row.appendChild(lab);
                return { row, lab };
            };

            const nameRow = createRow('来源名称');
            const txtName = document.createElement('input');
            txtName.type = 'text';
            txtName.placeholder = '例如：ext_bilibili';
            Object.assign(txtName.style, { background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.25)', borderRadius: '6px', padding: '4px 6px', color: '#fff', flex: '1', fontSize: '12px' });
            txtName.value = item?.SourceName || '';
            txtName.disabled = !!item; // 修改时不可改名
            nameRow.row.appendChild(txtName);
            dialog.appendChild(nameRow.row);

            const typeRow = createRow('类型');
            const selType = document.createElement('select');
            // 使用注入样式统一外观，避免被全局样式覆盖
            for (const opt of [{ value: 'url', label: '链接' }, { value: 'file', label: '文件' }]) {
                const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; selType.appendChild(o);
            }
            selType.value = item?.Type || 'url';
            typeRow.row.appendChild(selType);
            dialog.appendChild(typeRow.row);

            const srcRow = createRow('来源');
            const txtSource = document.createElement('input');
            txtSource.type = 'text';
            txtSource.placeholder = 'URL 或 文件路径';
            Object.assign(txtSource.style, { background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.25)', borderRadius: '6px', padding: '4px 6px', color: '#fff', flex: '1', fontSize: '12px' });
            txtSource.value = item?.Source || '';
            srcRow.row.appendChild(txtSource);
            dialog.appendChild(srcRow.row);

            // 文件上传区域（仅当 Type = file 显示）
            const uploadWrap = document.createElement('div');
            uploadWrap.style.display = 'none';
            uploadWrap.style.margin = '-4px 0 8px 96px'; // 与 label 对齐
            const dropZone = document.createElement('div');
            dropZone.style.border = '1px dashed rgba(255,255,255,.28)';
            dropZone.style.borderRadius = '8px';
            dropZone.style.padding = '10px';
            dropZone.style.background = 'rgba(255,255,255,.06)';
            dropZone.style.color = '#fff';
            dropZone.style.cursor = 'pointer';
            dropZone.style.userSelect = 'none';
            dropZone.style.display = 'flex';
            dropZone.style.alignItems = 'center';
            dropZone.style.gap = '8px';
            dropZone.classList.add('danmaku-extsrc-drop');
            dropZone.setAttribute('data-hasfile', 'false');
            const iconSpan = document.createElement('span');
            iconSpan.textContent = '📄';
            const tipSpan = document.createElement('span');
            tipSpan.textContent = '点击选择或将文件拖拽到此处';
            tipSpan.style.opacity = '.9';
            tipSpan.style.fontSize = '12px';
            const fileNameSpan = document.createElement('span');
            fileNameSpan.style.marginLeft = 'auto';
            fileNameSpan.style.fontSize = '12px';
            fileNameSpan.style.opacity = '.85';
            dropZone.appendChild(iconSpan);
            // 文案改为背景提示，通过 ::before 实现，这里不再插入 tipSpan
            dropZone.appendChild(fileNameSpan);
            const statusSpan = document.createElement('div');
            statusSpan.style.marginTop = '6px';
            statusSpan.style.fontSize = '12px';
            statusSpan.style.opacity = '.85';
            statusSpan.textContent = '';
            uploadWrap.appendChild(dropZone);
            uploadWrap.appendChild(statusSpan);
            dialog.appendChild(uploadWrap);

            // 延迟上传：增加“上传”按钮（初始禁用，选择文件后启用），放在文件框下方并占满宽度
            const btnUpload = document.createElement('button');
            btnUpload.type = 'button';
            btnUpload.textContent = '上传';
            Object.assign(btnUpload.style, {
                cursor: 'pointer', fontSize: '13px', borderRadius: '6px', padding: '10px 12px',
                border: '1px solid rgba(60,180,110,.8)', background: 'linear-gradient(90deg, rgba(50,160,95,.85), rgba(40,140,85,.85))',
                color: '#eafff2', fontWeight: '600', marginTop: '8px', width: '100%',
                boxShadow: '0 2px 6px -2px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08) inset',
                opacity: '.55', transition: 'background .15s ease, opacity .15s ease'
            });
            btnUpload.disabled = true;
            btnUpload.onmouseenter = () => { if (!btnUpload.disabled) btnUpload.style.background = 'linear-gradient(90deg, rgba(60,190,120,.9), rgba(50,170,105,.9))'; };
            btnUpload.onmouseleave = () => { if (!btnUpload.disabled) btnUpload.style.background = 'linear-gradient(90deg, rgba(50,160,95,.85), rgba(40,140,85,.85))'; };
            // 重新组织顺序：dropZone -> btnUpload -> statusSpan
            uploadWrap.appendChild(btnUpload);
            uploadWrap.appendChild(statusSpan);

            let pendingFile = null; // 记录已选择但尚未上传的文件

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            // 限制常见弹幕/字幕文件类型，用户可切换为“所有文件”依然可选
            try { fileInput.accept = '.xml,.json,.ass,.ssa,.srt'; } catch (_) { }
            fileInput.style.display = 'none';
            // 可根据需要限制扩展名，例如 .xml/.json/.ass 等，这里先不限制
            dialog.appendChild(fileInput);

            const setUploadVisible = () => {
                const isFile = selType.value === 'file';
                uploadWrap.style.display = isFile ? 'block' : 'none';
                // 文件模式：Source 自动填入，不允许手动修改
                txtSource.readOnly = isFile;
                if (isFile) {
                    txtSource.placeholder = '上传成功后将自动填入';
                    txtSource.style.background = 'rgba(255,255,255,.06)';
                } else {
                    txtSource.placeholder = '请输入 URL（http/https）';
                    txtSource.style.background = 'rgba(255,255,255,.1)';
                }
            };
            setUploadVisible();

            const setStatus = (msg, color = 'rgba(255,255,255,.85)') => {
                statusSpan.textContent = msg || '';
                statusSpan.style.color = color;
            };

            const doUpload = async () => {
                if (!pendingFile) { setStatus('请先选择文件', 'rgba(255,180,120,.9)'); return; }
                const file = pendingFile;
                const sourceName = (txtName.value || '').trim();
                if (!sourceName) {
                    setStatus('请先填写 SourceName 再上传文件', 'rgba(255,120,120,.9)');
                    try { txtName.focus(); } catch (_) { }
                    return;
                }
                btnUpload.disabled = true; btnUpload.style.opacity = '.55';
                setStatus('正在上传...');
                try {
                    const url = ApiClient.getUrl('danmaku/upload_file');
                    const contentBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result || ''));
                        reader.onerror = () => reject(reader.error || new Error('read error'));
                        reader.readAsDataURL(file);
                    });
                    const payload = { itemId: String(itemId), sourceName, contentBase64 };
                    const data = await ApiClient.ajax({ type: 'POST', url, data: JSON.stringify(payload), contentType: 'application/json; charset=UTF-8', dataType: 'json' });
                    const p = data && (data.path || data.Path || data.url || data.URL);
                    if (!p) throw new Error('服务未返回 path');
                    txtSource.value = String(p);
                    setStatus('上传成功，已填入 Source');
                    // 成功后可以允许再次上传替换：保留 pendingFile，启用按钮
                    btnUpload.disabled = false; btnUpload.style.opacity = '1';
                } catch (e) {
                    this.logger?.warn?.('[ExtSourceDialog] 文件上传失败', e);
                    let msg = '';
                    try {
                        if (e?.responseText) {
                            try { const j = JSON.parse(e.responseText); msg = j?.message || e.statusText || e.message || ''; }
                            catch { msg = e.responseText || e.statusText || e.message || ''; }
                        } else { msg = e?.statusText || e?.message || ''; }
                    } catch (_) { }
                    setStatus(`上传失败${msg ? `：${String(msg)}` : ''}`, 'rgba(255,120,120,.9)');
                    btnUpload.disabled = false; btnUpload.style.opacity = '1';
                }
            };

            btnUpload.onclick = () => { doUpload(); };

            const setPendingFile = (file) => {
                if (!file) return;
                pendingFile = file;
                fileNameSpan.textContent = file.name;
                dropZone.setAttribute('data-hasfile', 'true');
                // 规则：
                // 1) 若来源名称为空，则直接使用文件名
                // 2) 若来源名称非空，检查是否已以相同后缀结尾；若没有或不同则追加 .ext
                try {
                    if (!item && !txtName.disabled) { // 仅在“新增”模式下自动填充
                        const cur = (txtName.value || '').trim();
                        const lastDot = file.name.lastIndexOf('.');
                        const ext = (lastDot > 0 && lastDot < file.name.length - 1) ? file.name.slice(lastDot + 1) : '';
                        if (!cur) {
                            txtName.value = file.name; // 直接使用完整文件名
                        } else if (ext) {
                            const lowerCur = cur.toLowerCase();
                            if (!lowerCur.endsWith('.' + ext.toLowerCase())) {
                                txtName.value = cur + '.' + ext;
                            }
                        }
                    }
                } catch (_) { /* 忽略自动命名异常 */ }
                setStatus('已选择文件，点击“上传”开始上传');
                btnUpload.disabled = false; btnUpload.style.opacity = '1';
            };

            // 交互：点击区域 = 触发文件选择
            dropZone.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const f = fileInput.files && fileInput.files[0];
                if (f) setPendingFile(f);
            });
            // 拖拽上传
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = 'rgba(255,255,255,.12)'; });
            dropZone.addEventListener('dragleave', () => { dropZone.style.background = 'rgba(255,255,255,.06)'; });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault(); dropZone.style.background = 'rgba(255,255,255,.06)';
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) setPendingFile(f);
            });
            selType.addEventListener('change', setUploadVisible);

            // 切换类型时重置状态
            selType.addEventListener('change', () => {
                if (selType.value !== 'file') {
                    pendingFile = null;
                    fileNameSpan.textContent = '';
                    dropZone.setAttribute('data-hasfile', 'false');
                    setStatus('');
                    btnUpload.disabled = true; btnUpload.style.opacity = '.55';
                }
            });

            // 启用状态移至外层列表进行切换，这里不包含启用控件

            // 按钮
            const btns = document.createElement('div');
            btns.style.display = 'flex';
            btns.style.justifyContent = 'flex-end';
            btns.style.gap = '10px';
            const btnCancel = document.createElement('button');
            const btnSave = document.createElement('button');
            for (const b of [btnCancel, btnSave]) {
                b.type = 'button'; b.style.cursor = 'pointer'; b.style.fontSize = '12px'; b.style.borderRadius = '6px'; b.style.padding = '6px 10px'; b.style.border = '1px solid rgba(255,255,255,.25)'; b.style.background = 'rgba(255,255,255,.08)'; b.style.color = '#fff';
                b.onmouseenter = () => b.style.background = 'rgba(255,255,255,.15)';
                b.onmouseleave = () => b.style.background = 'rgba(255,255,255,.08)';
            }
            btnCancel.textContent = '取消';
            btnSave.textContent = '保存';
            btns.appendChild(btnCancel);
            btns.appendChild(btnSave);
            dialog.appendChild(btns);

            // 事件
            const close = () => { try { overlay.remove(); } catch (_) { } };
            btnCancel.onclick = () => close();
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            btnSave.onclick = async () => {
                try {
                    const sourceName = (txtName.value || '').trim();
                    if (!sourceName) { txtName.style.borderColor = 'rgba(255,80,80,.8)'; setTimeout(() => { txtName.style.borderColor = 'rgba(255,255,255,.25)'; }, 1500); return; }
                    const type = selType.value || 'url';
                    const source = (txtSource.value || '').trim();
                    // 启用状态由外层控制：编辑时沿用原状态；新增默认启用
                    const enable = item?.Enable ?? true;

                    const url = ApiClient.getUrl('danmaku/ext_source');
                    const form = new URLSearchParams();
                    form.append('item_id', String(itemId));
                    form.append('source_name', sourceName);
                    form.append('type', type);
                    form.append('source', source);
                    form.append('enable', String(enable));
                    await ApiClient.ajax({ type: 'POST', url, data: form.toString(), contentType: 'application/x-www-form-urlencoded; charset=UTF-8', dataType: 'json' });
                    // POST 成功后触发一次自动保存
                    try { await saveIfAutoOn(); } catch (_) { }
                    // 派发全局事件：外部弹幕源已保存，供小球页面监听重建
                    try {
                        const evt = new Event('danmaku-ext-source-saved');
                        window.dispatchEvent(evt);
                    } catch (_) { }
                    if (typeof onSaved === 'function') await onSaved();
                    close();
                } catch (e) {
                    this.logger?.warn?.('[ExtSourceDialog] 保存失败', e);
                }
            };

            // 将对话框挂载到遮罩，再挂到页面
            overlay.appendChild(dialog);
            (panel || document.body).appendChild(overlay);
            setTimeout(() => { try { (item ? txtSource : txtName).focus(); } catch (_) { } }, 50);
        } catch (e) {
            this.logger?.warn?.('[ExtSourceDialog] 显示失败', e);
        }
    }
}
