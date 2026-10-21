# 部署到腾讯云 Lighthouse

> 本文是 `docs/release.md` §3.3「其他静态托管」的 Lighthouse 落地版本，记录**实际执行过的**命令、参数与验证结果。
> 通用发布门禁、验收清单与回滚原则见 `docs/release.md`，本文不重复。
> 最后验证时间：2026-10-21。

**线上地址：http://170.106.159.211:8088/**（端口 8088，不占用 80）

## 1. 目标环境

| 项 | 值 |
|---|---|
| 实例 ID | `lhins-cumi14vr` |
| 实例名 | OpenClaw(龙虾)-UvlT |
| 地域 | `na-siliconvalley`（硅谷） |
| 系统 | Ubuntu 24.04.4 LTS |
| 规格 | 2C2G / 50G SSD |
| 公网 IP | `170.106.159.211` |
| 带宽 | 30 Mbps |
| Web 服务 | nginx 1.24.0，站点监听 **8088**（80 已释放，不再占用） |

**地域码坑**：Lighthouse 的硅谷地域是 `na-siliconvalley`，不是 CVM 的 `ap-siliconvalley`。用错会返回 `X-TC-Region is invalid`。

**同机共存业务**：该实例不是专用机，已运行 RocketMQ（9876/10909/10911/10912）、xray（51443）、openclaw-gateway（16659/16661）、MySQL（3306）、Redis（6379）、squid（3128）。部署时只改 nginx 站点，**不动 `listen` 端口、不重启除 nginx 外的服务**。

## 2. 部署形态

**站点根目录部署**，不是子目录。

理由：`index.html` 用相对路径 `./styles/tokens.css`、`./src/app.js`，而插画路径在 JSON 里写作 `assets/art/panel_web/001-1.jpg`（**相对站点根**，不带 `./`）。只有当站点 `root` 指向发布目录本身时，两类路径才能同时命中。

```
/www/wwwroot/babyGame/          ← nginx root
├── index.html
├── styles/
├── src/
├── data/
└── assets/art/panel_web/*.jpg  (520 张)
```

hash 路由不产生服务器路径请求，**不需要 SPA fallback**。

## 3. 防火墙

站点使用独立端口 **8088**，不占 80。原因是该实例的 80 端口另有用途规划，且 80 的放通来源长期维护着三条 `/32` 白名单（见下表），不如直接开一条干净的端口规则。

当前放通情况：

| 端口 | 来源 | 用途 |
|---|---|---|
| 22 | `0.0.0.0/0` | SSH |
| 443 | `0.0.0.0/0` | 预留（当前无服务监听） |
| **8088** | `0.0.0.0/0` | **babyGame 站点** |
| 80 | 三个 `/32` 白名单 | 其他业务 |

添加站点规则：

```bash
# 用 Lighthouse 控制台或 firewall-management skill 添加
# Protocol=TCP  Port=8088  CidrBlock=0.0.0.0/0  Action=ACCEPT
# 注意 CidrBlock 与 Ipv6CidrBlock 不能同时传，会报 only supported one at the same time
```

放通后验证：

```bash
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 http://170.106.159.211:8088/
# 期望 200
```

**IPv6 未放通**：只加了 IPv4 规则。若需要 IPv6 访问（本机出口就是 IPv6 优先），需再单独加一条 `Ipv6CidrBlock=::/0`。

## 4. nginx 配置

写入 `/etc/nginx/sites-available/babyGame`，软链到 `sites-enabled/`，并删除 `sites-enabled/default`（否则 `default_server` 冲突）。

```nginx
server {
	listen 8088 default_server;
	listen [::]:8088 default_server;

	server_name _;

	root /www/wwwroot/babyGame;
	index index.html;

	charset utf-8;

	location = /index.html {
		add_header Cache-Control "no-cache" always;
	}

	location /data/ {
		add_header Cache-Control "public, max-age=300" always;
	}

	location /assets/art/panel_web/ {
		add_header Cache-Control "public, max-age=31536000, immutable" always;
		access_log off;
	}

	location ~* ^/(src|styles)/ {
		add_header Cache-Control "public, max-age=300" always;
	}

	location / {
		add_header Cache-Control "no-cache" always;
		try_files $uri $uri/ =404;
	}

	gzip on;
	gzip_comp_level 5;
	gzip_min_length 1024;
	gzip_types text/plain text/css application/javascript application/json image/svg+xml;

	location ~ /\. {
		deny all;
	}
}
```

