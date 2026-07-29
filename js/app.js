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
    // 暴露给侧滑逻辑使用
    window.__wsOpenSidebar = openSidebar;
    window.__wsCloseSidebar = closeSidebar;

    menuToggle?.addEventListener('click', openSidebar);
    sidebarOverlay?.addEventListener('click', closeSidebar);

    // 侧滑打开侧边栏（仅 PWA 模式，避免与 Safari 浏览器侧滑返回冲突）
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isPWA) {
        let touchStartX = 0, touchStartY = 0, touchActive = false;
        const EDGE_THRESHOLD = 25;   // 左边缘触发区域宽度
        const SWIPE_THRESHOLD = 50;  // 触发打开所需水平位移

        document.addEventListener('touchstart', (e) => {
            if (sidebar.classList.contains('open')) return; // 已打开时不处理
            const t = e.touches[0];
            // 仅在左边缘 25px 内开始触摸才视为侧滑意图
            if (t.clientX <= EDGE_THRESHOLD) {
                touchStartX = t.clientX;
                touchStartY = t.clientY;
                touchActive = true;
            } else {
                touchActive = false;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!touchActive) return;
            const t = e.touches[0];
            const dx = t.clientX - touchStartX;
            const dy = Math.abs(t.clientY - touchStartY);
            // 水平位移明显大于垂直位移（避免误触上下滚动）
            if (dx > SWIPE_THRESHOLD && dy < 40) {
                openSidebar();
                touchActive = false;
            }
        }, { passive: true });

        document.addEventListener('touchend', () => { touchActive = false; }, { passive: true });
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
