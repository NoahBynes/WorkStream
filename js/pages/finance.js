// 财务规划 - 收支记账 + 债务管理 + 分类统计 + 月度报表
import { dbGetAll, dbGetByIndex, dbAdd, dbPut, dbDelete, genId } from '../db.js';
import { date, escapeHtml, toast, formatMoney, confirmDialog, store, formDialog } from '../store.js';

const CATEGORIES = {
    expense: ['🍽️ 餐饮', '🚗 交通', '🛒 购物', '🏠 居家', '💊 医疗', '🎬 娱乐', '📚 学习', '🎁 礼物', '💡 其他'],
    income: ['💰 工资', '💼 兼职', '📈 投资', '🎁 红包', '💡 其他']
};

export default async function renderFinance(container) {
    const monthStart = date.monthStart();
    const monthEnd = date.monthEnd();
    const records = await dbGetByIndex('finance_records', 'date', IDBKeyRange.bound(monthStart, monthEnd + '\uffff'));
    const allRecords = await dbGetAll('finance_records');
    const debts = await dbGetAll('finance_debts');
    const budget = store.get('finance_budget', { monthly: 0 });

    const income = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const expense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const balance = income - expense;
    const budgetUsed = budget.monthly > 0 ? (expense / budget.monthly * 100) : 0;

    // 债务统计
    const activeDebts = debts.filter(d => d.status === 'active');
    const totalDebt = activeDebts.reduce((s, d) => s + (d.totalAmount - (d.paidAmount || 0)), 0);
    const today = date.today();
    const dueSoon = activeDebts.filter(d => d.dueDate && d.dueDate >= today && d.dueDate <= date.daysAgo(-7)).length;
    const overdue = activeDebts.filter(d => d.dueDate && d.dueDate < today).length;

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">💰 财务规划</div>
                <div class="page-subtitle">${date.format(monthStart).slice(0, 7)} · 收支记账 · 债务管理 · 预算</div>
            </div>
            <button class="btn btn-secondary" id="btn-budget">⚙️ 预算设置</button>
        </div>

        <div class="grid grid-4 mb-4">
            <div class="stat-card">
                <div class="stat-label">本月收入</div>
                <div class="stat-icon">📈</div>
                <div class="stat-value text-success">${formatMoney(income)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">本月支出</div>
                <div class="stat-icon">📉</div>
                <div class="stat-value text-danger">${formatMoney(expense)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">本月结余</div>
                <div class="stat-icon">💰</div>
                <div class="stat-value ${balance >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(balance)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">预算使用</div>
                <div class="stat-icon">🎯</div>
                <div class="stat-value ${budgetUsed > 100 ? 'text-danger' : ''}">${budget.monthly > 0 ? budgetUsed.toFixed(0) + '%' : '未设'}</div>
                <div class="progress mt-2"><div class="progress-bar" style="width:${Math.min(budgetUsed, 100)}%;background:${budgetUsed > 100 ? 'var(--danger)' : 'var(--primary)'}"></div></div>
            </div>
        </div>

        <div class="grid grid-2">
            <div class="card">
                <div class="card-title"><span>📝 记一笔</span></div>
                <form id="finance-form">
                    <div class="flex gap-2 mb-3">
                        <button type="button" class="btn flex-1" data-type="expense" id="type-expense">📉 支出</button>
                        <button type="button" class="btn btn-secondary flex-1" data-type="income" id="type-income">📈 收入</button>
                    </div>
                    <div class="field">
                        <label class="field-label">金额 (¥)</label>
                        <input class="input" type="number" step="0.01" id="amount" placeholder="0.00" required>
                    </div>
                    <div class="field">
                        <label class="field-label">分类</label>
                        <select class="select" id="category"></select>
                    </div>
                    <div class="flex gap-2">
                        <div class="field" style="flex:1">
                            <label class="field-label">日期</label>
                            <input class="input" type="date" id="date" value="${date.today()}">
                        </div>
                        <div class="field" style="flex:1">
                            <label class="field-label">备注</label>
                            <input class="input" id="note" placeholder="可选">
                        </div>
                    </div>
                    <button class="btn w-full" type="submit">保存</button>
                </form>
            </div>

            <div class="card">
                <div class="card-title"><span>📊 支出分类</span></div>
                <div style="height:280px"><canvas id="categoryChart"></canvas></div>
            </div>
        </div>

        <div class="card mt-4">
            <div class="card-title">
                <span>💳 债务管理</span>
                <div class="actions">
                    <span class="text-muted text-sm">待还 ${formatMoney(totalDebt)}</span>
                    <button class="btn btn-sm" id="btn-add-debt">➕ 添加债务</button>
                </div>
            </div>
            <div class="grid grid-3 mb-3">
                <div class="stat-card">
                    <div class="stat-label">待还总额</div>
                    <div class="stat-value text-danger">${formatMoney(totalDebt)}</div>
                    <div class="stat-trend">${activeDebts.length} 笔进行中</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">即将到期</div>
                    <div class="stat-value ${dueSoon > 0 ? 'text-warning' : ''}">${dueSoon}</div>
                    <div class="stat-trend">7 天内到期</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">已逾期</div>
                    <div class="stat-value ${overdue > 0 ? 'text-danger' : ''}">${overdue}</div>
                    <div class="stat-trend">需尽快处理</div>
                </div>
            </div>
            <div id="debt-list"></div>
        </div>

        <div class="card mt-4">
            <div class="card-title">
                <span>📋 本月明细</span>
                <span class="text-muted text-sm">共 ${records.length} 条</span>
            </div>
            <div style="overflow-x:auto">
                <table class="table">
                    <thead><tr><th>日期</th><th>类型</th><th>分类</th><th>金额</th><th>备注</th><th></th></tr></thead>
                    <tbody id="record-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    updateCategoryOptions('expense');
    renderCategoryChart(records);
    renderRecordTable(records);
    renderDebtList(debts);
    bindEvents();
}

function updateCategoryOptions(type) {
    const sel = document.getElementById('category');
    sel.innerHTML = CATEGORIES[type].map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderCategoryChart(records) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    const expenses = records.filter(r => r.type === 'expense');
    const byCategory = {};
    expenses.forEach(r => { byCategory[r.category] = (byCategory[r.category] || 0) + r.amount; });
    const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        ctx.parentElement.innerHTML = '<div class="empty"><div class="empty-icon">📊</div><div>暂无支出数据</div></div>';
        return;
    }
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: entries.map(e => e[0]),
            datasets: [{
                data: entries.map(e => e[1]),
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 12 }, padding: 10 } },
                tooltip: { callbacks: { label: (c) => `${c.label}: ${formatMoney(c.parsed)}` } }
            }
        }
    });
}

