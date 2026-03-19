"""Pydantic 请求/响应模型"""

from pydantic import BaseModel


class RecordRequest(BaseModel):
    """记录请求体"""
    action: str


class RecordResponse(BaseModel):
    """记录响应体"""
    ok: bool = True


class SummaryResponse(BaseModel):
    """统计查询响应体"""
    period_days: int
    unique_users: int
    total_calls: int
    export_docx_calls: int
    ai_proofread_calls: int