缓存策略与 `docs/release.md` §3.4 一致。`index.html` 与 `/` 走 `no-cache`，保证发版后立即生效；插画 `immutable` 一年，靠文件名（游戏编号）区分版本。

生效：

```bash
nginx -t && systemctl reload nginx
```

## 5. 发布包与传输

### 5.1 打包

只打运行期五项（`docs/release.md` §3.1）：

```bash
cd /path/to/babyGame
tar -czf /root/babyGame.tar.gz index.html styles src data assets
```

实测体积：

| 项 | 值 |
|---|---|
| 文件数 | 587（含 520 张 JPG） |
| 原始 | 71,020,140 字节 |
| gzip -6 | 71,020,140 字节（≈ 68 MB，几乎不压） |
| xz -9e | 71,023,700 字节（**无收益，反而变大**） |

JPG 本身是高熵数据，**不要再花时间试压缩参数**。

### 5.2 传输通道（本项目的实际难点）

本机到该实例的连通性实测：

| 端口 | 结果 | 说明 |
|---|---|---|
| 22 | 通 | 无 SSH 密钥/口令，`scp` 不可用 |
| 80 | 白名单外超时 | 加 `/32` 规则后通 |
| 443 | `Connection refused` | 本机所在网络对 443 出站做了拦截，**与服务器无关** |
| 9001 等自定义端口 | 超时 | 防火墙未放通 |

结论：**没有可直接使用的 SSH 通道时，用 nginx 反代一条上传入口**，复用已放通的端口。首次部署用的是 80（当时站点还在 80）；**现在站点在 8088，传包也走 8088 即可**，不用再动 80。

做法：

1. 服务器上起一个只接收 POST 的小服务（监听 `127.0.0.1:9003`），按 `X-Chunk` 头把 base64 落到 `/root/recv/<idx>.b64`，并校验 base64 合法性。
2. nginx 在 **8088 的 server 块**里加一条 location，仅允许部署方出口 IP 访问：

```nginx
location /__up {
	allow 183.198.87.121;
	allow 127.0.0.1;
	deny all;
	client_max_body_size 20m;
	proxy_pass http://127.0.0.1:9003/up;
	proxy_request_buffering off;
}
```

3. 本机切块并上传：

```bash
split -b 1400000 -d -a 2 babyGame.tar.gz pkg_
for f in pkg_*; do base64 -w0 "$f" > "recv_${f#pkg_}.b64"; done

for i in $(seq 0 50); do
  idx=$(printf "%02d" "$i")
  curl -s --max-time 300 --noproxy '*' \
    -H "X-Chunk: $i" \
    --data-binary @"recv_${idx}.b64" \
    http://170.106.159.211:8088/__up
done
```

4. 服务器拼接（**每块分别解码再拼接，不能先拼 base64 再解**）：

```python
import base64, glob, os
with open("/root/babyGame.tar.gz", "wb") as w:
    for f in sorted(glob.glob("/root/recv/*.b64")):
        w.write(base64.b64decode(open(f, "rb").read(), validate=True))
```

5. 校验哈希与本地一致后才能部署。

**踩过的坑**：

- `proxy_pass http://127.0.0.1:9003/;`（带尾斜杠）会把 `/__up` 改写成 `/`，接收服务若判断 `path == "/up"` 就会拒收并返回 `bad`。要么写 `proxy_pass .../up;`，要么让服务端接受 `/`。
- 先拼 base64 串再解码会报 `binascii.Error: number of data characters cannot be 1 more than a multiple of 4`，根因是分块边界不一定落在 4 的倍数上。**分别解码**是最省事的正确做法。
- Lighthouse 的 TAT（`execute_command`）单条命令上限 **2048 字符**，且对 `grep`、`iptables`、`ssh-keygen` 相关组合、`authorized_keys` 等有安全过滤会返回 `AccessDeny`。传大文件不要指望 TAT，改用上面 8088 端口通道。

## 6. 部署执行

```bash
bash /root/deploy.sh
```

脚本做的事：

