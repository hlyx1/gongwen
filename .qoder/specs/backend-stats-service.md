# 后端统计服务实施方案

## Context

公文排版工具目前是纯前端应用，无法获知用户的使用情况。需要添加一个轻量级 Python FastAPI 后端，记录用户每次点击"导出 Word"和"AI 校对"按钮的元数据（时间、IP、功能），并提供简单的统计查询接口。后端通过 Docker 部署，集成到现有的 docker-compose 中，nginx 反向代理 `/api` 路径。

## 架构

```
浏览器 → Nginx(:80)
            ├─ /api/*   → proxy_pass → FastAPI(:8000)
            └─ /*       → 静态文件 (前端)

FastAPI 写入 /data/stats.log（挂载到宿主机 gongwen-docker/data/）
```

## 步骤 1：创建后端 FastAPI 应用

### 文件结构

```
backend/
├── main.py              # FastAPI 入口，路由注册，后台清理任务
├── routers/
│   └── stats.py         # POST /api/stats/record, GET /api/stats/summary
├── services/
│   └── stats_service.py # 防抖缓存、日志写入、统计聚合
├── models.py            # Pydantic 请求/响应模型
├── config.py            # 常量配置（日志路径、防抖时间等）
├── Dockerfile           # python:3.12-slim 镜像
└── requirements.txt     # fastapi + uvicorn
```

### API 设计

**POST /api/stats/record**
- 请求体：`{ "action": "export_docx" | "ai_proofread" }`
- 从 `X-Real-IP` / `X-Forwarded-For` 获取用户 IP
- 防抖：以 `(IP, action)` 为 key，10 秒内重复调用不记录
- 响应：`{ "ok": true }`（无论是否被防抖过滤，都返回成功）

**GET /api/stats/summary?days=7**
- 参数 days：7 / 30 / 365 / 0（全部）
- 响应：`{ "period_days": 7, "unique_users": 42, "total_calls": 156, "export_docx_calls": 120, "ai_proofread_calls": 36 }`

**GET /api/health**
- 响应：`{ "status": "healthy" }` — Docker 健康检查用

### 日志格式

每行一条，制表符分隔：
```
2026-03-19T14:30:25	192.168.1.100	export_docx
```

文件路径：容器内 `/data/stats.log`，挂载到宿主机 `gongwen-docker/data/stats.log`

### 防抖实现

- 内存字典 `dict[tuple[str, str], float]`，key=(IP, action)，value=上次时间戳
- 后台任务每 10 分钟清理过期 key（>60 秒）

### requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
```

### Dockerfile

基于 `python:3.12-slim`，安装依赖，复制源码，启动 uvicorn（单 worker）。

## 步骤 2：修改 Docker 配置

### 修改文件：`gongwen-docker/docker-compose-dev.yml`

添加 `gongwen-stats` 服务：
- build context 指向 `../backend`
- volumes 挂载 `./data:/data`
- 不暴露宿主端口（仅 nginx 容器内部访问）
- 健康检查 `curl -f http://localhost:8000/api/health`

`gongwen` 服务添加 `depends_on: gongwen-stats`

### 修改文件：`gongwen-docker/docker-compose-prod.yml`

同上，添加 `gongwen-stats` 服务。

### 修改文件：`gongwen-docker/nginx-dev.conf`

在 `server` 块中 `location /` 之前添加：
```nginx
location /api {
    proxy_pass http://gongwen-stats:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_connect_timeout 5s;
    proxy_read_timeout 10s;
}
```

### 修改文件：`gongwen-docker/nginx-prod.conf`

同上。

## 步骤 3：前端添加统计上报

### 新建文件：`src/utils/statsReporter.ts`

- 导出 `reportStats(action: string): void` 函数和两个常量 `STATS_ACTION_EXPORT`、`STATS_ACTION_AI_PROOFREAD`
- 使用 `fetch` 发送 POST `/api/stats/record`，fire-and-forget 不 await
- 完全静默：失败不弹窗、不重试、不阻塞主流程
- 兼容 Chrome 78：不使用 `?.`、`??` 等语法

### 修改文件：`src/App.tsx`

- `handleExport`（第116行）：在 `await downloadDocx(ast, config)` 成功后调用 `reportStats(STATS_ACTION_EXPORT)`
- `handleStartAIProofread`（第191行）：在 `startProofread(...)` 调用前调用 `reportStats(STATS_ACTION_AI_PROOFREAD)`

### 修改文件：`vite.config.ts`

在 `server` 配置中添加 proxy，将 `/api` 代理到 `http://localhost:8000`，使开发环境也能测试上报功能。

## 步骤 4：更新 .gitignore

添加 `gongwen-docker/data/` 防止日志文件被提交。

## 验证

1. 启动后端：`cd backend && pip install -r requirements.txt && uvicorn main:app --port 8000`
2. 测试健康检查：`curl http://localhost:8000/api/health` 应返回 `{"status":"healthy"}`
3. 测试记录：`curl -X POST http://localhost:8000/api/stats/record -H "Content-Type: application/json" -d "{\"action\":\"export_docx\"}"`
4. 测试防抖：10 秒内重复调用上述命令，检查日志文件只记录一条
5. 测试统计：`curl http://localhost:8000/api/stats/summary?days=7`
6. 前端验证：`npm run dev`，点击导出 Word / AI 校对，检查后端日志是否记录
7. Docker 验证：在 gongwen-docker 目录执行 `docker-compose -f docker-compose-dev.yml up -d --build`，访问 `http://localhost:88/api/health`

## 变更文件清单

| 操作 | 文件 |
|------|------|
| 新建 | `backend/main.py` |
| 新建 | `backend/routers/stats.py` |
| 新建 | `backend/services/stats_service.py` |
| 新建 | `backend/models.py` |
| 新建 | `backend/config.py` |
| 新建 | `backend/Dockerfile` |
| 新建 | `backend/requirements.txt` |
| 新建 | `src/utils/statsReporter.ts` |
| 修改 | `src/App.tsx` |
| 修改 | `vite.config.ts` |
| 修改 | `gongwen-docker/docker-compose-dev.yml` |
| 修改 | `gongwen-docker/docker-compose-prod.yml` |
| 修改 | `gongwen-docker/nginx-dev.conf` |
| 修改 | `gongwen-docker/nginx-prod.conf` |
| 修改 | `.gitignore` |
