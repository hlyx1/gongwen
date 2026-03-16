# 公文排版工具 - Docker 镜像构建文件
# 直接复制本地构建的 dist 目录，适用于本地构建后部署

# ==================== 生产阶段 ====================
FROM nginx:stable-alpine3.21-perl

# 删除 nginx 默认配置
RUN rm /etc/nginx/nginx.conf

# 从构建上下文复制本地构建的 dist 目录
# 需要先在项目根目录运行: npm run build
COPY dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
