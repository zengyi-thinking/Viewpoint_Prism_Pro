import asyncio
import os
import signal
import shutil
import shlex
import socket
import subprocess
from pathlib import Path
from typing import Dict, Iterable, Optional

from aiohttp import ClientConnectionResetError, ClientSession, ClientTimeout, WSMsgType, web


ROOT = Path(__file__).resolve().parent
PUBLIC_HOST = os.getenv("HOST", "0.0.0.0")
PUBLIC_PORT = int(os.getenv("PORT", "7860"))
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "7861"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "7862"))
AUTO_PRISMA_PUSH = os.getenv("AUTO_PRISMA_PUSH", "1") == "1"
ALLOW_START_WITHOUT_DB = os.getenv("ALLOW_START_WITHOUT_DB", "1") == "1"
DATA_ROOT = Path(os.getenv("APP_DATA_ROOT", "/home/user/data"))

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5433"))
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "viewpoint_prism")
POSTGRES_DATA_DIR = Path(os.getenv("POSTGRES_DATA_DIR", str(DATA_ROOT / "postgres")))
POSTGRES_LOG_FILE = Path(os.getenv("POSTGRES_LOG_FILE", str(DATA_ROOT / "postgresql.log")))

REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DATA_DIR = Path(os.getenv("REDIS_DATA_DIR", str(DATA_ROOT / "redis")))

MINIO_HOST = os.getenv("MINIO_HOST", "127.0.0.1")
MINIO_PORT = int(os.getenv("MINIO_PORT", "9000"))
MINIO_CONSOLE_PORT = int(os.getenv("MINIO_CONSOLE_PORT", "9001"))
MINIO_DATA_DIR = Path(os.getenv("MINIO_DATA_DIR", str(DATA_ROOT / "minio")))
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "viewpoint-prism")
MINIO_USE_SSL = os.getenv("MINIO_USE_SSL", "false")

PROCESSES: list[subprocess.Popen] = []
POSTGRES_STARTED = False


def log(message: str) -> None:
    print(f"[modelscope-launcher] {message}", flush=True)


def run(
    cmd: Iterable[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
) -> None:
    cmd = list(cmd)
    log(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd or ROOT), env=env, check=True)


def spawn(
    cmd: Iterable[str],
    cwd: Optional[Path] = None,
    env: Optional[Dict[str, str]] = None,
) -> subprocess.Popen:
    cmd = list(cmd)
    log(f"Spawning: {' '.join(cmd)}")
    process = subprocess.Popen(cmd, cwd=str(cwd or ROOT), env=env)
    PROCESSES.append(process)
    return process


def merged_env(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    env = os.environ.copy()
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def set_internal_defaults() -> None:
    os.environ.setdefault(
        "DATABASE_URL",
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}",
    )
    os.environ.setdefault("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}")
    os.environ.setdefault("MINIO_ENDPOINT", MINIO_HOST)
    os.environ.setdefault("MINIO_PORT", str(MINIO_PORT))
    os.environ.setdefault("MINIO_ACCESS_KEY", MINIO_ACCESS_KEY)
    os.environ.setdefault("MINIO_SECRET_KEY", MINIO_SECRET_KEY)
    os.environ.setdefault("MINIO_BUCKET", MINIO_BUCKET)
    os.environ.setdefault("MINIO_USE_SSL", MINIO_USE_SSL)
    os.environ.setdefault("FFMPEG_PATH", "ffmpeg")
    os.environ.setdefault("AUTH_AUTO_REGISTER_ON_LOGIN", "1")


def port_is_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


async def wait_for_port(host: str, port: int, timeout: float = 120.0) -> None:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        if port_is_open(host, port):
            return
        await asyncio.sleep(1)
    raise TimeoutError(f"Timeout waiting for {host}:{port}")


def find_postgres_binary(name: str) -> str:
    direct = shutil.which(name)
    if direct:
        return direct
    candidates = sorted(Path("/usr/lib/postgresql").glob(f"*/bin/{name}"))
    if not candidates:
        raise RuntimeError(f"PostgreSQL binary not found: {name}")
    return str(candidates[-1])


def run_as_postgres(command: Iterable[str]) -> subprocess.CompletedProcess[str]:
    cmd = " ".join(shlex.quote(str(part)) for part in command)
    log(f"Running as postgres: {cmd}")
    return subprocess.run(
        ["su", "-s", "/bin/sh", "postgres", "-c", cmd],
        check=True,
        text=True,
        capture_output=True,
    )


def ensure_directory(path: Path, owner: Optional[str] = None) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if owner:
        shutil.chown(path, user=owner, group=owner)


def chown_tree(path: Path, owner: str) -> None:
    if not path.exists():
        return
    shutil.chown(path, user=owner, group=owner)
    for child in path.rglob("*"):
        try:
            shutil.chown(child, user=owner, group=owner)
        except FileNotFoundError:
            continue


