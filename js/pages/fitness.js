// 身材管理 - 周循环训练任务 + 体重 + 趋势图
import { dbGetAll, dbAdd, dbPut, dbDelete, genId } from '../db.js';
import { date, escapeHtml, toast, confirmDialog, store, formDialog } from '../store.js';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 默认周训练计划（首次初始化）
const DEFAULT_WEEKLY_PLAN = [
    { id: 'wp-1', weekday: 1, title: '💪 力量训练 - 上肢', items: [{ name: '卧推', sets: 4, reps: 10 }, { name: '引体向上', sets: 3, reps: 8 }, { name: '哑铃推举', sets: 3, reps: 12 }] },
    { id: 'wp-2', weekday: 2, title: '🏃 有氧', items: [{ name: '慢跑', sets: 1, reps: 30, unit: '分钟' }] },
    { id: 'wp-3', weekday: 3, title: '🧘 休息/拉伸', items: [{ name: '全身拉伸', sets: 1, reps: 20, unit: '分钟' }, { name: '泡沫轴放松', sets: 1, reps: 15, unit: '分钟' }] },
    { id: 'wp-4', weekday: 4, title: '💪 力量训练 - 下肢', items: [{ name: '深蹲', sets: 4, reps: 10 }, { name: '硬拉', sets: 3, reps: 8 }, { name: '弓步蹲', sets: 3, reps: 12 }] },
    { id: 'wp-5', weekday: 5, title: '⚡ HIIT', items: [{ name: '波比跳', sets: 4, reps: 15 }, { name: '登山者', sets: 4, reps: 20 }, { name: '开合跳', sets: 4, reps: 30 }] },
    { id: 'wp-6', weekday: 6, title: '🏸 户外运动', items: [{ name: '球类/骑行', sets: 1, reps: 60, unit: '分钟' }] },
    { id: 'wp-7', weekday: 0, title: '😴 休息日', items: [] }
];

let planState = { selectedWeekday: new Date().getDay() };

