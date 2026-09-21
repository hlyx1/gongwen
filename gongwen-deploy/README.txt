========================================
公文排版工具（gongwen）离线部署包
前端镜像 gongwen-web:2.0.0 / 统计后端镜像 gongwen-stats:1.0.0
========================================
本目录自包含：拷贝整个目录到生产机即可部署。
（镜像 tar、compose、部署手册都在本目录内）

目录结构：
  docker-compose-prod.yml    生产编排
  host_nginx.conf            宿主 nginx 配置（:88 → 127.0.0.1:50088，真实 IP 透传）
  images/*.tar               镜像包（文件名带版本号，构建后从开发机放入）
  stats-logs/                统计后端日志挂载目录（运行期生成）

----------------------------------------
部署步骤（按顺序执行）
----------------------------------------

1) 拷贝本目录到生产机（任意路径）

2) 导入镜像
   docker load -i images/gongwen-web-2.0.0.tar
   docker load -i images/gongwen-stats-1.0.0.tar
   验证：docker images | grep gongwen

3) 确认外部依赖已启动（本 compose 只声明 external 网络，外部容器未起时
   nginx 容器直接起不来——烘焙 conf 启动期解析容器名）：
   - vllm-proxy 容器（VLLM-Proxy 部署包先起、创建 vllm-proxy-net 网络；
     AI 校对经容器名 vllm-proxy:8000 直连，proxy 按请求体 model 别名路由）
   - vllm-proxy 的 backends.yaml 别名表中须存在 compose 里 AI_MODEL 所填的
     别名（默认 Qwen3.6-35B-Thinking，指向思考引擎 Qwen3.6-35B-A3B-AWQ-4bit，
     think_fix=off 完全透传，与旧版直连 vLLM 输出形态一致）；名字不在别名表中时
     改 compose 的 AI_MODEL 为实际别名即可（改完 up -d，无需重打镜像）

4) 启动服务
   docker compose -f docker-compose-prod.yml up -d
   验证：docker compose -f docker-compose-prod.yml ps   # 两容器 Up

5) 宿主 nginx 接入（对外统一入口 :88，真实 IP 透传——统计按 IP 算单位排名必需）
   sudo cp host_nginx.conf /etc/nginx/sites-available/gongwen
   sudo ln -sf /etc/nginx/sites-available/gongwen /etc/nginx/sites-enabled/gongwen
   # 如 /etc/nginx/sites-enabled/default 占用端口可禁用：sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t && sudo systemctl reload nginx

6) 验证
   curl -s -o /dev/null -w "%{http_code}" http://localhost:88            # 200（前端，经宿主 nginx）
   curl -s http://localhost:88/api/health                                # 统计后端 healthy
   curl -s http://localhost:88/runtime-config.js                         # AI 运行时配置（model 同 compose env）
   curl -s -o /dev/null -w "%{http_code}" http://localhost:88/llm/v1/models   # vllm-proxy JSON 列表（200；非 502 即反代通）
   浏览器访问 http://<服务器IP>:88，AI 审核跑一轮（F12 网络面板可见
   /llm/v1/chat/completions 流式响应）
   （绕过宿主 nginx 直连容器验证用 http://localhost:50088）

----------------------------------------
日常维护
----------------------------------------
  日志：docker compose -f docker-compose-prod.yml logs -f gongwen|gongwen-stats
  重启：docker compose -f docker-compose-prod.yml restart gongwen
  停止：docker compose -f docker-compose-prod.yml down

----------------------------------------
换 AI 模型 / 密钥 / 参数（2.0.0 起免重打镜像）
----------------------------------------
  改 docker-compose-prod.yml 的 gongwen.environment（AI_MODEL / AI_API_KEY /
  AI_TEMPERATURE / AI_MAX_TOKENS / AI_TOP_P / AI_TOP_K / AI_MIN_P /
  AI_PRESENCE_PENALTY / AI_REPETITION_PENALTY / AI_ENABLED）→
  docker compose -f docker-compose-prod.yml up -d——容器重建即生效。
  前提：AI_MODEL 须在 vllm-proxy backends.yaml 别名表中（不在则先在 proxy 侧加别名）。
  彻底关闭 AI 功能：environment 加一行 AI_ENABLED=false 再 up -d。

----------------------------------------
升级到新版本
----------------------------------------
开发机上：
  1) 升版本号：本目录 docker-compose-prod.yml 的两处 image: 行改版本号
  2) npm run build（dist 过期则镜像装旧产物）
  3) 构建并导出变更镜像（文件名带版本号，放入 images/）：
     docker build -t gongwen-web:<新版本> -f backend/nginx/Dockerfile .
     docker save -o images/gongwen-web-<新版本>.tar gongwen-web:<新版本>
     （统计后端变更时同理 build gongwen-stats:<新版本> 并 save）
  4) 同步本目录到生产机，重跑步骤 2、4（未变更镜像无需重新 load）

  ⚠️ nginx conf 与 runtime-config 生成脚本均烘焙在前端镜像内
     （backend/nginx/default-prod.conf、backend/nginx/docker-entrypoint.d/）：
     改这两者必须重打前端镜像，只改 compose 或只 reload 不会生效。

----------------------------------------
从旧版（旧部署目录 gongwen-docker/，挂载式 compose）升级
----------------------------------------
  1) 新架构：AI 校对从「浏览器直连 vLLM 8002 端口」改为「同源 /llm/ 路径经
     vllm-proxy 容器路由」；AI 配置从「构建时 .env.production 注入（改链接须重打
     镜像）」改为「容器启动时按 env 生成 runtime-config.js（改配置只须 up -d）」。
  2) 统计历史延续：把旧部署目录 gongwen-docker/data/ 内的历史日志
     拷入本目录 stats-logs/ 即可。
  3) 宿主 nginx 侧零操作：旧版生产已按「宿主 :88 → 容器 :50088」形态配置的，
     本包沿用同一端口约定（host_nginx.conf 供新机部署用）。
  4) 旧容器下线：在旧目录 docker-compose down（旧镜像建议先留作回滚底，
     确认新版正常后 docker rmi 清掉）。
  5) 回滚＝compose 两 image 行临时指回旧名再 up -d（旧 tar 在盘时无需重新 load）。
