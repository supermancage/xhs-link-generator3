// ═══════════════════════════════════════════════════
// 智词引擎 · UI 渲染与交互
// ═══════════════════════════════════════════════════

var KC = window.KC || {};

// ── UI 常量与状态 ──
KC.UI = {};
KC.UI.L1_META = {
  '国内酒店': { cls: 'hotel', color: '#1a73e8', pct: 0 },
  '国内机票': { cls: 'flight', color: '#10b981', pct: 0 },
  '国际酒店': { cls: 'hotel-intl', color: '#8b5cf6', pct: 0 },
  '国际机票': { cls: 'flight-intl', color: '#f59e0b', pct: 0 },
  '景区': { cls: 'scenic', color: '#ef4444', pct: 0 },
  '火车票': { cls: 'train', color: '#ec4899', pct: 0 },
  '娱乐演出': { cls: 'entertainment', color: '#f43f5e', pct: 0 },
  '公共': { cls: 'public', color: '#06b6d4', pct: 0 },
  '待确认': { cls: 'unclassified', color: '#9ca3af', pct: 0 },
};
KC.UI.L1_ORDER = ['国内酒店','国内机票','国际酒店','国际机票','景区','火车票','公共','待确认','娱乐演出'];
KC.UI.L2_COLORS = ['#1a73e8','#10b981','#8b5cf6','#f59e0b','#ef4444','#ec4899','#0d9488','#f97316','#6366f1','#84cc16','#06b6d4','#e11d48'];

// 局部别名（函数内裸引用 → 命名空间属性的快捷方式）
const L1_META = KC.UI.L1_META;
const L1_ORDER = KC.UI.L1_ORDER;
const L2_COLORS = KC.UI.L2_COLORS;
const PAGE_SIZE = 50;
KC.UI.PAGE_SIZE = PAGE_SIZE;

// ── 输入上限（防止超大文件/超长文本导致页面卡死）──
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_ROWS = 50000;                 // 有效行数上限

let allResults = [];
let filteredResults = [];
let currentPage = 1;
let charts = {};
let analysisDim = 'l1';   // 分析板块分组维度: 'l1' 或 'adBizLine'
let crossDim = 'l1';       // 交叉分析维度: 'l1' 或 'adBizLine'
let hasAppDataGlobal = false; // 是否存在 APP 互动/打开/订单数据

KC.State = {
  allResults: [],
  filteredResults: [],
  currentPage: 1,
  charts: {},
  analysisCharts: {},
  crossCharts: {},
  geoCharts: {},
  geoSelectedL1: new Set(),
};

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-paste').classList.toggle('hidden', tab !== 'paste');
  document.getElementById('tab-upload').classList.toggle('hidden', tab !== 'upload');
}

function loadSample() {
  const samples = [
    '上海酒店推荐','北京民宿性价比高','杭州旅游攻略','苏州住哪个地铁站比较方便',
    '广州长隆迎宾路城际酒店','三亚亚特兰蒂斯酒店','成都宽窄巷子附近酒店',
    '重庆洪崖洞住宿','武汉黄鹤楼附近酒店','南京总统府门票',
    '北京故宫门票多少钱','上海迪士尼乐园门票','张家界天门山门票',
    '五一机票特价','国庆去哪里玩便宜机票','北京飞上海机票',
    '从成都到重庆机票','杭州到厦门航班','深圳到海口特价机票',
    '国航值机选座','机票退改签手续费','儿童机票怎么买',
    '随心飞第三次卡','机票盲盒真的假的','高铁票候补成功率高吗',
    '火车票抢票软件哪个快','长沙南站怎么去市区','五一车票候补',
    '高铁贵宾厅有什么服务','济州岛酒店推荐','日本东京酒店性价比',
    '曼谷民宿近地铁口','普吉岛亲子酒店推荐','巴厘岛悬崖酒店',
    '首尔仁川机场附近酒店','巴黎酒店安全区域','五一日本往返机票',
    '五一去巴厘岛费用','济州岛购物免税店攻略','马尔代夫选岛攻略',
    '携程酒店预订','去哪儿机票比价','飞猪民宿','美团酒店',
    '同程旅行订房优惠','如家酒店汉庭全季','希尔顿万豪洲际',
    '五一天安门升旗仪式预约','国庆长城门票','春节三亚机票贵',
    '暑假带娃去哪里玩好','清明祭祖去哪里','端午粽子推荐',
    '元旦跨年烟花秀','情人节适合去哪里','圣诞节约会餐厅',
  ];
  document.getElementById('kw-text').value = samples.join('\n');
}

async function runClassify() {
  const t0 = performance.now();
  showLoading(true);

  // 让浏览器先渲染 loading 动画，避免同步代码阻塞 UI
  await new Promise(r => setTimeout(r, 0));

  let raw = [];
  const tab = document.querySelector('.tab-btn.active').dataset.tab;

  try {
    if (tab === 'paste') {
      const text = document.getElementById('kw-text').value.trim();
      if (!text) { showLoading(false); alert('请输入关键词'); return; }
      raw = text.split('\n').map(s => s.trim()).filter(Boolean);
      if (raw.length > MAX_ROWS) { showLoading(false); alert('关键词数量超过 ' + MAX_ROWS + ' 行上限，请拆分后重试'); return; }
    } else {
      if (typeof XLSX === 'undefined') { showLoading(false); alert('Excel 解析库未加载，请刷新页面重试或使用粘贴模式'); return; }
      const file = document.getElementById('file-input').files[0];
      if (!file) { showLoading(false); alert('请先上传文件'); return; }
      if (file.size > MAX_FILE_SIZE) { showLoading(false); alert('文件大小超过 ' + (MAX_FILE_SIZE / 1024 / 1024) + 'MB 上限，请拆分后重试'); return; }
      const ab = await file.arrayBuffer();
      const data = new Uint8Array(ab);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws || !ws['!ref']) { showLoading(false); alert('Excel 表格为空或格式不支持'); return; }
      const col = parseInt(document.getElementById('col-kw').value) || 1;
      const colCost = parseInt(document.getElementById('col-cost').value) || 0;
      const colImp = parseInt(document.getElementById('col-impression').value) || 0;
      const colClick = parseInt(document.getElementById('col-click').value) || 0;
      const colAppInteract = parseInt(document.getElementById('col-app-interact').value) || 0;
      const colAppOpen = parseInt(document.getElementById('col-app-open').value) || 0;
      const colAppOrder = parseInt(document.getElementById('col-app-order').value) || 0;
      const colAdBizLine = parseInt(document.getElementById('col-ad-biz-line').value) || 0;
      const rowStart = parseInt(document.getElementById('row-start').value) || 1;
      const range = XLSX.utils.decode_range(ws['!ref']);
      if (range.e.r - range.s.r + 1 > MAX_ROWS) { showLoading(false); alert('有效行数超过 ' + MAX_ROWS + ' 行上限，请拆分后重试'); return; }
      for (let r = range.s.r + rowStart - 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: col - 1 })];
        const val = cell ? (typeof cell.v === 'number' ? String(cell.v) : String(cell.v || '')) : '';
        if (val.trim()) {
          const item = { kw: val.trim(), cost: 0, impression: 0, click: 0, appInteract: 0, appOpen: 0, appOrder: 0, adBizLine: '' };
          if (colCost > 0) {
            const costCell = ws[XLSX.utils.encode_cell({ r, c: colCost - 1 })];
            item.cost = costCell ? (parseFloat(costCell.v) || 0) : 0;
          }
          if (colImp > 0) {
            const impCell = ws[XLSX.utils.encode_cell({ r, c: colImp - 1 })];
            item.impression = impCell ? (parseInt(impCell.v) || 0) : 0;
          }
          if (colClick > 0) {
            const clickCell = ws[XLSX.utils.encode_cell({ r, c: colClick - 1 })];
            item.click = clickCell ? (parseInt(clickCell.v) || 0) : 0;
          }
          if (colAppInteract > 0) {
            const aiCell = ws[XLSX.utils.encode_cell({ r, c: colAppInteract - 1 })];
            item.appInteract = aiCell ? (parseFloat(aiCell.v) || 0) : 0;
          }
          if (colAppOpen > 0) {
            const aoCell = ws[XLSX.utils.encode_cell({ r, c: colAppOpen - 1 })];
            item.appOpen = aoCell ? (parseFloat(aoCell.v) || 0) : 0;
          }
          if (colAppOrder > 0) {
            const aordCell = ws[XLSX.utils.encode_cell({ r, c: colAppOrder - 1 })];
            item.appOrder = aordCell ? (parseFloat(aordCell.v) || 0) : 0;
          }
          if (colAdBizLine > 0) {
            const abCell = ws[XLSX.utils.encode_cell({ r, c: colAdBizLine - 1 })];
            item.adBizLine = abCell ? String(abCell.v || '').trim() : '';
          }
          raw.push(item);
        }
      }
    }
  } catch(e) {
    showLoading(false);
    alert('读取失败: ' + e.message);
    return;
  }

  if (raw.length === 0) { showLoading(false); alert('未找到关键词'); return; }

  const tClassify = performance.now();
  allResults = raw.map(item => {
    const result = KC.Classifier.classify(item.kw || item);
    if (typeof item === 'object') {
      result.cost = item.cost || 0;
      result.impression = item.impression || 0;
      result.click = item.click || 0;
      result.appInteract = item.appInteract || 0;
      result.appOpen = item.appOpen || 0;
      result.appOrder = item.appOrder || 0;
      result.adBizLine = item.adBizLine || '';
    } else {
      result.cost = 0;
      result.impression = 0;
      result.click = 0;
      result.appInteract = 0;
      result.appOpen = 0;
      result.appOrder = 0;
      result.adBizLine = '';
    }
    return result;
  });
  const msClassify = Math.round(performance.now() - tClassify);

  const ms = Math.round(performance.now() - t0);
  console.log(`分类 ${raw.length} 条关键词耗时: ${msClassify}ms（总耗时: ${ms}ms，含文件读取 ${ms - msClassify}ms）`);
  showLoading(false);
  renderAll(allResults, ms);
}

function initFilters() {
  // 一级分类筛选器
  const l1Tags = document.getElementById('filter-l1-tags');
  const l1s = [...new Set(allResults.map(r => r.l1).filter(Boolean))].sort();
  l1Tags.innerHTML = '<span class="filter-tag active" data-value="" onclick="selectFilter(this, \'l1\')">全部</span>' +
    l1s.map(l1 => `<span class="filter-tag" data-value="${escHtml(l1)}" onclick="selectFilter(this, 'l1')">${escHtml(l1)}</span>`).join('');

  // 二级分类筛选器 - 初始显示全部
  updateL2FilterTags('');

  // 国家下拉
  const countrySelect = document.getElementById('filter-country');
  const countries = [...new Set(allResults.map(r => r.country).filter(Boolean))].sort();
  countrySelect.innerHTML = '<option value="">全部国家</option>' +
    countries.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  // 城市下拉（级联：受分区/等级控制）
  updateCityDropdown();

  // 分区下拉
  const zoneSelect = document.getElementById('filter-zone');
  const zones = [...new Set(allResults.map(r => r.zone).filter(Boolean))].sort();
  zoneSelect.innerHTML = '<option value="">全部分区</option>' +
    zones.map(z => `<option value="${escHtml(z)}">${escHtml(z)}</option>`).join('');

  // 等级下拉
  const tierSelect = document.getElementById('filter-tier');
  const tiers = [...new Set(allResults.map(r => r.tier).filter(Boolean))].sort();
  tierSelect.innerHTML = '<option value="">全部等级</option>' +
    tiers.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');

  // 投放素材业务线下拉
  const adBizSelect = document.getElementById('filter-ad-biz-line');
  const adBizs = [...new Set(allResults.map(r => r.adBizLine).filter(Boolean))].sort();
  adBizSelect.innerHTML = '<option value="">全部</option>' +
    adBizs.map(ab => `<option value="${escHtml(ab)}">${escHtml(ab)}</option>`).join('');
}

