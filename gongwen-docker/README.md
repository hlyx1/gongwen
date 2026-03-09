# Docker 命令

## 构建流程

```bash
# 1. 先在项目根目录构建前端（确保 vite.config.ts 中的兼容性配置生效）
npm run build

# 2. 进入 docker 目录
cd gongwen-docker

# 3. 构建并启动容器
docker-compose up -d --build
```

## 导出/导入镜像

```bash
# 导出镜像
docker save gongwen:latest -o gongwen-latest.tar

# 导入镜像
docker load -i gongwen-latest.tar
```

## 注意事项

- 构建镜像前**必须**先在本地运行 `npm run build` 生成 `dist` 目录
- 本地构建会应用 `vite.config.ts` 中的 Chrome 78 兼容性配置（禁用 `inset` 等 CSS 新特性）
- 如果修改了前端代码，需要重新构建 `dist` 目录后再构建镜像
