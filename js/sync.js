// 云端同步模块 - 基于 Supabase
// 提供：配置管理 / 邮箱登录 / 增量双向同步 / 本地变更自动推送
import { dbGetAll, dbPut, dbDelete, STORES } from './db.js';

// ESM 方式引入 Supabase JS SDK
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const CONFIG_KEY = 'supabase_config';
const LAST_SYNC_KEY = 'last_sync_at';
const LOCAL_TS_KEY = 'sync_local_ts'; // 本地每条记录的修改时间戳映射

let client = null;
let currentUser = null;
let pushQueue = [];
let pushTimer = null;
let isSyncing = false;
let isApplyingRemote = false; // 拉取远程数据写入本地时为 true，避免循环推送
let autoSyncTimer = null;

// ============ 监听本地数据变更 ============
if (typeof window !== 'undefined') {
    window.addEventListener('db-change', (e) => {
        if (isApplyingRemote) return; // 远程数据写入本地，不触发推送
        const { type, storeName, payload } = e.detail;
        if (type === 'put' && payload && payload.id) {
            notifyChange(storeName, payload);
        } else if (type === 'delete' && payload) {
            notifyDelete(storeName, payload);
        }
    });
}

// ============ 配置管理 ============
export function getConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); } catch { return {}; }
}

export function setConfig(url, anonKey) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, anonKey }));
    initClient();
}

export function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
    localStorage.removeItem(LOCAL_TS_KEY);
    client = null;
    currentUser = null;
}

export function isConfigured() {
    const c = getConfig();
    return !!(c.url && c.anonKey);
}

function initClient() {
    const c = getConfig();
    if (!c.url || !c.anonKey) { client = null; return; }
    client = createClient(c.url, c.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
    });
}

initClient();

// ============ 本地时间戳追踪 ============
function getLocalTimestamps() {
    try { return JSON.parse(localStorage.getItem(LOCAL_TS_KEY) || '{}'); } catch { return {}; }
}

function setLocalTimestamp(storeName, recordId, ts) {
    const map = getLocalTimestamps();
    map[`${storeName}:${recordId}`] = ts;
    localStorage.setItem(LOCAL_TS_KEY, JSON.stringify(map));
}

function getLocalTimestamp(storeName, recordId) {
    return getLocalTimestamps()[`${storeName}:${recordId}`] || null;
}

// ============ 认证 ============
export async function signUp(email, password) {
    if (!client) throw new Error('未配置 Supabase URL 和 anon key');
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data;
}

export async function signIn(email, password) {
    if (!client) throw new Error('未配置 Supabase URL 和 anon key');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    return data;
}

export async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    stopAutoSync();
}

export async function getCurrentUser() {
    if (!client) return null;
    if (currentUser) return currentUser;
    const { data } = await client.auth.getUser();
    currentUser = data.user;
    return currentUser;
}

export function getCurrentUserSync() {
    return currentUser;
}

