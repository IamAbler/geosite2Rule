# geosite2Rule Worker

Cloudflare Worker：从 `geosite.dat` 和 `geoip.dat` 读取分类，实时生成 Clash/Mihomo、Surge 与 Mihomo MRS 规则集。Vue 首页提供搜索分类、属性筛选、格式选择和订阅地址复制。默认数据来自 [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat)。

## 本地运行与手动部署

```sh
npm install
npm run build
npm run dev       # 本地预览
npm run deploy
npm run preview   # 发布当前分支的 Cloudflare Preview
```

Vite 将 Vue 前端构建到 `dist/`，Wrangler 通过静态资源绑定提供页面；Worker 继续处理规则集接口。部署前可在 `wrangler.jsonc` 修改 `SOURCE_URL` 与 `GEOIP_URL`，指向其他兼容的 HTTPS 数据文件。转换结果在边缘节点缓存 1 小时，源文件请求也缓存 1 小时。无需 KV、R2 或数据库。

## Cloudflare Workers Git 部署配置

在 Cloudflare 控制台选择 **Workers & Pages → Create application → Import a repository**，连接 `IamAbler/geosite2Rule`。生产分支选择 `main`，根目录保持仓库根目录。Worker 名称使用 `geosite2rule`，与 `wrangler.jsonc` 中的 `name` 一致。

| 配置项 | 填写内容 |
| --- | --- |
| 构建命令（Build command） | `npm run build` |
| 部署命令（Deploy command） | `npx wrangler deploy` |
| 预览命令（Preview command） | `npx wrangler preview` |

保存后，推送到 `main` 会触发生产部署。开启预览构建后，其他分支和拉取请求会运行预览命令并生成独立的预览地址。本地预览仍使用 `npm run dev`。

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
| `/rules/geoip/clash/cn.yaml` | YAML | Mihomo `ipcidr` provider |
| `/rules/geoip/clash-text/cn.list` | 文本 | Mihomo `ipcidr`、`format: text` provider |
| `/rules/geoip/surge/cn.list` | 文本 | Surge IP `RULE-SET` |
| `/rules/geoip/mrs/cn.mrs` | MRS | Mihomo `ipcidr`、`format: mrs` provider |

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

`domain`、`full`、`keyword` 分别转换为 `DOMAIN-SUFFIX`、`DOMAIN`、`DOMAIN-KEYWORD`。Clash/Mihomo classical 中的 `regexp` 转为 `DOMAIN-REGEX`；Surge 无等价的域名正则规则，因此会跳过。MRS 只支持 `domain` 与 `ipcidr` 行为：Geosite MRS 可保留完整域名和域名后缀，`keyword`、`regexp` 及无法编码为 ASCII 域名的值会跳过。MRS 使用有效的 Zstandard 原始块封装，文件通常比 Mihomo 自带转换器生成的压缩 MRS 大。规则值含逗号或换行时，文本格式也会跳过，以避免输出无效规则。响应头 `X-Rule-Count` 和 `X-Skipped-Rules` 显示结果数量。单个源文件上限为 32 MiB。

默认源的版本日期取自 GitHub Release 对应文件的更新时间；自定义源尝试读取 `Last-Modified` 响应头。数据源没有可靠日期时，首页会显示“暂无日期”。
