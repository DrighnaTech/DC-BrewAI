from prometheus_client import Counter, Histogram, Gauge

chat_requests_total = Counter(
    "brewai_chat_requests_total",
    "Total chat requests",
    ["model"],
)

chat_latency_seconds = Histogram(
    "brewai_chat_latency_seconds",
    "Chat response latency in seconds",
    ["model"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
)

tokens_total = Counter(
    "brewai_tokens_total",
    "Total tokens processed",
    ["direction"],  # in / out
)

feedback_total = Counter(
    "brewai_feedback_total",
    "Feedback submissions",
    ["rating"],  # positive / negative
)

finetune_jobs_total = Counter(
    "brewai_finetune_jobs_total",
    "Fine-tune jobs triggered",
    ["status"],  # triggered / completed / failed
)

active_model_info = Gauge(
    "brewai_active_model_info",
    "Currently active model (value=1)",
    ["model_name"],
)