// 根据选中的一级分类更新二级分类标签
function updateL2FilterTags(selectedL1) {
  const l2Tags = document.getElementById('filter-l2-tags');
  let l2s;
  
  if (selectedL1 === '') {
    // 全部：显示所有二级分类
    l2s = [...new Set(allResults.map(r => r.l2).filter(Boolean))].sort();
  } else {
    // 只显示该一级分类下的二级分类
    l2s = [...new Set(allResults.filter(r => r.l1 === selectedL1).map(r => r.l2).filter(Boolean))].sort();
  }
  
  l2Tags.innerHTML = '<span class="filter-tag active" data-value="" onclick="selectFilter(this, \'l2\')">全部</span>' +
    l2s.map(l2 => `<span class="filter-tag" data-value="${escHtml(l2)}" onclick="selectFilter(this, 'l2')">${escHtml(l2)}</span>`).join('');
}

// 根据分区/等级筛选更新城市下拉
function updateCityDropdown() {
  const filterZone = document.getElementById('filter-zone')?.value || '';
  const filterTier = document.getElementById('filter-tier')?.value || '';
  let base = allResults;
  if (filterZone) base = base.filter(r => r.zone === filterZone);
  if (filterTier) base = base.filter(r => r.tier === filterTier);
  const cities = [...new Set(base.map(r => r.city).filter(Boolean))].sort();
  const citySelect = document.getElementById('filter-city');
  const prevCity = citySelect?.value || '';
  citySelect.innerHTML = '<option value="">全部城市</option>' +
    cities.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  // 恢复之前选中（如果还在列表中）
  if (prevCity && cities.includes(prevCity)) citySelect.value = prevCity;
}

// 分区/等级变化时的级联处理
function onZoneTierChange() {
  updateCityDropdown();
  renderTable(1);
}

function selectFilter(el, type) {
  const container = type === 'l1' ? document.getElementById('filter-l1-tags') : document.getElementById('filter-l2-tags');
  container.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('active'));
  el.classList.add('active');
  
  // 如果点击的是一级分类，更新二级分类标签
  if (type === 'l1') {
    const selectedL1 = el.dataset.value;
    updateL2FilterTags(selectedL1);
  }
  
  renderTable(1);
}

function clearFilters() {
  document.getElementById('search-box').value = '';
  document.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('active'));
  document.querySelector('#filter-l1-tags .filter-tag[data-value=""]').classList.add('active');
  // 重置二级分类标签为全部
  updateL2FilterTags('');
  document.getElementById('filter-country').value = '';
  document.getElementById('filter-zone').value = '';
  document.getElementById('filter-tier').value = '';
  document.getElementById('filter-city').value = '';
  const adBizSelect = document.getElementById('filter-ad-biz-line');
  if (adBizSelect) adBizSelect.value = '';
  // 重建城市下拉（无分区/等级限制）
  updateCityDropdown();
  renderTable(1);
}

function renderAll(results, ms) {
  ensureDataLabelsPlugin();
  document.getElementById('result-area').classList.remove('hidden');
  initFilters();
  currentPage = 1;
  document.getElementById('search-box').value = '';

  // 重置分析维度
  analysisDim = 'l1';
  crossDim = 'l1';
  const dimSelect = document.getElementById('analysis-dim-select');
  if (dimSelect) dimSelect.value = 'l1';
  const crossDimSelect = document.getElementById('cross-dim-select');
  if (crossDimSelect) crossDimSelect.value = 'l1';
  updateAnalysisHeaders();

  // 统计
  document.getElementById('stat-total').textContent = results.length.toLocaleString();
  const l1Set = new Set(results.map(r => r.l1));
  const l2Set = new Set(results.map(r => r.l2));
  document.getElementById('stat-l1').textContent = l1Set.size;
  document.getElementById('stat-l2').textContent = l2Set.size;
  document.getElementById('stat-time').textContent = ms + 'ms';

  // L1 计数
  const l1Count = {};
  const l2Count = {};
  results.forEach(r => {
    l1Count[r.l1] = (l1Count[r.l1] || 0) + 1;
    l2Count[r.l2] = (l2Count[r.l2] || 0) + 1;
  });

  // L1 百分比
  L1_ORDER.forEach(l1 => {
    if (l1Count[l1] !== undefined)
      L1_META[l1].pct = l1Count[l1] / results.length;
  });

  // 渲染表格（优先渲染，确保核心数据始终可见）
  filteredResults = [...results];
  renderTable(1);

  // 渲染图表（CDN 可能未加载，加容错）
  try { renderL1Chart(l1Count, results.length); } catch(e) { console.warn('L1图表渲染跳过:', e.message); }
  try { renderL2Chart(l2Count, results.length); } catch(e) { console.warn('L2图表渲染跳过:', e.message); }

  // 渲染数据分析（如果有花费数据）
  const hasCostData = results.some(r => r.cost > 0);
  hasAppDataGlobal = results.some(r => (r.appInteract || 0) > 0 || (r.appOpen || 0) > 0 || (r.appOrder || 0) > 0);
  if (hasCostData) {
    document.getElementById('analysis-section').classList.remove('hidden');
    document.getElementById('cross-analysis-section').classList.remove('hidden');
    // APP成本 Tab 始终可见（无数据时内部显示空状态提示）
    document.querySelectorAll('[data-analysis="appInteract"], [data-analysis="appOpen"], [data-analysis="appOrder"]').forEach(btn => {
      btn.style.display = '';
    });
    try { renderCostAnalysis(); } catch(e) { console.warn('花费分析渲染跳过:', e.message); }
    initCrossFilters();
    try { renderCrossAnalysis(); } catch(e) { console.warn('交叉分析渲染跳过:', e.message); }
  } else {
    document.getElementById('analysis-section').classList.add('hidden');
    document.getElementById('cross-analysis-section').classList.add('hidden');
  }

  // 渲染关键词词云
  try { initWcFilters(); } catch(e) { console.warn('词云筛选器初始化跳过:', e.message); }
  try { renderWordCloud(); } catch(e) { console.warn('词云渲染跳过:', e.message); }

  // 渲染地理维度分析（有明确标签数据时显示）
  var hasLabeledData = results.some(function(r) { return r.l1 && r.l1 !== '待确认'; });
  if (hasLabeledData) {
    document.getElementById('geo-analysis-section').classList.remove('hidden');
    try { initGeoFilters(); renderGeoAnalysis(); } catch(e) { console.warn('地理分析渲染跳过:', e.message); }
  } else {
    document.getElementById('geo-analysis-section').classList.add('hidden');
  }

}

// Chart.js 数据标签插件
const dataLabelsPlugin = {
  id: 'dataLabels',
  afterDatasetsDraw(chart, args, options) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((element, index) => {
        const value = dataset.data[index];
        if (value === 0 || value === undefined || value === null) return;
        
        ctx.save();
        ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const pos = element.tooltipPosition();
        const label = value.toLocaleString();
        
        // 根据图表类型调整位置
        if (chart.config.type === 'doughnut' || chart.config.type === 'pie') {
          // 环形图：显示百分比和数量
          const total = dataset.data.reduce((sum, v) => sum + (v || 0), 0);
          const pct = total > 0 ? (value / total * 100).toFixed(1) : 0;
          const labelText = pct + '%';
          const countText = '(' + value.toLocaleString() + ')';
          
          const angle = (element.startAngle + element.endAngle) / 2;
          const radius = (element.innerRadius + element.outerRadius) / 2;
          const x = element.x + Math.cos(angle) * radius;
          const y = element.y + Math.sin(angle) * radius;
          
          // 如果扇形太小就不显示
          const arcSize = element.endAngle - element.startAngle;
          if (arcSize > 0.15) {
            // 绘制百分比
            ctx.font = 'bold 12px Arial';
            ctx.fillText(labelText, x, y - 6);
            // 绘制数量
            ctx.font = '10px Arial';
            ctx.fillText(countText, x, y + 8);
          }
        } else if (chart.config.type === 'bar') {
          // 柱状图：显示在柱子顶部
          const canvasId = chart.canvas ? chart.canvas.id : '';
          const isGeoCity = canvasId === 'chart-geo-city';
          const isAppCost = canvasId === 'chart-appInteract'
                         || canvasId === 'chart-appOpen'
                         || canvasId === 'chart-appOrder';

          ctx.fillStyle = '#1f2937';

          let barLabel;
          if (isGeoCity) {
            ctx.font = '9px Arial';
            barLabel = value.toFixed(1) + '%';
          } else if (isAppCost) {
            ctx.font = 'bold 11px Arial';
            barLabel = '¥' + value.toFixed(1);
          } else {
            ctx.font = 'bold 11px Arial';
            barLabel = label;
          }
          ctx.fillText(barLabel, pos.x, pos.y - 5);
        }
        
        ctx.restore();
      });
    });
  }
};

// 注册插件（延迟注册：Chart 由 defer CDN 加载，内联脚本执行时 Chart 可能尚未就绪）
let _dlpRegistered = false;
function ensureDataLabelsPlugin() {
  if (!_dlpRegistered && typeof Chart !== 'undefined') {
    Chart.register(dataLabelsPlugin);
    _dlpRegistered = true;
  }
}

