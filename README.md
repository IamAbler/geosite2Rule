# geosite2Rule Worker

Cloudflare Worker：从 Geosite 和 GeoIP `.dat` 文件读取分类，实时生成 Clash/Mihomo、Surge、Quantumult X、Loon、Shadowrocket 和 sing-box 规则集。首页使用 Vue 3 和微软 [Fluent UI Web Components](https://github.com/microsoft/fluentui/tree/master/packages/web-components)，提供数据来源、分类、属性与格式选择，以及订阅地址复制。默认数据来自 [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat)。

## 本地运行与手动部署

```sh
npm install
npm run build
npx wrangler d1 migrations apply geosite2rule-cache --local
npm run dev       # 本地预览
npm run deploy
npm run preview   # 发布当前分支的 Cloudflare Preview
```

Vite 将 Vue 前端构建到 `dist/`，Wrangler 通过静态资源绑定提供页面；Worker 继续处理规则集接口。默认 Loyalsoldier 文件从 jsDelivr 获取，CDN 失败时回退到 GitHub Release；可在 `wrangler.jsonc` 修改 `SOURCE_URL` 与 `GEOIP_URL`，自定义地址不会自动回退。转换结果先查边缘缓存，再按源文件 SHA-256 与规范化路径查 D1；等价的分类大小写、属性顺序和 `.list`／`.txt` 地址共用缓存。KV 只保存 Loyalsoldier 和 V2Fly 来源的 SHA-256、校验时间及可用的 `Last-Modified` 日期，24 小时校验一次。源文件未改变时直接复用 D1 结果；D1 数据保留 30 天，单份结果上限 8 MiB，按 1 MiB 分块避开单行大小限制。边缘响应缓存 1 小时，源文件请求缓存 1 小时。每个 Worker 实例还会短暂保留有限数量的源文件和分类索引。jsDelivr 的分支文件可能比上游版本晚约 12 小时，页面上的版本日期取自上游 Release。

KV 命名空间在 `wrangler.jsonc` 绑定为 `RULE_CACHE`，D1 数据库绑定为 `RULE_DB`。自定义 URL 不写入 KV 或 D1，但若文件内容与已缓存的官方来源相同，可直接命中 D1；自定义响应的边缘缓存仍为 1 小时。首次转换仍需同步执行，大型分类可能超出 Workers 免费套餐 CPU 限额；迁移主要减少重复转换和 KV 写入，不保证所有冷请求都能在免费 CPU 限额内完成。KV、D1 写入失败不会影响本次规则响应。

远程 D1 数据库 `geosite2rule-cache` 已创建，真实 UUID 已写入 `wrangler.jsonc`，迁移 `0001_rule_cache.sql` 已应用。新环境需要先创建同名数据库、更新 UUID，再应用迁移；后续迁移使用：

```sh
npx wrangler d1 migrations apply geosite2rule-cache --remote
```

旧 KV 规则正文和 Queue 配置不再读取；确认新版本运行正常后，可在 Cloudflare 控制台删除旧 Queue。旧 KV 条目有过期时间，会自行清除。

仓库包含已构建的 `dist/`，以兼容此前未填写构建命令的 Cloudflare Git 部署；更新前端源码后仍应运行 `npm run build` 并提交新的构建产物。推荐将 Cloudflare 构建命令设为 `npm run build`，由平台在每次部署时生成最新文件。

## 数据来源

| 选择 | Geosite | GeoIP |
| --- | --- | --- |
| Loyalsoldier（默认） | `geosite.dat` | `geoip.dat` |
| V2Fly | [domain-list-community 的 `dlc.dat`](https://github.com/v2fly/domain-list-community) | [v2fly/geoip 的 `geoip.dat`](https://github.com/v2fly/geoip) |
| 自定义 | 用户提供的公开 HTTPS `.dat` 地址 | 用户提供的公开 HTTPS `.dat` 地址 |

自定义来源可分别填写 Geosite、GeoIP 地址，只填当前需要的一种即可。选择 V2Fly 或自定义来源后，分类接口、属性接口、版本日期和规则集订阅地址都会使用同一来源。规则地址通过 `source=v2fly` 或 `source=custom&url=...` 保存来源；自定义 URL 会出现在订阅地址中。

## Cloudflare Workers Git 部署配置

在 Cloudflare 控制台选择 **Workers & Pages → Create application → Import a repository**，连接 `IamAbler/geosite2Rule`。生产分支选择 `main`，根目录保持仓库根目录。Worker 名称使用 `geosite2rule`，与 `wrangler.jsonc` 中的 `name` 一致。

| 配置项 | 填写内容 |
| --- | --- |
| 构建命令（Build command） | `npm run build` |
| 部署命令（Deploy command） | `npx wrangler deploy` |
| 预览命令（Preview command） | `npx wrangler preview` |

保存后，推送到 `main` 会触发生产部署。开启预览构建后，其他分支和拉取请求会运行预览命令并生成独立的预览地址。本地预览仍使用 `npm run dev`。

Worker 已在 `wrangler.jsonc` 开启请求与异常日志。遇到间歇性 5xx 时，在 Cloudflare 控制台打开 **Workers & Pages → geosite2rule → Observability**，按时间、请求路径和执行结果筛选；也可在终端运行 `npx wrangler tail geosite2rule --format=pretty` 查看实时日志。排查完毕后，可调低 `head_sampling_rate` 减少日志量。

## 接口

| 地址 | 输出 | 用途 |
| --- | --- | --- |
| `/categories?type=geosite` | JSON | Geosite 分类 |
| `/categories?type=geoip` | JSON | GeoIP 分类 |
| `/attributes/google` | JSON | Geosite 分类可用属性 |
| `/version?type=geosite` | JSON | 数据源版本日期；GeoIP 可用 `type=geoip` |
| `/rules/clash/google.yaml` | YAML | Clash/Mihomo `classical` provider |
| `/rules/clash-text/google.list` | 文本 | Mihomo `classical`、`format: text` provider |
| `/rules/surge/google.list` | 文本 | Surge `RULE-SET` |
| `/rules/mrs/google.mrs` | MRS | Mihomo `domain`、`format: mrs` provider |
| `/rules/quantumult-x/google.list` | 文本 | Quantumult X `[filter_remote]` |
| `/rules/loon/google.list` | 文本 | Loon `[Remote Rule]` |
| `/rules/shadowrocket/google.list` | 文本 | Shadowrocket `RULE-SET` |
| `/rules/sing-box/google.json` | JSON | sing-box `source` 规则集 |
| `/rules/geoip/clash/cn.yaml` | YAML | Mihomo `ipcidr` provider |
| `/rules/geoip/clash-text/cn.list` | 文本 | Mihomo `ipcidr`、`format: text` provider |
| `/rules/geoip/surge/cn.list` | 文本 | Surge IP `RULE-SET` |
| `/rules/geoip/mrs/cn.mrs` | MRS | Mihomo `ipcidr`、`format: mrs` provider |
| `/rules/geoip/quantumult-x/cn.list` | 文本 | Quantumult X IPv4/IPv6 CIDR |
| `/rules/geoip/loon/cn.list` | 文本 | Loon IPv4/IPv6 CIDR |
| `/rules/geoip/shadowrocket/cn.list` | 文本 | Shadowrocket IPv4/IPv6 CIDR |
| `/rules/geoip/sing-box/cn.json` | JSON | sing-box `ip_cidr` 规则集 |

例如 `/categories?type=geosite&source=v2fly`、`/rules/mrs/google.mrs?source=v2fly` 和 `/rules/clash/google.yaml?source=custom&url=https%3A%2F%2Fexample.com%2Fgeosite.dat`。

分类名不区分大小写。Geosite 可用 `@属性` 筛选，例如 `google@ads`；用 `@-属性` 排除，例如 `google@-ads`。多个属性条件同时生效，MRS 也使用相同的属性筛选。GeoIP 不含属性。

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

Quantumult X `[filter_remote]` 示例：

```ini
https://YOUR-WORKER.example/rules/quantumult-x/google.list, tag=google, force-policy=proxy, enabled=true
```

Loon `[Remote Rule]` 示例：

```ini
https://YOUR-WORKER.example/rules/loon/google.list,policy=PROXY,enabled=true
```

Shadowrocket `[Rule]` 示例：

```ini
RULE-SET,https://YOUR-WORKER.example/rules/shadowrocket/google.list,PROXY
```

sing-box 的 `route` 配置片段：

```json
{
  "rule_set": [{ "type": "remote", "tag": "google", "format": "source", "url": "https://YOUR-WORKER.example/rules/sing-box/google.json" }],
  "rules": [{ "rule_set": "google", "action": "route", "outbound": "proxy" }]
}
```

将示例中的 `PROXY`、`proxy` 或 `outbound` 换成自己的策略或出站标签。Quantumult X 列表按其规则格式携带默认 `proxy` 策略，`force-policy` 可覆盖它；GeoIP 的 IPv6 规则使用 `ip6-cidr`。Loon 与 Shadowrocket 使用独立的订阅地址及各自的配置示例，其列表内容与 Surge 的普通规则格式相同。sing-box 输出 `version: 1` 的 source JSON，可作为远程规则集直接引用；域名正则会写入 `domain_regex`，实际能否匹配取决于 sing-box 的正则语法。

Mihomo MRS 配置示例：

```yaml
rule-providers:
  google:
    type: http
    behavior: domain
    format: mrs
    url: https://YOUR-WORKER.example/rules/mrs/google@ads.mrs
    interval: 3600
  cn_ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://YOUR-WORKER.example/rules/geoip/mrs/cn.mrs
    interval: 3600
```

`domain`、`full`、`keyword` 分别转换为 `DOMAIN-SUFFIX`、`DOMAIN`、`DOMAIN-KEYWORD`。Clash/Mihomo classical 中的 `regexp` 转为 `DOMAIN-REGEX`；Surge、Quantumult X、Loon 与 Shadowrocket 输出会跳过域名正则。MRS 只支持 `domain` 与 `ipcidr` 行为：Geosite MRS 可保留完整域名和域名后缀，`keyword`、`regexp` 及无法编码为 ASCII 域名的值会跳过。MRS 使用有效的 Zstandard 原始块封装，文件通常比 Mihomo 自带转换器生成的压缩 MRS 大。规则值含逗号或换行时，文本格式也会跳过，以避免输出无效规则。响应头 `X-Rule-Count` 和 `X-Skipped-Rules` 显示结果数量。单个源文件上限为 32 MiB。

Loyalsoldier 与 V2Fly 的版本日期取自各自 GitHub Release 对应文件的更新时间；自定义源尝试读取 `Last-Modified` 响应头。数据源没有可靠日期时，首页会显示“暂无日期”。
