"""公文排版工具 - 统计服务"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from routers.stats import router as stats_router
from services.stats_service import periodic_cleanup


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：启动后台清理任务"""
    cleanup_task = asyncio.create_task(periodic_cleanup())
    yield
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="公文排版工具 - 统计服务",
    version="1.0.0",
    lifespan=lifespan,
)

# 注册路由
app.include_router(stats_router)


@app.get("/api/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}
