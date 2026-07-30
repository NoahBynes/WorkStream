-- WorkStream 同步数据库建表脚本
-- 在 Supabase SQL Editor 中运行此脚本

-- ============ 1. 用户配置表（存储每个用户的同步配置） ============
create table if not exists public.sync_data (
    user_id uuid references auth.users(id) on delete cascade not null,
    store_name text not null,
    record_id text not null,
    data jsonb not null,
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    primary key (user_id, store_name, record_id)
);

-- updated_at 自动更新触发器
create or replace function public.touch_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_data_touch on public.sync_data;
create trigger trg_sync_data_touch
    before update on public.sync_data
    for each row execute function public.touch_updated_at();

-- ============ 2. 索引 ============
create index if not exists idx_sync_data_user_store on public.sync_data(user_id, store_name);
create index if not exists idx_sync_data_updated_at on public.sync_data(user_id, updated_at);

-- ============ 3. RLS 行级安全（每个用户只能访问自己的数据） ============
alter table public.sync_data enable row level security;

-- 用户只能读取自己的数据
drop policy if exists "用户读取自己的同步数据" on public.sync_data;
create policy "用户读取自己的同步数据"
    on public.sync_data for select
    using (auth.uid() = user_id);

-- 用户只能插入自己的数据
drop policy if exists "用户插入自己的同步数据" on public.sync_data;
create policy "用户插入自己的同步数据"
    on public.sync_data for insert
    with check (auth.uid() = user_id);

-- 用户只能更新自己的数据
drop policy if exists "用户更新自己的同步数据" on public.sync_data;
create policy "用户更新自己的同步数据"
    on public.sync_data for update
    using (auth.uid() = user_id);

-- 用户只能删除自己的数据
drop policy if exists "用户删除自己的同步数据" on public.sync_data;
create policy "用户删除自己的同步数据"
    on public.sync_data for delete
    using (auth.uid() = user_id);

-- ============ 4. 实时订阅（可选，用于实时同步） ============
alter publication supabase_realtime add table public.sync_data;
