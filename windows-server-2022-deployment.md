# Windows Server 2022 部署步骤表

> 适用场景：腾讯云轻量应用服务器，操作系统为 Windows Server 2022。
> 当前目标：先跑通“源站直出静态资源 + Node API + 小程序远程加载”的第一版，不默认依赖 CDN。

## 一、推荐目录结构

| 用途 | 建议路径 | 说明 |
|------|----------|------|
| 后端应用目录 | `D:\ar-magnet\app` | 放 Node 服务代码 |
| 后端日志目录 | `D:\ar-magnet\logs` | 放 API 输出日志、错误日志 |
| 静态资源目录 | `D:\ar-assets\magnets` | 放 marker、video、poster 等业务资源 |
| Nginx 目录 | `D:\nginx` | 解压后的 Nginx for Windows |
| 运维工具目录 | `D:\tools\nssm` | 放 NSSM，可用于注册 Windows 服务 |

## 二、环境部署步骤表

| 步骤 | 动作 | 结果 |
|------|------|------|
| 1 | 登录腾讯云控制台，给轻量服务器绑定固定公网 IP，并确认安全组开放 `80`、`443`、后续如需远程管理再按需开放 `22/3389` | 服务器具备基础公网访问能力 |
| 2 | 通过远程桌面连接 Windows Server 2022，安装系统更新，重启一次 | 降低后续部署中的兼容问题 |
| 3 | 安装 Node.js LTS 版本，安装完成后执行 `node -v`、`npm -v` 检查 | 具备运行后端 API 的 Node 环境 |
| 4 | 下载并解压 Nginx for Windows 到 `D:\nginx` | 具备静态资源服务和反向代理能力 |
| 5 | 下载 NSSM 或 WinSW 到 `D:\tools\nssm` | 具备把 Node/Nginx 注册成 Windows 服务的能力 |
| 6 | 创建目录 `D:\ar-magnet\app`、`D:\ar-magnet\logs`、`D:\ar-assets\magnets` | 服务代码、日志、静态资源目录就位 |
| 7 | 上传后端代码到 `D:\ar-magnet\app`，在该目录执行 `npm install --production` | Node 服务依赖安装完成 |
| 8 | 在后端目录放置 `.env` 或等效配置，至少包含端口、数据库连接、静态资源根目录、域名 | 服务运行参数可配置 |
| 9 | 先直接执行 `node server.js` 或项目真实入口文件，验证 API 能启动 | 先排除代码级错误，再做系统服务化 |
| 10 | 编写 Nginx 配置：`/api/` 反向代理到 Node 端口，`/static/` 映射到 `D:\ar-assets` | 对外统一暴露 API 和静态资源 |
| 11 | 用 NSSM/WinSW 把 Node API 注册成 Windows 服务，例如服务名 `ar-magnet-api` | API 可开机自启、异常后可重启 |
| 12 | 用 NSSM/WinSW 把 Nginx 注册成 Windows 服务，例如服务名 `ar-magnet-nginx` | Nginx 可开机自启 |
| 13 | 配置 Windows 防火墙规则，允许 `80`、`443` 入站 | 对外 HTTP/HTTPS 可访问 |
| 14 | 绑定域名到服务器公网 IP；若暂时没有域名，可先用 IP 联调 | 小程序和运维侧有稳定入口 |
| 15 | 配置 HTTPS 证书并在 Nginx 中启用 `443` | 满足正式环境的 HTTPS 访问要求 |
| 16 | 上传一组测试资源到 `D:\ar-assets\magnets\magnet_001\`，人工验证 `marker.jpg`、`video.mp4`、`poster.jpg` 可通过 `/static/...` 访问 | 静态资源分发链路可用 |
| 17 | 用浏览器、Postman 或 curl 验证 `/api/client/config`、`/api/magnets`、`/api/magnets/:id` | 后端读接口可用 |
| 18 | 再让小程序切换到远程配置和远程资源模式进行联调 | 服务端闭环跑通后再改前端接入 |

## 三、PowerShell 初始化命令示例

```powershell
New-Item -ItemType Directory -Force -Path "D:\ar-magnet\app"
New-Item -ItemType Directory -Force -Path "D:\ar-magnet\logs"
New-Item -ItemType Directory -Force -Path "D:\ar-assets\magnets"
New-Item -ItemType Directory -Force -Path "D:\tools\nssm"

New-NetFirewallRule -DisplayName "AR Magnet HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "AR Magnet HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

## 四、Nginx 配置骨架

```nginx
server {
    listen       80;
    server_name  your-domain.com;

    client_max_body_size 50m;

    location /api/ {
        proxy_pass         http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias D:/ar-assets/;
        add_header Cache-Control "public, max-age=300";
    }
}
```

## 五、NSSM 注册服务示例

```powershell
# Node API
.\nssm.exe install ar-magnet-api "C:\Program Files\nodejs\node.exe" "D:\ar-magnet\app\server.js"
.\nssm.exe set ar-magnet-api AppDirectory "D:\ar-magnet\app"
.\nssm.exe set ar-magnet-api AppStdout "D:\ar-magnet\logs\api.out.log"
.\nssm.exe set ar-magnet-api AppStderr "D:\ar-magnet\logs\api.err.log"

# Nginx
.\nssm.exe install ar-magnet-nginx "D:\nginx\nginx.exe"
.\nssm.exe set ar-magnet-nginx AppDirectory "D:\nginx"
```

> 如果后端入口文件不是 `server.js`，把命令中的入口文件改成实际文件名。

## 六、上线前检查表

| 检查项 | 目标 |
|--------|------|
| `http://your-domain.com/static/...` 可访问 | 识别图/视频/封面已被 Nginx 正确暴露 |
| `http://your-domain.com/api/client/config` 可返回 JSON | API 代理已生效 |
| 服务重启后 Node 和 Nginx 自动拉起 | Windows 服务配置正确 |
| 日志持续写入到 `D:\ar-magnet\logs` | 基础运维可观察 |
| 小程序能拿到资源清单并下载素材 | 可以开始前端远程资源接入 |

## 七、当前建议

先把 Windows Server 2022 源站跑通，再改前端去接远程配置和远程缓存。顺序不要反过来，否则前端改完以后会卡在服务端不可访问、路径不稳定或 HTTPS 未就绪这些部署问题上。