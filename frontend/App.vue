<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const sourceType = ref("geosite");
const provider = ref("loyalsoldier");
const customDraft = ref({ geosite: "", geoip: "" });
const customApplied = ref({ geosite: "", geoip: "" });
const customError = ref("");
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
const activeCustomUrl = computed(() => customApplied.value[sourceType.value]);
const sourceParameters = computed(() => {
  if (provider.value === "loyalsoldier") return "";
  const params = new URLSearchParams({ source: provider.value });
  if (provider.value === "custom") {
    if (!activeCustomUrl.value) return null;
    params.set("url", activeCustomUrl.value);
  }
  return params.toString();
});
const providerName = computed(() => ({ loyalsoldier: "Loyalsoldier", v2fly: "V2Fly", custom: "自定义" })[provider.value]);
const sourceName = computed(() => {
  if (provider.value === "v2fly" && sourceType.value === "geosite") return "dlc.dat";
  if (provider.value === "custom") {
    return activeCustomUrl.value ? new URL(activeCustomUrl.value).pathname.split("/").pop() || "custom.dat" : "未设置";
  }
  return sourceType.value === "geoip" ? "geoip.dat" : "geosite.dat";
});
function endpoint(path, type = null) {
  const params = new URLSearchParams(sourceParameters.value || "");
  if (type) params.set("type", type);
  const query = params.toString();
  return path + (query ? "?" + query : "");
}
const selectedAttributes = computed(() => Object.entries(attributeModes.value).filter(([, mode]) => mode));
const ruleUrl = computed(() => {
  if (!category.value || sourceParameters.value === null) return "";
  let name = category.value;
  if (sourceType.value === "geosite") {
    for (const [attribute, mode] of selectedAttributes.value) {
      name += "@" + (mode === "exclude" ? "-" : "") + attribute;
    }
  }
  const path = sourceType.value === "geoip" ? "/rules/geoip/" : "/rules/";
  const extension = format.value === "clash" ? ".yaml" : format.value === "mrs" ? ".mrs" : ".list";
  return location.origin + endpoint(path + format.value + "/" + encodeURIComponent(name) + extension);
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
  if (sourceParameters.value === null) return "待设置";
  if (versionLoading.value) return "读取中…";
  if (!version.value?.date) return "暂无日期";
  return new Date(version.value.date).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai"
  }) + " CST";
});
const versionNote = computed(() => {
  if (sourceParameters.value === null) return "应用地址后显示版本日期";
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

function applyCustom() {
  const applied = { ...customApplied.value };
  for (const type of ["geosite", "geoip"]) {
    const value = customDraft.value[type].trim();
    if (!value) { applied[type] = ""; continue; }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash || url.href.length > 2048 ||
        url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
        url.hostname.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.startsWith("[")) {
        throw new Error();
      }
      applied[type] = url.href;
    } catch {
      customError.value = (type === "geosite" ? "Geosite" : "GeoIP") + " 地址需要是公开的 HTTPS URL";
      return;
    }
  }
  customError.value = "";
  customApplied.value = applied;
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
    const response = await fetch(endpoint("/attributes/" + encodeURIComponent(category.value)));
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
    const response = await fetch(endpoint("/categories", type));
    if (!response.ok) throw new Error(provider.value === "custom" ? "无法读取自定义文件，请检查地址和 .dat 格式" : "分类加载失败，请稍后重试");
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
    const response = await fetch(endpoint("/version", type));
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

watch([sourceType, provider, activeCustomUrl], ([type]) => {
  const requestId = ++sourceRequest;
  category.value = "";
  dismissPicker();
  categories.value = [];
  version.value = null;
  message.value = "";
  customError.value = "";
  if (sourceParameters.value === null) {
    categoriesLoading.value = false;
    versionLoading.value = false;
    categoryError.value = "请先填写并应用当前数据类型的自定义地址";
    return;
  }
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
  <div class="app-frame">
    <nav class="topbar">
      <div class="shell topbar-inner">
        <a class="brand" href="/" aria-label="geosite2rule 首页"><span class="brand-mark" aria-hidden="true">g<span>2</span></span><span>geosite2rule</span></a>
        <a class="top-link" href="https://github.com/IamAbler/geosite2Rule" target="_blank" rel="noopener">GitHub <span aria-hidden="true">↗</span></a>
      </div>
    </nav>
    <main class="shell">
      <header class="intro">
        <div class="eyebrow"><span class="eyebrow-line"></span> RULESET CONVERTER</div>
        <h1>把数据文件变成规则集<span class="title-dot">.</span></h1>
        <p>选择数据来源、分类和输出格式，获取可直接订阅的规则地址。</p>
      </header>
      <div class="workspace">
        <div class="rule-column">
          <section class="panel builder" aria-label="规则集生成器">
            <div class="section-head"><div><span class="section-kicker">01 / BUILD</span><h2>选择规则</h2></div><fluent-badge appearance="tint" color="brand">实时转换</fluent-badge></div>
            <fluent-divider></fluent-divider>
            <div class="field">
              <div class="label-row"><strong>数据类型</strong></div>
              <div class="segmented" aria-label="数据类型">
                <fluent-button appearance="subtle" :class="{ active: sourceType === 'geosite' }" :aria-pressed="sourceType === 'geosite'" @click="sourceType = 'geosite'">Geosite <span class="button-description">域名</span></fluent-button>
                <fluent-button appearance="subtle" :class="{ active: sourceType === 'geoip' }" :aria-pressed="sourceType === 'geoip'" @click="sourceType = 'geoip'">GeoIP <span class="button-description">IP 段</span></fluent-button>
              </div>
            </div>
            <div class="field">
              <div class="label-row"><strong>数据来源</strong></div>
              <div class="source-options" aria-label="数据来源">
                <fluent-button :appearance="provider === 'loyalsoldier' ? 'primary' : 'outline'" :aria-pressed="provider === 'loyalsoldier'" @click="provider = 'loyalsoldier'">Loyalsoldier</fluent-button>
                <fluent-button :appearance="provider === 'v2fly' ? 'primary' : 'outline'" :aria-pressed="provider === 'v2fly'" @click="provider = 'v2fly'">V2Fly</fluent-button>
                <fluent-button :appearance="provider === 'custom' ? 'primary' : 'outline'" :aria-pressed="provider === 'custom'" @click="provider = 'custom'">自定义</fluent-button>
              </div>
              <form v-if="provider === 'custom'" class="custom-source" @submit.prevent="applyCustom">
                <label for="custom-geosite">Geosite 文件 URL</label>
                <fluent-text-input id="custom-geosite" appearance="outline" type="url" autocomplete="url" placeholder="https://example.com/geosite.dat"
                  :value="customDraft.geosite" @input="customDraft.geosite = $event.target.value; customError = ''"></fluent-text-input>
                <label for="custom-geoip">GeoIP 文件 URL</label>
                <fluent-text-input id="custom-geoip" appearance="outline" type="url" autocomplete="url" placeholder="https://example.com/geoip.dat"
                  :value="customDraft.geoip" @input="customDraft.geoip = $event.target.value; customError = ''"></fluent-text-input>
                <div class="custom-actions"><fluent-button appearance="primary" type="button" @click="applyCustom">应用地址</fluent-button><span>{{ activeCustomUrl && customDraft[sourceType].trim() === activeCustomUrl ? '当前类型已应用' : '可只填写需要使用的一种' }}</span></div>
                <p v-if="customError" class="custom-error" role="alert">{{ customError }}</p>
              </form>
            </div>
            <div class="field">
              <div class="label-row"><label for="category-trigger">分类</label><span class="hint">{{ categoriesLoading ? '加载中…' : categories.length + ' 个分类' }}</span></div>
              <div ref="picker" class="picker">
                <button id="category-trigger" ref="pickerTrigger" class="picker-trigger" type="button" :disabled="sourceParameters === null"
                  :aria-expanded="categoryOpen" aria-controls="category-options" aria-haspopup="listbox" @click="togglePicker">
                  <span :class="{ placeholder: !category }">{{ category || (sourceParameters === null ? '请先应用自定义地址' : categoriesLoading ? '正在读取分类…' : '请选择分类') }}</span>
                  <svg class="picker-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <Transition name="picker-pop"><div v-if="categoryOpen" id="category-options" class="picker-menu">
                  <div class="picker-search-wrap">
                    <fluent-text-input id="category-search" ref="pickerSearch" class="picker-search" type="search" appearance="outline" autocomplete="off"
                      role="combobox" aria-controls="category-list" :aria-expanded="categoryOpen" aria-autocomplete="list"
                      :aria-activedescendant="shownCategories.length ? 'category-option-' + activeIndex : undefined"
                      :value="categoryQuery" placeholder="搜索分类" @input="onCategoryInput" @keydown="onCategoryKeydown"></fluent-text-input>
                  </div>
                  <div id="category-list" class="picker-list" role="listbox">
                    <p v-if="categoriesLoading" class="picker-empty">正在读取分类…</p>
                    <div v-else-if="categoryError" class="picker-empty">{{ categoryError }}<fluent-button appearance="subtle" @click="loadCategories(sourceType, sourceRequest)">重试</fluent-button></div>
                    <p v-else-if="!matches.length" class="picker-empty">没有匹配的分类</p>
                    <template v-else>
                      <button v-for="(name, index) in shownCategories" :id="'category-option-' + index" :key="name" type="button" role="option"
                        :aria-selected="name === category" :class="['picker-option', { focused: index === activeIndex, chosen: name === category }]"
                        @mouseenter="activeIndex = index" @click="selectCategory(name)">{{ name }}<span v-if="name === category" aria-hidden="true">✓</span></button>
                      <p v-if="matches.length > shownCategories.length" class="picker-more">还有 {{ matches.length - shownCategories.length }} 个结果，请继续输入关键词</p>
                    </template>
                  </div>
                  <div v-if="category" class="picker-footer"><fluent-button appearance="subtle" @click="clearCategory">清除当前选择</fluent-button></div>
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
                <fluent-button v-for="name in availableAttributes" :key="name" size="small" :appearance="attributeModes[name] === 'include' ? 'primary' : 'outline'"
                  :class="['attribute', attributeModes[name] || '']" :aria-pressed="!!attributeModes[name]" @click="cycleAttribute(name)">{{ attributeModes[name] === 'exclude' ? '@-' : '@' }}{{ name }}</fluent-button>
              </div>
              <p class="helper">包含生成 <code>@属性</code>，排除生成 <code>@-属性</code>。</p>
            </div>
          </section>
          <section class="panel usage-panel"><div class="section-head compact"><div><span class="section-kicker">02 / USE</span><h2>配置示例</h2></div></div><p class="subtle">{{ format === 'surge' ? '加入 Surge 配置的 [Rule] 区块' : '加入 Clash / Mihomo 的规则提供者' }}</p><pre class="snippet">{{ snippet }}</pre></section>
        </div>
        <aside class="side">
          <section class="panel output">
            <div class="section-head"><div><span class="section-kicker">OUTPUT</span><h2>生成地址</h2></div></div>
            <fluent-divider></fluent-divider>
            <div class="label-row"><strong>输出格式</strong></div>
            <div class="output-grid">
              <button v-for="item in formats" :key="item.id" type="button" :class="['format', { active: format === item.id }]"
                :aria-pressed="format === item.id" @click="format = item.id"><span class="format-title">{{ item.title }}</span><small>{{ item.detail }}</small><span class="format-check" aria-hidden="true">{{ format === item.id ? '✓' : '' }}</span></button>
            </div>
            <div class="result">
              <div class="result-header"><span class="result-label">订阅地址</span><span v-if="ruleUrl" class="result-ready">已生成</span></div>
              <p class="url" :class="{ 'url-empty': !ruleUrl }">{{ ruleUrl || '选择分类后在这里获取地址' }}</p>
              <div class="actions"><fluent-button appearance="primary" :disabled="!ruleUrl" @click="copyUrl">复制地址</fluent-button>
                <a v-if="ruleUrl" class="secondary" :href="ruleUrl" target="_blank" rel="noopener">{{ format === 'mrs' ? '下载 MRS' : '预览规则' }} <span aria-hidden="true">↗</span></a></div>
            </div>
            <p class="status" role="status">{{ message || (sourceType === 'geosite' && format === 'mrs' ? 'MRS 仅包含完整域名和域名后缀；keyword / regexp 会跳过。' : '') }}</p>
          </section>
          <section class="panel source-panel"><div class="section-head compact"><div><span class="section-kicker">SOURCE</span><h2>当前数据源</h2></div></div><div class="meta-list">
            <div class="meta-item"><span class="meta-label">来源</span><strong class="meta-value">{{ providerName }}</strong></div>
            <div class="meta-item"><span class="meta-label">数据文件</span><strong class="meta-value">{{ sourceName }}</strong></div>
            <div class="meta-item"><span class="meta-label">版本日期</span><strong class="meta-value">{{ versionText }}</strong><p class="subtle">{{ versionNote }}</p></div>
            <div class="meta-item"><span class="meta-label">更新频率</span><strong class="meta-value">每小时检查</strong></div>
          </div></section>
        </aside>
      </div>
    </main>
    <footer><div class="shell footer-inner"><span>geosite2rule</span><span>数据来源：{{ providerName }}</span></div></footer>
  </div>
</template>
