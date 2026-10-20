#!/usr/bin/env bash
#
# babyGame 启动脚本
# 纯静态站点，无需安装依赖；Node 只用于生成数据。
#
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5173}"
DAEMON=0
REBUILD=0
STRICT_PORT=0

usage() {
  cat <<'EOF'
用法：./start.sh [选项]

选项：
  -p, --port <端口>   监听端口（默认 5173，也可用 PORT 环境变量）
      --host <地址>   监听地址（默认 127.0.0.1；容器/远程用 0.0.0.0）
  -d, --daemon        后台运行，日志写入 .run/server.log
      --rebuild       启动前重新生成数据（npm run data）
      --strict-port   端口被占用时直接退出，不自动顺延
      --stop          停止后台实例
  -h, --help          显示本帮助

示例：
  ./start.sh                    前台启动，Ctrl+C 结束
  ./start.sh -d                 后台启动
  ./start.sh --stop             停止后台实例
  ./start.sh -p 8081 -d         指定端口后台启动
  ./start.sh --rebuild          改完书稿后重建数据再启动
EOF
}

log()  { printf '%s\n' "$*"; }
fail() { printf '✗ %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)      [[ $# -ge 2 ]] || fail "缺少端口号"; PORT="$2"; shift 2 ;;
    --host)         [[ $# -ge 2 ]] || fail "缺少监听地址"; HOST="$2"; shift 2 ;;
    -d|--daemon)    DAEMON=1; shift ;;
    --rebuild)      REBUILD=1; shift ;;
    --strict-port)  STRICT_PORT=1; shift ;;
    --stop)         STOP=1; shift ;;
    -h|--help)      usage; exit 0 ;;
    *)              fail "未知参数：$1（用 --help 查看用法）" ;;
  esac
done

[[ "$PORT" =~ ^[0-9]+$ ]] || fail "端口必须是数字：$PORT"
mkdir -p "$RUN_DIR"

# 监听地址用于健康检查：0.0.0.0 时探测本机回环。
probe_host="$HOST"
[[ "$probe_host" == "0.0.0.0" || "$probe_host" == "::" ]] && probe_host="127.0.0.1"

port_open() { (exec 3<>"/dev/tcp/$probe_host/$1") >/dev/null 2>&1; }

alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

stop_daemon() {
  if [[ ! -f "$PID_FILE" ]]; then
    log "没有找到后台实例（$PID_FILE）"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  if ! alive "$pid"; then
    rm -f "$PID_FILE"
    log "进程 $pid 已不存在，清理了残留的 pid 文件"
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    alive "$pid" || break
    sleep 0.1
  done
  alive "$pid" && kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  log "已停止后台实例（pid $pid）"
}

if [[ "${STOP:-0}" -eq 1 ]]; then
  stop_daemon
  exit 0
fi

# 已在后台运行时直接复用。
if [[ -f "$PID_FILE" ]]; then
  running_pid="$(cat "$PID_FILE")"
  if alive "$running_pid"; then
    if [[ "$DAEMON" -eq 1 ]]; then
      log "后台实例已在运行（pid $running_pid）：http://$HOST:$PORT/"
      log "如需重启：./start.sh --stop && ./start.sh -d"
      exit 0
    fi
    log "警告：检测到后台实例（pid $running_pid），前台启动可能端口冲突。" >&2
  else
    rm -f "$PID_FILE"
  fi
fi

[[ -f "$ROOT/index.html" ]] || fail "找不到 index.html，脚本需放在项目根目录"

command -v python3 >/dev/null 2>&1 || fail "需要 python3 提供静态服务（或改用 npm run serve）"

# 数据缺失或要求重建时生成。
if [[ "$REBUILD" -eq 1 || ! -f "$ROOT/data/toc.json" ]]; then
  command -v node >/dev/null 2>&1 || fail "生成数据需要 Node ≥ 18"
  log "· 生成数据（npm run data）……"
  ( cd "$ROOT" && npm run --silent data ) || fail "数据生成失败，先看上面的报错"
fi

# 端口被占用时自动顺延。
if port_open "$PORT"; then
  if [[ "$STRICT_PORT" -eq 1 ]]; then
    fail "端口 $PORT 已被占用（去掉 --strict-port 可自动顺延）"
  fi
  base_port="$PORT"
  for candidate in $(seq "$((base_port + 1))" "$((base_port + 20))"); do
    if ! port_open "$candidate"; then
      PORT="$candidate"
      log "· 端口 $base_port 被占用，改用 $PORT"
      break
    fi
  done
  [[ "$PORT" != "$base_port" ]] || fail "端口 ${base_port}-$((base_port + 20)) 全部被占用"
fi

url="http://$probe_host:$PORT/"

# 只起一层子 shell 并 exec，保证 $! 就是 python 的 pid。
if [[ "$DAEMON" -eq 1 ]]; then
  ( cd "$ROOT" && exec python3 -m http.server "$PORT" --bind "$HOST" --directory "$ROOT" ) >"$LOG_FILE" 2>&1 &
else
  ( cd "$ROOT" && exec python3 -m http.server "$PORT" --bind "$HOST" --directory "$ROOT" ) &
fi
SERVER_PID=$!

# 只删除属于本次启动的 pid 文件，避免前台实例误删后台实例的记录。
remove_own_pid() {
  [[ -f "$PID_FILE" ]] || return 0
  [[ "$(cat "$PID_FILE" 2>/dev/null)" == "$SERVER_PID" ]] && rm -f "$PID_FILE"
  return 0
}

on_signal() {
  if alive "$SERVER_PID"; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  remove_own_pid
  exit 130
}

# 后台实例的生命周期由 --stop 管理，脚本退出时不能顺手杀它。
trap on_signal INT TERM
trap '[[ "$DAEMON" -eq 1 ]] || remove_own_pid' EXIT

# 健康检查：拿到 200 再宣布成功。
ready=0
for _ in $(seq 1 60); do
  alive "$SERVER_PID" || break
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "$url" 2>/dev/null && { ready=1; break; }
  elif port_open "$PORT"; then
    ready=1
    break
  fi
  sleep 0.1
done

if [[ "$ready" -ne 1 ]]; then
  if [[ "$DAEMON" -eq 1 ]]; then
    log "✗ 服务未能就绪，日志尾部：" >&2
    tail -n 20 "$LOG_FILE" >&2 || true
  fi
  alive "$SERVER_PID" && kill "$SERVER_PID" 2>/dev/null || true
  fail "启动失败（端口 $PORT）"
fi

if [[ "$DAEMON" -eq 1 ]]; then
  printf '%s' "$SERVER_PID" >"$PID_FILE"
fi

log ""
log "  babyGame 已启动"
log "  地址   $url"
log "  端口   $PORT   监听 $HOST"
log "  数据   data/toc.json · 130 个游戏"
if [[ "$DAEMON" -eq 1 ]]; then
  log "  日志   .run/server.log"
  log "  停止   ./start.sh --stop"
else
  log "  停止   Ctrl+C"
fi
log ""

if [[ "$DAEMON" -eq 1 ]]; then
  exit 0
fi

wait "$SERVER_PID"