function renderL1Chart(counts, total) {
  if (charts.l1) charts.l1.destroy();
  const labels = L1_ORDER.filter(l => counts[l]);
  const data = labels.map(l => counts[l]);
  const colors = labels.map(l => L1_META[l]?.color || '#999');

  charts.l1 = new Chart(document.getElementById('chart-l1'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 12 }, padding: 14, usePointStyle: true, pointStyleWidth: 10 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} (${(ctx.parsed/total*100).toFixed(1)}%)`
          }
        }
      }
    }
  });
}

function renderL2Chart(counts, total) {
  if (charts.l2) charts.l2.destroy();
  // 合并 l1+l2 作为标签
  const l2Map = {};
  allResults.forEach(r => {
    const key = r.l1 + ' > ' + r.l2;
    l2Map[key] = (l2Map[key] || 0) + 1;
  });
  const sorted = Object.entries(l2Map).sort((a, b) => b[1] - a[1]);
  const labels = sorted.slice(0, 15).map(s => s[0]);
  const data = sorted.slice(0, 15).map(s => s[1]);

  charts.l2 = new Chart(document.getElementById('chart-l2'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '词数',
        data,
        backgroundColor: labels.map((_, i) => L2_COLORS[i % L2_COLORS.length]),
        borderRadius: 5,
        barThickness: 18,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x.toLocaleString()} (${(ctx.parsed.x/total*100).toFixed(1)}%)`
          }
        }
      },
      scales: {
        x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderTable(page) {
  const search = document.getElementById('search-box').value.trim().toLowerCase();
  const filterL1 = document.querySelector('#filter-l1-tags .active')?.dataset.value || '';
  const filterL2 = document.querySelector('#filter-l2-tags .active')?.dataset.value || '';
  const filterCountry = document.getElementById('filter-country').value;
  const filterCity = document.getElementById('filter-city').value;
  const filterZone = document.getElementById('filter-zone').value;
  const filterTier = document.getElementById('filter-tier').value;
  const filterAdBizLine = document.getElementById('filter-ad-biz-line')?.value || '';

  filteredResults = allResults.filter(r => {
    if (search && !r.kw.toLowerCase().includes(search)) return false;
    if (filterL1 && r.l1 !== filterL1) return false;
    if (filterL2 && r.l2 !== filterL2) return false;
    if (filterCountry && r.country !== filterCountry) return false;
    if (filterCity && r.city !== filterCity) return false;
    if (filterZone && r.zone !== filterZone) return false;
    if (filterTier && r.tier !== filterTier) return false;
    if (filterAdBizLine && (r.adBizLine || '') !== filterAdBizLine) return false;
    return true;
  });
  currentPage = page;
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = filteredResults.slice(start, end);
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));

  const tbody = document.getElementById('tbl-body');
  tbody.innerHTML = pageItems.map((r, i) => {
    const l1Meta = L1_META[r.l1] || { cls: '', color: '#999' };
    const ctr = r.impression > 0 ? (r.click / r.impression * 100).toFixed(2) + '%' : '-';
    const cpc = r.click > 0 ? '¥' + (r.cost / r.click).toFixed(2) : '-';
    const appInteractCost = r.appInteract > 0 ? '¥' + (r.cost / r.appInteract).toFixed(1) : '-';
    const appOpenCost = r.appOpen > 0 ? '¥' + (r.cost / r.appOpen).toFixed(1) : '-';
    const appOrderCost = r.appOrder > 0 ? '¥' + (r.cost / r.appOrder).toFixed(1) : '-';
    return `<tr>
      <td class="num" style="color:#9ca3af">${start + i + 1}</td>
      <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.kw)}">${escHtml(r.kw)}</td>
      <td><span class="l1-badge ${l1Meta.cls}">${escHtml(r.l1 || '')}</span></td>
      <td><span class="l2-tag">${escHtml(r.l2 || '')}</span></td>
      <td style="color:#6366f1;font-weight:500">${escHtml(r.country || '-')}</td>
      <td style="color:#059669;font-weight:500">${escHtml(r.city || '-')}</td>
      <td style="color:#6366f1;font-weight:500">${escHtml(r.zone || '-')}</td>
      <td style="color:#f59e0b;font-weight:500">${escHtml(r.tier || '-')}</td>
      <td>${r.adBizLine ? `<span class="l1-badge adbiz-badge">${escHtml(r.adBizLine)}</span>` : '<span style="color:#9ca3af">-</span>'}</td>
      <td class="num" style="color:#ef4444">${r.cost ? '¥' + r.cost.toLocaleString() : '-'}</td>
      <td class="num" style="color:#3b82f6">${r.impression ? r.impression.toLocaleString() : '-'}</td>
      <td class="num" style="color:#10b981">${r.click ? r.click.toLocaleString() : '-'}</td>
      <td class="num">${ctr}</td>
      <td class="num">${cpc}</td>
      <td class="num" style="color:#8b5cf6">${appInteractCost}</td>
      <td class="num" style="color:#ec4899">${appOpenCost}</td>
      <td class="num" style="color:#0d9488">${appOrderCost}</td>
    </tr>`;
  }).join('');

  // 分页
  const pagination = document.getElementById('pagination');
  if (filteredResults.length <= PAGE_SIZE) {
    pagination.innerHTML = '';
    return;
  }
  let html = `<span class="page-info">${filteredResults.length} 条结果，第 ${page}/${totalPages} 页</span>`;
  html += `<button class="page-btn" onclick="renderTable(1)">«</button>`;
  html += `<button class="page-btn" onclick="renderTable(${Math.max(1, page-1)})">‹</button>`;
  const pages = [];
  for (let p = Math.max(1, page-2); p <= Math.min(totalPages, page+2); p++) pages.push(p);
  pages.forEach(p => {
    html += `<button class="page-btn${p===page?' active':''}" onclick="renderTable(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="renderTable(${Math.min(totalPages, page+1)})">›</button>`;
  html += `<button class="page-btn" onclick="renderTable(${totalPages})">»</button>`;
  pagination.innerHTML = html;
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function exportCSV() {
  const rows = [['关键词','一级分类','二级分类','国家','城市','分区','等级','投放素材业务线','花费','曝光量','点击量','CTR','CPC','APP互动成本','APP打开成本','APP订单成本']];
  filteredResults.forEach(r => {
    const ctr = r.impression > 0 ? (r.click / r.impression * 100).toFixed(2) + '%' : '-';
    const cpc = r.click > 0 ? (r.cost / r.click).toFixed(2) : '-';
    const appInteractCost = r.appInteract > 0 ? (r.cost / r.appInteract).toFixed(1) : '-';
    const appOpenCost = r.appOpen > 0 ? (r.cost / r.appOpen).toFixed(1) : '-';
    const appOrderCost = r.appOrder > 0 ? (r.cost / r.appOrder).toFixed(1) : '-';
    const kw = r.kw.replace(/[\r\n,]/g, ' ');
    rows.push([kw, r.l1, r.l2, r.country, r.city, r.zone, r.tier, r.adBizLine || '', r.cost, r.impression, r.click, ctr, cpc, appInteractCost, appOpenCost, appOrderCost]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile('\ufeff' + csv, '关键词分类结果.csv', 'text/csv;charset=utf-8');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function showLoading(show) {
  document.getElementById('loading').classList.toggle('show', show);
}

// ═══════════════════════════════════════════════════
// 数据分析模块
// ═══════════════════════════════════════════════════

let analysisCharts = {};

// ── 维度辅助函数 ──
function getDimHeader() {
  if (analysisDim === 'adBizLine') return '投放素材业务线';
  if (analysisDim === 'l2') return '词包（二级分类）';
  return '一级分类';
}

function getDimColor(key) {
  if (analysisDim === 'adBizLine') return '#6366f1';
  if (analysisDim === 'l2') {
    // 稳定的字符串哈希 → 取模 L2_COLORS，保证同一词包颜色不变
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash) + key.charCodeAt(i);
      hash |= 0;
    }
    return L2_COLORS[Math.abs(hash) % L2_COLORS.length];
  }
  return L1_META[key]?.color || '#999';
}

function renderDimBadge(key) {
  if (analysisDim === 'adBizLine') {
    return `<span class="l1-badge unclassified">${escHtml(key)}</span>`;
  }
  if (analysisDim === 'l2') {
    return `<span class="l2-tag">${escHtml(key)}</span>`;
  }
  const meta = L1_META[key];
  return `<span class="l1-badge ${meta?.cls || ''}">${escHtml(key)}</span>`;
}

function updateAnalysisHeaders() {
  const header = getDimHeader();
  document.querySelectorAll('.th-dim').forEach(el => { el.textContent = header; });
}

function switchAnalysisDim() {
  analysisDim = document.getElementById('analysis-dim-select').value;
  updateAnalysisHeaders();
  const activeBtn = document.querySelector('[data-analysis].active');
  if (activeBtn) switchAnalysisTab(activeBtn.dataset.analysis);
}

function switchAnalysisTab(tab) {
  document.querySelectorAll('[data-analysis]').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-analysis="${tab}"]`).classList.add('active');
  document.querySelectorAll('.analysis-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`analysis-${tab}`).classList.remove('hidden');

  // 渲染对应图表
  if (tab === 'cost') renderCostAnalysis();
  else if (tab === 'impression') renderImpressionAnalysis();
  else if (tab === 'click') renderClickAnalysis();
  else if (tab === 'appInteract') renderAppInteractAnalysis();
  else if (tab === 'appOpen') renderAppOpenAnalysis();
  else if (tab === 'appOrder') renderAppOrderAnalysis();
}

function calculateMetrics(dim) {
  dim = dim || analysisDim || 'l1';
  const metrics = {};

  // 按维度汇总
  allResults.forEach(r => {
    let groupKey;
    if (dim === 'adBizLine') {
      groupKey = r.adBizLine || '未标注';
    } else if (dim === 'l2') {
      groupKey = r.l2 || '未分类';
    } else {
      groupKey = r.l1 || '未分类';
    }
    if (!metrics[groupKey]) {
      metrics[groupKey] = {
        count: 0,
        cost: 0,
        impression: 0,
        click: 0,
        appInteract: 0,
        appOpen: 0,
        appOrder: 0
      };
    }
    metrics[groupKey].count++;
    metrics[groupKey].cost += r.cost || 0;
    metrics[groupKey].impression += r.impression || 0;
    metrics[groupKey].click += r.click || 0;
    metrics[groupKey].appInteract += r.appInteract || 0;
    metrics[groupKey].appOpen += r.appOpen || 0;
    metrics[groupKey].appOrder += r.appOrder || 0;
  });

  // 计算衍生指标
  Object.keys(metrics).forEach(key => {
    const m = metrics[key];
    m.avgCost = m.count > 0 ? m.cost / m.count : 0;
    m.avgImpression = m.count > 0 ? m.impression / m.count : 0;
    m.avgClick = m.count > 0 ? m.click / m.count : 0;
    m.ctr = m.impression > 0 ? (m.click / m.impression * 100) : 0;
    m.cpc = m.click > 0 ? (m.cost / m.click) : 0;
    m.appInteractCost = m.appInteract > 0 ? (m.cost / m.appInteract) : 0;
    m.appOpenCost = m.appOpen > 0 ? (m.cost / m.appOpen) : 0;
    m.appOrderCost = m.appOrder > 0 ? (m.cost / m.appOrder) : 0;
  });

  return metrics;
}

function renderCostAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[b].cost - metrics[a].cost);
  const totalCost = Object.values(metrics).reduce((sum, m) => sum + m.cost, 0);

  // 渲染图表
  if (analysisCharts.cost) analysisCharts.cost.destroy();
  analysisCharts.cost = new Chart(document.getElementById('chart-cost'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: '花费',
        data: keys.map(k => metrics[k].cost),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` 花费: ¥${ctx.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => '¥' + v.toLocaleString() } }
      }
    }
  });

  // 渲染表格
  const tbody = document.querySelector('#table-cost tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalCost > 0 ? (m.cost / totalCost * 100).toFixed(1) : 0;
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#ef4444;font-weight:600">¥${m.cost.toLocaleString()}</td>
      <td class="num">${pct}%</td>
      <td class="num">¥${m.avgCost.toFixed(1)}</td>
      <td class="num">${m.impression.toLocaleString()}</td>
      <td class="num">${m.click.toLocaleString()}</td>
      <td class="num">¥${m.cpc.toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function renderImpressionAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[b].impression - metrics[a].impression);
  const totalImp = Object.values(metrics).reduce((sum, m) => sum + m.impression, 0);

  // 渲染图表
  if (analysisCharts.impression) analysisCharts.impression.destroy();
  analysisCharts.impression = new Chart(document.getElementById('chart-impression'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: '曝光量',
        data: keys.map(k => metrics[k].impression),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } }
      }
    }
  });

  // 渲染表格
  const tbody = document.querySelector('#table-impression tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalImp > 0 ? (m.impression / totalImp * 100).toFixed(1) : 0;
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#3b82f6;font-weight:600">${m.impression.toLocaleString()}</td>
      <td class="num">${pct}%</td>
      <td class="num">${m.avgImpression.toFixed(0)}</td>
      <td class="num">${m.click.toLocaleString()}</td>
      <td class="num">${m.ctr.toFixed(2)}%</td>
    </tr>`;
  }).join('');
}

function renderClickAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[b].click - metrics[a].click);
  const totalClick = Object.values(metrics).reduce((sum, m) => sum + m.click, 0);

  // 渲染图表
  if (analysisCharts.click) analysisCharts.click.destroy();
  analysisCharts.click = new Chart(document.getElementById('chart-click'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: '点击量',
        data: keys.map(k => metrics[k].click),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } }
      }
    }
  });

  // 渲染表格
  const tbody = document.querySelector('#table-click tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalClick > 0 ? (m.click / totalClick * 100).toFixed(1) : 0;
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#10b981;font-weight:600">${m.click.toLocaleString()}</td>
      <td class="num">${pct}%</td>
      <td class="num">${m.avgClick.toFixed(0)}</td>
      <td class="num">¥${m.cost.toLocaleString()}</td>
      <td class="num">¥${m.cpc.toFixed(2)}</td>
    </tr>`;
  }).join('');
}


