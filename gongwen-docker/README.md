# Docker 部署指南

## 快速开始

```bash
# 进入 docker 目录
cd gongwen-docker

```bash
docker-compose up -d --build
```

## 导出/导入镜像

```bash
# 导出镜像
docker save gongwen-web:latest -o gongwen-web-latest.tar

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