def initialize_postgres() -> None:
    ensure_directory(DATA_ROOT)
    ensure_directory(POSTGRES_DATA_DIR, owner="postgres")
    ensure_directory(POSTGRES_LOG_FILE.parent, owner="postgres")
    chown_tree(POSTGRES_DATA_DIR, "postgres")

    initdb = find_postgres_binary("initdb")
    if (POSTGRES_DATA_DIR / "PG_VERSION").exists():
        return

    password_file = DATA_ROOT / ".postgres-password"
    password_file.write_text(POSTGRES_PASSWORD, encoding="utf-8")
    shutil.chown(password_file, user="postgres", group="postgres")
    password_file.chmod(0o600)

    try:
        run_as_postgres(
            [
                initdb,
                "-D",
                str(POSTGRES_DATA_DIR),
                "--auth-local=trust",
                "--auth-host=scram-sha-256",
                "-U",
                POSTGRES_USER,
                f"--pwfile={password_file}",
            ]
        )
    finally:
        password_file.unlink(missing_ok=True)

    conf = POSTGRES_DATA_DIR / "postgresql.conf"
    conf.write_text(
        conf.read_text(encoding="utf-8")
        + (
            f"\nlisten_addresses = '{POSTGRES_HOST}'\n"
            f"port = {POSTGRES_PORT}\n"
            "max_connections = 100\n"
            "shared_buffers = 128MB\n"
            "fsync = off\n"
            "full_page_writes = off\n"
        ),
        encoding="utf-8",
    )


def start_postgres() -> None:
    global POSTGRES_STARTED
    initialize_postgres()
    if port_is_open(POSTGRES_HOST, POSTGRES_PORT):
        POSTGRES_STARTED = True
        return

    pg_ctl = find_postgres_binary("pg_ctl")
    run_as_postgres(
        [
            pg_ctl,
            "-D",
            str(POSTGRES_DATA_DIR),
            "-l",
            str(POSTGRES_LOG_FILE),
            "start",
        ]
    )
    POSTGRES_STARTED = True


def stop_postgres() -> None:
    if not POSTGRES_STARTED:
        return
    try:
        pg_ctl = find_postgres_binary("pg_ctl")
        run_as_postgres(
            [
                pg_ctl,
                "-D",
                str(POSTGRES_DATA_DIR),
                "stop",
                "-m",
                "fast",
            ]
        )
    except Exception as exc:
        log(f"PostgreSQL stop warning: {exc}")


def ensure_postgres_database() -> None:
    createdb = find_postgres_binary("createdb")
    psql = find_postgres_binary("psql")

    try:
        result = run_as_postgres(
            [
                psql,
                "-tAc",
                f"SELECT 1 FROM pg_database WHERE datname = '{POSTGRES_DB}'",
                "-p",
                str(POSTGRES_PORT),
                "postgres",
            ]
        )
        if result.stdout.strip() == "1":
            return
    except subprocess.CalledProcessError:
        pass

    run_as_postgres([createdb, "-p", str(POSTGRES_PORT), POSTGRES_DB])


def start_redis() -> None:
    ensure_directory(REDIS_DATA_DIR)
    if port_is_open(REDIS_HOST, REDIS_PORT):
        return
    spawn(
        [
            "redis-server",
            "--bind",
            REDIS_HOST,
            "--port",
            str(REDIS_PORT),
            "--dir",
            str(REDIS_DATA_DIR),
            "--save",
            "",
            "--appendonly",
            "no",
            "--protected-mode",
            "no",
        ]
    )


def start_minio() -> None:
    ensure_directory(MINIO_DATA_DIR)
    if port_is_open(MINIO_HOST, MINIO_PORT):
        return
    minio_env = merged_env(
        {
            "MINIO_ROOT_USER": MINIO_ACCESS_KEY,
            "MINIO_ROOT_PASSWORD": MINIO_SECRET_KEY,
        }
    )
    spawn(
        [
            "minio",
            "server",
            str(MINIO_DATA_DIR),
            "--address",
            f"{MINIO_HOST}:{MINIO_PORT}",
            "--console-address",
            f"{MINIO_HOST}:{MINIO_CONSOLE_PORT}",
        ],
        env=minio_env,
    )


async def start_infrastructure() -> None:
    set_internal_defaults()
    start_postgres()
    await wait_for_port(POSTGRES_HOST, POSTGRES_PORT)
    ensure_postgres_database()

    start_redis()
    await wait_for_port(REDIS_HOST, REDIS_PORT)

    start_minio()
    await wait_for_port(MINIO_HOST, MINIO_PORT)


def prepare_runtime() -> None:
    if AUTO_PRISMA_PUSH:
        try:
            run(["npm", "run", "db:push"])
        except subprocess.CalledProcessError as exc:
            if not ALLOW_START_WITHOUT_DB:
                raise
            log(
                "Database migration skipped because database is unreachable. "
                "The site will still start, but any feature that depends on PostgreSQL "
                "will fail until DATABASE_URL points to a reachable database. "
                f"Original exit code: {exc.returncode}"
            )


