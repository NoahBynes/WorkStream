// 财务规划 - 收支记账 + 总资产 + 分类统计 + 月度报表
import { dbGetAll, dbGetByIndex, dbAdd, dbDelete, genId } from '../db.js';
import { date, escapeHtml, toast, formatMoney, confirmDialog, store, formDialog } from '../store.js';

const CATEGORIES = {
    expense: ['🍽️ 餐饮', '🚗 交通', '🛒 购物', '🏠 居家', '💊 医疗', '🎬 娱乐', '📚 学习', '🎁 礼物', '💡 其他'],
    income: ['💰 工资', '💼 兼职', '📈 投资', '🎁 红包', '💡 其他']
};

let currentType = 'expense';

// 账单浏览状态：月账单 / 年账单，支持历史浏览
let viewMode = 'month'; // 'month' | 'year'
const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth() + 1; // 1-12

function periodRange() {
    const pad = n => String(n).padStart(2, '0');
    if (viewMode === 'year') {
        return { start: `${viewYear}-01-01`, end: `${viewYear}-12-31`, label: `${viewYear} 年` };
    }
    const lastDay = new Date(viewYear, viewMonth, 0).getDate();
    return { start: `${viewYear}-${pad(viewMonth)}-01`, end: `${viewYear}-${pad(viewMonth)}-${pad(lastDay)}`, label: `${viewYear}-${pad(viewMonth)}` };
}

