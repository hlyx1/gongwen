"""统计相关路由"""

from fastapi import APIRouter, Request, HTTPException, Query

from models import RecordRequest, RecordResponse, SummaryResponse
from config import VALID_ACTIONS
from services.stats_service import is_debounced, append_log, get_summary

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.post("/record", response_model=RecordResponse)
async def record(req: RecordRequest, request: Request) -> RecordResponse:
    """记录用户使用行为"""
    # 验证 action 合法性
    if req.action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="invalid action")

    # 获取用户真实 IP（nginx 反向代理注入的头）
    ip = (
        request.headers.get("x-real-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )

    # 防抖检查
    if is_debounced(ip, req.action):
        return RecordResponse(ok=True)

    # 写入日志
    append_log(ip, req.action)
    return RecordResponse(ok=True)


@router.get("/summary", response_model=SummaryResponse)
async def summary(days: int = Query(default=7, ge=0)) -> SummaryResponse:
    """查询统计数据"""
    result = get_summary(days)
    return SummaryResponse(**result)
