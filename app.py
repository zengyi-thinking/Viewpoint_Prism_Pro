import asyncio
import os
import shutil
import signal
import socket
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, Optional

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web


ROOT = Path(__file__).resolve().parent
PUBLIC_HOST = os.getenv("HOST", "0.0.0.0")
PUBLIC_PORT = int(os.getenv("PORT", "7860"))
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "7861"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "7862"))
INSTALL_DEPS = os.getenv("MODEL_SCOPE_INSTALL_DEPS", "1") == "1"

PROCESSES: list[subprocess.Popen] = []


def log(message: str) -> None:
    print(f"[modelscope-launcher] {message}", flush=True)


def ensure_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Missing required command: {name}")


def run(cmd: Iterable[str], cwd: Optional[Path] = None, env: Optional[Dict[str, str]] = None) -> None:
    cmd = list(cmd)
    log(f"Running: {' '.join(cmd)}")
    subprocess.run(
        cmd,
        cwd=str(cwd or ROOT),
        env=env,
        check=True,
    )


def spawn(cmd: Iterable[str], cwd: Optional[Path] = None, env: Optional[Dict[str, str]] = None) -> subprocess.Popen:
    cmd = list(cmd)
    log(f"Spawning: {' '.join(cmd)}")
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd or ROOT),
        env=env,
    )
    PROCESSES.append(process)
    return process


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


def merged_env(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    env = os.environ.copy()
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def maybe_install_and_build() -> None:
    ensure_command("node")
    ensure_command("npm")

    if INSTALL_DEPS and not (ROOT / "node_modules").exists():
        run(["npm", "install", "--workspaces", "--include-workspace-root"])

    run(["npm", "--prefix", "server", "run", "prisma:generate"])
    run(["npm", "--prefix", "server", "run", "build"])
    run(["npm", "--prefix", "client", "run", "build"])


async def start_services() -> None:
    maybe_install_and_build()

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

    spawn(["npm", "--prefix", "server", "run", "start:prod"], env=backend_env)
    await wait_for_port("127.0.0.1", BACKEND_PORT)

    spawn(
        ["npm", "--prefix", "client", "run", "start", "--", "--hostname", "127.0.0.1", "--port", str(FRONTEND_PORT)],
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
}


def choose_target(request: web.Request) -> str:
    path = request.rel_url.path
    if path.startswith("/api/") or path.startswith("/socket.io/"):
        return f"http://127.0.0.1:{BACKEND_PORT}"
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

    target_url = f"{target_base}{request.rel_url}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_HEADERS}
    body = await request.read()

    timeout = ClientTimeout(total=None)
    async with ClientSession(timeout=timeout) as session:
        async with session.request(
            request.method,
            target_url,
            headers=headers,
            data=body if body else None,
            allow_redirects=False,
        ) as resp:
            proxy_headers = {
                k: v
                for k, v in resp.headers.items()
                if k.lower() not in HOP_HEADERS
            }
            streamed = web.StreamResponse(status=resp.status, reason=resp.reason, headers=proxy_headers)
            await streamed.prepare(request)
            async for chunk in resp.content.iter_chunked(65536):
                await streamed.write(chunk)
            await streamed.write_eof()
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
    try:
        import aiohttp  # noqa: F401
    except Exception as exc:  # pragma: no cover
        raise SystemExit(f"aiohttp is required: {exc}")
    main()