function renderRecordTable(records) {
    const tbody = document.getElementById('record-tbody');
    if (!tbody) return;
    const sorted = records.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:30px">暂无记录，先记一笔吧</td></tr>';
        return;
    }
    tbody.innerHTML = sorted.map(r => `
        <tr>
            <td>${date.format(r.date)}</td>
            <td><span class="tag ${r.type === 'income' ? 'tag-income' : 'tag-expense'}">${r.type === 'income' ? '收入' : '支出'}</span></td>
            <td>${escapeHtml(r.category)}</td>
            <td class="${r.type === 'income' ? 'text-success' : 'text-danger'}">${r.type === 'income' ? '+' : '-'}${formatMoney(r.amount)}</td>
            <td class="text-muted">${escapeHtml(r.note || '')}</td>
            <td><button class="btn btn-sm btn-ghost" data-del="${r.id}">删除</button></td>
        </tr>
    `).join('');
}

// ============ 债务管理 ============
function renderDebtList(debts) {
    const el = document.getElementById('debt-list');
    if (!el) return;
    const today = date.today();
    const sorted = debts.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
    if (sorted.length === 0) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">💳</div><div>暂无债务记录</div></div>';
        return;
    }
    el.innerHTML = sorted.map(d => {
        const remaining = d.totalAmount - (d.paidAmount || 0);
        const paidPercent = d.totalAmount > 0 ? ((d.paidAmount || 0) / d.totalAmount * 100) : 0;
        const isOverdue = d.status === 'active' && d.dueDate && d.dueDate < today;
        const isDueSoon = d.status === 'active' && d.dueDate && d.dueDate >= today && d.dueDate <= date.daysAgo(-7);
        const isDone = d.status === 'paid' || remaining <= 0;
        let statusTag = '';
        if (isDone) statusTag = '<span class="tag" style="background:var(--success);color:#fff">✅ 已还清</span>';
        else if (isOverdue) statusTag = '<span class="tag" style="background:var(--danger);color:#fff">⚠️ 已逾期</span>';
        else if (isDueSoon) statusTag = '<span class="tag" style="background:var(--warning);color:#fff">⏰ 即将到期</span>';
        else statusTag = '<span class="tag">进行中</span>';

        return `
            <div class="list-item" style="flex-direction:column;align-items:stretch;${isDone ? 'opacity:0.6' : ''}">
                <div class="flex-between w-full">
                    <div style="flex:1">
                        <div class="font-bold">${escapeHtml(d.name)} ${statusTag}</div>
                        <div class="text-sm text-muted">
                            ${d.creditor ? `债权人：${escapeHtml(d.creditor)} · ` : ''}
                            ${d.dueDate ? `到期：${date.format(d.dueDate)}` : '无到期日'}
                            ${d.note ? ` · ${escapeHtml(d.note)}` : ''}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-danger font-bold">${formatMoney(remaining)}</div>
                        <div class="text-sm text-muted">/ ${formatMoney(d.totalAmount)}</div>
                    </div>
                </div>
                <div class="mt-2">
                    <div class="progress"><div class="progress-bar" style="width:${paidPercent}%;background:${isDone ? 'var(--success)' : 'var(--primary)'}"></div></div>
                    <div class="flex-between text-sm text-muted mt-1">
                        <span>已还 ${formatMoney(d.paidAmount || 0)} (${paidPercent.toFixed(0)}%)</span>
                    </div>
                </div>
                ${!isDone ? `
                    <div class="flex gap-2 mt-2">
                        <button class="btn btn-sm flex-1" data-repay="${d.id}">💰 还款</button>
                        <button class="btn btn-sm btn-ghost" data-edit-debt="${d.id}">编辑</button>
                        <button class="btn btn-sm btn-ghost" data-del-debt="${d.id}">删除</button>
                    </div>
                ` : `
                    <div class="flex gap-2 mt-2 justify-end">
                        <button class="btn btn-sm btn-ghost" data-edit-debt="${d.id}">编辑</button>
                        <button class="btn btn-sm btn-ghost" data-del-debt="${d.id}">删除</button>
                    </div>
                `}
            </div>
        `;
    }).join('');

    el.querySelectorAll('[data-repay]').forEach(btn => {
        btn.addEventListener('click', () => repayDebt(debts.find(d => d.id === btn.dataset.repay)));
    });
    el.querySelectorAll('[data-edit-debt]').forEach(btn => {
        btn.addEventListener('click', () => editDebt(debts.find(d => d.id === btn.dataset.editDebt)));
    });
    el.querySelectorAll('[data-del-debt]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await confirmDialog('删除此债务记录？')) {
                await dbDelete('finance_debts', btn.dataset.delDebt);
                toast('已删除');
                refresh();
            }
        });
    });
}

