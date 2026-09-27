<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const sourceType = ref("geosite");
const format = ref("clash");
const categories = ref([]);
const category = ref("");
const categoryQuery = ref("");
const categoryOpen = ref(false);
const activeIndex = ref(0);
const picker = ref(null);
const categoryError = ref("");
const categoriesLoading = ref(false);
const versionLoading = ref(false);
const version = ref(null);
const availableAttributes = ref([]);
const attributeModes = ref({});
const attributesLoading = ref(false);
const attributeError = ref("");
const message = ref("");

let sourceRequest = 0;
let attributeRequest = 0;

const formats = [
  { id: "clash", title: "Clash YAML", detail: "规则提供者" },
  { id: "clash-text", title: "Clash 文本", detail: "纯文本订阅" },
  { id: "surge", title: "Surge", detail: "RULE-SET" },
  { id: "mrs", title: "MRS", detail: "Mihomo 二进制" }
];

const matches = computed(() => {
  const query = categoryQuery.value.trim().toLowerCase();
  return query ? categories.value.filter(name => name.includes(query)) : categories.value;
});
const shownCategories = computed(() => matches.value.slice(0, 80));
const sourceName = computed(() => sourceType.value === "geoip" ? "geoip.dat" : "geosite.dat");
const selectedAttributes = computed(() => Object.entries(attributeModes.value).filter(([, mode]) => mode));
const ruleUrl = computed(() => {
  if (!category.value) return "";
  let name = category.value;
  if (sourceType.value === "geosite") {
    for (const [attribute, mode] of selectedAttributes.value) {
      name += "@" + (mode === "exclude" ? "-" : "") + attribute;
    }
  }
  const path = sourceType.value === "geoip" ? "/rules/geoip/" : "/rules/";
  const extension = format.value === "clash" ? ".yaml" : format.value === "mrs" ? ".mrs" : ".list";
  return location.origin + path + format.value + "/" + encodeURIComponent(name) + extension;
});
const behavior = computed(() => sourceType.value === "geoip" ? "ipcidr" : format.value === "mrs" ? "domain" : "classical");
const snippet = computed(() => {
  if (!ruleUrl.value) return "选择分类后显示配置片段";
  if (format.value === "surge") return "RULE-SET," + ruleUrl.value + ",PROXY";
  const ruleFormat = format.value === "mrs" ? "mrs" : format.value === "clash-text" ? "text" : "yaml";
  return [
    "rule-providers:", "  selected:", "    type: http",
    "    behavior: " + behavior.value, "    format: " + ruleFormat,
    "    url: " + ruleUrl.value, "    interval: 3600",
    "rules:", "  - RULE-SET,selected,PROXY"
  ].join("\n");
});
const versionText = computed(() => {
  if (versionLoading.value) return "读取中…";
  if (!version.value?.date) return "暂无日期";
  return new Date(version.value.date).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai"
  }) + " CST";
});
const versionNote = computed(() => {
  if (!version.value?.date) return versionLoading.value ? "" : "当前数据源未提供可确认的更新时间";
  return version.value.source === "release" ? "GitHub Release 文件更新时间" : "源文件 Last-Modified";
});

function selectCategory(name) {
  category.value = name;
  categoryQuery.value = name;
  categoryOpen.value = false;
  message.value = "";
}

function openPicker() {
  categoryQuery.value = "";
  categoryOpen.value = true;
  activeIndex.value = 0;
}

function onCategoryInput(event) {
  categoryQuery.value = event.target.value;
  category.value = "";
  categoryOpen.value = true;
  activeIndex.value = 0;
}

function onCategoryKeydown(event) {
  if (event.key === "Escape") {
    categoryOpen.value = false;
    categoryQuery.value = category.value;
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    categoryOpen.value = true;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = Math.max(0, Math.min(shownCategories.value.length - 1, activeIndex.value + delta));
  } else if (event.key === "Enter" && categoryOpen.value && shownCategories.value.length) {
    event.preventDefault();
    selectCategory(shownCategories.value[activeIndex.value] || shownCategories.value[0]);
  }
}

function closePicker(event) {
  if (picker.value && !picker.value.contains(event.target)) {
    categoryOpen.value = false;
    categoryQuery.value = category.value;
  }
}

function cycleAttribute(name) {
  const mode = attributeModes.value[name];
  attributeModes.value = {
    ...attributeModes.value,
    [name]: mode === "include" ? "exclude" : mode === "exclude" ? "" : "include"
  };
  message.value = "";
}

