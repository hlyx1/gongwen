# Docker 部署指南

## 快速开始

```bash
# 进入 docker 目录
cd gongwen-docker

# 构建并启动容器（无 AI 功能）
docker-compose up -d --build
```

访问 `http://localhost:88` 即可使用。

## AI 审核功能配置

如需启用 AI 审核功能，需要配置 AI 服务参数。

### 方式一：使用 .env 文件（推荐）

1. 在 `gongwen-docker` 目录下创建 `.env` 文件：

```bash
# AI服务配置
VITE_AI_BASE_URL=https://api.openai.com/v1/chat/completions
VITE_AI_MODEL=gpt-4o
VITE_AI_API_KEY=your-api-key-here
VITE_AI_TEMPERATURE=0.3
VITE_AI_MAX_TOKENS=4096
```

2. 构建并启动：

```bash
docker-compose up -d --build
```

### 方式二：使用环境变量

```bash
# Linux/macOS
export VITE_AI_BASE_URL="https://api.openai.com/v1/chat/completions"
export VITE_AI_MODEL="gpt-4o"
export VITE_AI_API_KEY="your-api-key-here"
docker-compose up -d --build

# Windows PowerShell
$env:VITE_AI_BASE_URL="https://api.openai.com/v1/chat/completions"
$env:VITE_AI_MODEL="gpt-4o"
$env:VITE_AI_API_KEY="your-api-key-here"
docker-compose up -d --build
```

### 方式三：命令行参数

```bash
docker-compose build --build-arg VITE_AI_BASE_URL="https://api.openai.com/v1/chat/completions" \
  --build-arg VITE_AI_MODEL="gpt-4o" \
  --build-arg VITE_AI_API_KEY="your-api-key-here"
docker-compose up -d
```

## 配置说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VITE_AI_BASE_URL` | AI API 服务地址 | 空（不启用 AI 功能） |
| `VITE_AI_MODEL` | AI 模型名称 | 空 |
| `VITE_AI_API_KEY` | API 密钥 | 空 |
| `VITE_AI_TEMPERATURE` | 温度参数 | 0.3 |
| `VITE_AI_MAX_TOKENS` | 最大 token 数 | 4096 |

**注意**：
- AI 配置在**构建时**注入，修改配置后需要重新构建镜像
- `.env` 文件包含敏感信息，**切勿提交到 Git**
- 项目根目录的 `.gitignore` 已配置忽略 `.env` 文件

## 导出/导入镜像

```bash
# 导出镜像
docker save gongwen:latest -o gongwen-latest.tar

# 导入镜像
docker load -i gongwen-latest.tar

# 导入后启动
docker-compose up -d
```

## 技术细节

### 多阶段构建

Dockerfile 采用多阶段构建：

1. **构建阶段**：使用 `node:20-alpine` 镜像编译前端代码
   - 自动处理 `.env.production` 配置
   - 应用 Chrome 78 兼容性配置
   - 生成优化后的静态文件

2. **生产阶段**：使用 `nginx:stable-alpine3.21-perl` 镜像
   - 仅包含编译后的静态文件
   - 镜像体积更小，更安全

### Chrome 78 兼容性

构建时自动应用 `vite.config.ts` 中的兼容性配置：
- CSS 目标：`chrome78`
- JavaScript 目标：`chrome78`
- 禁用 `inset`、`gap` 等新 CSS 特性

## 常见问题

### Q: 修改 AI 配置后不生效？

A: AI 配置在构建时注入，需要重新构建镜像：

```bash
docker-compose up -d --build
```

### Q: 如何查看当前配置？

A: AI 配置会被编译到 JavaScript 文件中，无法直接查看。建议保留 `.env` 文件作为配置记录。

### Q: 如何在不启用 AI 功能的情况下部署？

A: 直接运行 `docker-compose up -d --build`，不创建 `.env` 文件即可。AI 审核按钮将不会显示。
