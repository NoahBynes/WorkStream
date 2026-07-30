// 主应用入口
import { registerRoute, initRouter, navigate } from './router.js';
import { getTheme, setTheme, toggleTheme, toast, confirmDialog, date } from './store.js';
import { exportAllData, importAllData } from './db.js';
import { openQuickRecord } from './components/quick-record.js';
import { openSyncPanel, updateSyncButton } from './components/sync-panel.js';
import { restoreSession } from './sync.js';
import renderDashboard from './pages/dashboard.js';
import renderStudy from './pages/study.js';
import renderFitness from './pages/fitness.js';
import renderFinance from './pages/finance.js';
import renderNews from './pages/news.js';

// 注册路由
registerRoute('dashboard', renderDashboard);
registerRoute('study', renderStudy);
registerRoute('fitness', renderFitness);
registerRoute('finance', renderFinance);
registerRoute('news', renderNews);

// 初始化主题
setTheme(getTheme());

// 绑定全局事件
function bindGlobalEvents() {
    // 快速记录
    document.getElementById('btn-quick-record')?.addEventListener('click', openQuickRecord);

    // 主题切换
    document.getElementById('btn-theme')?.addEventListener('click', () => {
        const t = toggleTheme();
        toast(t === 'dark' ? '已切换深色模式' : '已切换浅色模式');
        // 重新渲染当前页面以更新图表颜色
        const hash = location.hash.replace('#/', '') || 'dashboard';
        setTimeout(() => navigate(hash), 50);
    });

    // 移动端菜单
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function openSidebar() {
        sidebar.classList.add('open');
        if (menuToggle) menuToggle.style.display = 'none';
        if (sidebarOverlay) sidebarOverlay.classList.add('show');
        document.body.style.overflow = 'hidden';  // 锁定背景页面滚动
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        if (menuToggle) menuToggle.style.display = '';
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
        document.body.style.overflow = '';  // 恢复滚动
    }

    menuToggle?.addEventListener('click', openSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);

    // 侧滑手势：左边缘右滑打开 / 侧边栏内左滑关闭（仅 PWA 模式）
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isPWA) {
        const EDGE = 30;        // 左边缘触发区域宽度(px)
        const SWIPE = 40;       // 触发所需水平位移(px)
        let sx = 0, sy = 0, tracking = false, mode = null, locked = false; // mode: 'open' | 'close'

        window.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            if (sidebar.classList.contains('open')) {
                // 侧边栏打开状态：在侧边栏区域内触摸，准备左滑关闭
                const sidebarWidth = sidebar.offsetWidth;
                if (t.clientX <= sidebarWidth) {
                    sx = t.clientX; sy = t.clientY;
                    tracking = true; mode = 'close'; locked = false;
                } else {
                    tracking = false; mode = null;
                }
            } else {
                // 侧边栏关闭状态：左边缘右滑打开
                if (t.clientX <= EDGE) {
                    sx = t.clientX; sy = t.clientY;
                    tracking = true; mode = 'open'; locked = true;
                    // 立即拦截，阻止 iOS 系统级侧滑返回手势启动
                    e.preventDefault();
                } else {
                    tracking = false; mode = null;
                }
            }
        }, { passive: false, capture: true });

        window.addEventListener('touchmove', (e) => {
            if (!tracking) return;
            const t = e.touches[0];
            const dx = t.clientX - sx;
            const dy = Math.abs(t.clientY - sy);

            // close 模式：仅当判定为水平滑动意图时才 preventDefault，避免影响侧边栏 nav 垂直滚动
            if (mode === 'close' && !locked) {
                if (Math.abs(dx) > 10 && Math.abs(dx) > dy * 1.5) {
                    locked = true;  // 锁定为水平滑动
                } else if (dy > 10) {
                    // 垂直滑动优先，放弃 close 意图，让 nav 正常滚动
                    tracking = false; mode = null;
                    return;
                }
            }
            if (locked) {
                e.preventDefault();  // 阻止 body 滚动/橡皮筋
            }
            if (!locked) return;

            if (mode === 'open' && dx > SWIPE) {
                openSidebar();
                tracking = false; mode = null; locked = false;
            } else if (mode === 'close' && dx < -SWIPE) {
                closeSidebar();
                tracking = false; mode = null; locked = false;
            }
        }, { passive: false, capture: true });

        window.addEventListener('touchend', () => {
            tracking = false; mode = null; locked = false;
        }, { passive: true });
    }

    // 导出数据
    document.getElementById('btn-export')?.addEventListener('click', async () => {
        try {
            const data = await exportAllData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workstream-backup-${date.today()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast('数据已导出', 'success');
        } catch (err) {
            toast('导出失败: ' + err.message, 'error');
        }
    });

    // 导入数据
    document.getElementById('btn-import')?.addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const ok = await confirmDialog('导入将覆盖当前所有数据，确定继续吗？');
        if (!ok) { e.target.value = ''; return; }
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            await importAllData(payload);
            toast('数据导入成功', 'success');
            const hash = location.hash.replace('#/', '') || 'dashboard';
            setTimeout(() => navigate(hash), 200);
        } catch (err) {
            toast('导入失败: ' + err.message, 'error');
        }
        e.target.value = '';
    });

    // 云同步
    document.getElementById('btn-sync')?.addEventListener('click', () => openSyncPanel());
}

// 注册 Service Worker
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
            // 每次加载立即检查 SW 更新
            reg.update();
            // 检测到新 SW 后立即激活
            if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
        }).catch(err => {
            console.warn('SW 注册失败（不影响使用）:', err);
        });
    }
}

// 启动
async function start() {
    bindGlobalEvents();
    registerSW();
    initRouter();
    // 恢复 Supabase 登录会话并启动自动同步
    try {
        await restoreSession();
        await updateSyncButton();
    } catch (err) {
        console.warn('同步会话恢复失败（不影响使用）:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
