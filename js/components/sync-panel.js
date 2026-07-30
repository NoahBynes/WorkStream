// 云同步面板 - 配置 / 登录 / 同步状态
import {
    getConfig, setConfig, clearConfig, isConfigured,
    signUp, signIn, signOut, getCurrentUser, getCurrentUserSync,
    syncAll, startAutoSync, stopAutoSync, restoreSession
} from '../sync.js';
import { toast, escapeHtml } from '../store.js';

export async function openSyncPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'qr-overlay';
    document.body.appendChild(overlay);

    const render = async () => {
        const configured = isConfigured();
        const user = await getCurrentUser();
        const config = getConfig();

        overlay.innerHTML = `
            <div class="qr-modal" style="max-width:440px;max-height:85vh;overflow-y:auto">
                <div class="qr-header">
                    <span class="qr-title">☁️ 云同步</span>
                    <button class="btn btn-sm btn-ghost" id="sp-close">✕</button>
                </div>
                <div style="padding:16px">
                    ${!configured ? `
                        <div class="text-sm text-muted mb-3">配置 Supabase 以启用多设备同步。首次使用请先在 supabase.com 创建项目并运行建表 SQL。</div>
                        <div class="field">
                            <label class="field-label">Project URL</label>
                            <input class="input" id="sp-url" placeholder="https://xxxx.supabase.co">
                        </div>
                        <div class="field">
                            <label class="field-label">anon public key</label>
                            <input class="input" id="sp-key" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6...">
                        </div>
                        <button class="btn w-full" id="sp-save-config">保存配置</button>
                    ` : !user ? `
                        <div class="text-sm text-muted mb-3">已配置 Supabase · ${escapeHtml(config.url)}</div>
                        <div class="card-title"><span>登录 / 注册</span></div>
                        <div class="field">
                            <label class="field-label">邮箱</label>
                            <input class="input" id="sp-email" type="email" placeholder="you@example.com">
                        </div>
                        <div class="field">
                            <label class="field-label">密码</label>
                            <input class="input" id="sp-password" type="password" placeholder="至少 6 位" minlength="6">
                        </div>
                        <div class="flex gap-2">
                            <button class="btn" style="flex:1" id="sp-signin">登录</button>
                            <button class="btn btn-secondary" style="flex:1" id="sp-signup">注册</button>
                        </div>
                        <button class="btn btn-ghost w-full mt-3" id="sp-reset-config">重新配置 Supabase</button>
                    ` : `
                        <div class="list-item mb-3">
                            <span style="font-size:24px">👤</span>
                            <div style="flex:1">
                                <div class="font-bold">${escapeHtml(user.email || '已登录')}</div>
                                <div class="text-sm text-muted">同步已启用 · 每 60 秒自动同步</div>
                            </div>
                        </div>
                        <div id="sp-sync-status" class="text-sm text-muted mb-3 text-center"></div>
                        <button class="btn w-full mb-2" id="sp-sync-now">🔄 立即同步</button>
                        <button class="btn btn-ghost w-full" id="sp-signout">退出登录</button>
                        <button class="btn btn-ghost w-full mt-2" id="sp-reset-config">重新配置 Supabase</button>
                    `}
                </div>
            </div>
        `;
        bindEvents();
    };

    const bindEvents = () => {
        const close = () => overlay.remove();
        overlay.querySelector('#sp-close')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // 保存配置
        overlay.querySelector('#sp-save-config')?.addEventListener('click', () => {
            const url = overlay.querySelector('#sp-url').value.trim();
            const key = overlay.querySelector('#sp-key').value.trim();
            if (!url || !key) { toast('请填写完整', 'error'); return; }
            setConfig(url, key);
            toast('配置已保存', 'success');
            render();
        });

        // 登录
        overlay.querySelector('#sp-signin')?.addEventListener('click', async () => {
            const email = overlay.querySelector('#sp-email').value.trim();
            const password = overlay.querySelector('#sp-password').value;
            if (!email || !password) { toast('请填写邮箱和密码', 'error'); return; }
            try {
                overlay.querySelector('#sp-signin').disabled = true;
                await signIn(email, password);
                toast('登录成功', 'success');
                startAutoSync();
                render();
            } catch (err) {
                toast('登录失败: ' + err.message, 'error');
            } finally {
                overlay.querySelector('#sp-signin').disabled = false;
            }
        });

        // 注册
        overlay.querySelector('#sp-signup')?.addEventListener('click', async () => {
            const email = overlay.querySelector('#sp-email').value.trim();
            const password = overlay.querySelector('#sp-password').value;
            if (!email || !password) { toast('请填写邮箱和密码', 'error'); return; }
            try {
                overlay.querySelector('#sp-signup').disabled = true;
                await signUp(email, password);
                toast('注册成功，请查收邮箱确认链接', 'success');
            } catch (err) {
                toast('注册失败: ' + err.message, 'error');
            } finally {
                overlay.querySelector('#sp-signup').disabled = false;
            }
        });

        // 立即同步
        overlay.querySelector('#sp-sync-now')?.addEventListener('click', async () => {
            const statusEl = overlay.querySelector('#sp-sync-status');
            const btn = overlay.querySelector('#sp-sync-now');
            try {
                btn.disabled = true;
                statusEl.textContent = '正在同步...';
                const r = await syncAll();
                if (r.skipped) {
                    statusEl.textContent = '同步进行中，请稍候';
                } else {
                    statusEl.textContent = `同步完成 · 拉取 ${r.pulled} 条 · 推送 ${r.pushed} 条`;
                    toast('同步完成', 'success');
                }
            } catch (err) {
                statusEl.textContent = '同步失败: ' + err.message;
                toast('同步失败', 'error');
            } finally {
                btn.disabled = false;
            }
        });

        // 退出登录
        overlay.querySelector('#sp-signout')?.addEventListener('click', async () => {
            await signOut();
            toast('已退出登录', 'success');
            render();
        });

        // 重新配置
        overlay.querySelector('#sp-reset-config')?.addEventListener('click', () => {
            if (confirm('确定重新配置？将清除当前配置和登录状态。')) {
                clearConfig();
                toast('已清除配置', 'success');
                render();
            }
        });
    };

    await render();
}

// 更新侧边栏云同步按钮状态
export async function updateSyncButton() {
    const btn = document.getElementById('btn-sync');
    if (!btn) return;
    const configured = isConfigured();
    const user = getCurrentUserSync();
    if (configured && user) {
        btn.textContent = '☁️ 已同步';
        btn.style.opacity = '0.8';
    } else if (configured) {
        btn.textContent = '☁️ 待登录';
        btn.style.opacity = '0.9';
    } else {
        btn.textContent = '☁️ 云同步';
        btn.style.opacity = '';
    }
}
