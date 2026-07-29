// 热点搜集 - RSS 聚合 + 收藏整理
import { dbGetAll, dbAdd, dbDelete, genId } from '../db.js';
import { date, escapeHtml, toast, confirmDialog, store, formDialog } from '../store.js';

// 默认 RSS 源（已验证稳定可用的源）
const DEFAULT_SOURCES = [
    { id: 'default-1', name: '阮一峰的网络日志', url: 'https://feeds.feedburner.com/ruanyifeng', category: '学习' },
    { id: 'default-2', name: '少数派', url: 'https://sspai.com/feed', category: '科技' },
    { id: 'default-3', name: '威锋网', url: 'https://www.feng.com/rss.xml', category: '数码' }
];

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

export default async function renderNews(container) {
    let sources = [];
    try {
        sources = await dbGetAll('news_sources');
    } catch (e) { console.warn('读取订阅源失败，使用内存默认源', e); }

    if (sources.length === 0) {
        sources = [...DEFAULT_SOURCES];
        // 尝试写入 DB（失败不影响功能）
        DEFAULT_SOURCES.forEach(s => dbAdd('news_sources', s).catch(() => {}));
    } else {
        // 自动修复旧的失效源（rsshub.app 已不可用）
        const stale = sources.filter(s => s.url && s.url.includes('rsshub.app'));
        if (stale.length > 0) {
            for (const s of stale) {
                await dbDelete('news_sources', s.id).catch(() => {});
                sources = sources.filter(x => x.id !== s.id);
            }
            for (const s of DEFAULT_SOURCES) {
                if (!sources.some(x => x.id === s.id)) {
                    sources.push(s);
                    dbAdd('news_sources', s).catch(() => {});
                }
            }
            toast('已自动更新失效的订阅源', 'success');
        }
    }

    let favorites = [];
    try { favorites = await dbGetAll('news_favorites'); } catch (e) {}

    container.innerHTML = `
        <div class="page-header">
            <div>
                <div class="page-title">🔥 热点搜集</div>
                <div class="page-subtitle">RSS 聚合 · 关键词订阅 · 收藏整理</div>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary" id="btn-manage">⚙️ 源管理</button>
                <button class="btn" id="btn-refresh">🔄 刷新</button>
            </div>
        </div>

        <div class="grid grid-4 mb-4">
            <div class="stat-card">
                <div class="stat-label">订阅源</div>
                <div class="stat-icon">📡</div>
                <div class="stat-value">${sources.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">已收藏</div>
                <div class="stat-icon">⭐</div>
                <div class="stat-value">${favorites.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">本次抓取</div>
                <div class="stat-icon">📰</div>
                <div class="stat-value" id="fetched-count">0</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">关键词</div>
                <div class="stat-icon">🔍</div>
                <div class="stat-value" id="kw-count">${store.get('news_keywords', []).length}</div>
            </div>
        </div>

        <div class="flex gap-2 mb-4">
            <input class="input" id="search-input" placeholder="🔍 搜索文章标题或描述...">
            <button class="btn btn-secondary" id="btn-keyword">关键词管理</button>
        </div>

        <div id="feed-area">
            <div class="empty"><div class="empty-icon">📰</div><div>点击右上角"刷新"抓取最新文章</div></div>
        </div>

        <div class="card mt-4">
            <div class="card-title"><span>⭐ 我的收藏</span></div>
            <div id="fav-list" class="list"></div>
        </div>
    `;

    renderFavorites(favorites);
    bindEvents(sources);

    // 自动抓取（延迟确保 DOM 渲染完成）
    setTimeout(() => fetchFeeds(sources), 100);
}

let allFeeds = [];

async function fetchFeeds(sources) {
    const area = document.getElementById('feed-area');
    if (!area || sources.length === 0) return;
    area.innerHTML = '<div class="loading">⏳ 正在抓取订阅源...</div>';

    // 串行请求避免 rss2json 并发限额
    allFeeds = [];
    let failed = 0;
    for (const src of sources) {
        try {
            const resp = await fetch(RSS2JSON + encodeURIComponent(src.url));
            const data = await resp.json();
            if (data.status !== 'ok') throw new Error(data.message || '抓取失败');
            const items = (data.items || []).slice(0, 20).map(item => ({
                id: genId(),
                title: item.title,
                link: item.link,
                description: item.description || '',
                pubDate: item.pubDate,
                source: src.name,
                category: src.category
            }));
            allFeeds.push(...items);
        } catch (e) {
            console.warn(`抓取 ${src.name} 失败:`, e.message);
            failed++;
        }
    }

    // 按日期排序
    allFeeds.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

    const fetchedEl = document.getElementById('fetched-count');
    if (fetchedEl) fetchedEl.textContent = allFeeds.length;

    if (allFeeds.length === 0) {
        area.innerHTML = `<div class="empty"><div class="empty-icon">📡</div><div>未抓取到文章${failed ? `（${failed} 个源失败，可能是网络或 CORS 限制）` : ''}</div><div class="text-sm mt-2 text-muted">可尝试手动添加文章链接</div></div>
        <div class="text-center mt-3"><button class="btn btn-secondary" id="btn-add-manual">➕ 手动添加链接</button></div>`;
        document.getElementById('btn-add-manual')?.addEventListener('click', addManualLink);
        return;
    }
    if (failed > 0) toast(`${failed} 个源抓取失败`, 'error');
    renderFeeds(allFeeds);
}

