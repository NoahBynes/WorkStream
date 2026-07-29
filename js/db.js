// IndexedDB 封装 - 统一数据访问层
const DB_NAME = 'workstream-db';
const DB_VERSION = 3;

// 数据库表结构定义
const STORES = {
    study_tasks: { keyPath: 'id', indexes: [{ name: 'createdAt', keyPath: 'createdAt' }, { name: 'done', keyPath: 'done' }, { name: 'date', keyPath: 'date' }] },
    study_sessions: { keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
    study_routines: { keyPath: 'id', indexes: [{ name: 'category', keyPath: 'category' }, { name: 'enabled', keyPath: 'enabled' }] },
    fitness_records: { keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }, { name: 'type', keyPath: 'type' }] },
    fitness_weekly_plan: { keyPath: 'id', indexes: [{ name: 'weekday', keyPath: 'weekday' }] },
    fitness_workout_tasks: { keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }, { name: 'done', keyPath: 'done' }] },
    fitness_meals: { keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }] },
    finance_records: { keyPath: 'id', indexes: [{ name: 'date', keyPath: 'date' }, { name: 'type', keyPath: 'type' }, { name: 'category', keyPath: 'category' }] },
    finance_debts: { keyPath: 'id', indexes: [{ name: 'status', keyPath: 'status' }, { name: 'dueDate', keyPath: 'dueDate' }] },
    news_sources: { keyPath: 'id', indexes: [{ name: 'category', keyPath: 'category' }] },
    news_favorites: { keyPath: 'id', indexes: [{ name: 'savedAt', keyPath: 'savedAt' }] },
    notes: { keyPath: 'id', indexes: [{ name: 'updatedAt', keyPath: 'updatedAt' }] }
};

let dbInstance = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
            dbInstance = req.result;
            dbInstance.onversionchange = () => {
                dbInstance.close();
                dbInstance = null;
            };
            resolve(dbInstance);
        };
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            Object.entries(STORES).forEach(([name, config]) => {
                if (!db.objectStoreNames.contains(name)) {
                    const store = db.createObjectStore(name, { keyPath: config.keyPath });
                    (config.indexes || []).forEach(idx => store.createIndex(idx.name, idx.keyPath, { unique: false }));
                }
            });
        };
        req.onblocked = () => {
            console.warn('DB 升级被阻塞，重试中...');
            setTimeout(() => {
                openDB().then(resolve).catch(reject);
            }, 500);
        };
        // 超时保护：5 秒未打开则 reject，避免页面永久卡在"加载中"
        setTimeout(() => {
            if (!dbInstance) reject(new Error('数据库连接超时，请刷新页面或清除浏览器数据'));
        }, 5000);
    });
}

// 通用 CRUD - 使用 tx.oncomplete 确保事务真正完成
async function dbAdd(storeName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).add(data);
        tx.oncomplete = () => resolve(data);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('事务已中止'));
    });
}

async function dbPut(storeName, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data);
        tx.oncomplete = () => resolve(data);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('事务已中止'));
    });
}

async function dbGet(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbDelete(storeName, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('事务已中止'));
    });
}

async function dbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        let done = false;
        req.onsuccess = () => { done = true; };
        tx.oncomplete = () => resolve(done ? (req.result || []) : []);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('事务已中止'));
        // 超时保护
        setTimeout(() => { if (!done) reject(new Error('读取超时')); }, 3000);
    });
}

// 按索引范围查询
async function dbGetByIndex(storeName, indexName, range) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(range);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// 清空表
async function dbClear(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// 导出所有数据
async function exportAllData() {
    const result = {};
    for (const name of Object.keys(STORES)) {
        result[name] = await dbGetAll(name);
    }
    return { version: DB_VERSION, exportedAt: new Date().toISOString(), data: result };
}

// 导入数据（覆盖）
async function importAllData(payload) {
    if (!payload || !payload.data) throw new Error('数据格式错误');
    for (const name of Object.keys(STORES)) {
        const items = payload.data[name] || [];
        await dbClear(name);
        for (const item of items) await dbPut(name, item);
    }
}

// 生成唯一 ID
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export { dbAdd, dbPut, dbGet, dbDelete, dbGetAll, dbGetByIndex, dbClear, exportAllData, importAllData, genId, STORES };