// ═══════════════════════════════════════════════════
// APP 成本分析模块（互动/打开/订单）
// ═══════════════════════════════════════════════════

function renderAppInteractAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[a].appInteractCost - metrics[b].appInteractCost);
  const totalCost = Object.values(metrics).reduce((sum, m) => sum + m.cost, 0);

  // 无 APP 数据时显示空状态提示
  if (!hasAppDataGlobal) {
    if (analysisCharts.appInteract) { analysisCharts.appInteract.destroy(); analysisCharts.appInteract = null; }
    const chartWrap = document.getElementById('chart-appInteract').parentElement;
    chartWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:14px;">暂无 APP 互动数据，请上传包含 APP 互动列的 Excel 文件</div>';
    document.querySelector('#table-appInteract tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">暂无 APP 互动数据</td></tr>';
    return;
  }

  // 恢复 canvas（如果之前被空状态替换）
  const chartWrap = document.getElementById('chart-appInteract')?.parentElement;
  if (chartWrap && !chartWrap.querySelector('canvas')) {
    chartWrap.innerHTML = '<canvas id="chart-appInteract"></canvas>';
  }

  if (analysisCharts.appInteract) analysisCharts.appInteract.destroy();
  analysisCharts.appInteract = new Chart(document.getElementById('chart-appInteract'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: 'APP互动成本',
        data: keys.map(k => metrics[k].appInteract > 0 ? metrics[k].appInteractCost : 0),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const m = metrics[keys[ctx.dataIndex]];
              return m.appInteract > 0 ? ` APP互动成本: ¥${ctx.parsed.y.toFixed(1)}` : ' 无APP互动数据';
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => '¥' + v.toLocaleString() } }
      }
    }
  });

  const tbody = document.querySelector('#table-appInteract tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalCost > 0 ? (m.cost / totalCost * 100).toFixed(1) : 0;
    const costStr = m.appInteract > 0 ? '¥' + m.appInteractCost.toFixed(1) : '-';
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#ef4444;font-weight:600">¥${m.cost.toLocaleString()}</td>
      <td class="num" style="color:#8b5cf6;font-weight:600">${m.appInteract.toLocaleString()}</td>
      <td class="num" style="color:#8b5cf6;font-weight:600">${costStr}</td>
      <td class="num">${pct}%</td>
    </tr>`;
  }).join('');
}

function renderAppOpenAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[a].appOpenCost - metrics[b].appOpenCost);
  const totalCost = Object.values(metrics).reduce((sum, m) => sum + m.cost, 0);

  // 无 APP 数据时显示空状态提示
  if (!hasAppDataGlobal) {
    if (analysisCharts.appOpen) { analysisCharts.appOpen.destroy(); analysisCharts.appOpen = null; }
    const chartWrap = document.getElementById('chart-appOpen').parentElement;
    chartWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:14px;">暂无 APP 打开数据，请上传包含 APP 打开列的 Excel 文件</div>';
    document.querySelector('#table-appOpen tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">暂无 APP 打开数据</td></tr>';
    return;
  }

  // 恢复 canvas（如果之前被空状态替换）
  const chartWrap = document.getElementById('chart-appOpen')?.parentElement;
  if (chartWrap && !chartWrap.querySelector('canvas')) {
    chartWrap.innerHTML = '<canvas id="chart-appOpen"></canvas>';
  }

  if (analysisCharts.appOpen) analysisCharts.appOpen.destroy();
  analysisCharts.appOpen = new Chart(document.getElementById('chart-appOpen'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: 'APP打开成本',
        data: keys.map(k => metrics[k].appOpen > 0 ? metrics[k].appOpenCost : 0),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const m = metrics[keys[ctx.dataIndex]];
              return m.appOpen > 0 ? ` APP打开成本: ¥${ctx.parsed.y.toFixed(1)}` : ' 无APP打开数据';
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => '¥' + v.toLocaleString() } }
      }
    }
  });

  const tbody = document.querySelector('#table-appOpen tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalCost > 0 ? (m.cost / totalCost * 100).toFixed(1) : 0;
    const costStr = m.appOpen > 0 ? '¥' + m.appOpenCost.toFixed(1) : '-';
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#ef4444;font-weight:600">¥${m.cost.toLocaleString()}</td>
      <td class="num" style="color:#ec4899;font-weight:600">${m.appOpen.toLocaleString()}</td>
      <td class="num" style="color:#ec4899;font-weight:600">${costStr}</td>
      <td class="num">${pct}%</td>
    </tr>`;
  }).join('');
}

