# Docker 镜像构建指南（fojian-ai 同款烘焙体例）

本目录只放**镜像构建材料**；生产部署用自包含部署包 [../gongwen-deploy/](../gongwen-deploy/README.txt)，
开发调试用根目录 `docker-compose-dev.yml`。

## 目录结构

```
backend/nginx/
├── Dockerfile                        # 前端镜像（构建上下文＝项目根目录）
├── default-prod.conf                 # 烘焙进镜像的 nginx 配置（/llm 反代 vllm-proxy、/api 反代统计后端）
└── docker-entrypoint.d/
    └── 40-runtime-config.sh          # 容器启动时按 AI_* env 生成 runtime-config.js
```

## 构建与导出

```bash
# 1) 先构建前端（dist 过期则镜像装旧产物）
npm run build

# 2) 构建前端镜像（注意构建上下文是项目根目录，-f 指定本目录 Dockerfile）
docker build -t gongwen-web:2.0.0 -f backend/nginx/Dockerfile .

# 3) 构建统计后端镜像
docker build -t gongwen-stats:1.0.0 backend/

# 4) 导出镜像到部署包（文件名带版本号）
docker save -o gongwen-deploy/images/gongwen-web-2.0.0.tar gongwen-web:2.0.0
docker save -o gongwen-deploy/images/gongwen-stats-1.0.0.tar gongwen-stats:1.0.0
```

## 技术细节

- 前端镜像基于 `nginx:stable-alpine3.21-perl`，直接复制本地 `dist/`（本地构建后部署，非多阶段构建）。
- nginx 配置**烘焙进镜像**（`default-prod.conf` → `/etc/nginx/conf.d/default.conf`），
  生产 compose 不再挂载宿主配置——**改 conf 必须重打前端镜像**。
- `/llm/` 反代 `vllm-proxy:8000`（外部网络 `vllm-proxy-net` 容器名直连，启动期 DNS 解析：
  vllm-proxy 未起则 nginx 容器起不来）；SSE 流式三件套（`proxy_buffering off`、
  `proxy_http_version 1.1`、`Connection ""`）与 600s 读超时。
- `/api` 反代统计后端容器 `gongwen-stats:8000`。
- `40-runtime-config.sh` 挂官方 nginx entrypoint 机制（`/docker-entrypoint.d/`），
  容器每次启动按 `AI_*` env 重新生成 `/usr/share/nginx/html/runtime-config.js`
  （覆盖 `public/` 拷入的默认 no-op）。

## Chrome 78 兼容性

构建时自动应用 `vite.config.ts` 中的兼容性配置：
- CSS 目标：`chrome78`
- JavaScript 目标：`chrome78`

## 常见问题

### Q: 修改 AI 模型名/密钥/采样参数后如何生效？

A: 2.0.0 起是运行时配置，**无需重打镜像**：改 `gongwen-deploy/docker-compose-prod.yml`
中 `gongwen.environment`（`AI_MODEL` / `AI_API_KEY` / `AI_TEMPERATURE` 等）后
`docker compose up -d` 即可。`AI_MODEL` 须为 vllm-proxy `backends.yaml` 别名表中存在的别名。

### Q: 什么时候才需要重打前端镜像？

A: 只有改了前端代码、`default-prod.conf` 或 `40-runtime-config.sh`（这三者都烘焙在镜像内）。

### Q: 如何在不启用 AI 功能的情况下部署？

A: `gongwen.environment` 加一行 `AI_ENABLED=false` 后 `up -d`，AI 审核按钮即隐藏。
