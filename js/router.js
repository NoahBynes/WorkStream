// 简易 Hash 路由
const routes = {};
let currentRoute = null;

function registerRoute(path, handler) {
    routes[path] = handler;
}

function navigate(path) {
    if (location.hash !== `#/${path}`) {
        location.hash = `#/${path}`;
    } else {
        render(path);
    }
}

function render(path) {
    const handler = routes[path] || routes['dashboard'];
    currentRoute = path;
    // 更新导航高亮
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.route === path);
    });
    // 关闭移动端侧边栏（含遮罩与菜单按钮恢复）
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) menuToggle.style.display = '';
    // 渲染页面
    const container = document.getElementById('page-container');
    container.innerHTML = '<div class="loading">加载中...</div>';
    Promise.resolve(handler(container)).catch(err => {
        console.error('路由渲染失败:', err);
        const isDBError = err.message && (err.message.includes('数据库') || err.message.includes('超时'));
        container.innerHTML = `
            <div class="empty" style="padding:60px 20px">
                <div class="empty-icon" style="font-size:48px">⚠️</div>
                <div style="font-size:18px;font-weight:600;margin-top:12px">页面加载失败</div>
                <div class="text-sm mt-2 text-muted">${err.message}</div>
                ${isDBError ? `
                    <div class="text-sm mt-3" style="max-width:400px;line-height:1.6">
                        数据库连接超时，可能是浏览器 IndexedDB 被阻塞。<br>
                        请尝试：<br>
                        1. 关闭并重新打开浏览器标签页<br>
                        2. 或在浏览器设置中清除站点数据后刷新
                    </div>
                    <button class="btn mt-4" onclick="location.reload()">🔄 刷新重试</button>
                ` : ''}
            </div>
        `;
    });
}

function handleHashChange() {
    const hash = location.hash.replace('#/', '') || 'dashboard';
    render(hash);
}

function initRouter() {
    window.addEventListener('hashchange', handleHashChange);
    if (!location.hash) location.hash = '#/dashboard';
    else handleHashChange();
}

export { registerRoute, navigate, initRouter, currentRoute };