async function loadAttributes() {
  const requestId = ++attributeRequest;
  availableAttributes.value = [];
  attributeModes.value = {};
  attributeError.value = "";
  attributesLoading.value = false;
  if (sourceType.value !== "geosite" || !category.value) return;
  attributesLoading.value = true;
  try {
    const response = await fetch("/attributes/" + encodeURIComponent(category.value));
    if (!response.ok) throw new Error("属性加载失败，请稍后重试");
    const data = await response.json();
    if (requestId !== attributeRequest) return;
    availableAttributes.value = data.attributes || [];
  } catch (error) {
    if (requestId === attributeRequest) attributeError.value = error.message;
  } finally {
    if (requestId === attributeRequest) attributesLoading.value = false;
  }
}

async function loadCategories(type, requestId) {
  categoriesLoading.value = true;
  categoryError.value = "";
  try {
    const response = await fetch("/categories?type=" + type);
    if (!response.ok) throw new Error("分类加载失败，请稍后重试");
    const data = await response.json();
    if (requestId !== sourceRequest) return;
    categories.value = data.categories || [];
  } catch (error) {
    if (requestId === sourceRequest) categoryError.value = error.message;
  } finally {
    if (requestId === sourceRequest) categoriesLoading.value = false;
  }
}

async function loadVersion(type, requestId) {
  versionLoading.value = true;
  try {
    const response = await fetch("/version?type=" + type);
    if (!response.ok) throw new Error("日期读取失败");
    const data = await response.json();
    if (requestId === sourceRequest) version.value = data;
  } catch {
    if (requestId === sourceRequest) version.value = null;
  } finally {
    if (requestId === sourceRequest) versionLoading.value = false;
  }
}

async function copyUrl() {
  if (!ruleUrl.value) return;
  try {
    await navigator.clipboard.writeText(ruleUrl.value);
    message.value = "地址已复制";
  } catch {
    message.value = "复制失败，请手动选择地址";
  }
}

watch(sourceType, type => {
  const requestId = ++sourceRequest;
  category.value = "";
  categoryQuery.value = "";
  categoryOpen.value = false;
  categories.value = [];
  version.value = null;
  message.value = "";
  loadCategories(type, requestId);
  loadVersion(type, requestId);
}, { immediate: true });
watch([category, sourceType], loadAttributes);
watch([format, selectedAttributes], () => { message.value = ""; });
onMounted(() => document.addEventListener("pointerdown", closePicker));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closePicker));
</script>