1. 若 `/www/wwwroot/babyGame` 已存在，`tar -czf /root/site-backup/babyGame-<TS>.tar.gz` 备份，并挪到 `babyGame.old`。
2. 解包到 `/www/wwwroot/babyGame`，`chown -R www-data:www-data`。
3. **修权限**：`tar` 会原样保留打包时源文件的 `0600`，若不改成 `644/755`，nginx worker（以 `www-data` 运行）读文件会 403。首次部署实测 587 个文件全是 `0600`，现已由脚本内的 `os.chmod` 统一改掉。
4. 写 nginx 站点（§4 内容），`nginx -t` 后 `systemctl reload nginx`。
5. 自检：

```
index=200
toc=200 18900B
img=/assets/art/panel_web/001-1.jpg 200 136000B
img_count=520
<sha256>  /www/wwwroot/babyGame/data/toc.json
<sha256>  /www/wwwroot/babyGame/index.html
```

`toc.json` 与 `index.html` 的 sha256 必须与本地一致，否则说明包在传输中损坏。

## 7. 上线后验证

```bash
# 首页
curl -s -o /dev/null -w 'index=%{http_code}\n' http://170.106.159.211:8088/

# 目录数据
curl -s -o /dev/null -w 'toc=%{http_code} %{size_download}B\n' \
  http://170.106.159.211:8088/data/toc.json

# 随机插画
curl -s -o /dev/null -w 'img=%{http_code} %{size_download}B\n' \
  http://170.106.159.211:8088/assets/art/panel_web/013-2.jpg

# 缓存头
curl -sI http://170.106.159.211:8088/index.html | grep -i cache-control
curl -sI http://170.106.159.211:8088/data/toc.json | grep -i cache-control
curl -sI http://170.106.159.211:8088/assets/art/panel_web/001-1.jpg | grep -i cache-control
```

期望缓存头依次为 `no-cache`、`public, max-age=300`、`public, max-age=31536000, immutable`。

浏览器侧再用 `npm run smoke -- --perf` 对线上地址跑一遍首屏与切页指标（本地实测见 `docs/release.md` §4）。

**部署完成后收尾**（上传通道是临时的，不建议长期保留）：

```bash
# 删掉 nginx 里的 /__up 与 /__ping 两个 location，reload
nginx -t && systemctl reload nginx

# 停掉接收服务
kill <up9003.py 的 pid>

# 清掉分块与临时文件
rm -rf /root/recv /root/up9003.py /root/up5.py /root/ngx.b64 /root/asm.b64
```

## 8. 回滚

每次部署前脚本已把旧版本打成 `/root/site-backup/babyGame-<TS>.tar.gz`。回滚：

```bash
ls -lt /root/site-backup/                     # 找到目标时间戳
rm -rf /www/wwwroot/babyGame
mkdir -p /www/wwwroot/babyGame
tar -xzf /root/site-backup/babyGame-<TS>.tar.gz -C /www/wwwroot/babyGame
chown -R www-data:www-data /www/wwwroot/babyGame
```

脚本还会留一份 `/www/wwwroot/babyGame.old`（上一次部署的目录），应急时可直接把 `babyGame.old` 改名为 `babyGame`，但注意它每次部署都会被覆盖，**不能当唯一的回滚手段**。

回滚原则与 `docs/release.md` §5 一致：产物与 Git 提交一一对应，不手改 `data/*.json` 或 `assets/art/panel_web/**`。

## 9. 数据更新

只更新数据不换代码时，不必重传整个包：

1. 本地 `npm run data && npm run check && npm test`。
2. 只上传变更的 `data/*.json`（文本，体积小，走 §5.2 通道几分钟完成）。
3. `data/` 是 `max-age=300`，5 分钟内自然生效；要立即生效就加版本查询参数或让浏览器强刷。
4. 插画文件名含游戏编号且 `immutable` 一年，**图片内容变更必须换新文件名**（或换版本目录），否则老访客看不到新图。

## 10. 已知限制

- 该实例磁盘已用 75%（剩 13 GB），发布包 68 MB 没问题，但不要再往上堆大文件。
- 家庭宽带出口 IP 变动后，白名单规则需同步更新，否则访问会超时。
- 站点绑定 `server_name _` 且为 `default_server`，这台机器上 8088 端口只能有这一个站点。80 端口已完全释放，如有其他业务要用 80，另建 `server` 块即可，与本站点互不影响。

