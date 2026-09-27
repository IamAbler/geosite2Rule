# geosite2Rule Worker

Cloudflare Worker：从 `geosite.dat` 读取分类，实时生成 Clash/Mihomo 和 Surge 规则集。默认数据来自 [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat)。

## 本地运行与手动部署

```sh
npm install
npm run dev       # 本地预览
npm run deploy
```

部署前可在 `wrangler.jsonc` 修改 `SOURCE_URL`，指向其他兼容的 HTTPS `geosite.dat`。转换结果在边缘节点缓存 1 小时，源文件请求也缓存 1 小时。无需 KV、R2 或数据库。

## Cloudflare Workers Git 部署配置

在 Cloudflare 控制台选择 **Workers & Pages → Create application → Import a repository**，连接 `IamAbler/geosite2Rule`。生产分支选择 `main`，根目录保持仓库根目录。Worker 名称使用 `geosite2rule`，与 `wrangler.jsonc` 中的 `name` 一致。

| 配置项 | 填写内容 |
| --- | --- |
| 构建命令（Build command） | 留空；此项目没有独立构建步骤，Wrangler 会在部署时打包 Worker |
| 部署命令（Deploy command） | `npx wrangler deploy` |
| 预览命令（Preview command） | `npx wrangler preview` |

保存后，推送到 `main` 会触发生产部署。开启预览构建后，其他分支和拉取请求会运行预览命令并生成独立的预览地址。本地预览仍使用 `npm run dev`。

## 接口

| 地址 | 输出 | 用途 |
| --- | --- | --- |
| `/categories` | JSON | 可用分类 |
| `/rules/clash/google.yaml` | YAML | Clash/Mihomo `classical` provider |
| `/rules/clash-text/google.list` | 文本 | Mihomo `classical`、`format: text` provider |
| `/rules/surge/google.list` | 文本 | Surge `RULE-SET` |

分类名不区分大小写。可用 `@属性` 筛选，例如 `google@ads`；用 `@-属性` 排除，例如 `google@-ads`。多个属性条件同时生效。

Clash/Mihomo 配置示例：

```yaml
rule-providers:
  google:
    type: http
    behavior: classical
    format: yaml
    url: https://YOUR-WORKER.example/rules/clash/google.yaml
    interval: 3600
rules:
  - RULE-SET,google,PROXY
```

Surge `[Rule]` 示例：

```ini
RULE-SET,https://YOUR-WORKER.example/rules/surge/google.list,PROXY
```

`domain`、`full`、`keyword` 分别转换为 `DOMAIN-SUFFIX`、`DOMAIN`、`DOMAIN-KEYWORD`。Clash/Mihomo 中的 `regexp` 转为 `DOMAIN-REGEX`；Surge 无等价的域名正则规则，因此会跳过。规则值含逗号或换行时也会跳过，以避免输出无效规则。响应头 `X-Rule-Count` 和 `X-Skipped-Rules` 显示结果数量。单个源文件上限为 32 MiB。