async def start_services() -> None:
    await start_infrastructure()
    prepare_runtime()

    backend_env = merged_env(
        {
            "HOST": "127.0.0.1",
            "PORT": str(BACKEND_PORT),
        }
    )
    frontend_env = merged_env(
        {
            "HOST": "127.0.0.1",
            "PORT": str(FRONTEND_PORT),
            "INTERNAL_API_URL": f"http://127.0.0.1:{BACKEND_PORT}",
            "NEXT_PUBLIC_API_URL": "",
            "NEXT_PUBLIC_WS_URL": "",
        }
    )

    spawn(["node", "dist/src/main.js"], cwd=ROOT / "server", env=backend_env)
    await wait_for_port("127.0.0.1", BACKEND_PORT)

    spawn(
        [
            "node",
            "../node_modules/next/dist/bin/next",
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            str(FRONTEND_PORT),
        ],
        cwd=ROOT / "client",
        env=frontend_env,
    )
    await wait_for_port("127.0.0.1", FRONTEND_PORT)
    log("Frontend and backend are ready.")


HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
}


def choose_target(request: web.Request) -> str:
    path = request.rel_url.path
    if path.startswith("/api/") or path.startswith("/socket.io/"):
        return f"http://127.0.0.1:{BACKEND_PORT}"
    if path.startswith("/storage/"):
        return f"http://{MINIO_HOST}:{MINIO_PORT}"
    return f"http://127.0.0.1:{FRONTEND_PORT}"


async def proxy_websocket(request: web.Request, target_base: str) -> web.WebSocketResponse:
    ws_server = web.WebSocketResponse()
    await ws_server.prepare(request)

    target_url = f"{target_base}{request.rel_url}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS}

    async with ClientSession() as session:
        async with session.ws_connect(target_url, headers=headers) as ws_client:
            async def forward_client() -> None:
                async for msg in ws_server:
                    if msg.type == WSMsgType.TEXT:
                        await ws_client.send_str(msg.data)
                    elif msg.type == WSMsgType.BINARY:
                        await ws_client.send_bytes(msg.data)
                    elif msg.type == WSMsgType.CLOSE:
                        await ws_client.close()

            async def forward_backend() -> None:
                async for msg in ws_client:
                    if msg.type == WSMsgType.TEXT:
                        await ws_server.send_str(msg.data)
                    elif msg.type == WSMsgType.BINARY:
                        await ws_server.send_bytes(msg.data)
                    elif msg.type == WSMsgType.CLOSE:
                        await ws_server.close()

            await asyncio.gather(forward_client(), forward_backend())

    return ws_server


async def proxy_http(request: web.Request) -> web.StreamResponse:
    target_base = choose_target(request)
    connection_hdr = request.headers.get("Upgrade", "").lower()
    if connection_hdr == "websocket":
        return await proxy_websocket(request, target_base)

    if request.rel_url.path.startswith("/storage/"):
        rewritten_path = "/" + request.rel_url.path[len("/storage/") :].lstrip("/")
        target_url = f"{target_base}{rewritten_path}"
        if request.rel_url.query_string:
            target_url = f"{target_url}?{request.rel_url.query_string}"
    else:
        target_url = f"{target_base}{request.rel_url}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS}
    body = await request.read()

    timeout = ClientTimeout(total=None)
    async with ClientSession(timeout=timeout, auto_decompress=False) as session:
        async with session.request(
            request.method,
            target_url,
            headers=headers,
            data=body if body else None,
            allow_redirects=False,
        ) as resp:
            proxy_headers = {
                k: v for k, v in resp.headers.items() if k.lower() not in HOP_HEADERS
            }
            streamed = web.StreamResponse(
                status=resp.status,
                reason=resp.reason,
                headers=proxy_headers,
            )
            try:
                await streamed.prepare(request)
                async for chunk in resp.content.iter_chunked(65536):
                    await streamed.write(chunk)
                await streamed.write_eof()
                return streamed
            except (ClientConnectionResetError, ConnectionResetError, BrokenPipeError):
                log(
                    f"Client disconnected while proxying {request.method} {request.rel_url.path}"
                )
                return streamed


async def on_startup(_: web.Application) -> None:
    await start_services()


async def on_cleanup(_: web.Application) -> None:
    for proc in reversed(PROCESSES):
        if proc.poll() is None:
            proc.terminate()
    for proc in reversed(PROCESSES):
        if proc.poll() is None:
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    stop_postgres()


def main() -> None:
    app = web.Application(client_max_size=1024**3)
    app.router.add_route("*", "/{path_info:.*}", proxy_http)
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    def handle_signal(*_: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    log(f"Starting public proxy on http://{PUBLIC_HOST}:{PUBLIC_PORT}")
    web.run_app(app, host=PUBLIC_HOST, port=PUBLIC_PORT, handle_signals=False)


if __name__ == "__main__":
    main()
