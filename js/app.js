// 主应用入口
import { registerRoute, initRouter, navigate } from './router.js';
import { getTheme, setTheme, toggleTheme, toast, confirmDialog } from './store.js';
import { exportAllData, importAllData } from './db.js';
import { openQuickRecord } from './components/quick-record.js';
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
    }
    function closeSidebar() {
        sidebar.classList.remove('open');
        if (menuToggle) menuToggle.style.display = '';
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    menuToggle?.addEventListener('click', openSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);

    // 侧滑打开侧边栏（拦截 iOS 左边缘侧滑返回手势）
    // 仅 PWA 模式启用；Safari 浏览器中保留原生侧滑返回
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isPWA) {
        const EDGE = 25;        // 左边缘触发区域宽度(px)
        const SWIPE = 35;       // 触发打开所需水平位移(px)
        let sx = 0, sy = 0, tracking = false, locked = false;

        document.addEventListener('touchstart', (e) => {
            if (sidebar.classList.contains('open')) { tracking = false; return; }
            const t = e.touches[0];
            if (t.clientX <= EDGE) {
                sx = t.clientX; sy = t.clientY;
                tracking = true; locked = false;
            } else {
                tracking = false;
            }
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (!tracking) return;
            const t = e.touches[0];
            const dx = t.clientX - sx;
            const dy = Math.abs(t.clientY - sy);
            // 水平位移占主导时锁定为侧滑意图，阻止默认行为避免触发 iOS 返回
            if (!locked && dx > 10 && dx > dy * 1.5) {
                locked = true;
            }
            if (locked) {
                e.preventDefault();  // 关键：阻止 iOS 侧滑返回手势
                if (dx > SWIPE) {
                    openSidebar();
                    tracking = false; locked = false;
                }
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            tracking = false; locked = false;
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
            a.download = `workstream-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
}

// 注册 Service Worker
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => {
            console.warn('SW 注册失败（不影响使用）:', err);
        });
    }
}

// 启动
function start() {
    bindGlobalEvents();
    registerSW();
    initRouter();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}