export default async function renderFitness(container) {
    // 初始化周训练计划
    let weeklyPlan = await dbGetAll('fitness_weekly_plan');
    if (weeklyPlan.length === 0) {
        for (const p of DEFAULT_WEEKLY_PLAN) await dbAdd('fitness_weekly_plan', p);
        weeklyPlan = await dbGetAll('fitness_weekly_plan');
    }

    const records = await dbGetAll('fitness_records');
    const workoutTasks = await dbGetAll('fitness_workout_tasks');

    const weights = records.filter(r => r.type === 'weight').sort((a, b) => a.date.localeCompare(b.date));

    const profile = store.get('fitness_profile', { targetWeight: null, height: null });
    const latestWeight = weights[weights.length - 1];
    const prevWeight = weights[weights.length - 2];
    const today = date.today();

    let weightChange = 0;
    if (prevWeight && latestWeight) weightChange = latestWeight.value - prevWeight.value;
    let targetDiff = null;
    if (latestWeight && profile.targetWeight) targetDiff = latestWeight.value - profile.targetWeight;

    // 今日训练任务打卡情况
    const todayPlan = weeklyPlan.find(p => p.weekday === new Date().getDay());
    const todayWorkoutTasks = workoutTasks.filter(t => t.date === today);
    const planDoneCount = todayPlan && todayPlan.items.length > 0
        ? todayPlan.items.filter((_, i) => todayWorkoutTasks.some(t => t.itemIndex === i && t.done)).length
        : 0;
    const planTotal = todayPlan ? todayPlan.items.length : 0;

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">💪 身材管理</div>
                <div class="page-subtitle">周训练 · 体重 · 趋势追踪</div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary" id="btn-plan-manage">🗓️ 周计划</button>
                <button class="btn btn-secondary" id="btn-profile">⚙️ 目标</button>
            </div>
        </div>

        <div class="grid grid-2 mb-4">
            <div class="stat-card">
                <div class="stat-label">今日训练</div>
                <div class="stat-icon">📋</div>
                <div class="stat-value">${planDoneCount}<span class="text-lg text-muted">/${planTotal}</span></div>
                <div class="stat-trend">${todayPlan ? escapeHtml(todayPlan.title) : '无计划'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">当前体重</div>
                <div class="stat-icon">⚖️</div>
                <div class="stat-value">${latestWeight ? latestWeight.value : '--'}<span class="text-lg text-muted"> kg</span></div>
                <div class="stat-trend ${weightChange > 0 ? 'down' : weightChange < 0 ? 'up' : ''}">
                    ${prevWeight ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : '暂无对比'}
                </div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="card-title">
                <span>📅 日训练任务列表（周循环）</span>
                <span class="tag" id="weekday-label">今天 · ${WEEKDAYS[new Date().getDay()]}</span>
            </div>
            <div class="weekly-plan-tabs" id="weekday-tabs">
                ${WEEKDAYS.map((name, i) => `
                    <button class="weekly-plan-tab ${i === new Date().getDay() ? 'today' : ''} ${i === planState.selectedWeekday ? 'active' : ''}" data-weekday="${i}">${name}</button>
                `).join('')}
            </div>
            <div id="plan-content"></div>
        </div>

        <div class="grid grid-2 mb-4">
            <div class="card">
                <div class="card-title"><span>📊 体重趋势</span></div>
                <div style="height:240px"><canvas id="weightChart"></canvas></div>
            </div>

            <div class="card">
                <div class="card-title"><span>📝 记录体重</span></div>
                <form id="fitness-form">
                    <div id="weight-fields">
                        <div class="field">
                            <label class="field-label">体重 (kg)</label>
                            <input class="input" type="number" step="0.1" id="weight-value" placeholder="例如 65.5">
                        </div>
                        <div class="field">
                            <label class="field-label">备注（可选）</label>
                            <input class="input" id="weight-note" placeholder="例如 晨起空腹">
                        </div>
                    </div>
                    <button class="btn w-full" type="submit">保存记录</button>
                </form>
            </div>
        </div>

        <div class="card">
            <div class="card-title"><span>📅 近期记录</span></div>
            <div id="record-list" class="list"></div>
        </div>
    `;

    renderWeightChart(weights, profile.targetWeight);
    renderPlanContent(weeklyPlan, workoutTasks, planState.selectedWeekday);
    renderRecordList(records);
    bindEvents(weeklyPlan, workoutTasks);
}

// ============ 周训练计划渲染 ============
function renderPlanContent(weeklyPlan, workoutTasks, weekday) {
    const el = document.getElementById('plan-content');
    const plan = weeklyPlan.find(p => p.weekday === weekday);
    const today = date.today();
    const isToday = weekday === new Date().getDay();

    if (!plan) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div>该日无训练计划</div></div>';
        return;
    }
    if (!plan.items || plan.items.length === 0) {
        el.innerHTML = `<div class="empty"><div class="empty-icon">😴</div><div>${escapeHtml(plan.title)}</div><div class="text-sm mt-2 text-muted">休息日，好好恢复</div></div>`;
        return;
    }

    const dayTasks = isToday ? workoutTasks.filter(t => t.date === today) : [];
    el.innerHTML = `
        <div class="mb-3 text-lg font-bold">${escapeHtml(plan.title)}</div>
        <div class="list">
            ${plan.items.map((item, i) => {
                const task = dayTasks.find(t => t.itemIndex === i);
                const done = task && task.done;
                const unit = item.unit || '次';
                return `
                    <div class="workout-task ${done ? 'done' : ''}">
                        ${isToday ? `<input type="checkbox" class="checkbox" data-plan-item="${i}" ${done ? 'checked' : ''}>` : '<span style="width:18px"></span>'}
                        <div style="flex:1">
                            <div class="wt-name">${escapeHtml(item.name)}</div>
                            <div class="text-sm text-muted">${item.sets} 组 × ${item.reps} ${unit}</div>
                        </div>
                        ${done ? '<span class="tag">✅ 已完成</span>' : (isToday ? '<span class="tag">待完成</span>' : '')}
                    </div>
                `;
            }).join('')}
        </div>
        ${isToday && plan.items.length > 0 ? `
            <div class="mt-3 text-center text-sm text-muted">
                今日完成 ${dayTasks.filter(t => t.done).length} / ${plan.items.length} 项
            </div>
        ` : ''}
    `;

    // 打卡事件
    el.querySelectorAll('[data-plan-item]').forEach(check => {
        check.addEventListener('change', async (e) => {
            const itemIndex = parseInt(check.dataset.planItem);
            const existing = workoutTasks.find(t => t.date === today && t.itemIndex === itemIndex);
            if (existing) {
                existing.done = check.checked;
                existing.completedAt = check.checked ? date.now() : null;
                await dbPut('fitness_workout_tasks', existing);
            } else {
                await dbAdd('fitness_workout_tasks', {
                    id: genId(), date: today, planId: plan.id, itemIndex,
                    name: plan.items[itemIndex].name, done: check.checked,
                    completedAt: check.checked ? date.now() : null, createdAt: date.now()
                });
            }
            toast(check.checked ? '完成一项 🎉' : '已取消');
            refresh();
        });
    });
}

// ============ 体重图表 ============
function renderWeightChart(weights, target) {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;
    if (weights.length === 0) {
        ctx.parentElement.innerHTML = '<div class="empty"><div class="empty-icon">📊</div><div>暂无体重数据</div></div>';
        return;
    }
    const datasets = [{
        label: '体重 (kg)', data: weights.map(w => w.value),
        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--fitness').trim(),
        backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.3, fill: true, pointRadius: 4
    }];
    if (target) {
        datasets.push({ label: '目标', data: weights.map(() => target),
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--warning').trim(),
            borderDash: [6, 4], pointRadius: 0, fill: false });
    }
    new Chart(ctx, {
        type: 'line',
        data: { labels: weights.map(w => w.date.slice(5)), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: true, labels: { color: '#94a3b8' } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(148,163,184,0.15)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderRecordList(records) {
    const el = document.getElementById('record-list');
    if (!el) return;
    // 仅显示体重记录（训练打卡功能已移除）
    const sorted = records.filter(r => r.type === 'weight').sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (sorted.length === 0) {
        el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div>暂无记录</div></div>';
        return;
    }
    el.innerHTML = sorted.slice(0, 15).map(r => `
        <div class="list-item">
            <span style="font-size:20px">⚖️</span>
            <div style="flex:1">
                <div>体重 ${r.value} kg</div>
                <div class="text-sm text-muted">${date.format(r.date)}${r.note ? ' · ' + escapeHtml(r.note) : ''}</div>
            </div>
            <button class="btn btn-sm btn-ghost" data-del="${r.id}">删除</button>
        </div>
    `).join('');
    el.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (await confirmDialog('删除此记录？')) {
                await dbDelete('fitness_records', btn.dataset.del);
                toast('已删除');
                refresh();
            }
        });
    });
}

// ============ 事件绑定 ============
function bindEvents(weeklyPlan, workoutTasks) {
    // 周几切换
    document.querySelectorAll('[data-weekday]').forEach(tab => {
        tab.addEventListener('click', () => {
            planState.selectedWeekday = parseInt(tab.dataset.weekday);
            document.querySelectorAll('[data-weekday]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderPlanContent(weeklyPlan, workoutTasks, planState.selectedWeekday);
        });
    });

    // 周计划管理
    document.getElementById('btn-plan-manage').addEventListener('click', () => showPlanManager(weeklyPlan));

    // 记录体重
    document.getElementById('fitness-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = parseFloat(document.getElementById('weight-value').value);
        if (!value || value <= 0 || value > 500) { toast('请输入有效体重', 'error'); return; }
        await dbAdd('fitness_records', {
            id: genId(), type: 'weight', value,
            note: document.getElementById('weight-note').value.trim(),
            date: date.today(), createdAt: date.now()
        });
        toast('体重已记录', 'success');
        refresh();
    });

    // 目标设置
    document.getElementById('btn-profile').addEventListener('click', async () => {
        const profile = store.get('fitness_profile', { targetWeight: null, height: null });
        const r = await formDialog({
            title: '🎯 目标设置',
            fields: [
                { key: 'targetWeight', label: '目标体重 (kg)', type: 'number', default: profile.targetWeight || '', placeholder: '例如 65' }
            ],
            submitText: '保存'
        });
        if (r.cancelled) return;
        store.set('fitness_profile', { ...profile, targetWeight: isNaN(r.values.targetWeight) ? null : r.values.targetWeight });
        toast('目标已更新', 'success');
        refresh();
    });
}

// ============ 周计划管理 ============
function showPlanManager(weeklyPlan) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    overlay.innerHTML = `
        <div class="qr-modal" style="max-width:600px;max-height:85vh;overflow-y:auto">
            <div class="qr-header">
                <span class="qr-title">🗓️ 管理周训练计划</span>
                <button class="btn btn-sm btn-ghost" id="pm-close">✕</button>
            </div>
            <div style="padding:16px">
                <div class="text-muted text-sm mb-3">为每天设置训练任务，按周循环执行</div>
                <div class="list" id="pm-list"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const renderList = () => {
        const el = overlay.querySelector('#pm-list');
        el.innerHTML = WEEKDAYS.map((name, i) => {
            const plan = weeklyPlan.find(p => p.weekday === i);
            const itemCount = plan ? plan.items.length : 0;
            return `
                <div class="list-item" style="flex-direction:column;align-items:stretch">
                    <div class="flex-between w-full">
                        <div>
                            <span class="font-bold">${name}</span>
                            ${plan ? ` · ${escapeHtml(plan.title)}` : ' · 无计划'}
                        </div>
                        <button class="btn btn-sm btn-ghost" data-edit="${i}">${plan ? '编辑' : '添加'}</button>
                    </div>
                    ${plan && plan.items.length > 0 ? `
                        <div class="text-sm text-muted mt-2">${plan.items.map(it => escapeHtml(`${it.name}(${it.sets}×${it.reps})`)).join(' · ')}</div>
                    ` : ''}
                </div>
            `;
        }).join('');
    };
    renderList();

    overlay.querySelector('#pm-list').addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        if (!edit) return;
        const weekday = parseInt(edit.dataset.edit);
        await editDayPlan(weekday, weeklyPlan, renderList);
    });

    overlay.querySelector('#pm-close').addEventListener('click', () => { overlay.remove(); refresh(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); refresh(); } });
}