function renderAppOrderAnalysis() {
  const metrics = calculateMetrics(analysisDim);
  const keys = Object.keys(metrics).sort((a, b) => metrics[a].appOrderCost - metrics[b].appOrderCost);
  const totalCost = Object.values(metrics).reduce((sum, m) => sum + m.cost, 0);

  // 无 APP 数据时显示空状态提示
  if (!hasAppDataGlobal) {
    if (analysisCharts.appOrder) { analysisCharts.appOrder.destroy(); analysisCharts.appOrder = null; }
    const chartWrap = document.getElementById('chart-appOrder').parentElement;
    chartWrap.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:14px;">暂无 APP 订单数据，请上传包含 APP 订单列的 Excel 文件</div>';
    document.querySelector('#table-appOrder tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:24px;">暂无 APP 订单数据</td></tr>';
    return;
  }

  // 恢复 canvas（如果之前被空状态替换）
  const chartWrap = document.getElementById('chart-appOrder')?.parentElement;
  if (chartWrap && !chartWrap.querySelector('canvas')) {
    chartWrap.innerHTML = '<canvas id="chart-appOrder"></canvas>';
  }

  if (analysisCharts.appOrder) analysisCharts.appOrder.destroy();
  analysisCharts.appOrder = new Chart(document.getElementById('chart-appOrder'), {
    type: 'bar',
    data: {
      labels: keys,
      datasets: [{
        label: 'APP订单成本',
        data: keys.map(k => metrics[k].appOrder > 0 ? metrics[k].appOrderCost : 0),
        backgroundColor: keys.map(k => getDimColor(k)),
        borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const m = metrics[keys[ctx.dataIndex]];
              return m.appOrder > 0 ? ` APP订单成本: ¥${ctx.parsed.y.toFixed(1)}` : ' 无APP订单数据';
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => '¥' + v.toLocaleString() } }
      }
    }
  });

  const tbody = document.querySelector('#table-appOrder tbody');
  tbody.innerHTML = keys.map(k => {
    const m = metrics[k];
    const pct = totalCost > 0 ? (m.cost / totalCost * 100).toFixed(1) : 0;
    const costStr = m.appOrder > 0 ? '¥' + m.appOrderCost.toFixed(1) : '-';
    return `<tr>
      <td>${renderDimBadge(k)}</td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#ef4444;font-weight:600">¥${m.cost.toLocaleString()}</td>
      <td class="num" style="color:#0d9488;font-weight:600">${m.appOrder.toLocaleString()}</td>
      <td class="num" style="color:#0d9488;font-weight:600">${costStr}</td>
      <td class="num">${pct}%</td>
    </tr>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// 地理维度分析模块
// ═══════════════════════════════════════════════════

var geoSelectedL1 = new Set();
var geoCharts = {};

// 区域固定顺序（去除"未识别"）
var GEO_REGION_ORDER = ['华东','华南','华北','华中','西南','西北','东北','海外'];
// 城市等级固定顺序（去除"未识别"）
var GEO_TIER_ORDER = ['一线城市','新一线城市','二线城市','三线城市','四线城市','五线城市','海外城市'];

function initGeoFilters() {
  // 获取所有非空、非"待确认"的业务线
  var l1Set = new Set();
  allResults.forEach(function(r) {
    if (r.l1 && r.l1 !== '待确认') {
      l1Set.add(r.l1);
    }
  });

  // 默认全选
  geoSelectedL1 = new Set(l1Set);

  var container = document.getElementById('geo-filter-l1');
  container.innerHTML = [...l1Set].sort().map(function(l1) {
    return '<span class="filter-tag active" data-l1="' + escHtml(l1) + '" onclick="toggleGeoL1(this)">' + escHtml(l1) + '</span>';
  }).join('');
}

function toggleGeoL1(el) {
  var l1 = el.dataset.l1;
  if (geoSelectedL1.has(l1)) {
    geoSelectedL1.delete(l1);
    el.classList.remove('active');
  } else {
    geoSelectedL1.add(l1);
    el.classList.add('active');
  }
  renderGeoAnalysis();
}

function clearGeoFilters() {
  var l1Set = new Set();
  allResults.forEach(function(r) {
    if (r.l1 && r.l1 !== '待确认') {
      l1Set.add(r.l1);
    }
  });
  geoSelectedL1 = new Set(l1Set);
  document.querySelectorAll('#geo-filter-l1 .filter-tag').forEach(function(el) {
    el.classList.add('active');
  });
  renderGeoAnalysis();
}

function calculateGeoMetrics() {
  var metric = document.getElementById('geo-metric-select').value;
  var data = {
    country: {},   // 国家分布
    region: {},    // 区域分布
    tier: {},      // 城市等级分布
    city: {}       // 城市TOP20
  };

  var CITY_TIER_MAP = KC.DictEntity.CITY_TIER_MAP;
  var CITY_REGION_MAP = KC.DictEntity.CITY_REGION_MAP;

  // 只分析有明确标签的数据
  allResults.forEach(function(r) {
    if (!r.l1 || r.l1 === '待确认') return;
    if (!geoSelectedL1.has(r.l1)) return;

    var value = r[metric] || 0;

    // 1. 国家分布（跳过无国家信息的数据）
    var country = r.country;
    if (!country || country === '') return; // 跳过未识别
    if (!data.country[country]) data.country[country] = 0;
    data.country[country] += value;

    // 2. 区域分布（跳过未识别的数据）
    var region = null;
    if (r.country !== '中国' && r.city) {
      region = '海外';
    } else if (r.city && CITY_REGION_MAP[r.city]) {
      region = CITY_REGION_MAP[r.city];
    }
    // 无法识别区域的数据跳过
    if (region !== null) {
      if (!data.region[region]) data.region[region] = 0;
      data.region[region] += value;
    }

    // 3. 城市等级分布（跳过未识别的数据）
    var tier = null;
    if (r.country !== '中国' && r.city) {
      tier = '海外城市';
    } else if (r.city && CITY_TIER_MAP[r.city]) {
      tier = CITY_TIER_MAP[r.city];
    }
    // 无法识别等级的数据跳过
    if (tier !== null) {
      if (!data.tier[tier]) data.tier[tier] = 0;
      data.tier[tier] += value;
    }

    // 4. 城市TOP20（有city且非空字符串）
    if (r.city && r.city !== '') {
      if (!data.city[r.city]) data.city[r.city] = 0;
      data.city[r.city] += value;
    }
  });

  return data;
}

function renderGeoAnalysis() {
  var data = calculateGeoMetrics();
  renderGeoCountryChart(data.country);
  renderGeoRegionChart(data.region);
  renderGeoTierChart(data.tier);
  renderGeoCityChart(data.city);
}

function renderGeoCountryChart(countryData) {
  if (geoCharts.country) geoCharts.country.destroy();
  var sorted = Object.entries(countryData).sort(function(a, b) { return b[1] - a[1]; });
  var labels = sorted.map(function(item) { return item[0]; });
  var values = sorted.map(function(item) { return item[1]; });

  geoCharts.country = new Chart(document.getElementById('chart-geo-country'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6',
          '#ec4899','#06b6d4','#f97316','#84cc16','#6366f1',
          '#14b8a6','#e11d48','#a855f7','#0ea5e9','#d946ef'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var total = ctx.dataset.data.reduce(function(s, v) { return s + v; }, 0);
              var pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ' ' + ctx.label + ': ' + pct + '%';
            }
          }
        }
      }
    }
  });
}

function renderGeoRegionChart(regionData) {
  if (geoCharts.region) geoCharts.region.destroy();
  // 按固定顺序展示
  var labels = [];
  var values = [];
  GEO_REGION_ORDER.forEach(function(region) {
    if (regionData[region] !== undefined) {
      labels.push(region);
      values.push(regionData[region]);
    }
  });

  geoCharts.region = new Chart(document.getElementById('chart-geo-region'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6',
          '#ec4899','#06b6d4','#f97316'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var total = ctx.dataset.data.reduce(function(s, v) { return s + v; }, 0);
              var pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ' ' + ctx.label + ': ' + pct + '%';
            }
          }
        }
      }
    }
  });
}

function renderGeoTierChart(tierData) {
  if (geoCharts.tier) geoCharts.tier.destroy();
  // 按固定顺序展示
  var labels = [];
  var values = [];
  GEO_TIER_ORDER.forEach(function(tier) {
    if (tierData[tier] !== undefined) {
      labels.push(tier);
      values.push(tierData[tier]);
    }
  });

  geoCharts.tier = new Chart(document.getElementById('chart-geo-tier'), {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6',
          '#ec4899','#06b6d4'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12, padding: 8 } },
        tooltip: {
          callbacks: {
            label: function(ctx) {
              var total = ctx.dataset.data.reduce(function(s, v) { return s + v; }, 0);
              var pct = total > 0 ? (ctx.parsed / total * 100).toFixed(1) : 0;
              return ' ' + ctx.label + ': ' + pct + '%';
            }
          }
        }
      }
    }
  });
}

function renderGeoCityChart(cityData) {
  if (geoCharts.city) geoCharts.city.destroy();
  // 取Top50按数值降序
  var sorted = Object.entries(cityData).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 50);
  var total = sorted.reduce(function(sum, item) { return sum + item[1]; }, 0);
  var labels = sorted.map(function(item) { return item[0]; });
  var values = sorted.map(function(item) { return total > 0 ? (item[1] / total * 100) : 0; });

  geoCharts.city = new Chart(document.getElementById('chart-geo-city'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '占比',
        data: values,
        backgroundColor: '#3b82f6',
        borderRadius: 4,
        barThickness: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ' ' + ctx.parsed.y.toFixed(1) + '%'; }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: function(v) { return v.toFixed(1) + '%'; } } },
        x: { ticks: { font: { size: 9 }, maxRotation: 60, minRotation: 45 } }
      }
    }
  });
}

// ── 文件拖拽 ──
const dropzone = document.getElementById('dropzone');
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    document.getElementById('file-input').files = files;
    // 手动触发 change 显示反馈
    document.getElementById('file-input').dispatchEvent(new Event('change'));
  }
});
document.getElementById('file-input').addEventListener('change', function() {
  const f = this.files[0];
  if (f) {
    const sizeStr = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1) + ' MB' : (f.size/1024).toFixed(0) + ' KB';
    // dropzone 内部显示文件名
    const dropzone = document.getElementById('dropzone');
    dropzone.classList.add('has-file');
    document.getElementById('filename-display').textContent = '✅ ' + f.name + '（' + sizeStr + '）';
    // 操作栏显示醒目标记（文件名可能含特殊字符，用 textContent 防注入）
    const fileInfoEl = document.getElementById('file-info');
    fileInfoEl.textContent = '';
    const fileInfoBadge = document.createElement('span');
    fileInfoBadge.className = 'file-info-badge';
    fileInfoBadge.textContent = '📁 ' + f.name + '（' + sizeStr + '）';
    fileInfoEl.appendChild(fileInfoBadge);
  }
});

// ═══════════════════════════════════════════════════
// 交叉分析模块：业务线 × 词包（可筛选版）
// ═══════════════════════════════════════════════════

let crossCharts = {};
let crossSelectedL1 = new Set();
let crossSelectedL2 = new Set();
let crossSelectedAdBiz = new Set();

// ── 交叉分析维度辅助函数 ──
function getCrossDimLabel() {
  return crossDim === 'adBizLine' ? '投放素材业务线' : '业务线';
}

function getCrossDimColor(val) {
  if (crossDim === 'adBizLine') return '#6366f1';
  return L1_META[val]?.color || '#999';
}

function renderCrossDimBadge(val) {
  if (crossDim === 'adBizLine') {
    return `<span class="l1-badge unclassified">${escHtml(val)}</span>`;
  }
  return `<span class="l1-badge ${L1_META[val]?.cls || ''}">${escHtml(val)}</span>`;
}

function switchCrossDim() {
  crossDim = document.getElementById('cross-dim-select').value;
  const titleEl = document.getElementById('cross-chart-l1-title');
  if (titleEl) titleEl.textContent = '📊 ' + getCrossDimLabel() + '维度';
  updateCrossL2Tags();
  renderCrossAnalysis();
}

function initCrossFilters() {
  // 获取所有唯一的l1和l2
  const l1Set = new Set(allResults.map(r => r.l1).filter(Boolean));
  const l2Set = new Set(allResults.map(r => r.l2).filter(Boolean));
  const adBizSet = new Set(allResults.map(r => r.adBizLine || '未标注'));

  // 默认全选
  crossSelectedL1 = new Set(l1Set);
  crossSelectedL2 = new Set(l2Set);
  crossSelectedAdBiz = new Set(adBizSet);

  // 渲染业务线筛选器
  const l1Container = document.getElementById('cross-filter-l1');
  l1Container.innerHTML = [...l1Set].sort().map(l1 =>
    `<span class="filter-tag active" data-l1="${escHtml(l1)}" onclick="toggleCrossL1(this)">${escHtml(l1)}</span>`
  ).join('');

  // 渲染投放素材业务线筛选器
  const adBizContainer = document.getElementById('cross-filter-adbiz');
  adBizContainer.innerHTML = [...adBizSet].sort().map(ab =>
    `<span class="filter-tag active" data-adbiz="${escHtml(ab)}" onclick="toggleCrossAdBiz(this)">${escHtml(ab)}</span>`
  ).join('') || '<span style="color:#9ca3af;font-size:12px;">（无投放素材业务线数据）</span>';

  // 渲染词包筛选器
  const l2Container = document.getElementById('cross-filter-l2');
  l2Container.innerHTML = [...l2Set].sort().map(l2 =>
    `<span class="filter-tag active" data-l2="${escHtml(l2)}" onclick="toggleCrossL2(this)">${escHtml(l2)}</span>`
  ).join('');
}

function toggleCrossL1(el) {
  const l1 = el.dataset.l1;
  if (crossSelectedL1.has(l1)) {
    crossSelectedL1.delete(l1);
    el.classList.remove('active');
  } else {
    crossSelectedL1.add(l1);
    el.classList.add('active');
  }
  // 业务线变化后，联动更新词包标签（只显示选中业务线下存在的词包）
  if (crossDim === 'l1') updateCrossL2Tags();
  renderCrossAnalysis();
}

function toggleCrossAdBiz(el) {
  const ab = el.dataset.adbiz;
  if (crossSelectedAdBiz.has(ab)) {
    crossSelectedAdBiz.delete(ab);
    el.classList.remove('active');
  } else {
    crossSelectedAdBiz.add(ab);
    el.classList.add('active');
  }
  if (crossDim === 'adBizLine') updateCrossL2Tags();
  renderCrossAnalysis();
}

// 根据当前选中的维度，动态更新词包筛选标签
function updateCrossL2Tags() {
  const selectedSet = crossDim === 'adBizLine' ? crossSelectedAdBiz : crossSelectedL1;
  const dimField = crossDim === 'adBizLine' ? 'adBizLine' : 'l1';

  // 计算选中维度下实际存在的词包集合
  let availableL2s;
  if (selectedSet.size === 0) {
    availableL2s = new Set();
  } else {
    availableL2s = new Set(
      allResults
        .filter(r => {
          const val = crossDim === 'adBizLine' ? (r.adBizLine || '未标注') : r.l1;
          return val && selectedSet.has(val) && r.l2;
        })
        .map(r => r.l2)
    );
  }

  const l2Container = document.getElementById('cross-filter-l2');

  // 如果选中了全部维度值，直接显示全部词包
  const allDimSet = new Set(allResults.map(r => {
    return crossDim === 'adBizLine' ? (r.adBizLine || '未标注') : r.l1;
  }).filter(Boolean));
  const isAllSelected = [...allDimSet].every(v => selectedSet.has(v));

  if (isAllSelected) {
    availableL2s = new Set(allResults.map(r => r.l2).filter(Boolean));
  }

  // 重新渲染词包标签，默认全选可用词包
  crossSelectedL2 = new Set(availableL2s);
  l2Container.innerHTML = [...availableL2s].sort().map(l2 =>
    `<span class="filter-tag active" data-l2="${escHtml(l2)}" onclick="toggleCrossL2(this)">${escHtml(l2)}</span>`
  ).join('') || '<span style="color:#9ca3af;font-size:12px;">（当前维度下无词包）</span>';
}

function toggleCrossL2(el) {
  const l2 = el.dataset.l2;
  if (crossSelectedL2.has(l2)) {
    crossSelectedL2.delete(l2);
    el.classList.remove('active');
  } else {
    crossSelectedL2.add(l2);
    el.classList.add('active');
  }
  renderCrossAnalysis();
}

function clearCrossFilters() {
  crossSelectedL1 = new Set(allResults.map(r => r.l1).filter(Boolean));
  crossSelectedL2 = new Set(allResults.map(r => r.l2).filter(Boolean));
  crossSelectedAdBiz = new Set(allResults.map(r => r.adBizLine || '未标注'));

  document.querySelectorAll('#cross-filter-l1 .filter-tag').forEach(el => {
    el.classList.add('active');
  });

  // 清除时恢复全量词包标签
  updateCrossL2Tags();

  // 恢复投放素材业务线标签
  const adBizContainer = document.getElementById('cross-filter-adbiz');
  adBizContainer.innerHTML = [...crossSelectedAdBiz].sort().map(ab =>
    `<span class="filter-tag active" data-adbiz="${escHtml(ab)}" onclick="toggleCrossAdBiz(this)">${escHtml(ab)}</span>`
  ).join('') || '<span style="color:#9ca3af;font-size:12px;">（无投放素材业务线数据）</span>';

  renderCrossAnalysis();
}

function calculateCrossMetrics() {
  const metrics = {};

  // 只统计选中的维度和词包
  allResults.forEach(r => {
    const dimVal = crossDim === 'adBizLine' ? (r.adBizLine || '未标注') : (r.l1 || '未分类');
    const l2 = r.l2 || '通用词';

    if (crossDim === 'adBizLine') {
      if (!crossSelectedAdBiz.has(dimVal)) return;
    } else {
      if (!crossSelectedL1.has(dimVal)) return;
    }
    if (!crossSelectedL2.has(l2)) return;

    const key = dimVal + '|||' + l2;
    if (!metrics[key]) {
      metrics[key] = { dimVal, l2, count: 0, cost: 0, impression: 0, click: 0, appInteract: 0, appOpen: 0, appOrder: 0 };
    }
    metrics[key].count++;
    metrics[key].cost += r.cost || 0;
    metrics[key].impression += r.impression || 0;
    metrics[key].click += r.click || 0;
    metrics[key].appInteract += r.appInteract || 0;
    metrics[key].appOpen += r.appOpen || 0;
    metrics[key].appOrder += r.appOrder || 0;
  });

  // 计算衍生指标
  Object.values(metrics).forEach(m => {
    m.ctr = m.impression > 0 ? (m.click / m.impression * 100) : 0;
    m.cpc = m.click > 0 ? (m.cost / m.click) : 0;
    m.appInteractCost = m.appInteract > 0 ? (m.cost / m.appInteract) : 0;
    m.appOpenCost = m.appOpen > 0 ? (m.cost / m.appOpen) : 0;
    m.appOrderCost = m.appOrder > 0 ? (m.cost / m.appOrder) : 0;
  });

  return metrics;
}

function renderCrossAnalysis() {
  const metrics = calculateCrossMetrics();
  const metricField = document.getElementById('cross-metric-select').value;

  // 获取所有唯一的维度值和词包（只包含选中的）
  let dimVals;
  if (crossDim === 'adBizLine') {
    dimVals = [...crossSelectedAdBiz].sort();
  } else {
    dimVals = [...crossSelectedL1].sort();
  }
  const l2s = [...crossSelectedL2].sort();

  if (dimVals.length === 0 || l2s.length === 0) {
    document.getElementById('cross-summary-cards').innerHTML = '<p style="color:#9ca3af;text-align:center;">请选择至少一个' + getCrossDimLabel() + '和词包</p>';
    return;
  }

  // 构建矩阵
  const matrix = {};
  dimVals.forEach(dv => {
    matrix[dv] = {};
    l2s.forEach(l2 => {
      const key = dv + '|||' + l2;
      matrix[dv][l2] = metrics[key] || { dimVal: dv, l2, count: 0, cost: 0, impression: 0, click: 0, ctr: 0, cpc: 0, appInteract: 0, appOpen: 0, appOrder: 0, appInteractCost: 0, appOpenCost: 0, appOrderCost: 0 };
    });
  });

  // 渲染概览卡片
  renderCrossSummaryCards(metrics);

  // 渲染图表
  renderCrossCharts(dimVals, l2s, matrix, metricField);

  // 渲染热力图
  renderCrossHeatmap(dimVals, l2s, matrix, metricField);

  // 渲染详细表格
  renderCrossDetailTable(metrics);
}

function renderCrossSummaryCards(metrics) {
  const values = Object.values(metrics);
  const totalCount = values.reduce((sum, m) => sum + m.count, 0);
  const totalCost = values.reduce((sum, m) => sum + m.cost, 0);
  const totalImp = values.reduce((sum, m) => sum + m.impression, 0);
  const totalClick = values.reduce((sum, m) => sum + m.click, 0);
  const totalAppInteract = values.reduce((sum, m) => sum + (m.appInteract || 0), 0);
  const totalAppOpen = values.reduce((sum, m) => sum + (m.appOpen || 0), 0);
  const totalAppOrder = values.reduce((sum, m) => sum + (m.appOrder || 0), 0);
  const avgCtr = totalImp > 0 ? (totalClick / totalImp * 100) : 0;
  const avgCpc = totalClick > 0 ? (totalCost / totalClick) : 0;
  const avgAppInteractCost = totalAppInteract > 0 ? (totalCost / totalAppInteract) : 0;
  const avgAppOpenCost = totalAppOpen > 0 ? (totalCost / totalAppOpen) : 0;
  const avgAppOrderCost = totalAppOrder > 0 ? (totalCost / totalAppOrder) : 0;
  
  const cards = [
    { label: '关键词数', value: totalCount.toLocaleString(), color: '#1a73e8' },
    { label: '总花费', value: '¥' + totalCost.toLocaleString(), color: '#ef4444' },
    { label: '总曝光', value: totalImp.toLocaleString(), color: '#3b82f6' },
    { label: '总点击', value: totalClick.toLocaleString(), color: '#10b981' },
    { label: '平均CTR', value: avgCtr.toFixed(2) + '%', color: '#f59e0b' },
    { label: '平均CPC', value: '¥' + avgCpc.toFixed(2), color: '#8b5cf6' },
    { label: '平均APP互动成本', value: avgAppInteractCost > 0 ? '¥' + avgAppInteractCost.toFixed(1) : '-', color: '#8b5cf6' },
    { label: '平均APP打开成本', value: avgAppOpenCost > 0 ? '¥' + avgAppOpenCost.toFixed(1) : '-', color: '#ec4899' },
    { label: '平均APP订单成本', value: avgAppOrderCost > 0 ? '¥' + avgAppOrderCost.toFixed(1) : '-', color: '#0d9488' },
  ];
  
  document.getElementById('cross-summary-cards').innerHTML = cards.map(c => `
    <div style="background:linear-gradient(135deg,${c.color}15,${c.color}08);border-radius:8px;padding:12px;text-align:center;border:1px solid ${c.color}30;transition:all .2s;"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px ${c.color}20'"
      onmouseout="this.style.transform='';this.style.boxShadow=''"
    >
      <div style="font-size:20px;font-weight:700;color:${c.color};margin-bottom:4px;">${c.value}</div>
      <div style="font-size:11px;color:#6b7280;">${c.label}</div>
    </div>
  `).join('');
}

function renderCrossCharts(dimVals, l2s, matrix, metricField) {
  // 计算合计（始终按消耗cost降序排序）并排序
  const dimTotals = {};
  dimVals.forEach(dv => {
    let sum = 0;
    l2s.forEach(l2 => sum += matrix[dv][l2].cost || 0);
    dimTotals[dv] = sum;
  });

  const l2Totals = {};
  l2s.forEach(l2 => {
    let sum = 0;
    dimVals.forEach(dv => sum += matrix[dv][l2].cost || 0);
    l2Totals[l2] = sum;
  });

  // l2CostData（各词包消耗合计，用于组合图柱状图）
  const l2CostData = {};
  l2s.forEach(l2 => {
    let sum = 0;
    dimVals.forEach(dv => sum += matrix[dv][l2].cost || 0);
    l2CostData[l2] = sum;
  });

  // 成本类指标升序（低排前），其余指标降序（高排前）
  const costMetrics = new Set(['appInteractCost', 'appOpenCost', 'appOrderCost', 'cpc']);
  const isCostMetric = costMetrics.has(metricField);
  const sortCmp = isCostMetric
    ? ((a, b) => dimTotals[a] - dimTotals[b])
    : ((a, b) => dimTotals[b] - dimTotals[a]);
  const sortCmpL2 = isCostMetric
    ? ((a, b) => l2Totals[a] - l2Totals[b])
    : ((a, b) => l2Totals[b] - l2Totals[a]);

  const sortedDims = [...dimVals].sort(sortCmp);
  // 词包始终按消耗降序排列
  const sortedL2s = [...l2s].sort((a, b) => l2Totals[b] - l2Totals[a]);

  // 维度图表（数值仍用metricField）
  // 成本比值类指标（appInteractCost/appOpenCost/appOrderCost）不能直接跨词包求和，需先汇总量再除
  const dimData = sortedDims.map(dv => {
    if (isCostMetric && metricField !== 'cpc') {
      const appField = metricField.replace('Cost', '');
      let totalCost = 0, totalApp = 0;
      l2s.forEach(l2 => {
        totalCost += matrix[dv][l2].cost || 0;
        totalApp += matrix[dv][l2][appField] || 0;
      });
      return totalApp > 0 ? totalCost / totalApp : 0;
    }
    let sum = 0;
    l2s.forEach(l2 => sum += matrix[dv][l2][metricField] || 0);
    return sum;
  });
  const dimColors = sortedDims.map(dv => getCrossDimColor(dv));

  // 延迟到下一帧渲染，确保父容器已解除 hidden 状态且 canvas 有正确尺寸
  requestAnimationFrame(() => {
    const canvasL1 = document.getElementById('chart-cross-l1');
    if (!canvasL1) return;

    if (crossCharts.l1) crossCharts.l1.destroy();
    crossCharts.l1 = new Chart(canvasL1, {
      type: 'bar',
      data: {
        labels: sortedDims,
        datasets: [{
          label: getMetricLabel(metricField),
          data: dimData,
          backgroundColor: dimColors,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const total = dimData.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (ctx.parsed.y / total * 100).toFixed(1) : 0;
                return ` ${ctx.parsed.y.toLocaleString()} (${pct}%)`;
              }
            }
          }
        },
        scales: { y: { beginAtZero: true, title: { display: true, text: getMetricLabel(metricField) }, ticks: { callback: v => formatMetricValue(v, metricField) } } }
      }
    });

    const canvasL2 = document.getElementById('chart-cross-l2');
    if (!canvasL2) return;

    if (crossCharts.l2) crossCharts.l2.destroy();
    crossCharts.l2 = new Chart(canvasL2, {
      type: 'bar',
      data: {
        labels: sortedL2s,
        datasets: [
          {
            label: '消耗',
            data: sortedL2s.map(l2 => l2CostData[l2]),
            backgroundColor: '#ef444420',
            borderColor: '#ef4444',
            borderWidth: 1,
            borderRadius: 5,
            yAxisID: 'y',
            order: 1
          },
          ...(isCostMetric && metricField !== 'cpc' ? [{
            label: getMetricLabel(metricField),
            data: sortedL2s.map(l2 => {
              const appField = metricField.replace('Cost', '');
              let totalCost = 0, totalApp = 0;
              dimVals.forEach(dv => {
                totalCost += matrix[dv][l2].cost || 0;
                totalApp += matrix[dv][l2][appField] || 0;
              });
              return totalApp > 0 ? totalCost / totalApp : 0;
            }),
            type: 'line',
            borderColor: '#6366f1',
            backgroundColor: '#6366f120',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: '#6366f1',
            tension: 0.3,
            yAxisID: 'y1',
            order: 0
          }] : [])
        ]
      },
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '消耗 (¥)' },
            beginAtZero: true
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: '成本 (¥)' },
            beginAtZero: true,
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  });
}

function renderCrossHeatmap(dimVals, l2s, matrix, metricField) {
  // 计算每个维度值的合计值（始终按消耗cost排序），用于排序
  const dimTotals = {};
  dimVals.forEach(dv => {
    let sum = 0;
    l2s.forEach(l2 => {
      sum += matrix[dv][l2].cost || 0;
    });
    dimTotals[dv] = sum;
  });

  // 计算每个词包的合计值（始终按消耗cost排序），用于排序
  const l2Totals = {};
  l2s.forEach(l2 => {
    let sum = 0;
    dimVals.forEach(dv => {
      sum += matrix[dv][l2].cost || 0;
    });
    l2Totals[l2] = sum;
  });

  // 成本类指标升序（低排前），其余指标降序（高排前）
  const costMetrics = new Set(['appInteractCost', 'appOpenCost', 'appOrderCost', 'cpc']);
  const isCostMetric = costMetrics.has(metricField);
  const sortCmp = isCostMetric
    ? ((a, b) => dimTotals[a] - dimTotals[b])
    : ((a, b) => dimTotals[b] - dimTotals[a]);
  const sortCmpL2 = isCostMetric
    ? ((a, b) => l2Totals[a] - l2Totals[b])
    : ((a, b) => l2Totals[b] - l2Totals[a]);

  const sortedDims = [...dimVals].sort(sortCmp);
  const sortedL2s = [...l2s].sort(sortCmpL2);

  // 计算所有数据的最大值用于颜色映射
  let maxValue = 0;
  sortedDims.forEach(dv => {
    sortedL2s.forEach(l2 => {
      maxValue = Math.max(maxValue, matrix[dv][l2][metricField] || 0);
    });
  });

  // 计算总计（用于百分比计算）
  let grandTotal = 0;
  sortedDims.forEach(dv => {
    sortedL2s.forEach(l2 => {
      grandTotal += matrix[dv][l2][metricField] || 0;
    });
  });

  // 生成热力图HTML
  let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';

  // 表头
  html += '<thead><tr><th style="background:#f9fafb;padding:8px;border:1px solid #e5e7eb;">' + getCrossDimLabel() + ' \\ 词包</th>';
  sortedL2s.forEach(l2 => {
    const colTotal = l2Totals[l2] || 0;
    const colPct = grandTotal > 0 ? (colTotal / grandTotal * 100).toFixed(1) : 0;
    html += `<th style="background:#f9fafb;padding:8px;border:1px solid #e5e7eb;text-align:center;font-size:11px;">
      <div>${escHtml(l2)}</div>
      <div style="font-size:10px;color:#6b7280;font-weight:normal;">${formatMetricValue(colTotal, metricField)}</div>
      <div style="font-size:10px;color:#1a73e8;font-weight:normal;">${colPct}%</div>
    </th>`;
  });
  html += `<th style="background:#f9fafb;padding:8px;border:1px solid #e5e7eb;text-align:center;font-size:11px;">
    <div>合计</div>
    <div style="font-size:10px;color:#6b7280;font-weight:normal;">${formatMetricValue(grandTotal, metricField)}</div>
  </th></tr></thead>`;

  // 表体
  html += '<tbody>';
  sortedDims.forEach(dv => {
    const rowTotal = dimTotals[dv] || 0;
    const rowPct = grandTotal > 0 ? (rowTotal / grandTotal * 100).toFixed(1) : 0;

    html += `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;">
      <div>${renderCrossDimBadge(dv)}</div>
      <div style="font-size:10px;color:#6b7280;font-weight:normal;margin-top:2px;">${formatMetricValue(rowTotal, metricField)}</div>
      <div style="font-size:10px;color:#1a73e8;font-weight:normal;">${rowPct}%</div>
    </td>`;

    sortedL2s.forEach(l2 => {
      const value = matrix[dv][l2][metricField] || 0;

      // 计算颜色强度
      const intensity = maxValue > 0 ? (value / maxValue) : 0;
      const color = getHeatmapColor(intensity, metricField);

      // 计算百分比（占总计）
      const pct = grandTotal > 0 ? (value / grandTotal * 100).toFixed(1) : 0;
      const rPct = rowTotal > 0 ? (value / rowTotal * 100).toFixed(1) : 0;

      html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;background:${color};cursor:pointer;transition:all .15s;"
        onmouseover="this.style.transform='scale(1.05)';this.style.zIndex='10';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)';this.style.position='relative'"
        onmouseout="this.style.transform='';this.style.zIndex='';this.style.boxShadow=''"
        title="${escHtml(dv)} × ${escHtml(l2)}: ${formatMetricValue(value, metricField)} (${pct}% of total)"
      >
        <div style="font-weight:600;font-size:13px;">${formatMetricValue(value, metricField)}</div>
        <div style="font-size:10px;color:#374151;margin-top:2px;">${pct}%</div>
        <div style="font-size:9px;color:#6b7280;">行${rPct}%</div>
      </td>`;
    });

    html += `<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;font-weight:600;background:#f3f4f6;">
      <div>${formatMetricValue(rowTotal, metricField)}</div>
      <div style="font-size:10px;color:#1a73e8;">${rowPct}%</div>
    </td></tr>`;
  });

  html += '</tbody></table>';

  document.getElementById('cross-heatmap').innerHTML = html;
}