function renderFeeds(feeds) {
    const area = document.getElementById('feed-area');
    if (!area) return;
    if (feeds.length === 0) {
        area.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div>没有匹配的文章</div></div>';
        return;
    }
    area.innerHTML = feeds.map(f => `
        <div class="card mb-3" style="padding:14px 18px">
            <div class="flex-between mb-2">
                <div class="flex gap-2" style="align-items:center;flex-wrap:wrap">
                    <span class="tag">${escapeHtml(f.source)}</span>
                    ${f.category ? `<span class="tag">${escapeHtml(f.category)}</span>` : ''}
                    <span class="text-muted text-sm">${f.pubDate ? date.format(f.pubDate, true) : ''}</span>
                </div>
                <button class="btn btn-sm btn-ghost" data-fav='${escapeHtml(JSON.stringify({title:f.title,link:f.link,source:f.source}))}'>⭐ 收藏</button>
            </div>
            <a href="${escapeHtml(f.link)}" target="_blank" style="text-decoration:none;color:var(--text)"><div class="text-lg font-bold">${escapeHtml(f.title)}</div></a>
            <div class="text-sm text-muted mt-2" style="overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(stripHtml(f.description).slice(0, 200))}</div>
        </div>
    `).join('');

    // 收藏按钮
    area.querySelectorAll('[data-fav]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const data = JSON.parse(btn.dataset.fav);
            await dbAdd('news_favorites', {
                id: genId(),
                title: data.title,
                link: data.link,
                source: data.source,
                savedAt: date.now()
            });
            toast('已收藏', 'success');
            const favs = await dbGetAll('news_favorites');
            renderFavorites(favs);
            document.querySelectorAll('.stat-card .stat-value')[1].textContent = favs.length;
        });
    });
}

function renderFavorites(favorites) {
    const el = document.getElementById('fav-list');
    if (!el) return;
    if (favorites.length === 0) {
        el.innerHTML = '<div class="empty"><div class="text-muted text-sm">还没有收藏，点击文章右侧 ⭐ 收藏</div></div>';
        return;
    }
    const sorted = favorites.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    el.innerHTML = sorted.map(f => `
        <div class="list-item">
            <span>⭐</span>
            <div style="flex:1;min-width:0">
                <a href="${escapeHtml(f.link)}" target="_blank" style="text-decoration:none;color:var(--text)"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(f.title)}</div></a>
                <div class="text-sm text-muted">${escapeHtml(f.source || '')} · ${date.format(f.savedAt, true)}</div>
            </div>
            <a href="${escapeHtml(f.link)}" target="_blank" class="btn btn-sm btn-ghost">打开</a>
            <button class="btn btn-sm btn-ghost" data-del="${f.id}">删除</button>
        </div>
    `).join('');

    el.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
            await dbDelete('news_favorites', btn.dataset.del);
            toast('已删除');
            const favs = await dbGetAll('news_favorites');
            renderFavorites(favs);
            document.querySelectorAll('.stat-card .stat-value')[1].textContent = favs.length;
        });
    });
}

function bindEvents(sources) {
    // 刷新
    document.getElementById('btn-refresh').addEventListener('click', () => fetchFeeds(sources));

    // 搜索
    document.getElementById('search-input').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderFeeds(allFeeds); return; }
        renderFeeds(allFeeds.filter(f => f.title.toLowerCase().includes(q) || (f.description || '').toLowerCase().includes(q)));
    });

    // 源管理
    document.getElementById('btn-manage').addEventListener('click', () => showSourceManager(sources));

    // 关键词管理
    document.getElementById('btn-keyword').addEventListener('click', () => showKeywordManager());
}

