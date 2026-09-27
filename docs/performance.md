# 性能观测与静态规则

动态接口的 `X-Cache-Layer` 表示本次请求经过的层：`edge`、`d1` 或 `convert`。`Server-Timing` 的 `worker` 值是 Worker 内的**总耗时**，包含等待网络与数据库的时间，不能当作 CPU 时间。静态规则由 Cloudflare Assets 直接返回，不执行 Worker，因此没有这两个响应头。

本地或线上抽样：

```sh
npm run measure -- https://geo2rule.ameu.net /rules/clash/google.yaml /rules/geoip/clash/cn.yaml
```

脚本每个地址请求 12 次，报告实际响应层、状态码及客户端总耗时的 p50/p95。测试首次转换时应使用**允许的、尚未请求过的分类/属性组合**；重复同一地址用于观察缓存命中。不要把客户端总耗时与 Worker CPU 混用。

在 Cloudflare Worker 的 Metrics → Errors → Invocation Statuses 观察 `Exceeded CPU Time Limits` 与 `Exceeded Memory`，在 Workers Logs 查看 CPU time，在 D1 dashboard 查看每日读写行数。对静态路径、边缘命中、D1 命中和转换分别记录样本；如果转换请求接近 10 ms CPU 或出现 1102，优先把真实热门路径加入 `scripts/build-prebuilt.mjs` 的 `hotset`。每次扩充都检查文件大小及仓库增长。

`npm run build:prebuilt` 从 `wrangler.jsonc` 中的默认来源生成 `public/prebuilt/`，并保存来源 SHA-256 与构建时间。数据不变时不会重写文件。定时 GitHub Action 每天运行该命令并提交更新；`npm run build` 会检查静态规则与配置中的来源 URL 是否一致。Cloudflare Assets 会先提供命中的静态路径，其余请求进入 Worker。