let crossSortField = 'cost';
let crossSortDesc = true;

function sortCrossTable(field) {
  if (crossSortField === field) {
    crossSortDesc = !crossSortDesc;
  } else {
    crossSortField = field;
    crossSortDesc = true;
  }
  renderCrossAnalysis();
}

function renderCrossDetailTable(metrics) {
  const values = Object.values(metrics);

  // 排序
  values.sort((a, b) => {
    const aVal = a[crossSortField] || 0;
    const bVal = b[crossSortField] || 0;
    return crossSortDesc ? bVal - aVal : aVal - bVal;
  });

  // 计算总计用于百分比
  const totalCost = values.reduce((sum, m) => sum + m.cost, 0);
  const totalImp = values.reduce((sum, m) => sum + m.impression, 0);
  const totalClick = values.reduce((sum, m) => sum + m.click, 0);
  const totalAppInteract = values.reduce((sum, m) => sum + (m.appInteract || 0), 0);
  const totalAppOpen = values.reduce((sum, m) => sum + (m.appOpen || 0), 0);
  const totalAppOrder = values.reduce((sum, m) => sum + (m.appOrder || 0), 0);

  // 渲染动态表头（带排序指示器）
  const headers = [
    { field: null, label: getCrossDimLabel() },
    { field: null, label: '词包' },
    { field: 'count', label: '关键词数' },
    { field: 'cost', label: '花费' },
    { field: 'impression', label: '曝光' },
    { field: 'click', label: '点击' },
    { field: 'ctr', label: 'CTR' },
    { field: 'cpc', label: 'CPC' },
    { field: 'appInteractCost', label: 'APP互动成本' },
    { field: 'appOpenCost', label: 'APP打开成本' },
    { field: 'appOrderCost', label: 'APP订单成本' }
  ];

  const theadHtml = headers.map(h => {
    if (!h.field) return `<th>${h.label}</th>`;
    const arrow = crossSortField === h.field ? (crossSortDesc ? ' ▼' : ' ▲') : '';
    return `<th style="cursor:pointer;" onclick="sortCrossTable('${h.field}')" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background=''">${h.label}${arrow}</th>`;
  }).join('');
  document.getElementById('cross-detail-header').innerHTML = theadHtml;

  const tbody = document.querySelector('#table-cross-detail tbody');
  tbody.innerHTML = values.map(m => {
    const costPct = totalCost > 0 ? (m.cost / totalCost * 100).toFixed(1) : 0;
    const impPct = totalImp > 0 ? (m.impression / totalImp * 100).toFixed(1) : 0;
    const clickPct = totalClick > 0 ? (m.click / totalClick * 100).toFixed(1) : 0;

    return `
    <tr>
      <td>${renderCrossDimBadge(m.dimVal)}</td>
      <td><span class="l2-tag">${escHtml(m.l2 || '')}</span></td>
      <td class="num">${m.count.toLocaleString()}</td>
      <td class="num" style="color:#ef4444">
        ¥${m.cost.toLocaleString()}
        <div style="font-size:10px;color:#6b7280;">${costPct}%</div>
      </td>
      <td class="num">
        ${m.impression.toLocaleString()}
        <div style="font-size:10px;color:#6b7280;">${impPct}%</div>
      </td>
      <td class="num">
        ${m.click.toLocaleString()}
        <div style="font-size:10px;color:#6b7280;">${clickPct}%</div>
      </td>
      <td class="num">${m.ctr.toFixed(2)}%</td>
      <td class="num">¥${m.cpc.toFixed(2)}</td>
      <td class="num" style="color:#8b5cf6">${m.appInteract > 0 ? '¥' + m.appInteractCost.toFixed(1) : '-'}</td>
      <td class="num" style="color:#ec4899">${m.appOpen > 0 ? '¥' + m.appOpenCost.toFixed(1) : '-'}</td>
      <td class="num" style="color:#0d9488">${m.appOrder > 0 ? '¥' + m.appOrderCost.toFixed(1) : '-'}</td>
    </tr>`;
  }).join('');

  // 添加合计行
  const totalRow = `
    <tr style="background:#f3f4f6;font-weight:600;">
      <td colspan="2">合计</td>
      <td class="num">${values.reduce((sum, m) => sum + m.count, 0).toLocaleString()}</td>
      <td class="num">¥${totalCost.toLocaleString()}</td>
      <td class="num">${totalImp.toLocaleString()}</td>
      <td class="num">${totalClick.toLocaleString()}</td>
      <td class="num">${totalImp > 0 ? (totalClick/totalImp*100).toFixed(2) : 0}%</td>
      <td class="num">¥${totalClick > 0 ? (totalCost/totalClick).toFixed(2) : 0}</td>
      <td class="num">${totalAppInteract > 0 ? '¥' + (totalCost/totalAppInteract).toFixed(1) : '-'}</td>
      <td class="num">${totalAppOpen > 0 ? '¥' + (totalCost/totalAppOpen).toFixed(1) : '-'}</td>
      <td class="num">${totalAppOrder > 0 ? '¥' + (totalCost/totalAppOrder).toFixed(1) : '-'}</td>
    </tr>
  `;
  tbody.innerHTML += totalRow;
}

