import multiprocessing
import os

# Gunicorn Configuration File

# Host and Port
host = os.getenv("HOST", "0.0.0.0")
port = os.getenv("PORT", "8000")
bind = f"{host}:{port}"

# Worker Configuration
# Recommended number of workers: (2 x num_cores) + 1
workers_per_core = 2
cores = multiprocessing.cpu_count()
default_web_concurrency = workers_per_core * cores + 1
workers = int(os.getenv("WEB_CONCURRENCY", default_web_concurrency))

# Use Uvicorn's worker class for ASGI support
worker_class = "uvicorn.workers.UvicornWorker"

# Timeout settings (to prevent hanging workers)
keepalive = 120
timeout = 120

# Logging
accesslog = "-"  # Log to stdout
errorlog = "-"  # Log to stderr
loglevel = os.getenv("LOG_LEVEL", "info")
