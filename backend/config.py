"""配置常量"""

import os

# 日志文件路径（容器内挂载目录）
LOG_FILE_PATH = os.environ.get("STATS_LOG_PATH", "/data/stats.log")

# 防抖间隔（秒）
DEBOUNCE_SECONDS = 10

# 防抖缓存清理间隔（秒）
DEBOUNCE_CLEANUP_INTERVAL = 600

# 有效的功能名称集合
VALID_ACTIONS = {"export_docx", "ai_proofread"}
