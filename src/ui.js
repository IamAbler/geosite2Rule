export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>geosite2Rule · 规则集转换</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f7f7f6;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button{cursor:pointer}a{color:inherit}
    .shell{max-width:1120px;margin:0 auto;padding:0 32px}.topbar{height:76px;border-bottom:1px solid #e4e4e1;background:#fff}.topbar .shell{height:100%;display:flex;align-items:center;justify-content:space-between}
    .brand{display:flex;align-items:center;gap:11px;text-decoration:none;font-weight:750;letter-spacing:-.04em;font-size:19px}.brand-mark{width:29px;height:29px;display:grid;place-items:center;background:#171717;color:#fff;border-radius:8px;font-size:17px;letter-spacing:0}
    .top-link{font-size:13px;text-decoration:none;color:#555;border:1px solid #dededb;border-radius:9px;padding:8px 12px}.top-link:hover{border-color:#171717;color:#171717}
    main{padding-top:70px;padding-bottom:80px}.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#666}.dot{width:7px;height:7px;border-radius:50%;background:#171717}
    h1{font-size:clamp(39px,5vw,62px);line-height:1.12;letter-spacing:-.065em;margin:18px 0 16px;font-weight:750}header p{font-size:17px;color:#666;line-height:1.7;margin:0;max-width:590px}
    .workspace{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(290px,1fr);gap:20px;margin-top:44px}.panel{background:#fff;border:1px solid #e5e5e2;border-radius:16px;box-shadow:0 7px 24px rgba(0,0,0,.025)}
    .builder{padding:29px}.side{display:flex;flex-direction:column;gap:20px}.side .panel{padding:24px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:21px}.section-head h2,.side h2{font-size:17px;letter-spacing:-.025em;margin:0}.step{font-size:11px;font-weight:700;color:#888;letter-spacing:.08em}
    .field{margin-top:27px}.field:first-of-type{margin-top:0}.label-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:11px}.label-row label,.label-row strong{font-size:13px;font-weight:700}.hint{font-size:12px;color:#888}.segmented{display:grid;grid-template-columns:1fr 1fr;gap:5px;background:#f2f2f0;border-radius:11px;padding:5px}.segmented button{border:0;background:transparent;border-radius:8px;padding:11px 8px;color:#777;font-size:13px;font-weight:650}.segmented button.active{background:#171717;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.13)}
    .input,.select{width:100%;border:1px solid #dededb;border-radius:9px;padding:11px 13px;color:#171717;background:#fff;outline:0}.input:focus,.select:focus{border-color:#171717;box-shadow:0 0 0 3px #ececec}.input::placeholder{color:#aaa}.select{min-height:171px;padding:5px}.select option{padding:7px 9px;border-radius:5px}.select option:checked{background:#171717 linear-gradient(#171717,#171717);color:#fff}.search{margin-bottom:9px}
    .empty{font-size:13px;color:#999;padding:14px 0}.attributes{display:flex;flex-wrap:wrap;gap:8px}.attribute{border:1px solid #dededb;background:#fff;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:650;color:#555}.attribute.include{background:#171717;color:white;border-color:#171717}.attribute.exclude{background:#ededeb;color:#171717;border-color:#bcbcb8;text-decoration:line-through}.helper{font-size:12px;color:#888;line-height:1.6;margin:9px 0 0}
    .output{margin-top:29px;border-top:1px solid #ececea;padding-top:25px}.output-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.format{border:1px solid #dfdfdc;background:#fff;border-radius:9px;padding:12px;text-align:left;color:#555;font-size:13px;font-weight:650}.format.active{background:#171717;color:#fff;border-color:#171717}.format small{display:block;font-size:11px;font-weight:500;opacity:.67;margin-top:3px}
    .result{margin-top:22px;background:#f7f7f6;border:1px solid #e7e7e4;border-radius:11px;padding:16px}.result-label{font-size:11px;font-weight:750;letter-spacing:.08em;color:#888;text-transform:uppercase;margin:0 0 10px}.url{overflow-wrap:anywhere;font-size:13px;line-height:1.6;margin:0;min-height:42px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.primary,.secondary{border-radius:8px;padding:10px 13px;font-size:12px;font-weight:700;text-decoration:none}.primary{background:#171717;color:#fff;border:1px solid #171717}.primary:hover{background:#333}.secondary{background:white;color:#171717;border:1px solid #dededb}.secondary:hover{border-color:#171717}.status{font-size:12px;color:#777;min-height:19px;margin:10px 0 0}
    .meta-list{display:grid;gap:17px;margin-top:20px}.meta-item{border-top:1px solid #ececea;padding-top:13px}.meta-item:first-child{border:0;padding-top:0}.meta-label{font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:.08em}.meta-value{display:block;font-size:14px;font-weight:650;margin-top:5px;overflow-wrap:anywhere}.subtle{font-size:12px;color:#888;line-height:1.6;margin:10px 0 0}.snippet{font:12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace;background:#f7f7f6;border:1px solid #ececea;padding:14px;border-radius:9px;white-space:pre-wrap;overflow-wrap:anywhere;margin:17px 0 0}
    footer{border-top:1px solid #e4e4e1;color:#999;font-size:12px;padding:23px 0 32px}.footer-inner{display:flex;justify-content:space-between;gap:12px}
    @media(max-width:760px){.shell{padding:0 18px}.topbar{height:64px}main{padding-top:45px}.workspace{grid-template-columns:1fr;margin-top:32px}.builder{padding:22px}.side{display:grid;grid-template-columns:1fr 1fr}h1{font-size:40px}}
    @media(max-width:560px){.side{grid-template-columns:1fr}.top-link{font-size:12px}.footer-inner{display:block}}
  </style>
</head>
<body>
  <nav class="topbar"><div class="shell"><a class="brand" href="/"><span class="brand-mark">↗</span> geosite2Rule</a><a class="top-link" href="https://github.com/IamAbler/geosite2Rule" target="_blank" rel="noopener">GitHub ↗</a></div></nav>
  <main class="shell">
    <header><span class="eyebrow"><span class="dot"></span> RULESET CONVERTER</span><h1>把地理数据，<br>变成你需要的规则。</h1><p>选择分类与格式，生成可直接订阅的 Clash / Mihomo、Surge 规则集。支持 Geosite、GeoIP 和 MRS。</p></header>
    <div class="workspace">
      <section class="panel builder" aria-label="规则集生成器">
        <div class="section-head"><h2>创建规则集</h2><span class="step">01 / CONFIGURE</span></div>
        <div class="field"><div class="label-row"><strong>数据类型</strong><span class="hint">选择源数据库</span></div><div class="segmented" id="types"><button class="active" type="button" data-type="geosite">Geosite · 域名</button><button type="button" data-type="geoip">GeoIP · IP 段</button></div></div>
        <div class="field"><div class="label-row"><label for="search">选择分类</label><span class="hint" id="category-count">加载中…</span></div><input class="input search" id="search" type="search" placeholder="搜索分类，例如 google 或 cn" autocomplete="off"><select class="select" id="category" size="7" aria-label="分类列表"></select><p class="helper" id="category-help">正在读取当前数据源的分类…</p></div>
        <div class="field" id="attribute-field"><div class="label-row"><strong>属性筛选</strong><span class="hint">点击切换 包含 → 排除 → 取消</span></div><div class="attributes" id="attributes"><span class="empty">选择分类后显示可用属性</span></div><p class="helper">包含生成 <code>@属性</code>，排除生成 <code>@-属性</code>。</p></div>
        <div class="output"><div class="label-row"><strong>输出格式</strong><span class="hint">选择订阅客户端</span></div><div class="output-grid" id="formats"></div><div class="result"><p class="result-label">订阅地址</p><p class="url" id="url">选择分类后生成地址</p><div class="actions"><button class="primary" id="copy" type="button" disabled>复制地址</button><a class="secondary" id="open" target="_blank" rel="noopener" hidden>预览规则</a></div></div><p class="status" id="status" role="status"></p></div>
      </section>
      <aside class="side"><section class="panel"><h2>当前数据源</h2><div class="meta-list"><div class="meta-item"><span class="meta-label">数据文件</span><strong class="meta-value" id="source-name">geosite.dat</strong></div><div class="meta-item"><span class="meta-label">版本日期</span><strong class="meta-value" id="version">读取中…</strong><p class="subtle" id="version-note"></p></div><div class="meta-item"><span class="meta-label">更新频率</span><strong class="meta-value">每小时检查</strong></div></div></section><section class="panel"><h2>接入提示</h2><p class="subtle" id="usage">Clash / Mihomo 使用 rule-providers 引用生成的 URL。</p><pre class="snippet" id="snippet">选择分类后显示配置片段</pre></section></aside>
    </div>
  </main>
  <footer><div class="shell footer-inner"><span>geosite2Rule · 开源规则集转换工具</span><span>由 Cloudflare Workers 提供服务</span></div></footer>
  <script>
    const state = { type: 'geosite', format: 'clash', categories: [], selected: '', attributes: new Map(), loadId: 0, typeLoadId: 0 };
    const $ = id => document.getElementById(id);
    const formats = [
      ['clash', 'Clash YAML', 'classical / ipcidr'],
      ['clash-text', 'Clash 文本', 'classical / ipcidr'],
      ['surge', 'Surge', 'RULE-SET'],
      ['mrs', 'MRS', 'Mihomo 二进制']
    ];
    function renderFormats() {
      $('formats').replaceChildren(...formats.map(([key, title, detail]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'format' + (state.format === key ? ' active' : '');
        button.innerHTML = title + '<small>' + detail + '</small>';
        button.addEventListener('click', () => { state.format = key; renderFormats(); renderResult(); });
        return button;
      }));
    }
    function renderCategories() {
      const query = $('search').value.trim().toLowerCase();
      const matches = state.categories.filter(name => name.includes(query));
      const select = $('category');
      select.replaceChildren(new Option('选择一个分类', '', false, !matches.includes(state.selected)), ...matches.map(name => new Option(name, name, false, name === state.selected)));
      $('category-count').textContent = matches.length + ' / ' + state.categories.length + ' 个分类';
      $('category-help').textContent = matches.length ? '从列表中选择一个分类' : '没有匹配的分类';
    }
    function renderAttributes() {
      const container = $('attributes');
      if (!state.attributes.size) { container.innerHTML = '<span class="empty">该分类没有可筛选属性</span>'; return; }
      container.replaceChildren(...[...state.attributes].map(([name, mode]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'attribute ' + mode;
        button.textContent = mode === 'exclude' ? '@-' + name : '@' + name;
        button.title = mode === 'include' ? '已包含；点击改为排除' : mode === 'exclude' ? '已排除；点击取消' : '点击包含';
        button.addEventListener('click', () => {
          state.attributes.set(name, mode === '' ? 'include' : mode === 'include' ? 'exclude' : '');
          renderAttributes(); renderResult();
        });
        return button;
      }));
    }
    function ruleUrl() {
      if (!state.selected) return '';
      let name = state.selected;
      if (state.type === 'geosite') for (const [attr, mode] of state.attributes) {
        if (mode) name += '@' + (mode === 'exclude' ? '-' : '') + attr;
      }
      const path = state.type === 'geoip' ? '/rules/geoip/' : '/rules/';
      const ext = state.format === 'clash' ? '.yaml' : state.format === 'mrs' ? '.mrs' : '.list';
      return location.origin + path + state.format + '/' + encodeURIComponent(name) + ext;
    }
    function renderResult() {
      const url = ruleUrl();
      $('url').textContent = url || '选择分类后生成地址';
      $('copy').disabled = !url;
      $('open').hidden = !url;
      $('open').textContent = state.format === 'mrs' ? '下载 MRS' : '预览规则';
      if (url) $('open').href = url;
      $('status').textContent = state.type === 'geosite' && state.format === 'mrs'
        ? 'MRS 仅包含完整域名和域名后缀；keyword / regexp 会跳过。' : '';
      const behavior = state.type === 'geoip' ? 'ipcidr' : state.format === 'mrs' ? 'domain' : 'classical';
      $('usage').textContent = state.format === 'surge' ? '将以下规则加入 Surge 配置的 [Rule] 区块。' : '将以下配置加入 Clash / Mihomo 的规则提供者。';
      $('snippet').textContent = !url ? '选择分类后显示配置片段' : state.format === 'surge'
        ? 'RULE-SET,' + url + ',PROXY'
        : ['rule-providers:', '  selected:', '    type: http', '    behavior: ' + behavior, '    format: ' + (state.format === 'mrs' ? 'mrs' : state.format === 'clash-text' ? 'text' : 'yaml'), '    url: ' + url, '    interval: 3600', 'rules:', '  - RULE-SET,selected,PROXY'].join(String.fromCharCode(10));
    }
    async function loadAttributes() {
      const id = ++state.loadId;
      state.attributes.clear(); renderAttributes(); renderResult();
      if (state.type !== 'geosite' || !state.selected) return;
      $('attributes').innerHTML = '<span class="empty">读取属性中…</span>';
      try {
        const response = await fetch('/attributes/' + encodeURIComponent(state.selected));
        if (!response.ok) throw new Error('属性加载失败');
        const data = await response.json();
        if (id !== state.loadId) return;
        state.attributes = new Map(data.attributes.map(name => [name, '']));
        renderAttributes();
      } catch (error) {
        if (id === state.loadId) $('attributes').textContent = error.message;
      }
    }
    async function loadType() {
      const type = state.type;
      const typeLoadId = ++state.typeLoadId;
      ++state.loadId;
      state.selected = ''; state.categories = []; state.attributes.clear();
      $('search').value = ''; renderCategories(); renderAttributes(); renderResult();
      $('source-name').textContent = type === 'geoip' ? 'geoip.dat' : 'geosite.dat';
      $('version').textContent = '读取中…'; $('version-note').textContent = '';
      $('attribute-field').hidden = type === 'geoip';
      document.querySelectorAll('[data-type]').forEach(button => button.classList.toggle('active', button.dataset.type === type));
      const [catalog, version] = await Promise.allSettled([
        fetch('/categories?type=' + type).then(async response => { if (!response.ok) throw new Error('分类加载失败'); return response.json(); }),
        fetch('/version?type=' + type).then(async response => { if (!response.ok) throw new Error('日期读取失败'); return response.json(); })
      ]);
      if (typeLoadId !== state.typeLoadId) return;
      if (catalog.status === 'fulfilled') {
        state.categories = catalog.value.categories;
        state.selected = state.categories.includes(type === 'geoip' ? 'cn' : 'google') ? (type === 'geoip' ? 'cn' : 'google') : state.categories[0] || '';
        renderCategories(); loadAttributes();
      } else {
        $('category-count').textContent = '加载失败';
        $('category-help').textContent = catalog.reason.message;
      }
      if (version.status === 'fulfilled' && version.value.date) {
        $('version').textContent = new Date(version.value.date).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Shanghai' }) + ' CST';
        $('version-note').textContent = version.value.source === 'release' ? 'GitHub Release 文件更新时间' : '源文件 Last-Modified';
      } else {
        $('version').textContent = '暂无日期';
        $('version-note').textContent = '当前数据源未提供可确认的更新时间';
      }
    }
    document.querySelectorAll('[data-type]').forEach(button => button.addEventListener('click', () => { if (state.type !== button.dataset.type) { state.type = button.dataset.type; loadType(); } }));
    $('search').addEventListener('input', () => {
      if (state.selected && !state.selected.includes($('search').value.trim().toLowerCase())) {
        state.selected = ''; state.attributes.clear(); ++state.loadId;
        renderAttributes(); renderResult();
      }
      renderCategories();
    });
    $('category').addEventListener('change', event => { state.selected = event.target.value; loadAttributes(); });
    $('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(ruleUrl()); $('status').textContent = '地址已复制'; } catch { $('status').textContent = '复制失败，请手动选择地址'; } });
    renderFormats(); loadType();
  </script>
</body>
</html>`;
