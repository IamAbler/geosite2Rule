# 性能观测

接口的 `X-Cache-Layer` 表示本次请求经过的层：`edge`、`d1` 或 `convert`。`Server-Timing` 的 `worker` 值是 Worker 内的**总耗时**，包含等待网络与数据库的时间，不能当作 CPU 时间。

本地或线上抽样：

```sh
npm run measure -- https://geo2rule.ameu.net /rules/clash/google.yaml /rules/geoip/clash/cn.yaml
```

脚本每个地址请求 12 次，报告实际响应层、状态码及客户端总耗时的 p50/p95。测试首次转换时应使用**允许的、尚未请求过的分类/属性组合**；重复同一地址用于观察缓存命中。不要把客户端总耗时与 Worker CPU 混用。

在 Cloudflare Worker 的 Metrics → Errors → Invocation Statuses 观察 `Exceeded CPU Time Limits` 与 `Exceeded Memory`，在 Workers Logs 查看 CPU time，在 D1 dashboard 查看每日读写行数。分别记录边缘缓存命中、D1 命中和首次转换的样本，关注高 CPU 耗时的转换请求。
