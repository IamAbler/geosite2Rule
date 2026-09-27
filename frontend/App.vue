<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const sourceType = ref("geosite");
const format = ref("clash");
const categories = ref([]);
const category = ref("");
const categoryQuery = ref("");
const categoryOpen = ref(false);
const activeIndex = ref(0);
const picker = ref(null);
const pickerTrigger = ref(null);
const pickerSearch = ref(null);
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
const shownCategories = computed(() => {
  if (categoryQuery.value.trim() || !category.value) return matches.value.slice(0, 80);
  return [category.value, ...matches.value.filter(name => name !== category.value).slice(0, 79)];
});
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
  dismissPicker();
  message.value = "";
  nextTick(() => pickerTrigger.value?.focus());
}

function dismissPicker() {
  categoryOpen.value = false;
  categoryQuery.value = "";
  activeIndex.value = 0;
}

function togglePicker() {
  if (categoryOpen.value) {
    dismissPicker();
    return;
  }
  categoryQuery.value = "";
  activeIndex.value = 0;
  categoryOpen.value = true;
  nextTick(() => pickerSearch.value?.focus());
}

function onCategoryInput(event) {
  categoryQuery.value = event.target.value;
  activeIndex.value = 0;
}

function onCategoryKeydown(event) {
  if (event.key === "Escape") {
    dismissPicker();
    nextTick(() => pickerTrigger.value?.focus());
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!shownCategories.value.length) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = Math.max(0, Math.min(shownCategories.value.length - 1, activeIndex.value + delta));
    nextTick(() => picker.value?.querySelector(".picker-option.focused")?.scrollIntoView({ block: "nearest" }));
  } else if (event.key === "Enter" && categoryOpen.value && shownCategories.value.length) {
    event.preventDefault();
    selectCategory(shownCategories.value[activeIndex.value] || shownCategories.value[0]);
  }
}

function clearCategory() {
  category.value = "";
  dismissPicker();
  message.value = "";
  nextTick(() => pickerTrigger.value?.focus());
}

function closeOnOutside(event) {
  if (categoryOpen.value && picker.value && !picker.value.contains(event.target)) dismissPicker();
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
  dismissPicker();
  categories.value = [];
  version.value = null;
  message.value = "";
  loadCategories(type, requestId);
  loadVersion(type, requestId);
}, { immediate: true });
watch([category, sourceType], loadAttributes);
watch([format, selectedAttributes], () => { message.value = ""; });
onMounted(() => {
  document.addEventListener("pointerdown", closeOnOutside);
  document.addEventListener("focusin", closeOnOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeOnOutside);
  document.removeEventListener("focusin", closeOnOutside);
});
</script>

