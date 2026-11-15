# geosite2Rule

将 Geosite 和 GeoIP `.dat` 数据转换为 Clash/Mihomo、Surge、Quantumult X、Loon、Shadowrocket、sing-box、MosDNS 和 SmartDNS 可用的规则集。打开网页选好数据来源、分类与格式，即可复制生成地址。

**Demo：[geo2rule.ameu.net](https://geo2rule.ameu.net/)**

Demo 适合体验和检查输出。公共站点的访问额度由所有用户共享；如果要长期订阅或供多人使用，**推荐先 [Fork 本仓库](https://github.com/IamAbler/geosite2Rule/fork)，再部署到自己的 Cloudflare 账号**，避免占用 Demo 的共享额度。

## 适合什么场景

| 需求 | 用法 |
| --- | --- |
| 按域名分类分流 | 选择 Geosite 分类，例如 `google`，生成域名规则集 |
| 按国家或地区 IP 分流 | 切换到 GeoIP，选择 `cn` 等分类 |
| 只保留或排除某类域名 | 为 Geosite 分类选择属性，例如包含 `@ads` 或排除 `@-ads` |
| 给不同客户端提供规则 | 为同一分类选择对应的 Clash/Mihomo、Surge、Loon、Shadowrocket、Quantumult X、sing-box、MosDNS 或 SmartDNS 格式 |
| 使用自己的 `.dat` 文件 | 选择“自定义”来源，填写公开的 HTTPS 下载地址 |

## 如何使用

1. 打开 [Demo](https://geo2rule.ameu.net/)，选择 **Geosite** 或 **GeoIP**。
2. 选择数据来源。默认使用 [Loyalsoldier](https://github.com/Loyalsoldier/v2ray-rules-dat)，也可选择 V2Fly 或自定义 `.dat` 地址。
3. 搜索并选择分类。Geosite 可进一步选择要包含或排除的属性；GeoIP 没有属性。
4. 选择客户端格式，复制生成的地址，填入客户端的配置。

常用地址示例：

| 用途 | Demo 地址 |
| --- | --- |
| Mihomo/Clash 域名规则 | [`/rules/clash/google.yaml`](https://geo2rule.ameu.net/rules/clash/google.yaml) |
| Mihomo MRS 域名规则 | [`/rules/mrs/google.mrs`](https://geo2rule.ameu.net/rules/mrs/google.mrs) |
| Mihomo/Clash GeoIP 规则 | [`/rules/geoip/clash/cn.yaml`](https://geo2rule.ameu.net/rules/geoip/clash/cn.yaml) |
| sing-box 域名规则 | [`/rules/sing-box/google.json`](https://geo2rule.ameu.net/rules/sing-box/google.json) |
| MosDNS 域名规则集 | [`/rules/mosdns/google.txt`](https://geo2rule.ameu.net/rules/mosdns/google.txt) |
| MosDNS GeoIP 规则集 | [`/rules/geoip/mosdns/cn.txt`](https://geo2rule.ameu.net/rules/geoip/mosdns/cn.txt) |
| SmartDNS 域名分流配置 | [`/rules/smartdns/google.conf?upstream=223.5.5.5`](https://geo2rule.ameu.net/rules/smartdns/google.conf?upstream=223.5.5.5) |
| SmartDNS GeoIP CIDR 清单 | [`/rules/geoip/smartdns/cn.txt`](https://geo2rule.ameu.net/rules/geoip/smartdns/cn.txt) |

例如，在 Mihomo 中订阅 `google` 域名分类：

```yaml
rule-providers:
  google:
    type: http
    behavior: classical
    format: yaml
    url: https://geo2rule.ameu.net/rules/clash/google.yaml
    interval: 3600
rules:
  - RULE-SET,google,PROXY
```

长期使用时，把示例中的 Demo 域名换成自己部署后的域名，并把 `PROXY` 换成自己的策略组。若使用 MRS，请选择 `behavior: domain`、`format: mrs`；GeoIP MRS 则使用 `behavior: ipcidr`。

### MosDNS 规则集

在网页选择 **MosDNS** 格式，可下载 MosDNS v5 `domain_set` 或 `ip_set` 插件可读取的规则文件。Geosite 会保留匹配类型：`domain:` 表示域名及其子域名，`full:` 表示完整匹配，`keyword:` 表示关键词，`regexp:` 表示正则表达式；GeoIP 输出 CIDR 清单。网页会提供把域名规则接到 `forward` 上游的配置片段，也可指定上游地址，例如 `223.5.5.5`。

MosDNS 规则集只保存匹配规则；选择的上游地址会放入配置示例中的 `forward` 插件。域名规则需要通过 `qname` 匹配器加入主 `sequence`，并放在默认转发分支之前。

### SmartDNS 规则集

在网页选择 **SmartDNS** 格式，Geosite 会生成可由 `conf-file` 引入的配置片段，包含指定上游和域名分流规则。默认上游是 `223.5.5.5`，也可填写 SmartDNS 支持的服务器地址，例如 `tls://dns.google:853` 或 `https://dns.google/dns-query`。域名后缀会生成为 `nameserver /example.org/geo2rule`，完整域名会生成为 `nameserver /-www.example.org/geo2rule`；关键词和正则类型无法由 SmartDNS 直接匹配，会被跳过。

GeoIP 会输出原始 CIDR 清单，可通过网页给出的 `ip-set -name geo2rule -type list -file ...` 指令加载，并在 SmartDNS 的 IP 规则中引用。

### 格式和来源说明

- 网页会按所选客户端生成正确的地址。Clash/Mihomo 支持 YAML、文本和 MRS；sing-box 使用 JSON；MosDNS 输出可由 `domain_set` / `ip_set` 插件加载的规则文件；SmartDNS 输出可引入的分流配置或 `ip-set` CIDR 清单；其他客户端使用各自的规则列表。
- 域名正则规则并非所有格式都支持。不支持的规则会被跳过；如果所选分类无法生成任何有效规则，接口会返回错误。响应头 `X-Rule-Count` 和 `X-Skipped-Rules` 可查看生成和跳过的数量。
- 自定义来源需是公开 HTTPS 地址，使用默认 HTTPS 端口，单个 `.dat` 文件不超过 32 MiB。请使用可信的数据来源。
- 规则缓存每天北京时间 09:00 到期；通常会先返回上一版并在后台刷新，缓存过期较久时可能需要等待更新完成。
- 首页显示的数据更新时间取决于上游是否提供可靠日期；“暂无日期”不代表数据为空。

## Fork 后自部署

需要 GitHub 账号、Cloudflare 账号和本地 Node.js 环境。先克隆自己的 Fork，其余命令在仓库根目录执行。

1. [Fork 本仓库](https://github.com/IamAbler/geosite2Rule/fork)，将下方的 `your-github-name` 换成自己的 GitHub 用户名，克隆 Fork、安装依赖并登录 Cloudflare：

   ```sh
   git clone https://github.com/your-github-name/geosite2Rule.git
   cd geosite2Rule
   npm install
   npx wrangler login
   ```

2. 打开 `wrangler.jsonc`，将 `name` 改为自己的 Worker 名称，例如 `geosite2rule-yourname`。创建自己的 KV 和 D1 资源：

   ```sh
   npx wrangler kv namespace create RULE_CACHE
   npx wrangler d1 create geosite2rule-cache
   ```

3. 将命令返回的 KV `id` 和 D1 `database_id` 写入 `wrangler.jsonc`，**替换仓库中现有的 ID**。绑定名保持 `RULE_CACHE` 和 `RULE_DB`；如果更改了 D1 数据库名，也要同步修改配置和下面的命令。

   `wrangler.jsonc` 中的资源 ID 可以随 Fork 公开，但它们必须属于你自己的 Cloudflare 账号。不要把 API Token、密码等写进配置文件或提交到 Git；如需添加敏感值，请使用 [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

4. 初始化自己的远程数据库：

   ```sh
   npx wrangler d1 migrations apply geosite2rule-cache --remote
   ```

5. 运行 `npm run build`，把修改后的 `wrangler.jsonc` 提交并推送到自己的 Fork。在 Cloudflare **Workers & Pages → Create application → Import a repository** 中选择这个 Fork。Worker 名称须与 `wrangler.jsonc` 的 `name` 一致；仓库根目录作为项目目录，构建命令填 `npm run build`，部署命令填 `npx wrangler deploy`。之后推送到生产分支即可自动更新。也可以直接运行 `npm run deploy` 手动发布。

首次部署后，打开自己的 Worker 地址，按上面的使用步骤生成订阅链接。Cloudflare 的 [Git 部署说明](https://developers.cloudflare.com/workers/ci-cd/builds/)、[KV 创建说明](https://developers.cloudflare.com/kv/get-started/) 和 [D1 创建说明](https://developers.cloudflare.com/d1/get-started/) 可供参考。

本地预览可运行：

```sh
npx wrangler d1 migrations apply geosite2rule-cache --local
npm run dev
```
