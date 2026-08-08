// 日常学习 - 固定语言任务 + 任务清单 + 进度追踪
import { dbGetAll, dbAdd, dbPut, dbDelete, genId } from '../db.js';
import { date, escapeHtml, toast, confirmDialog } from '../store.js';

let pageState = { filter: 'all' };

// 首次进入初始化学习固定任务模板
const DEFAULT_ROUTINES = [
    { id: 'routine-word', title: '背单词', subject: '学习', targetMinutes: 30, icon: '📖', enabled: true, category: 'language' },
    { id: 'routine-listen', title: '听力练习', subject: '学习', targetMinutes: 20, icon: '🎧', enabled: true, category: 'language' },
    { id: 'routine-speak', title: '口语跟读', subject: '学习', targetMinutes: 15, icon: '🗣️', enabled: true, category: 'language' },
    { id: 'routine-read', title: '阅读理解', subject: '学习', targetMinutes: 20, icon: '📰', enabled: true, category: 'language' }
];

export default async function renderStudy(container) {
    // 初始化固定任务模板
    let routines = await dbGetAll('study_routines');
    if (routines.length === 0) {
        for (const r of DEFAULT_ROUTINES) await dbAdd('study_routines', r);
        routines = await dbGetAll('study_routines');
    }

    const tasks = await dbGetAll('study_tasks');

    const today = date.today();
    const todayTasks = tasks.filter(t => t.date === today && !t.routineId);
    const doneToday = todayTasks.filter(t => t.done).length;
    const weekStart = date.daysAgo(7);
    const doneWeek = tasks.filter(t => t.done && t.date >= weekStart).length;

    // 今日固定任务打卡情况
    const todayRoutines = routines.filter(r => r.enabled);
    const todayRoutineDone = todayRoutines.filter(r =>
        tasks.some(t => t.routineId === r.id && t.date === today && t.done)
    ).length;

    render(container, tasks, routines, { doneToday, doneWeek, todayTasks, todayRoutines, todayRoutineDone });
}