export default async function renderFinance(container) {
    const range = periodRange();
    const records = await dbGetByIndex('finance_records', 'date', IDBKeyRange.bound(range.start, range.end + '\uffff'));
    const allRecords = await dbGetAll('finance_records');
    const budget = store.get('finance_budget', { monthly: 0 });

    const income = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const expense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const balance = income - expense;
    const budgetUsed = budget.monthly > 0 ? (expense / budget.monthly * 100) : 0;

    // 总资产：历史累计收入 - 支出
    const totalIncome = allRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const totalExpense = allRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const totalAssets = totalIncome - totalExpense;

    const isMonthView = viewMode === 'month';
    const isCurrentPeriod = isMonthView
        ? (viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1)
        : (viewYear === now.getFullYear());
    // 年账单的月均支出（当前年份按已过月数计算，否则按 12 个月）
    const monthsElapsed = isCurrentPeriod ? now.getMonth() + 1 : 12;
    const monthAvgExpense = monthsElapsed > 0 ? expense / monthsElapsed : 0;

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">💰 财务规划</div>
                <div class="page-subtitle">${range.label} · 收支记账 · 总资产 · 预算</div>
            </div>
            <button class="btn btn-secondary" id="btn-budget">⚙️ 预算设置</button>
        </div>

        <div class="card mb-4" style="background:linear-gradient(135deg, var(--primary), var(--primary-hover));color:#fff;border:none">
            <div class="flex-between">
                <div>
                    <div style="font-size:13px;opacity:0.85">💰 总资产</div>
                    <div style="font-size:32px;font-weight:700;margin-top:6px">${formatMoney(totalAssets)}</div>
                    <div style="font-size:12px;opacity:0.85;margin-top:6px">
                        累计收入 ${formatMoney(totalIncome)} · 累计支出 ${formatMoney(totalExpense)}
                    </div>
                </div>
                <div style="font-size:48px;opacity:0.3">💼</div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="flex-between" style="flex-wrap:wrap;gap:10px">
                <div class="flex gap-2">
                    <button type="button" class="btn btn-sm ${isMonthView ? '' : 'btn-secondary'}" data-view="month">📅 月账单</button>
                    <button type="button" class="btn btn-sm ${isMonthView ? 'btn-secondary' : ''}" data-view="year">📈 年账单</button>
                </div>
                <div class="flex gap-2" style="align-items:center">
                    <button type="button" class="btn btn-sm btn-ghost" id="period-prev">‹</button>
                    <span style="min-width:90px;text-align:center;font-weight:600">${range.label}</span>
                    <button type="button" class="btn btn-sm btn-ghost" id="period-next">›</button>
                    ${isCurrentPeriod ? '' : '<button type="button" class="btn btn-sm btn-ghost" id="period-today">本期</button>'}
                </div>
            </div>
        </div>

        <div class="grid grid-4 mb-4">
            <div class="stat-card">
                <div class="stat-label">${isMonthView ? '本月收入' : '年度收入'}</div>
                <div class="stat-icon">📈</div>
                <div class="stat-value text-success">${formatMoney(income)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${isMonthView ? '本月支出' : '年度支出'}</div>
                <div class="stat-icon">📉</div>
                <div class="stat-value text-danger">${formatMoney(expense)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">${isMonthView ? '本月结余' : '年度结余'}</div>
                <div class="stat-icon">💰</div>
                <div class="stat-value ${balance >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(balance)}</div>
            </div>
            ${isMonthView ? `<div class="stat-card">
                <div class="stat-label">预算使用</div>
                <div class="stat-icon">🎯</div>
                <div class="stat-value ${budgetUsed > 100 ? 'text-danger' : ''}">${budget.monthly > 0 ? budgetUsed.toFixed(0) + '%' : '未设'}</div>
                <div class="progress mt-2"><div class="progress-bar" style="width:${Math.min(budgetUsed, 100)}%;background:${budgetUsed > 100 ? 'var(--danger)' : 'var(--primary)'}"></div></div>
            </div>` : `<div class="stat-card">
                <div class="stat-label">月均支出</div>
                <div class="stat-icon">📊</div>
                <div class="stat-value text-danger">${formatMoney(monthAvgExpense)}</div>
                <div class="stat-trend">按 ${monthsElapsed} 个月计算</div>
            </div>`}
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
                <span>📋 ${isMonthView ? '月度明细' : '年度明细'}</span>
                <span class="text-muted text-sm">${range.label} · 共 ${records.length} 条</span>
            </div>
            <div style="overflow-x:auto">
                <table class="table">
                    <thead><tr><th>日期</th><th>类型</th><th>分类</th><th>金额</th><th>备注</th><th></th></tr></thead>
                    <tbody id="record-tbody"></tbody>
                </table>
            </div>
        </div>
    `;

    // 关键修复：用 currentType 同步 UI 状态，避免 refresh 后 UI 与状态不一致
    switchType(currentType);
    renderCategoryChart(records);
    renderRecordTable(records);
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

function bindEvents() {
    document.getElementById('type-expense').addEventListener('click', () => switchType('expense'));
    document.getElementById('type-income').addEventListener('click', () => switchType('income'));

    // 账单浏览：月/年切换 + 历史翻页
    document.querySelectorAll('[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            viewMode = btn.dataset.view;
            // 切换模式时回到当前周期
            viewYear = now.getFullYear();
            viewMonth = now.getMonth() + 1;
            refresh();
        });
    });
    const prevBtn = document.getElementById('period-prev');
    const nextBtn = document.getElementById('period-next');
    const todayBtn = document.getElementById('period-today');
    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (viewMode === 'year') { viewYear -= 1; }
        else { viewMonth -= 1; if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; } }
        refresh();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (viewMode === 'year') { viewYear += 1; }
        else { viewMonth += 1; if (viewMonth > 12) { viewMonth = 1; viewYear += 1; } }
        refresh();
    });
    if (todayBtn) todayBtn.addEventListener('click', () => {
        viewYear = now.getFullYear();
        viewMonth = now.getMonth() + 1;
        refresh();
    });

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
}

function switchType(type) {
    currentType = type;
    updateCategoryOptions(type);
    const expBtn = document.getElementById('type-expense');
    const incBtn = document.getElementById('type-income');
    if (expBtn) expBtn.className = `btn flex-1${type === 'expense' ? '' : ' btn-secondary'}`;
    if (incBtn) incBtn.className = `btn flex-1${type === 'income' ? '' : ' btn-secondary'}`;
}

async function refresh() {
    const container = document.getElementById('page-container');
    if (container) renderFinance(container);
}