function showSourceManager(sources) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
        <div class="card" style="max-width:560px;width:100%;max-height:80vh;overflow-y:auto">
            <div class="card-title"><span>📡 订阅源管理</span><button class="btn btn-sm btn-ghost" id="close-modal">✕</button></div>
            <form id="src-form" class="mb-3">
                <div class="flex gap-2 mb-2">
                    <input class="input" id="src-name" placeholder="名称" required>
                    <input class="input" id="src-url" placeholder="RSS 地址 (https://...)" required style="flex:2">
                </div>
                <div class="flex gap-2">
                    <input class="input" id="src-cat" placeholder="分类（可选）">
                    <button class="btn" type="submit">添加</button>
                </div>
                <div class="text-sm text-muted mt-2">💡 推荐 RSSHub 源：rsshub.app 开头的地址</div>
            </form>
            <div class="list" id="src-list"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const renderList = (list) => {
        document.getElementById('src-list').innerHTML = list.length === 0
            ? '<div class="empty text-sm">暂无订阅源</div>'
            : list.map(s => `
                <div class="list-item">
                    <div style="flex:1;min-width:0">
                        <div>${escapeHtml(s.name)} <span class="tag">${escapeHtml(s.category || '')}</span></div>
                        <div class="text-sm text-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(s.url)}</div>
                    </div>
                    <button class="btn btn-sm btn-ghost" data-del="${s.id}">删除</button>
                </div>
            `).join('');
    };
    renderList(sources);

    overlay.querySelector('#src-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('src-name').value.trim();
        const url = document.getElementById('src-url').value.trim();
        const category = document.getElementById('src-cat').value.trim();
        if (!name || !url) return;
        const src = { id: genId(), name, url, category };
        await dbAdd('news_sources', src);
        sources.push(src);
        renderList(sources);
        document.getElementById('src-name').value = '';
        document.getElementById('src-url').value = '';
        document.getElementById('src-cat').value = '';
        toast('已添加', 'success');
    });

    overlay.querySelector('#src-list').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (!del) return;
        await dbDelete('news_sources', del.dataset.del);
        const idx = sources.findIndex(s => s.id === del.dataset.del);
        if (idx >= 0) sources.splice(idx, 1);
        renderList(sources);
        toast('已删除');
    });

    overlay.querySelector('#close-modal').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function showKeywordManager() {
    const keywords = store.get('news_keywords', []);
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
        <div class="card" style="max-width:440px;width:100%">
            <div class="card-title"><span>🔍 关键词订阅</span><button class="btn btn-sm btn-ghost" id="close-modal">✕</button></div>
            <div class="text-muted text-sm mb-3">添加关注的关键词，匹配的文章会高亮显示</div>
            <form id="kw-form" class="mb-3">
                <div class="flex gap-2">
                    <input class="input" id="kw-input" placeholder="输入关键词" required>
                    <button class="btn" type="submit">添加</button>
                </div>
            </form>
            <div class="list" id="kw-list"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const renderList = (list) => {
        const el = document.getElementById('kw-list');
        el.innerHTML = list.length === 0
            ? '<div class="empty text-sm">暂无关键词</div>'
            : list.map((kw, i) => `
                <div class="list-item">
                    <span style="flex:1">${escapeHtml(kw)}</span>
                    <button class="btn btn-sm btn-ghost" data-idx="${i}">删除</button>
                </div>
            `).join('');
    };
    renderList(keywords);

    overlay.querySelector('#kw-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = document.getElementById('kw-input').value.trim();
        if (!v || keywords.includes(v)) return;
        keywords.push(v);
        store.set('news_keywords', keywords);
        document.getElementById('kw-input').value = '';
        renderList(keywords);
        document.getElementById('kw-count').textContent = keywords.length;
    });

    overlay.querySelector('#kw-list').addEventListener('click', (e) => {
        const del = e.target.closest('[data-idx]');
        if (!del) return;
        keywords.splice(parseInt(del.dataset.idx), 1);
        store.set('news_keywords', keywords);
        renderList(keywords);
        document.getElementById('kw-count').textContent = keywords.length;
    });

    overlay.querySelector('#close-modal').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function addManualLink() {
    const r = await formDialog({
        title: '➕ 手动添加链接',
        fields: [
            { key: 'title', label: '文章标题', placeholder: '必填' },
            { key: 'link', label: '文章链接', placeholder: 'https://...' }
        ],
        submitText: '添加'
    });
    if (r.cancelled || !r.values.title || !r.values.link) return;
    await dbAdd('news_favorites', {
        id: genId(),
        title: r.values.title, link: r.values.link,
        source: '手动添加',
        savedAt: date.now()
    });
    toast('已添加到收藏', 'success');
    const favs = await dbGetAll('news_favorites');
    renderFavorites(favs);
    document.querySelectorAll('.stat-card .stat-value')[1].textContent = favs.length;
}

function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