async function editDayPlan(weekday, weeklyPlan, onUpdate) {
    let plan = weeklyPlan.find(p => p.weekday === weekday);
    const overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    overlay.innerHTML = `
        <div class="qr-modal" style="max-width:520px;max-height:85vh;overflow-y:auto">
            <div class="qr-header">
                <span class="qr-title">编辑 ${WEEKDAYS[weekday]} 训练</span>
                <button class="btn btn-sm btn-ghost" id="ep-close">✕</button>
            </div>
            <div style="padding:16px">
                <div class="field">
                    <label class="field-label">训练标题</label>
                    <input class="input" id="ep-title" value="${plan ? escapeHtml(plan.title) : ''}" placeholder="如 💪 力量训练 - 上肢">
                </div>
                <div class="card-title"><span>训练项目</span></div>
                <div id="ep-items" class="list mb-3"></div>
                <form id="ep-add-form" class="flex gap-2 mb-3">
                    <input class="input" id="ep-name" placeholder="项目名，如 深蹲" required>
                    <input class="input" id="ep-sets" type="number" placeholder="组" value="3" style="width:60px">
                    <input class="input" id="ep-reps" type="number" placeholder="次" value="10" style="width:60px">
                    <button class="btn" type="submit">添加</button>
                </form>
                <button class="btn w-full" id="ep-save">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    let items = plan ? JSON.parse(JSON.stringify(plan.items)) : [];

    const renderItems = () => {
        const el = overlay.querySelector('#ep-items');
        el.innerHTML = items.length === 0
            ? '<div class="empty text-sm">暂无项目</div>'
            : items.map((it, i) => `
                <div class="list-item">
                    <span style="flex:1">${escapeHtml(it.name)} · ${it.sets} 组 × ${it.reps} ${it.unit || '次'}</span>
                    <button class="btn btn-sm btn-ghost" data-item-del="${i}">删除</button>
                </div>
            `).join('');
        el.querySelectorAll('[data-item-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                items.splice(parseInt(btn.dataset.itemDel), 1);
                renderItems();
            });
        });
    };
    renderItems();

    overlay.querySelector('#ep-add-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = overlay.querySelector('#ep-name').value.trim();
        const sets = parseInt(overlay.querySelector('#ep-sets').value) || 3;
        const reps = parseInt(overlay.querySelector('#ep-reps').value) || 10;
        if (!name) return;
        items.push({ name, sets, reps });
        overlay.querySelector('#ep-name').value = '';
        renderItems();
    });

    overlay.querySelector('#ep-save').addEventListener('click', async () => {
        const title = overlay.querySelector('#ep-title').value.trim() || WEEKDAYS[weekday] + ' 训练';
        if (plan) {
            plan.title = title;
            plan.items = items;
            await dbPut('fitness_weekly_plan', plan);
        } else {
            plan = { id: genId(), weekday, title, items };
            await dbAdd('fitness_weekly_plan', plan);
            weeklyPlan.push(plan);
        }
        toast('已保存', 'success');
        overlay.remove();
        onUpdate();
    });

    const close = () => { overlay.remove(); };
    overlay.querySelector('#ep-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function refresh() {
    const container = document.getElementById('page-container');
    if (container) renderFitness(container);
}