<template>
  <nav class="topbar"><div class="shell">
    <a class="brand" href="/">geosite<span>2</span>rule<span class="brand-period">.</span></a>
    <a class="top-link" href="https://github.com/IamAbler/geosite2Rule" target="_blank" rel="noopener">查看源码 <span aria-hidden="true">↗</span></a>
  </div></nav>
  <main class="shell">
    <header class="intro">
      <h1>规则集转换</h1>
      <p class="intro-copy">选择分类与格式，生成可直接订阅的规则地址。</p>
    </header>
    <div class="workspace">
      <div class="rule-column">
        <section class="panel builder" aria-label="规则集生成器">
        <div class="section-head"><h2>选择规则</h2></div>
        <div class="field">
          <div class="label-row"><strong>数据源</strong></div>
          <div class="segmented" aria-label="数据类型">
            <button type="button" :class="{ active: sourceType === 'geosite' }" :aria-pressed="sourceType === 'geosite'" @click="sourceType = 'geosite'">Geosite · 域名</button>
            <button type="button" :class="{ active: sourceType === 'geoip' }" :aria-pressed="sourceType === 'geoip'" @click="sourceType = 'geoip'">GeoIP · IP 段</button>
          </div>
        </div>
        <div class="field">
          <div class="label-row"><label for="category-trigger">分类</label><span class="hint">{{ categoriesLoading ? '加载中…' : categories.length + ' 个分类' }}</span></div>
          <div ref="picker" class="picker">
            <button id="category-trigger" ref="pickerTrigger" class="picker-trigger" type="button"
              :aria-expanded="categoryOpen" aria-controls="category-options" aria-haspopup="listbox" @click="togglePicker">
              <span :class="{ placeholder: !category }">{{ category || (categoriesLoading ? '正在读取分类…' : '请选择分类') }}</span>
              <svg class="picker-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m4 7 6 6 6-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <Transition name="picker-pop"><div v-if="categoryOpen" id="category-options" class="picker-menu">
              <div class="picker-search-wrap">
                <input id="category-search" ref="pickerSearch" class="input picker-search" type="search" autocomplete="off"
                  role="combobox" aria-controls="category-list" :aria-expanded="categoryOpen" aria-autocomplete="list"
                  :aria-activedescendant="shownCategories.length ? 'category-option-' + activeIndex : undefined"
                  :value="categoryQuery" placeholder="输入分类名称搜索" @input="onCategoryInput" @keydown="onCategoryKeydown">
              </div>
              <div id="category-list" class="picker-list" role="listbox">
              <p v-if="categoriesLoading" class="picker-empty">正在读取分类…</p>
              <div v-else-if="categoryError" class="picker-empty">{{ categoryError }}<button type="button" class="retry" @click="loadCategories(sourceType, sourceRequest)">重试</button></div>
              <p v-else-if="!matches.length" class="picker-empty">没有匹配的分类</p>
              <template v-else>
                <button v-for="(name, index) in shownCategories" :id="'category-option-' + index" :key="name" type="button" role="option"
                  :aria-selected="name === category" :class="['picker-option', { focused: index === activeIndex, chosen: name === category }]"
                  @mouseenter="activeIndex = index" @click="selectCategory(name)">{{ name }}<span v-if="name === category" aria-hidden="true">✓</span></button>
                <p v-if="matches.length > shownCategories.length" class="picker-more">还有 {{ matches.length - shownCategories.length }} 个结果，请继续输入关键词</p>
              </template>
              </div>
              <div v-if="category" class="picker-footer"><button type="button" @click="clearCategory">清除当前选择</button></div>
            </div></Transition>
          </div>
          <p class="helper" v-if="categoryError">{{ categoryError }}</p>
          <p class="helper" v-else>{{ category ? '当前分类：' + category + ' · 点击上方可更换' : '展开后搜索并选择分类' }}</p>
        </div>
        <div v-if="sourceType === 'geosite'" class="field">
          <div class="label-row"><strong>属性</strong><span class="hint">包含 → 排除 → 取消</span></div>
          <div class="attributes">
            <span v-if="attributesLoading" class="empty">读取属性中…</span>
            <span v-else-if="attributeError" class="empty">{{ attributeError }}</span>
            <span v-else-if="!availableAttributes.length" class="empty">{{ category ? '该分类没有可筛选属性' : '选择分类后显示可用属性' }}</span>
            <button v-for="name in availableAttributes" :key="name" type="button" :class="['attribute', attributeModes[name] || '']"
              :aria-pressed="!!attributeModes[name]" @click="cycleAttribute(name)">{{ attributeModes[name] === 'exclude' ? '@-' : '@' }}{{ name }}</button>
          </div>
          <p class="helper">包含生成 <code>@属性</code>，排除生成 <code>@-属性</code>。</p>
        </div>
        </section>
        <section class="panel usage-panel"><h2>配置示例</h2><p class="subtle">{{ format === 'surge' ? '加入 Surge 配置的 [Rule] 区块' : '加入 Clash / Mihomo 的规则提供者' }}</p><pre class="snippet">{{ snippet }}</pre></section>
      </div>
      <aside class="side">
        <section class="panel output">
          <div class="section-head"><h2>生成地址</h2></div>
          <div class="label-row"><strong>格式</strong></div>
          <div class="output-grid">
            <button v-for="item in formats" :key="item.id" type="button" :class="['format', { active: format === item.id }]"
              :aria-pressed="format === item.id" @click="format = item.id">{{ item.title }}<small>{{ item.detail }}</small></button>
          </div>
          <div class="result">
            <p class="result-label">订阅地址</p><p class="url" :class="{ 'url-empty': !ruleUrl }">{{ ruleUrl || '选择分类后在这里获取地址' }}</p>
            <div class="actions"><button class="primary" type="button" :disabled="!ruleUrl" @click="copyUrl">复制地址</button>
              <a v-if="ruleUrl" class="secondary" :href="ruleUrl" target="_blank" rel="noopener">{{ format === 'mrs' ? '下载 MRS' : '预览规则' }}</a></div>
          </div>
          <p class="status" role="status">{{ message || (sourceType === 'geosite' && format === 'mrs' ? 'MRS 仅包含完整域名和域名后缀；keyword / regexp 会跳过。' : '') }}</p>
        </section>
        <section class="panel source-panel"><h2>当前数据源</h2><div class="meta-list">
          <div class="meta-item"><span class="meta-label">数据文件</span><strong class="meta-value">{{ sourceName }}</strong></div>
          <div class="meta-item"><span class="meta-label">版本日期</span><strong class="meta-value">{{ versionText }}</strong><p class="subtle">{{ versionNote }}</p></div>
          <div class="meta-item"><span class="meta-label">更新频率</span><strong class="meta-value">每小时检查</strong></div>
        </div></section>
      </aside>
    </div>
  </main>
  <footer><div class="shell footer-inner"><span>geosite2rule</span><span>数据由 Loyalsoldier/v2ray-rules-dat 提供</span></div></footer>
</template>
