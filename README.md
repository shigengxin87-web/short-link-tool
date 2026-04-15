# 短链接工具

这是一个可自托管的短链接工具，适合把业务里的超长 URL 压缩成更短、更像正式业务链接的地址。

当前版本已经支持：

- 输入长链接后，自动生成短链接
- 支持自定义短链后缀，例如 `vip2026`
- 支持备注用途，方便区分不同客户、海报或活动
- 支持多用户注册和登录
- 每个用户登录后只看到自己的短链数据
- 不同用户之间的数据默认隔离
- 访问短链时自动 302 跳转到原始长链接
- 自动记录点击次数和最后访问时间
- 支持完成后提示音、浏览器通知和标签页提醒
- 自带一个本地管理页面，不需要额外后台模板
- 默认用本地 JSON 文件存储，无需数据库

## 当前适合的使用方式

这个工具现在适合做成：

- 本地运行的管理后台
- 后续部署成公网服务
- 团队成员各自注册自己的账号
- 每个人通过自己的后台管理自己的短链

如果后面部署到公网，那么：

- 团队成员可以在自己的账号里创建短链
- 客户依然可以直接打开公开短链接

## 本地启动方式

在目录 `/Users/murphys/Documents/code x/short-link-tool` 里执行：

```bash
SESSION_SECRET=一段更长的随机字符串 npm start
```

默认会启动在：

- 管理台：`http://localhost:3000`
- 短链接示例：`http://localhost:3000/Ab3kPq`

## 可选环境变量

- `PORT`：服务端口，默认 `3000`
- `HOST`：监听地址，默认 `0.0.0.0`
- `BASE_URL`：外部访问域名，部署上线后建议配置成你的真实域名，例如 `https://go.yourbrand.com`
- `SESSION_SECRET`：登录态签名密钥，强烈建议你自己设置，至少 16 位以上
- `INVITE_CODE`：可选的邀请码；如果设置了，注册时必须填写正确邀请码
- `DATA_DIR`：数据目录；部署到云平台时建议指向持久化存储目录，例如 `/data`

示例：

```bash
BASE_URL=https://go.yourbrand.com SESSION_SECRET=change-me-to-a-long-random-string INVITE_CODE=team2026 DATA_DIR=/data PORT=3000 npm start
```

## 数据存储

链接和用户数据默认保存在：

`/Users/murphys/Documents/code x/short-link-tool/data/links.json`

如果设置了 `DATA_DIR`，则会保存到：

`$DATA_DIR/links.json`

如果这个文件不存在，服务启动时会自动创建。

## 权限说明

- 公开短链接访问仍然可直接跳转，不需要登录
- 管理后台的查看、生成、删除都需要用户先登录
- 每个用户只能看到并删除自己创建的短链
- 如果配置了 `INVITE_CODE`，只有知道邀请码的人才能注册

## 公网部署建议

### 推荐方案：Railway

我更推荐你先部署到 Railway，因为它当前支持：

- 公开访问网址
- 自定义域名
- 持久化卷 Volume
- Free / Trial 方案下也能先低成本试跑

这点对你很重要，因为你的项目需要保存：

- 用户账号
- 短链映射
- 点击统计

### Railway 部署要点

1. 新建一个 Railway 项目
2. 上传这个项目代码，或者连接 GitHub 仓库
3. 给服务挂一个 Volume，挂载路径设为 `/data`
4. 配置环境变量：

```bash
BASE_URL=https://你的公网域名
SESSION_SECRET=你自己的长随机字符串
DATA_DIR=/data
INVITE_CODE=可选的邀请码
```

5. 部署完成后，Railway 会分配一个公网地址

### 为什么我当前不优先推荐 Render Free

根据 Render 官方文档，Free Web Service 不支持 Persistent Disk，服务重启后本地文件无法稳定保留。  
这对你当前这个“多用户 + 短链映射 + 统计”的工具不够稳，只适合临时演示，不适合你现在这一步。

## 后续正式化建议

如果你准备给更多客户长期使用，建议后续升级这两项：

- 用数据库替代本地 JSON 存储
- 绑定你自己的短域名，例如 `go.你的域名.com`

这样客户收到的短链会更可信，后期扩展也更稳。