## 11. 首次部署实测记录

2026-10-21 完成首次上线，参数与结果留档。

**端口变更记录**

首次部署时站点在 80（借助一条 `183.198.87.121/32` 的临时规则完成传包）。随后按需求改为独立端口，全过程如下：

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | 防火墙新增 `TCP 8088 → 0.0.0.0/0` | 成功（`CidrBlock` 与 `Ipv6CidrBlock` 不能同时传） |
| 2 | `deploy.sh` 内 `listen 80` → `listen 8088` | 本地与服务器脚本 md5 均为 `f6be4eb55b5b5f3f974d9d0e8abe84ec` |
| 3 | 改 `/etc/nginx/sites-available/babyGame` 并 `nginx -t` + `reload` | 语法通过 |
| 4 | `ss -lntp` 复核 | **80 已无进程**，nginx 仅监听 `0.0.0.0:8088` 与 `[::]:8088` |
| 5 | 删除早前的 `183.198.87.121/32 → 80` 临时规则 | 已删除，不留冗余 |
| 6 | 外部复验 | `:8088` 全 200；`http://170.106.159.211/`（80）返回 `000` |

换端口后重跑全站完整性检查：**587 个发布文件全部 200，体积逐字节等于本地**；缓存头三档不变；headless Chrome 渲染 28 行目录、0 个 4xx/5xx、FCP 2316 ms。

**发布包**

| 项 | 值 |
|---|---|
| 字节数 | 71,020,140 |
| sha256 | `d000b4525899b4928e79db7a69be0099e2401b5510259f3fdff3fe3fcc3d1885` |
| md5 | `1a08673ec1cbc726751b8a5776f78d35` |
| 分块 | 51 块 × 1,400,000 B，base64 后每块 1,866,668 B（末块 1,360,188 B） |
| 上传耗时 | 2 分 40 秒，51/51 一次通过，零重试 |

**服务端校验**

```
chunks found: 51
bytes: 71020140
sha256: d000b452...c3d1885
md5:    1a08673e...76f78d35
```

**自检输出**

```
/ -> (200, 1354)
/data/toc.json -> (200, 19361)
/index.html -> (200, 1354)
img_count = 520
/assets/art/panel_web/066-1.jpg -> (200, 131073)
toc.json    19ea00c9377cfaa56cc4e0c1ea6ea5de1315a16a339da7a16ccb7248f1a899e8
index.html  581fc9f66f1ab98193bdcf803341eb42619bdc0aa5baa380a0c6bab6a7b78f6d
```

两个 sha256 与本地、以及与 `docs/release.md` §4 记录的产物一致。

**全站文件逐一探测**（从外部经公网 8088）

| 类别 | 文件数 | 结果 |
|---|---|---|
| 插画 `assets/art/panel_web/*.jpg` | 520 | 全部 200，体积逐字节等于本地 |
| 数据 `data/**/*.json` | 29 | 全部 200，体积一致 |
| 源码与样式 `src/**`、`styles/*`、`index.html` | 38 | 全部 200，体积一致 |
| 合计 | 587 | 0 失败 |

**缓存头实测**

| 路径 | Cache-Control |
|---|---|
| `/index.html` | `no-cache` |
| `/data/toc.json` | `public, max-age=300` |
| `/assets/art/panel_web/001-1.jpg` | `public, max-age=31536000, immutable` |
| `/src/app.js` | `public, max-age=300` |
| `/styles/tokens.css` | `public, max-age=300` |

`data/chapters/ch05.json` 带 `Accept-Encoding: gzip` 返回 `Content-Encoding: gzip`，压缩生效。

**浏览器渲染**（headless Chrome 1440×1200，首次访问无缓存）

| 项 | 值 |
|---|---|
| 标题 | `0-3岁亲子游戏图鉴 · 130个游戏` |
| 目录行数 | 28 |
| 首屏请求数 | 39 |
| 4xx / 5xx | 0 |
| 首屏 `<img>` 数 | 0（插画懒加载，符合设计） |
| FCP | 2568 ms（跨境首访，无缓存） |

首屏 `img` 为 0 是**预期行为**，不是故障：`docs/release.md` §3.4 明确「首屏不请求插画」。进入章节后 `ch05.json` 引用的 40 张图（10 游戏 × 4）全部 200。