function render(container, tasks, routines, stats) {
    const today = date.today();
    const filtered = filterTasks(tasks, pageState.filter);

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">📚 日常学习</div>
                <div class="page-subtitle">固定任务 · 任务清单 · 进度追踪</div>
            </div>
        </div>

        <div class="grid grid-2 mb-4">
            <div class="stat-card">
                <div class="stat-label">今日固定任务</div>
                <div class="stat-icon">🎯</div>
                <div class="stat-value">${stats.todayRoutineDone}<span class="text-lg text-muted">/${stats.todayRoutines.length}</span></div>
                <div class="stat-trend">学习打卡</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">今日额外任务</div>
                <div class="stat-icon">✅</div>
                <div class="stat-value">${stats.doneToday}<span class="text-lg text-muted">/${stats.todayTasks.length}</span></div>
                <div class="stat-trend">已添加任务</div>
            </div>
        </div>

        <div class="card mb-4">
            <div class="card-title">
                <span>🎯 学习任务</span>
                <div class="actions">
                    <button class="btn btn-sm btn-ghost" id="btn-manage-routine">⚙️ 管理任务</button>
                </div>
            </div>
            <div class="text-muted text-sm mb-3">每天打卡的学习固定任务，点击勾选完成</div>
            <div class="list" id="routine-list">
                ${stats.todayRoutines.length === 0
                    ? `<div class="empty"><div class="empty-icon">📝</div><div>暂无固定任务，点击"管理任务"添加</div></div>`
                    : stats.todayRoutines.map(r => {
                        const done = tasks.some(t => t.routineId === r.id && t.date === today && t.done);
                        return `
                            <div class="list-item">
                                <input type="checkbox" class="checkbox" data-routine="${r.id}" ${done ? 'checked' : ''}>
                                <span style="font-size:20px">${r.icon || '📌'}</span>
                                <div style="flex:1;${done ? 'opacity:0.55;text-decoration:line-through' : ''}">
                                    <div>${escapeHtml(r.title)}</div>
                                    <div class="text-sm text-muted">${escapeHtml(r.subject || '')} · 目标 ${r.targetMinutes || 0} 分钟</div>
                                </div>
                                <span class="tag">${done ? '已完成' : '待完成'}</span>
                            </div>
                        `;
                    }).join('')}
            </div>
        </div>

        <div class="card mt-4">
            <div class="card-title">
                <span>📋 额外任务</span>
                <div class="actions">
                    <button class="btn btn-sm btn-ghost" data-filter="all">全部</button>
                    <button class="btn btn-sm btn-ghost" data-filter="todo">待办</button>
                    <button class="btn btn-sm btn-ghost" data-filter="done">已完成</button>
                </div>
            </div>

            <form id="task-form" class="mb-3">
                <div class="flex gap-2">
                    <input class="input" id="task-input" placeholder="添加任务，回车确认..." required>
                    <select class="select" id="task-priority" style="width:90px">
                        <option value="low">🟢 低</option>
                        <option value="medium" selected>🟡 中</option>
                        <option value="high">🔴 高</option>
                    </select>
                    <button class="btn" type="submit">添加</button>
                </div>
                <input class="input mt-2" id="task-subject" placeholder="科目/标签（可选）">
            </form>

            <div class="list" id="task-list">
                ${filtered.length === 0
                    ? `<div class="empty"><div class="empty-icon">📝</div><div>暂无任务</div></div>`
                    : filtered.sort((a, b) => (a.done - b.done) || b.createdAt.localeCompare(a.createdAt)).map(t => `
                        <div class="list-item">
                            <input type="checkbox" class="checkbox" data-id="${t.id}" ${t.done ? 'checked' : ''}>
                            <div style="flex:1;${t.done ? 'opacity:0.5;text-decoration:line-through' : ''}">
                                <div>${escapeHtml(t.title)}</div>
                                ${t.subject ? `<div class="text-sm text-muted">${escapeHtml(t.subject)}</div>` : ''}
                            </div>
                            <span class="tag">${t.priority === 'high' ? '🔴 高' : t.priority === 'medium' ? '🟡 中' : '🟢 低'}</span>
                            <button class="btn btn-sm btn-ghost" data-del="${t.id}">删除</button>
                        </div>
                    `).join('')}
            </div>
        </div>
    `;

    bindEvents(container, routines, tasks);
}

function filterTasks(tasks, filter) {
    const today = date.today();
    let list = tasks.filter(t => t.date === today && !t.routineId);
    if (filter === 'todo') return list.filter(t => !t.done);
    if (filter === 'done') return list.filter(t => t.done);
    return list;
}

function bindEvents(container, routines, allTasks) {
    // 固定任务打卡
    document.getElementById('routine-list').addEventListener('change', async (e) => {
        const check = e.target.closest('[data-routine]');
        if (!check) return;
        const routineId = check.dataset.routine;
        const today = date.today();
        const existing = allTasks.find(t => t.routineId === routineId && t.date === today);
        if (existing) {
            existing.done = check.checked;
            existing.completedAt = check.checked ? date.now() : null;
            await dbPut('study_tasks', existing);
        } else {
            const routine = routines.find(r => r.id === routineId);
            await dbAdd('study_tasks', {
                id: genId(), title: routine.title, subject: routine.subject,
                priority: 'medium', done: check.checked, date: today,
                routineId, completedAt: check.checked ? date.now() : null,
                createdAt: date.now()
            });
        }
        toast(check.checked ? '打卡成功 🎉' : '已取消打卡');
        refresh();
    });

    // 管理固定任务
    document.getElementById('btn-manage-routine').addEventListener('click', () => showRoutineManager(routines));

    // 过滤
    container.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => { pageState.filter = btn.dataset.filter; refresh(); });
    });

    // 添加任务
    document.getElementById('task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('task-input').value.trim();
        const priority = document.getElementById('task-priority').value;
        const subject = document.getElementById('task-subject').value.trim();
        if (!title) return;
        await dbAdd('study_tasks', {
            id: genId(), title, subject, priority,
            done: false, date: date.today(), createdAt: date.now()
        });
        toast('任务已添加', 'success');
        refresh();
    });

    // 任务操作（事件委托）
    document.getElementById('task-list').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        const check = e.target.closest('.checkbox');
        if (del) {
            if (await confirmDialog('删除此任务？')) {
                await dbDelete('study_tasks', del.dataset.del);
                toast('已删除');
                refresh();
            }
        } else if (check) {
            const task = allTasks.find(t => t.id === check.dataset.id);
            if (task) {
                task.done = check.checked;
                task.completedAt = check.checked ? date.now() : null;
                await dbPut('study_tasks', task);
                refresh();
            }
        }
    });
}

// ============ 固定任务管理 ============
function showRoutineManager(routines) {
    const overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    overlay.innerHTML = `
        <div class="qr-modal" style="max-width:520px;max-height:80vh;overflow-y:auto">
            <div class="qr-header">
                <span class="qr-title">🎯 管理每日固定任务</span>
                <button class="btn btn-sm btn-ghost" id="rm-close">✕</button>
            </div>
            <div style="padding:16px">
                <form id="rm-form" class="mb-3">
                    <div class="flex gap-2 mb-2">
                        <input class="input" id="rm-icon" placeholder="图标" style="width:60px" value="📌">
                        <input class="input" id="rm-title" placeholder="任务名称，如 背单词" required style="flex:2">
                        <input class="input" id="rm-minutes" type="number" placeholder="分钟" value="20" style="width:80px">
                    </div>
                    <button class="btn w-full" type="submit">➕ 添加固定任务</button>
                </form>
                <div class="list" id="rm-list"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const renderList = (list) => {
        const el = overlay.querySelector('#rm-list');
        el.innerHTML = list.length === 0
            ? '<div class="empty text-sm">暂无固定任务</div>'
            : list.map(r => `
                <div class="list-item">
                    <span style="font-size:18px">${r.icon || '📌'}</span>
                    <div style="flex:1">
                        <div>${escapeHtml(r.title)} ${r.enabled ? '' : '<span class="tag">已停用</span>'}</div>
                        <div class="text-sm text-muted">${escapeHtml(r.subject || '')} · ${r.targetMinutes} 分钟</div>
                    </div>
                    <button class="btn btn-sm btn-ghost" data-toggle="${r.id}">${r.enabled ? '停用' : '启用'}</button>
                    <button class="btn btn-sm btn-ghost" data-del="${r.id}">删除</button>
                </div>
            `).join('');
    };
    renderList(routines);

    overlay.querySelector('#rm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = overlay.querySelector('#rm-title').value.trim();
        const icon = overlay.querySelector('#rm-icon').value.trim() || '📌';
        const minutes = parseInt(overlay.querySelector('#rm-minutes').value) || 20;
        if (!title) return;
        const r = { id: genId(), title, subject: '学习', targetMinutes: minutes, icon, enabled: true, category: 'language' };
        await dbAdd('study_routines', r);
        routines.push(r);
        renderList(routines);
        overlay.querySelector('#rm-title').value = '';
        toast('已添加', 'success');
    });

    overlay.querySelector('#rm-list').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        const toggle = e.target.closest('[data-toggle]');
        if (del) {
            if (await confirmDialog('删除此固定任务？')) {
                await dbDelete('study_routines', del.dataset.del);
                const idx = routines.findIndex(r => r.id === del.dataset.del);
                if (idx >= 0) routines.splice(idx, 1);
                renderList(routines);
                toast('已删除');
            }
        } else if (toggle) {
            const r = routines.find(x => x.id === toggle.dataset.toggle);
            if (r) { r.enabled = !r.enabled; await dbPut('study_routines', r); renderList(routines); }
        }
    });

    overlay.querySelector('#rm-close').addEventListener('click', async () => {
        overlay.remove();
        refresh();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); refresh(); } });
}

async function refresh() {
    const routines = await dbGetAll('study_routines');
    const tasks = await dbGetAll('study_tasks');
    const today = date.today();
    const todayTasks = tasks.filter(t => t.date === today && !t.routineId);
    const doneToday = todayTasks.filter(t => t.done).length;
    const weekStart = date.daysAgo(7);
    const doneWeek = tasks.filter(t => t.done && t.date >= weekStart).length;
    const todayRoutines = routines.filter(r => r.enabled);
    const todayRoutineDone = todayRoutines.filter(r => tasks.some(t => t.routineId === r.id && t.date === today && t.done)).length;
    render(document.getElementById('page-container'), tasks, routines, { doneToday, doneWeek, todayTasks, todayRoutines, todayRoutineDone });
}
