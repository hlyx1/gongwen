# 公文排版工具 - Docker 镜像构建文件
# 多阶段构建：先构建前端，再打包到 nginx 镜像

# 阶段1：构建前端
FROM node:22-alpine3.22 AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建生产版本
RUN npm run build

# 阶段2：nginx 部署
FROM nginx:stable-alpine3.21-perl

# 删除 nginx 默认配置
RUN rm /etc/nginx/nginx.conf

# 复制自定义 nginx 配置（配置文件通过挂载方式，这里仅作备用）
# 实际运行时通过 docker-compose 挂载

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
