// 仪表盘 - 聚合四模块核心数据
import { dbGetAll, dbGetByIndex } from '../db.js';
import { date, formatMoney, escapeHtml } from '../store.js';
import { openQuickRecord, openQuickRecordType } from '../components/quick-record.js';

export default async function renderDashboard(container) {
    const today = date.today();
    const monthStart = date.monthStart();
    const monthEnd = date.monthEnd();

    // 并行加载各模块数据
    const [tasks, fitness, financeAll, newsFav] = await Promise.all([
        dbGetAll('study_tasks'),
        dbGetAll('fitness_records'),
        dbGetByIndex('finance_records', 'date', IDBKeyRange.bound(monthStart, monthEnd + '\uffff')),
        dbGetAll('news_favorites')
    ]);

    // 学习：今日待办（排除固定任务打卡记录，避免重复计数）
    const todayTasks = tasks.filter(t => !t.done && t.date === today && !t.routineId);
    const doneToday = tasks.filter(t => t.done && t.date === today && !t.routineId).length;
    const totalToday = todayTasks.length + doneToday;

    // 身材：最新体重
    const weights = fitness.filter(f => f.type === 'weight').sort((a, b) => b.date.localeCompare(a.date));
    const latestWeight = weights[0];
    const prevWeight = weights[1];

    // 财务：本月结余
    const monthIncome = financeAll.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const monthExpense = financeAll.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const balance = monthIncome - monthExpense;

    // 近 7 天支出
    const sevenDaysAgo = date.daysAgo(7);
    const recentExpenses = financeAll.filter(r => r.type === 'expense' && r.date >= sevenDaysAgo);

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">仪表盘</div>
                <div class="page-subtitle">${date.format(today)} · 一目了然掌握全局</div>
            </div>
        </div>

        <div class="quick-bar">
            <button class="quick-bar-item" data-qr="task"><span class="qb-icon">📚</span><span class="qb-label">学习任务</span></button>
            <button class="quick-bar-item" data-qr="weight"><span class="qb-icon">⚖️</span><span class="qb-label">记体重</span></button>
            <button class="quick-bar-item" data-qr="expense"><span class="qb-icon">📉</span><span class="qb-label">记支出</span></button>
            <button class="quick-bar-item" data-qr="income"><span class="qb-icon">📈</span><span class="qb-label">记收入</span></button>
            <button class="quick-bar-item" data-qr="meal"><span class="qb-icon">🍎</span><span class="qb-label">记饮食</span></button>
            <button class="quick-bar-item" data-qr="debt"><span class="qb-icon">💳</span><span class="qb-label">记债务</span></button>
        </div>

        <div class="grid grid-4 mb-4">
            <div class="stat-card">
                <div class="stat-label">今日待办</div>
                <div class="stat-icon">📚</div>
                <div class="stat-value">${totalToday}</div>
                <div class="stat-trend">已完成 ${doneToday} / ${totalToday}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">最新体重</div>
                <div class="stat-icon">💪</div>
                <div class="stat-value">${latestWeight ? latestWeight.value : '--'}</div>
                <div class="stat-trend ${prevWeight ? (latestWeight.value < prevWeight.value ? 'up' : 'down') : ''}">
                    ${prevWeight ? `${latestWeight.value - prevWeight.value > 0 ? '+' : ''}${(latestWeight.value - prevWeight.value).toFixed(1)} kg` : '暂无记录'}
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">本月结余</div>
                <div class="stat-icon">💰</div>
                <div class="stat-value ${balance >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(balance)}</div>
                <div class="stat-trend">收入 ${formatMoney(monthIncome)} · 支出 ${formatMoney(monthExpense)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">收藏热点</div>
                <div class="stat-icon">🔥</div>
                <div class="stat-value">${newsFav.length}</div>
                <div class="stat-trend">已收藏条目</div>
            </div>
        </div>

        <div class="grid grid-2">
            <div class="card">
                <div class="card-title">
                    <span>📋 今日待办</span>
                    <button class="btn btn-sm btn-ghost" data-goto="study">前往学习</button>
                </div>
                ${todayTasks.length === 0
                    ? `<div class="empty"><div class="empty-icon">✅</div><div>今天没有待办任务，继续保持！</div></div>`
                    : `<div class="list">${todayTasks.slice(0, 5).map(t => `
                        <div class="list-item">
                            <span>${t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢'}</span>
                            <span style="flex:1">${escapeHtml(t.title)}</span>
                            <span class="text-muted text-sm">${escapeHtml(t.subject || '')}</span>
                        </div>`).join('')}</div>
                    `}
            </div>

            <div class="card">
                <div class="card-title">
                    <span>📊 近 7 天支出</span>
                    <button class="btn btn-sm btn-ghost" data-goto="finance">查看明细</button>
                </div>
                <div style="height:200px"><canvas id="dashExpenseChart"></canvas></div>
            </div>
        </div>

        <div class="grid grid-2 mt-4">
            <div class="card">
                <div class="card-title">
                    <span>💪 体重趋势</span>
                    <button class="btn btn-sm btn-ghost" data-goto="fitness">前往记录</button>
                </div>
                <div style="height:200px"><canvas id="dashWeightChart"></canvas></div>
            </div>

            <div class="card">
                <div class="card-title">
                    <span>🔥 收藏热点</span>
                    <button class="btn btn-sm btn-ghost" data-goto="news">查看更多</button>
                </div>
                ${newsFav.length === 0
                    ? `<div class="empty"><div class="empty-icon">📰</div><div>还没有收藏的热点</div></div>`
                    : `<div class="list">${newsFav.slice(-5).reverse().map(n => `
                        <div class="list-item">
                            <span>🔥</span>
                            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(n.title)}</span>
                            <a href="${escapeHtml(n.link)}" target="_blank" class="btn btn-sm btn-ghost">打开</a>
                        </div>`).join('')}</div>`
                }
            </div>
        </div>
    `;

    // 跳转按钮
    container.querySelectorAll('[data-goto]').forEach(btn => {
        btn.addEventListener('click', () => {
            location.hash = `#/${btn.dataset.goto}`;
        });
    });

    // 快捷记录按钮（仪表盘快捷条直接对应类型打开表单）
    container.querySelectorAll('[data-qr]').forEach(btn => {
        btn.addEventListener('click', () => openQuickRecordType(btn.dataset.qr));
    });

    // 渲染图表
    renderExpenseChart(recentExpenses);
    renderWeightChart(weights.slice(0, 14).reverse());
}

function renderExpenseChart(expenses) {
    const ctx = document.getElementById('dashExpenseChart');
    if (!ctx) return;
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
        dailyMap[date.daysAgo(i)] = 0;
    }
    expenses.forEach(e => {
        if (dailyMap.hasOwnProperty(e.date)) dailyMap[e.date] += e.amount;
    });
    const labels = Object.keys(dailyMap).map(d => d.slice(5));
    const data = Object.values(dailyMap);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--finance').trim(),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(148,163,184,0.15)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderWeightChart(weights) {
    const ctx = document.getElementById('dashWeightChart');
    if (!ctx) return;
    if (weights.length === 0) {
        ctx.parentElement.innerHTML = '<div class="empty"><div class="empty-icon">⚖️</div><div>暂无体重数据</div></div>';
        return;
    }
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: weights.map(w => w.date.slice(5)),
            datasets: [{
                data: weights.map(w => w.value),
                borderColor: getComputedStyle(document.documentElement).getPropertyValue('--fitness').trim(),
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(148,163,184,0.15)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}