async function addDebt(existing) {
    const r = await formDialog({
        title: existing ? '✏️ 编辑债务' : '➕ 添加债务',
        fields: [
            { key: 'name', label: '债务名称', default: existing?.name || '', placeholder: '如 花呗/信用卡/借款' },
            { key: 'creditor', label: '债权人（可选）', default: existing?.creditor || '', placeholder: '如 某某银行/张三' },
            { key: 'totalAmount', label: '债务总额 (¥)', type: 'number', default: existing?.totalAmount || '', placeholder: '0.00' },
            { key: 'paidAmount', label: '已还金额 (¥)', type: 'number', default: existing?.paidAmount || '0' },
            { key: 'dueDate', label: '到期日', type: 'date', default: existing?.dueDate || '' },
            { key: 'note', label: '备注', default: existing?.note || '', placeholder: '可选' }
        ],
        submitText: existing ? '保存' : '添加'
    });
    if (r.cancelled || !r.values.name || !r.values.totalAmount) return;
    const data = {
        name: r.values.name, creditor: r.values.creditor,
        totalAmount: parseFloat(r.values.totalAmount),
        paidAmount: parseFloat(r.values.paidAmount) || 0,
        dueDate: r.values.dueDate, note: r.values.note,
        status: (parseFloat(r.values.paidAmount) || 0) >= parseFloat(r.values.totalAmount) ? 'paid' : 'active'
    };
    if (existing) {
        await dbPut('finance_debts', { ...existing, ...data });
    } else {
        await dbAdd('finance_debts', { id: genId(), ...data, createdAt: date.now() });
    }
    toast(existing ? '已更新' : '债务已添加', 'success');
    refresh();
}