function getHeatmapColor(intensity, metricField) {
  // 根据指标类型选择颜色主题
  if (metricField === 'ctr') {
    // CTR：蓝->绿
    return `rgba(59, 130, 246, ${0.15 + intensity * 0.55})`;
  } else if (metricField === 'cpc' || metricField === 'appInteractCost' || metricField === 'appOpenCost' || metricField === 'appOrderCost') {
    // 成本类：红（高成本=红色）
    return `rgba(239, 68, 68, ${0.15 + intensity * 0.55})`;
  } else {
    // 默认：蓝色渐变
    return `rgba(26, 115, 232, ${0.15 + intensity * 0.55})`;
  }
}

function getMetricLabel(metricField) {
  const labels = {
    count: '关键词数量',
    cost: '花费',
    impression: '曝光量',
    click: '点击量',
    ctr: 'CTR',
    cpc: 'CPC',
    appInteractCost: 'APP互动成本',
    appOpenCost: 'APP打开成本',
    appOrderCost: 'APP订单成本'
  };
  return labels[metricField] || metricField;
}

function formatMetricValue(value, metricField) {
  if (value === 0 || value === undefined || value === null) return '-';
  
  switch (metricField) {
    case 'cost':
    case 'cpc':
    case 'appInteractCost':
    case 'appOpenCost':
    case 'appOrderCost':
      return '¥' + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    case 'ctr':
      return value.toFixed(2) + '%';
    default:
      return value.toLocaleString();
  }
}