// ============ 同步核心 ============
// 全量双向同步：拉取远程增量 + 推送本地变更
export async function syncAll() {
    if (!client || !currentUser) return { pulled: 0, pushed: 0 };
    if (isSyncing) return { pulled: 0, pushed: 0, skipped: true };
    isSyncing = true;
    let pulled = 0, pushed = 0;
    try {
        const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00Z';

        // 1. 拉取远程增量数据
        const { data: remoteRows, error } = await client
            .from('sync_data')
            .select('store_name,record_id,data,updated_at')
            .eq('user_id', currentUser.id)
            .gt('updated_at', lastSync);

        if (error) throw error;

        // 合并远程数据到本地（抑制推送循环）
        isApplyingRemote = true;
        try {
            for (const row of (remoteRows || [])) {
                // 跳过本地已废弃的表（如已删除的 study_sessions）
                if (!STORES[row.store_name]) continue;
                const localTs = getLocalTimestamp(row.store_name, row.record_id);
                const remoteTs = row.updated_at;

                // 远程比本地新才覆盖
                if (!localTs || new Date(remoteTs) > new Date(localTs)) {
                    try {
                        if (row.data && row.data.__deleted) {
                            await dbDelete(row.store_name, row.record_id).catch(() => {});
                        } else if (row.data) {
                            await dbPut(row.store_name, row.data);
                            setLocalTimestamp(row.store_name, row.record_id, remoteTs);
                        }
                        pulled++;
                    } catch (e) {
                        console.warn('[sync] 跳过记录（表不存在或写入失败）:', row.store_name, e.message);
                    }
                }
            }
        } finally {
            isApplyingRemote = false;
        }

        // 2. 推送本地新数据到远程
        for (const storeName of Object.keys(STORES)) {
            let localData;
            try {
                localData = await dbGetAll(storeName);
            } catch (e) {
                console.warn('[sync] 跳过表（读取失败）:', storeName, e.message);
                continue;
            }
            for (const record of localData) {
                if (!record.id) continue;
                const localTs = getLocalTimestamp(storeName, record.id) || record.createdAt || record.updatedAt;
                // 本地比上次同步新才推送
                if (!localTs || new Date(localTs) > new Date(lastSync)) {
                    const ts = new Date().toISOString();
                    const { error: upErr } = await client.from('sync_data').upsert({
                        user_id: currentUser.id,
                        store_name: storeName,
                        record_id: record.id,
                        data: record,
                        updated_at: ts
                    });
                    if (!upErr) {
                        setLocalTimestamp(storeName, record.id, ts);
                        pushed++;
                    }
                }
            }
        }

        localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    } finally {
        isSyncing = false;
    }
    return { pulled, pushed };
}

// ============ 单条变更推送（debounce） ============
export function notifyChange(storeName, record) {
    if (!client || !currentUser || !record || !record.id) return;
    const ts = new Date().toISOString();
    setLocalTimestamp(storeName, record.id, ts);
    pushQueue.push({ storeName, record, ts });
    schedulePush();
}

export function notifyDelete(storeName, recordId) {
    if (!client || !currentUser || !recordId) return;
    const ts = new Date().toISOString();
    setLocalTimestamp(storeName, recordId, ts);
    pushQueue.push({ storeName, recordId, deleted: true, ts });
    schedulePush();
}

function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPushQueue, 3000);
}

async function flushPushQueue() {
    if (!client || !currentUser || pushQueue.length === 0) return;
    const items = pushQueue.splice(0);
    try {
        for (const item of items) {
            if (item.deleted) {
                await client.from('sync_data').upsert({
                    user_id: currentUser.id,
                    store_name: item.storeName,
                    record_id: item.recordId,
                    data: { __deleted: true },
                    updated_at: item.ts
                });
            } else {
                await client.from('sync_data').upsert({
                    user_id: currentUser.id,
                    store_name: item.storeName,
                    record_id: item.record.id,
                    data: item.record,
                    updated_at: item.ts
                });
            }
        }
    } catch (err) {
        console.error('[sync] 推送失败，重新入队:', err);
        pushQueue.unshift(...items);
    }
}

// ============ 自动同步定时器 ============
export function startAutoSync() {
    if (autoSyncTimer) clearInterval(autoSyncTimer);
    // 立即同步一次
    syncAll().catch(err => console.error('[sync] 自动同步失败:', err));
    // 每 60 秒同步一次
    autoSyncTimer = setInterval(() => {
        syncAll().catch(err => console.error('[sync] 自动同步失败:', err));
    }, 60000);
}

export function stopAutoSync() {
    if (autoSyncTimer) { clearInterval(autoSyncTimer); autoSyncTimer = null; }
}

// ============ 恢复登录状态 ============
export async function restoreSession() {
    if (!client) return null;
    const user = await getCurrentUser();
    if (user) {
        currentUser = user;
        startAutoSync();
    }
    return user;
}