async function editDebt(debt) {
    await addDebt(debt);
}

async function repayDebt(debt) {
    const remaining = debt.totalAmount - (debt.paidAmount || 0);
    const r = await formDialog({
        title: `💰 还款 - ${debt.name}`,
        fields: [
            { key: 'amount', label: `还款金额 (¥) · 待还 ${formatMoney(remaining)}`, type: 'number', default: String(remaining), placeholder: '0.00' }
        ],
        submitText: '确认还款'
    });
    if (r.cancelled || !r.values.amount) return;
    const repayAmount = parseFloat(r.values.amount);
    if (repayAmount <= 0 || repayAmount > remaining) {
        toast('还款金额无效（不能超过待还金额）', 'error');
        return;
    }
    debt.paidAmount = (debt.paidAmount || 0) + repayAmount;
    if (debt.paidAmount >= debt.totalAmount) debt.status = 'paid';
    await dbPut('finance_debts', debt);
    toast(`已还款 ${formatMoney(repayAmount)}`, 'success');
    refresh();
}

let currentType = 'expense';

function bindEvents() {
    document.getElementById('type-expense').addEventListener('click', () => switchType('expense'));
    document.getElementById('type-income').addEventListener('click', () => switchType('income'));

    document.getElementById('finance-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('amount').value);
        if (!amount || amount <= 0) { toast('请输入有效金额', 'error'); return; }
        await dbAdd('finance_records', {
            id: genId(),
            type: currentType,
            amount,
            category: document.getElementById('category').value,
            date: document.getElementById('date').value,
            note: document.getElementById('note').value.trim(),
            createdAt: date.now()
        });
        toast('记录已保存', 'success');
        document.getElementById('amount').value = '';
        document.getElementById('note').value = '';
        refresh();
    });

    document.getElementById('record-tbody').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (!del) return;
        if (await confirmDialog('删除此记录？')) {
            await dbDelete('finance_records', del.dataset.del);
            toast('已删除');
            refresh();
        }
    });

    document.getElementById('btn-budget').addEventListener('click', async () => {
        const budget = store.get('finance_budget', { monthly: 0 });
        const r = await formDialog({
            title: '⚙️ 月度预算设置',
            fields: [
                { key: 'monthly', label: '月度支出预算 (¥)', type: 'number', default: budget.monthly || '', placeholder: '例如 3000' }
            ],
            submitText: '保存'
        });
        if (r.cancelled) return;
        store.set('finance_budget', { monthly: isNaN(r.values.monthly) ? 0 : r.values.monthly });
        toast('预算已更新', 'success');
        refresh();
    });

    // 添加债务
    document.getElementById('btn-add-debt').addEventListener('click', () => addDebt());
}

function switchType(type) {
    currentType = type;
    updateCategoryOptions(type);
    document.getElementById('type-expense').className = `btn flex-1${type === 'expense' ? '' : ' btn-secondary'}`;
    document.getElementById('type-income').className = `btn flex-1${type === 'income' ? '' : ' btn-secondary'}`;
}

async function refresh() {
    const container = document.getElementById('page-container');
    if (container) renderFinance(container);
}
