"""统计服务核心逻辑：防抖缓存、日志写入、统计聚合"""

import asyncio
import os
import time
from datetime import datetime, timedelta

from config import LOG_FILE_PATH, DEBOUNCE_SECONDS, DEBOUNCE_CLEANUP_INTERVAL, VALID_ACTIONS


# 防抖缓存：key=(IP, action)，value=上次记录的时间戳
_debounce_cache: dict[tuple[str, str], float] = {}


def is_debounced(ip: str, action: str) -> bool:
    """检查是否处于防抖期内，如果不在防抖期则更新缓存并返回 False"""
    key = (ip, action)
    now = time.time()
    last_time = _debounce_cache.get(key)
    if last_time is not None and (now - last_time) < DEBOUNCE_SECONDS:
        return True
    _debounce_cache[key] = now
    return False


def cleanup_debounce_cache() -> None:
    """清理过期的防抖缓存条目（超过 60 秒的记录）"""
    now = time.time()
    expired_keys = [
        key for key, ts in _debounce_cache.items()
        if (now - ts) > 60
    ]
    for key in expired_keys:
        _debounce_cache.pop(key, None)


async def periodic_cleanup() -> None:
    """后台定时清理防抖缓存"""
    while True:
        await asyncio.sleep(DEBOUNCE_CLEANUP_INTERVAL)
        cleanup_debounce_cache()


def append_log(ip: str, action: str) -> None:
    """追加一条记录到日志文件"""
    # 确保日志目录存在
    log_dir = os.path.dirname(LOG_FILE_PATH)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    line = f"{timestamp}\t{ip}\t{action}\n"
    with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
        f.write(line)


def get_summary(days: int) -> dict:
    """读取日志文件并聚合统计数据

    参数:
        days: 统计天数范围，0 表示全部记录
    返回:
        统计结果字典
    """
    unique_ips: set[str] = set()
    total_calls = 0
    export_docx_calls = 0
    ai_proofread_calls = 0

    # 计算截止时间
    if days > 0:
        cutoff = datetime.now() - timedelta(days=days)
    else:
        cutoff = None

    # 如果日志文件不存在，返回全零结果
    if not os.path.exists(LOG_FILE_PATH):
        return {
            "period_days": days,
            "unique_users": 0,
            "total_calls": 0,
            "export_docx_calls": 0,
            "ai_proofread_calls": 0,
        }

    with open(LOG_FILE_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            timestamp_str, ip, action = parts

            # 解析时间，格式损坏则跳过
            try:
                timestamp = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                continue

            # 按时间范围过滤
            if cutoff is not None and timestamp < cutoff:
                continue

            # 验证 action 是否合法
            if action not in VALID_ACTIONS:
                continue

            unique_ips.add(ip)
            total_calls += 1
            if action == "export_docx":
                export_docx_calls += 1
            elif action == "ai_proofread":
                ai_proofread_calls += 1

    return {
        "period_days": days,
        "unique_users": len(unique_ips),
        "total_calls": total_calls,
        "export_docx_calls": export_docx_calls,
        "ai_proofread_calls": ai_proofread_calls,
    }