// ═══════════════════════════════════════════════════
// 关键词词云模块
// ═══════════════════════════════════════════════════

let wcSelectedL1 = new Set();
let wcSelectedL2 = new Set();
let wcWordcloudInstance = null;

function initWcFilters() {
  const l1Set = new Set(allResults.map(r => r.l1).filter(Boolean));
  const l2Set = new Set(allResults.map(r => r.l2).filter(Boolean));
  wcSelectedL1 = new Set(l1Set);
  wcSelectedL2 = new Set(l2Set);

  const l1Container = document.getElementById('wc-filter-l1');
  l1Container.innerHTML = [...l1Set].sort().map(l1 =>
    `<span class="filter-tag active" data-l1="${escHtml(l1)}" onclick="toggleWcL1(this)">${escHtml(l1)}</span>`
  ).join('');

  updateWcL2Tags();
}

function toggleWcL1(el) {
  const l1 = el.dataset.l1;
  if (wcSelectedL1.has(l1)) {
    wcSelectedL1.delete(l1);
    el.classList.remove('active');
  } else {
    wcSelectedL1.add(l1);
    el.classList.add('active');
  }
  updateWcL2Tags();
  renderWordCloud();
}

function updateWcL2Tags() {
  let availableL2s;
  if (wcSelectedL1.size === 0) {
    availableL2s = new Set();
  } else {
    availableL2s = new Set(
      allResults
        .filter(r => r.l1 && wcSelectedL1.has(r.l1) && r.l2)
        .map(r => r.l2)
    );
  }
  const allL1Set = new Set(allResults.map(r => r.l1).filter(Boolean));
  const isAllSelected = [...allL1Set].every(l1 => wcSelectedL1.has(l1));
  if (isAllSelected) {
    availableL2s = new Set(allResults.map(r => r.l2).filter(Boolean));
  }
  wcSelectedL2 = new Set(availableL2s);
  const l2Container = document.getElementById('wc-filter-l2');
  l2Container.innerHTML = [...availableL2s].sort().map(l2 =>
    `<span class="filter-tag active" data-l2="${escHtml(l2)}" onclick="toggleWcL2(this)">${escHtml(l2)}</span>`
  ).join('') || '<span style="color:#9ca3af;font-size:12px;">（当前业务线下无词包）</span>';
}

function toggleWcL2(el) {
  const l2 = el.dataset.l2;
  if (wcSelectedL2.has(l2)) {
    wcSelectedL2.delete(l2);
    el.classList.remove('active');
  } else {
    wcSelectedL2.add(l2);
    el.classList.add('active');
  }
  renderWordCloud();
}

function clearWcFilters() {
  wcSelectedL1 = new Set(allResults.map(r => r.l1).filter(Boolean));
  wcSelectedL2 = new Set(allResults.map(r => r.l2).filter(Boolean));
  document.querySelectorAll('#wc-filter-l1 .filter-tag').forEach(el => el.classList.add('active'));
  updateWcL2Tags();
  renderWordCloud();
}

function renderWordCloud() {
  const canvas = document.getElementById('wordcloud-canvas');
  const wrap = document.getElementById('wordcloud-wrap');
  const tooltip = document.getElementById('wordcloud-tooltip');
  const metric = document.getElementById('wc-metric-select').value;
  const metricLabel = { cost: '消耗', impression: '展示', click: '点击' }[metric];

  // 根据筛选条件过滤数据
  const filtered = allResults.filter(r =>
    wcSelectedL1.has(r.l1) && wcSelectedL2.has(r.l2)
  );

  // 高清 canvas（处理 Retina 屏幕）
  const dpr = window.devicePixelRatio || 1;
  const width = wrap.offsetWidth;
  const height = wrap.offsetHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  if (filtered.length === 0) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('无匹配关键词', width / 2, height / 2);
    return;
  }

  // 判断是否有对应指标数据
  const hasMetricData = filtered.some(r => r[metric] > 0);

  // 构建词列表：[text, weight, l1, l2, kw]
  const wordMap = {};
  filtered.forEach(r => {
    const kw = r.kw.trim();
    if (!kw) return;
    if (!wordMap[kw]) {
      wordMap[kw] = { text: kw, weight: 0, l1: r.l1, l2: r.l2 };
    }
    wordMap[kw].weight += hasMetricData ? (r[metric] || 1) : 1;
  });

  const wordList = Object.values(wordMap);
  // 词云最多展示 Top 80（按 weight 降序），词过多时全部渲染会 shrinkToFit 缩成一片、字叠字
  const MAX_WORDS = 80;
  wordList.sort((a, b) => b.weight - a.weight);
  const topWords = wordList.slice(0, MAX_WORDS);
  const truncated = wordList.length > MAX_WORDS;

  // 用 log10 缩放处理 weight 极差悬殊（线性归一化会让小词字号被压到最小）
  const minW = Math.max(Math.min(...topWords.map(w => w.weight)), 0);
  const maxW = Math.max(...topWords.map(w => w.weight));
  const minLog = Math.log10(minW + 1);
  const maxLog = Math.log10(maxW + 1);
  const logRange = maxLog - minLog || 1;

  // 构建 wordcloud2 所需格式 [[word, weight], ...]
  const wcData = topWords.map(w => {
    const safeW = Math.max(w.weight, 0);
    const normalized = (Math.log10(safeW + 1) - minLog) / logRange;
    const fontSize = Math.round(20 + normalized * 40);
    const color = L1_META[w.l1] ? L1_META[w.l1].color : '#6b7280';
    return [w.text, fontSize, color, w.l1, w.l2, w.weight];
  });

  // 隐藏 tooltip
  tooltip.style.display = 'none';

  const note = document.getElementById('wc-note');
  const setNote = function(msg) {
    if (note) { note.style.display = ''; note.textContent = msg; }
  };

  // 词太多时提示仅展示 Top 80
  if (truncated) {
    setNote('ℹ️ 共 ' + wordList.length + ' 个关键词，仅展示 ' + metricLabel + ' Top ' + MAX_WORDS + '');
  }

  // 组件未加载时给出明确提示（不再静默空白）
  if (typeof WordCloud === 'undefined') {
    setNote('⚠️ 词云组件未加载成功（CDN 不可用），请检查网络后刷新页面（Cmd/Ctrl+Shift+R）');
    return;
  }

  // 渲染词云
  try {
    WordCloud(canvas, {
      list: wcData.map(item => [item[0], item[1]]),
      // gridSize 12：保留字间距，避免词多时糊成一片
      gridSize: 12 * dpr,
      weightFactor: function(size) { return size * dpr; },
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontWeight: 600,
      color: function(word, weight) {
        const item = wcData.find(d => d[0] === word);
        return item ? item[2] : '#6b7280';
      },
      backgroundColor: 'transparent',
      rotateRatio: 0.3,
      rotationSteps: 2,
      minRotation: -Math.PI / 2,
      maxRotation: Math.PI / 2,
      drawOutOfBound: false,
      shrinkToFit: true,
      shuffle: true,
      hover: function(item, dimension, event) {
        if (item) {
          const wcItem = wcData.find(d => d[0] === item[0]);
          if (wcItem) {
            tooltip.innerHTML = `<b>${escHtml(wcItem[0])}</b><br><span style="opacity:.7">${escHtml(wcItem[3] || '')} · ${escHtml(wcItem[4] || '')}</span><br>${escHtml(metricLabel)}: ${Number(wcItem[5]).toLocaleString()}`;
            tooltip.style.display = 'block';
            tooltip.style.left = (event.offsetX + 12) + 'px';
            tooltip.style.top = (event.offsetY - 50) + 'px';
          }
        } else {
          tooltip.style.display = 'none';
        }
      },
      click: function(item) {
        if (item) {
          const wcItem = wcData.find(d => d[0] === item[0]);
          if (wcItem) {
            document.getElementById('search-box').value = wcItem[0];
            renderTable(1);
            document.querySelector('.card.mb-4:last-child').scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
    // 渲染成功：非截断时隐藏提示
    if (!truncated && note) { note.style.display = 'none'; }
  } catch (e) {
    // wordcloud2 容错（渲染异常给出可见提示，不静默）
    console.warn('词云渲染异常:', e);
    setNote('⚠️ 词云渲染失败：' + e.message);
  }
}

