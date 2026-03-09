# 公文排版工具 - Docker 镜像构建文件
# 使用本地已构建的 dist 目录

# 单阶段构建：直接使用本地 dist 目录
FROM nginx:stable-alpine3.21-perl

# 删除 nginx 默认配置
RUN rm /etc/nginx/nginx.conf

# 复制自定义 nginx 配置（配置文件通过挂载方式，这里仅作备用）
# 实际运行时通过 docker-compose 挂载

# 从本地 dist 目录复制构建产物
# 注意：构建镜像前需要先在本地运行 npm run build
COPY dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
