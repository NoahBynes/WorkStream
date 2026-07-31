// localStorage 配置 + 通用工具函数

const store = {
    get(key, defaultValue = null) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : defaultValue;
        } catch { return defaultValue; }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) { localStorage.removeItem(key); }
};

// 主题管理
function getTheme() { return store.get('theme', 'light'); }
function setTheme(theme) {
    store.set('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#6366f1');
}
function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}

// Toast 通知
function toast(message, type = 'info', duration = 2500) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        el.style.transition = 'all 0.25s';
        setTimeout(() => el.remove(), 250);
    }, duration);
}

// 日期工具（统一使用本地时区，避免 toISOString() 返回 UTC 导致时区错乱）
const date = {
    today() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    now() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },
    format(iso, withTime = false) {
        if (!iso) return '';
        // 兼容 "YYYY-MM-DD HH:mm:ss" 和 ISO 8601 两种格式
        const d = iso.includes('T') ? new Date(iso) : new Date(iso.replace(' ', 'T'));
        if (isNaN(d.getTime())) return iso;
        const pad = n => String(n).padStart(2, '0');
        let s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (withTime) s += ` ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        return s;
    },
    monthStart() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    },
    monthEnd() {
        const d = new Date();
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(last)}`;
    },
    daysAgo(n) {
        const d = new Date();
        d.setDate(d.getDate() - n);
        const pad = x => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    // 本周一（周一为一周开始）
    weekStart() {
        const d = new Date();
        const day = d.getDay();  // 0=周日, 1=周一...
        const diff = day === 0 ? 6 : day - 1;  // 距周一的天数
        d.setDate(d.getDate() - diff);
        const pad = x => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    // 获取当前时区显示名（如 "Asia/Shanghai (UTC+8)"）
    timezone() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '本地';
            const offset = -new Date().getTimezoneOffset() / 60;
            const sign = offset >= 0 ? '+' : '';
            return `${tz} (UTC${sign}${offset})`;
        } catch (e) {
            return '本地时区';
        }
    }
};

// HTML 转义
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 货币格式化
function formatMoney(n) {
    return '¥' + Number(n || 0).toFixed(2);
}

// 确认对话框（Promise）
function confirmDialog(message) {
    return Promise.resolve(window.confirm(message));
}

// 输入对话框（Promise）- 替代 prompt()
// 支持多字段：fields 为 [{key, label, placeholder, type, default}] 数组
// 返回 {values: {...}, cancelled: bool}
function formDialog({ title, fields, submitText = '确定', cancelText = '取消' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:300;display:flex;align-items:center;justify-content:center;padding:20px';
        const fieldHtml = fields.map(f => {
            if (f.options) {
                // select 类型字段
                const opts = f.options.map(o => {
                    const val = typeof o === 'object' ? o.value : o;
                    const txt = typeof o === 'object' ? o.label : o;
                    const sel = val === f.default ? 'selected' : '';
                    return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(txt)}</option>`;
                }).join('');
                return `
                    <div class="field">
                        ${f.label ? `<label class="field-label">${f.label}</label>` : ''}
                        <select class="select" id="fd-${f.key}">${opts}</select>
                    </div>
                `;
            }
            const stepAttr = f.type === 'number' ? ` step="${f.step || 'any'}" inputmode="decimal"` : '';  // number 字段允许小数
            return `
                <div class="field">
                    ${f.label ? `<label class="field-label">${f.label}</label>` : ''}
                    <input class="input" id="fd-${f.key}" type="${f.type || 'text'}" placeholder="${f.placeholder || ''}" value="${f.default != null ? f.default : ''}"${stepAttr}>
                </div>
            `;
        }).join('');
        overlay.innerHTML = `
            <div class="card" style="max-width:440px;width:100%">
                <div class="card-title"><span>${title}</span><button class="btn btn-sm btn-ghost" id="fd-close">✕</button></div>
                <form id="fd-form">
                    ${fieldHtml}
                    <div class="flex gap-2 mt-3">
                        <button class="btn btn-secondary flex-1" type="button" id="fd-cancel">${cancelText}</button>
                        <button class="btn flex-1" type="submit">${submitText}</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        const firstInput = overlay.querySelector('input');
        if (firstInput) { firstInput.focus(); firstInput.select(); }

        const close = (result) => { overlay.remove(); resolve(result); };

        const collect = () => {
            const values = {};
            fields.forEach(f => {
                const el = overlay.querySelector(`#fd-${f.key}`);
                let v = el.value.trim();
                if (f.type === 'number') v = v === '' ? null : parseFloat(v);
                values[f.key] = v;
            });
            return values;
        };

        overlay.querySelector('#fd-form').addEventListener('submit', (e) => {
            e.preventDefault();
            close({ values: collect(), cancelled: false });
        });
        overlay.querySelector('#fd-cancel').addEventListener('click', () => close({ values: {}, cancelled: true }));
        overlay.querySelector('#fd-close').addEventListener('click', () => close({ values: {}, cancelled: true }));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close({ values: {}, cancelled: true }); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close({ values: {}, cancelled: true }); });
    });
}

// 单字段输入对话框（Promise）- 返回 string 或 null（取消）
async function promptDialog(message, defaultValue = '') {
    const r = await formDialog({
        title: message,
        fields: [{ key: 'v', default: defaultValue }],
        submitText: '确定'
    });
    return r.cancelled ? null : r.values.v;
}

export { store, getTheme, setTheme, toggleTheme, toast, date, escapeHtml, formatMoney, confirmDialog, formDialog, promptDialog };
