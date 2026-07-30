// 通用快速记录组件 - 一入口覆盖学习/身材/财务
import { dbAdd, genId } from '../db.js';
import { date, toast, formDialog, escapeHtml } from '../store.js';

const CATEGORIES = {
    expense: ['🍽️ 餐饮', '🚗 交通', '🛒 购物', '🏠 居家', '💊 医疗', '🎬 娱乐', '📚 学习', '🎁 礼物', '💡 其他'],
    income: ['💰 工资', '💼 兼职', '📈 投资', '🎁 红包', '💡 其他']
};

// 打开快速记录选择菜单
export function openQuickRecord() {
    const overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    overlay.innerHTML = `
        <div class="qr-modal">
            <div class="qr-header">
                <span class="qr-title">⚡ 快速记录</span>
                <button class="btn btn-sm btn-ghost" id="qr-close">✕</button>
            </div>
            <div class="qr-grid">
                <button class="qr-item" data-type="task"><span class="qr-icon">📚</span><span>学习任务</span></button>
                <button class="qr-item" data-type="weight"><span class="qr-icon">⚖️</span><span>记体重</span></button>
                <button class="qr-item" data-type="expense"><span class="qr-icon">📉</span><span>记支出</span></button>
                <button class="qr-item" data-type="income"><span class="qr-icon">📈</span><span>记收入</span></button>
                <button class="qr-item" data-type="debt"><span class="qr-icon">💳</span><span>记债务</span></button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#qr-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('.qr-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            close();
            const type = btn.dataset.type;
            try {
                await handleRecord(type);
            } catch (err) {
                toast('操作失败: ' + err.message, 'error');
            }
        });
    });
}

// 直接按类型打开快速记录表单（仪表盘快捷条用）
export async function openQuickRecordType(type) {
    try {
        await handleRecord(type);
    } catch (err) {
        toast('操作失败: ' + err.message, 'error');
    }
}

async function handleRecord(type) {
    if (type === 'task') {
        const r = await formDialog({
            title: '📚 添加学习任务',
            fields: [
                { key: 'title', label: '任务标题', placeholder: '必填' },
                { key: 'subject', label: '科目/标签', placeholder: '可选' }
            ],
            submitText: '添加'
        });
        if (r.cancelled || !r.values.title) return;
        await dbAdd('study_tasks', {
            id: genId(), title: r.values.title, subject: r.values.subject,
            priority: 'medium', done: false, date: date.today(), createdAt: date.now()
        });
        toast('学习任务已添加', 'success');
    } else if (type === 'weight') {
        const r = await formDialog({
            title: '⚖️ 记录体重',
            fields: [
                { key: 'value', label: '体重 (kg)', type: 'number', placeholder: '例如 65.5' },
                { key: 'note', label: '备注', placeholder: '可选，如 晨起空腹' }
            ],
            submitText: '保存'
        });
        if (r.cancelled || !r.values.value) return;
        await dbAdd('fitness_records', {
            id: genId(), type: 'weight', value: parseFloat(r.values.value),
            note: r.values.note, date: date.today(), createdAt: date.now()
        });
        toast('体重已记录', 'success');
    } else if (type === 'expense' || type === 'income') {
        const cats = CATEGORIES[type];
        const r = await formDialog({
            title: type === 'expense' ? '📉 记一笔支出' : '📈 记一笔收入',
            fields: [
                { key: 'amount', label: '金额 (¥)', type: 'number', placeholder: '0.00' },
                { key: 'category', label: '分类（可选，留空默认"其他"）', placeholder: cats.join(' / ') },
                { key: 'note', label: '备注', placeholder: '可选' }
            ],
            submitText: '保存'
        });
        if (r.cancelled || !r.values.amount) return;
        let category = r.values.category;
        if (!category || !cats.includes(category)) category = '💡 其他';
        await dbAdd('finance_records', {
            id: genId(), type, amount: parseFloat(r.values.amount),
            category, date: date.today(), note: r.values.note, createdAt: date.now()
        });
        toast('已保存', 'success');
    } else if (type === 'debt') {
        const r = await formDialog({
            title: '💳 记一笔债务',
            fields: [
                { key: 'name', label: '债务名称', placeholder: '如 花呗/信用卡/借款' },
                { key: 'creditor', label: '债权人（可选）', placeholder: '如 某某银行/张三' },
                { key: 'totalAmount', label: '债务总额 (¥)', type: 'number', placeholder: '0.00' },
                { key: 'paidAmount', label: '已还金额 (¥)', type: 'number', default: '0' },
                { key: 'dueDate', label: '到期日', type: 'date' },
                { key: 'note', label: '备注', placeholder: '可选' }
            ],
            submitText: '保存'
        });
        if (r.cancelled || !r.values.name || !r.values.totalAmount) return;
        await dbAdd('finance_debts', {
            id: genId(), name: r.values.name, creditor: r.values.creditor,
            totalAmount: parseFloat(r.values.totalAmount),
            paidAmount: parseFloat(r.values.paidAmount) || 0,
            dueDate: r.values.dueDate, note: r.values.note,
            status: 'active', createdAt: date.now()
        });
        toast('债务已记录', 'success');
    }

    // 触发页面刷新（如果在对应页面）
    if (typeof window !== 'undefined') {
        const hash = location.hash.replace('#/', '');
        if (['dashboard', 'study', 'fitness', 'finance'].includes(hash)) {
            setTimeout(() => location.reload(), 300);
        }
    }
}
