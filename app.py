import os
from typing import Iterable

import gradio as gr


APP_TITLE = "Viewpoint Prism Pro"
APP_SUBTITLE = "ModelScope Studio Python Edition"


ENV_GROUPS = {
    "基础运行": [
        "HOST",
        "PORT",
        "DATABASE_URL",
        "REDIS_URL",
        "JWT_SECRET",
        "NEXTAUTH_SECRET",
        "NEXTAUTH_URL",
        "BYOK_ENCRYPTION_KEY",
    ],
    "文件能力": [
        "MINIO_ENDPOINT",
        "MINIO_PORT",
        "MINIO_ACCESS_KEY",
        "MINIO_SECRET_KEY",
        "MINIO_BUCKET",
        "FFMPEG_PATH",
    ],
    "AI Key": [
        "SILICONFLOW_KEY",
        "GEMINI_KEY",
        "OPENAI_KEY",
        "ELEVENLABS_KEY",
    ],
}


def _mask_value(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}***{value[-4:]}"


def _build_env_rows(group_name: str, keys: Iterable[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for key in keys:
        value = os.getenv(key, "")
        rows.append(
            [
                group_name,
                key,
                "已配置" if value else "未配置",
                _mask_value(value),
            ]
        )
    return rows


def inspect_env() -> tuple[list[list[str]], str]:
    rows: list[list[str]] = []
    required_missing: list[str] = []

    for group_name, keys in ENV_GROUPS.items():
        rows.extend(_build_env_rows(group_name, keys))
        if group_name in {"基础运行", "文件能力"}:
            for key in keys:
                if not os.getenv(key):
                    required_missing.append(key)

    if required_missing:
        summary = (
            "当前环境尚未满足最低运行条件。\n\n"
            "缺失变量：\n"
            + "\n".join(f"- `{key}`" for key in required_missing)
            + "\n\n请在创空间页面中依次点击：`设置` -> `环境变量管理` -> `新增` -> `保存` -> `上线` -> `确认`。"
        )
    else:
        summary = (
            "基础运行变量和文件能力变量已配置完成。\n\n"
            "如果你要启用 AI 能力，请继续补充对应的 `*_KEY`。"
        )

    return rows, summary


def build_demo() -> gr.Blocks:
    with gr.Blocks(title=APP_TITLE, theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            f"""
# {APP_TITLE}
### {APP_SUBTITLE}

这是一个为 **ModelScope 创空间纯 Python 运行环境**准备的入口页。

当前创空间环境 **没有 Node / npm**，因此不能直接运行仓库里的 Next.js + NestJS 全量工程。
这里提供的是：

- 项目说明
- 部署说明
- 环境变量检查面板

如果你后续要上线完整版本，建议使用：

- 支持 Node 的运行环境
- Docker / 自定义镜像
- 或把当前工程拆成真正的 Python 展示版
"""
        )

        with gr.Tab("项目说明"):
            gr.Markdown(
                """
## 产品结构

- **知识棱镜**：视频 -> 结构化知识资产
- **创作棱镜**：idea / 剧本 -> 节点化分镜与视频生成
- **译制棱镜**：视频 -> 多语种本地化
- **衍射棱镜**：视频 -> 多平台图文分发

## 当前创空间状态

本入口已经修正为 **纯 Python 可启动版本**，不会再尝试拉起 Node / npm。
"""
            )

        with gr.Tab("部署说明"):
            gr.Markdown(
                """
## 为什么之前启动失败

失败原因不是环境变量，而是之前的 `app.py` 会尝试执行：

- `node`
- `npm`
- `Next.js`
- `NestJS`

而当前魔搭创空间运行器是 **纯 Python**，日志里已经明确报错：

```text
RuntimeError: Missing required command: node
```

## 现在的修复方式

现在 `app.py` 已经改成纯 `Gradio` 入口，不再依赖 Node。

## 在魔搭界面中设置变量

1. 点击右上角 **设置**
2. 点击 **环境变量管理**
3. 点击 **新增**
4. 输入变量名和值
5. 点击 **保存**
6. 返回 **设置**
7. 点击 **上线**
8. 点击 **确认**

说明：

- 没有使用到某项 AI 能力，对应的 `*_KEY` 可以不设置
- 推荐统一使用 `XXX_KEY`
"""
            )

        with gr.Tab("环境变量检查"):
            env_table = gr.Dataframe(
                headers=["分类", "变量名", "状态", "当前值(脱敏)"],
                datatype=["str", "str", "str", "str"],
                interactive=False,
                wrap=True,
                value=[],
            )
            env_summary = gr.Markdown()
            refresh_btn = gr.Button("刷新环境变量状态", variant="primary")
            refresh_btn.click(inspect_env, outputs=[env_table, env_summary])

            demo.load(inspect_env, outputs=[env_table, env_summary])

        with gr.Tab("最低建议配置"):
            gr.Code(
                language="bash",
                value="""HOST=0.0.0.0
PORT=7860
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/viewpoint_prism
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-to-a-random-secret
NEXTAUTH_SECRET=change-me-to-a-random-secret
NEXTAUTH_URL=https://你的创空间域名
BYOK_ENCRYPTION_KEY=change-me-to-a-32-byte-hex-string
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=viewpoint-prism
FFMPEG_PATH=ffmpeg
SILICONFLOW_KEY=请填写你自己的KEY""",
            )

    return demo


if __name__ == "__main__":
    demo = build_demo()
    demo.launch(server_name="0.0.0.0", server_port=int(os.getenv("PORT", "7860")))