<template>
  <nav class="topbar">
    <div class="shell">
      <a class="brand" href="/"><span class="brand-mark">↗</span> geosite2Rule</a>
      <a class="top-link" href="https://github.com/IamAbler/geosite2Rule" target="_blank" rel="noopener">GitHub ↗</a>
    </div>
  </nav>
  <main class="shell">
    <header>
      <span class="eyebrow"><span class="dot"></span> RULESET CONVERTER</span>
      <h1>把地理数据，<br>变成你需要的规则。</h1>
      <p>选择分类与格式，生成可直接订阅的 Clash / Mihomo、Surge 规则集。支持 Geosite、GeoIP 和 MRS。</p>
    </header>
    <div class="workspace">
      <section class="panel builder" aria-label="规则集生成器">
        <div class="section-head"><h2>创建规则集</h2><span class="step">01 / CONFIGURE</span></div>
        <div class="field">
          <div class="label-row"><strong>数据类型</strong><span class="hint">选择源数据库</span></div>
          <div class="segmented" aria-label="数据类型">
            <button type="button" :class="{ active: sourceType === 'geosite' }" :aria-pressed="sourceType === 'geosite'" @click="sourceType = 'geosite'">Geosite · 域名</button>
            <button type="button" :class="{ active: sourceType === 'geoip' }" :aria-pressed="sourceType === 'geoip'" @click="sourceType = 'geoip'">GeoIP · IP 段</button>
          </div>
        </div>
        <div class="field">
          <div class="label-row"><label for="category-search">选择分类</label><span class="hint">{{ categoriesLoading ? '加载中…' : categories.length + ' 个分类' }}</span></div>
          <div ref="picker" class="picker">
            <div class="picker-input-wrap">
              <input id="category-search" class="input picker-input" type="search" autocomplete="off" role="combobox"
                aria-controls="category-options" :aria-expanded="categoryOpen" aria-autocomplete="list"
                :value="categoryQuery" :placeholder="categoriesLoading ? '正在读取分类…' : '搜索或选择分类'"
                @focus="openPicker" @input="onCategoryInput" @keydown="onCategoryKeydown">
              <span class="picker-arrow" aria-hidden="true">⌄</span>
            </div>
            <div v-if="categoryOpen" id="category-options" class="picker-menu" role="listbox">
              <p v-if="categoriesLoading" class="picker-empty">正在读取分类…</p>
              <p v-else-if="categoryError" class="picker-empty">{{ categoryError }}</p>
              <p v-else-if="!matches.length" class="picker-empty">没有匹配的分类</p>
              <template v-else>
                <button v-for="(name, index) in shownCategories" :key="name" type="button" role="option"
                  :aria-selected="name === category" :class="['picker-option', { focused: index === activeIndex, chosen: name === category }]"
                  @pointerdown.prevent="selectCategory(name)">{{ name }}<span v-if="name === category" aria-hidden="true">✓</span></button>
                <p v-if="matches.length > shownCategories.length" class="picker-more">还有 {{ matches.length - shownCategories.length }} 个结果，请继续输入关键词</p>
              </template>
            </div>
          </div>
          <p class="helper" v-if="categoryError">{{ categoryError }}</p>
          <p class="helper" v-else>{{ category ? '已选择 ' + category : '输入关键词搜索，点击结果即可选择' }}</p>
        </div>
        <div v-if="sourceType === 'geosite'" class="field">
          <div class="label-row"><strong>属性筛选</strong><span class="hint">点击切换 包含 → 排除 → 取消</span></div>
          <div class="attributes">
            <span v-if="attributesLoading" class="empty">读取属性中…</span>
            <span v-else-if="attributeError" class="empty">{{ attributeError }}</span>
            <span v-else-if="!availableAttributes.length" class="empty">{{ category ? '该分类没有可筛选属性' : '选择分类后显示可用属性' }}</span>
            <button v-for="name in availableAttributes" :key="name" type="button" :class="['attribute', attributeModes[name] || '']"
              :aria-pressed="!!attributeModes[name]" @click="cycleAttribute(name)">{{ attributeModes[name] === 'exclude' ? '@-' : '@' }}{{ name }}</button>
          </div>
          <p class="helper">包含生成 <code>@属性</code>，排除生成 <code>@-属性</code>。</p>
        </div>
        <div class="output">
          <div class="label-row"><strong>输出格式</strong><span class="hint">选择订阅客户端</span></div>
          <div class="output-grid">
            <button v-for="item in formats" :key="item.id" type="button" :class="['format', { active: format === item.id }]"
              :aria-pressed="format === item.id" @click="format = item.id">{{ item.title }}<small>{{ item.detail }}</small></button>
          </div>
          <div class="result">
            <p class="result-label">订阅地址</p><p class="url">{{ ruleUrl || '选择分类后生成地址' }}</p>
            <div class="actions"><button class="primary" type="button" :disabled="!ruleUrl" @click="copyUrl">复制地址</button>
              <a v-if="ruleUrl" class="secondary" :href="ruleUrl" target="_blank" rel="noopener">{{ format === 'mrs' ? '下载 MRS' : '预览规则' }}</a></div>
          </div>
          <p class="status" role="status">{{ message || (sourceType === 'geosite' && format === 'mrs' ? 'MRS 仅包含完整域名和域名后缀；keyword / regexp 会跳过。' : '') }}</p>
        </div>
      </section>
      <aside class="side">
        <section class="panel"><h2>当前数据源</h2><div class="meta-list">
          <div class="meta-item"><span class="meta-label">数据文件</span><strong class="meta-value">{{ sourceName }}</strong></div>
          <div class="meta-item"><span class="meta-label">版本日期</span><strong class="meta-value">{{ versionText }}</strong><p class="subtle">{{ versionNote }}</p></div>
          <div class="meta-item"><span class="meta-label">更新频率</span><strong class="meta-value">每小时检查</strong></div>
        </div></section>
        <section class="panel"><h2>接入提示</h2><p class="subtle">{{ format === 'surge' ? '将以下规则加入 Surge 配置的 [Rule] 区块。' : '将以下配置加入 Clash / Mihomo 的规则提供者。' }}</p><pre class="snippet">{{ snippet }}</pre></section>
      </aside>
    </div>
  </main>
  <footer><div class="shell footer-inner"><span>geosite2Rule · 开源规则集转换工具</span><span>由 Cloudflare Workers 提供服务</span></div></footer>
</template>
