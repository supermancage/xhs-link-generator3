// ===== LOAD DATA =====
// account_data.json 由 update_data.py 生成；加载失败时降级为空数据（可拖入日结报表）
function loadData() {
  fetch('account_data.json', { cache: 'no-store' })
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) { init(data); })
    .catch(function(e) {
      console.warn('account_data.json 加载失败:', e);
      init({ summary: { reportDate: '--', dateRange: '--' }, accounts: [] });
      showToast('⚠️ 未加载到 account_data.json，请点击「📂 加载新报表」导入');
    });
}
let allAccounts = [];
let transferData = null;
let currentTab = 'all';
let currentSort = { field: 'daysSupported', asc: true };
let charts = {};
let targetDays = 10;            // 调拨天数（可手动调整，localStorage 持久化）
let lastReportDate = '--';
let lastDateRange = '--';

function loadTargetDays() {
  var v = parseInt(localStorage.getItem('rebateTargetDays'));
  return (v && v >= 1 && v <= 60) ? v : 10;
}

// ===== INIT =====
function init(data) {
  allAccounts = data.accounts || [];
  targetDays = loadTargetDays();
  document.getElementById('targetDaysInput').value = targetDays;
  lastReportDate = (data.summary && data.summary.reportDate) || '--';
  lastDateRange = (data.summary && data.summary.dateRange) || '--';
  recomputeAll();
}

// ===== SUMMARY =====
function renderSummary(s) {
  document.getElementById('summaryRow').innerHTML =
    '<div class="summary-card"><div class="icon" style="background:#eef1ff">📋</div><div><div class="value">' + s.totalAccounts + '</div><div class="label">在投账户总数</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--red-bg)">⚠️</div><div><div class="value" style="color:var(--red)">' + s.alertAccounts + '</div><div class="label">不足' + targetDays + '天</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--green-bg)">✅</div><div><div class="value" style="color:var(--green)">' + s.safeAccounts + '</div><div class="label">余额充足</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--orange-bg)">🪫</div><div><div class="value" style="color:var(--orange)">' + s.zeroBalanceAccounts + '</div><div class="label">返货余额为0</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--blue-bg)">💤</div><div><div class="value" style="color:var(--blue)">' + (s.idleAccounts || 0) + '</div><div class="label">闲置余额(无消耗)</div></div></div>';
}

function renderTransferSummary() {
  if (!transferData) return;
  var t = transferData;
  document.getElementById('transferSummary').innerHTML =
    '<div class="transfer-card card-in"><div class="title">📥 需转入总额（' + t.insufficient.length + ' 个账户）</div><div class="amount" style="color:var(--red)">¥' + t.totalNeedIn.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</div><div class="sub">日均返货消耗 × ' + targetDays + '天 - 当前余额</div></div>' +
    '<div class="transfer-card card-out"><div class="title">📤 可转出总额（' + t.sufficient.length + ' 个账户）</div><div class="amount" style="color:var(--green)">¥' + t.totalCanOut.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</div><div class="sub">当前余额 - 日均返货消耗 × ' + targetDays + '天</div></div>' +
    '<div class="transfer-card card-net"><div class="title">' + (t.gap > 0 ? '⚠️ 资金缺口' : '✅ 净盈余') + '</div><div class="amount" style="color:' + (t.gap > 0 ? 'var(--red)' : 'var(--green)') + '">¥' + (t.gap > 0 ? t.gap : t.surplus).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</div><div class="sub">' + (t.gap > 0 ? '转出不足以覆盖，需额外充值' : '可转出完全覆盖转入需求') + '</div></div>';
}

// ===== TABLE =====
function switchTab(tab) {
  currentTab = tab;
  var btns = document.querySelectorAll('.tab-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.tab === tab);
  }
  renderTable();
}

function getTableData() {
  if (currentTab === 'insufficient') return transferData ? transferData.insufficient : [];
  if (currentTab === 'sufficient') return transferData ? transferData.sufficient : [];
  if (currentTab === 'idle') return allAccounts.filter(function(a){ return a.edgeCase === 'idle'; });
  return allAccounts;
}

function getFiltered() {
  var search = (document.getElementById('searchInput').value || '').toLowerCase();
  var list = getTableData().slice();

  if (search) {
    list = list.filter(function(a) {
      return (a.name || '').toLowerCase().indexOf(search) >= 0 ||
             (a.id || '').toLowerCase().indexOf(search) >= 0 ||
             (a.agent || '').toLowerCase().indexOf(search) >= 0;
    });
  }

  var f = currentSort.field;
  list.sort(function(a, b) {
    var va = a[f] != null ? a[f] : 0;
    var vb = b[f] != null ? b[f] : 0;
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va < vb) return currentSort.asc ? -1 : 1;
    if (va > vb) return currentSort.asc ? 1 : -1;
    return 0;
  });

  return list;
}

function sortTable(field) {
  if (currentSort.field === field) {
    currentSort.asc = !currentSort.asc;
  } else {
    currentSort.field = field;
    currentSort.asc = (field === 'daysSupported' || field === 'transferAmount');
  }
  renderTable();
}

// 用于 innerHTML 插值的转义函数：对 & < > " ' 五字符全部转义，浏览器显示时自动还原为原文
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTable() {
  var filtered = getFiltered();
  var isTransfer = currentTab === 'insufficient' || currentTab === 'sufficient';
  var isIdle = currentTab === 'idle';
  document.getElementById('tableStats').textContent = '显示 ' + filtered.length + ' / ' + allAccounts.length + ' 个账户';

  var headHTML, bodyHTML = '';
  var i, a, days, daysStr, rowClass, statusHtml, amt, isIn, absAmt;

  if (isIdle) {
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th style="text-align:right">建议转出金额</th>' +
      '</tr>';
    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      bodyHTML += '<tr class="row-alert">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell" style="font-weight:600">¥' + (a.rebateBalance || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell neg">-¥' + (a.rebateBalance || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '</tr>';
    }
  } else if (isTransfer) {
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyRebateSpend" onclick="sortTable(\'dailyRebateSpend\')" style="text-align:right">日均返货消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">当前返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="transferAmount" onclick="sortTable(\'transferAmount\')" style="text-align:right">' + (currentTab === 'insufficient' ? '建议转入金额' : '建议转出金额') + ' <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="daysSupported" onclick="sortTable(\'daysSupported\')" style="text-align:right">调拨后可支撑 <span class="sort-icon">⇅</span></th>' +
      '</tr>';

    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      amt = a.transferAmount || 0;
      isIn = currentTab === 'insufficient';
      absAmt = Math.abs(amt);
      rowClass = isIn ? 'row-alert' : (a.edgeCase === 'idle' ? 'row-alert' : '');
      bodyHTML += '<tr class="' + rowClass + '">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) + (a.edgeCase === 'idle' ? ' <span class="badge badge-info" style="font-size:9px">💤闲置</span>' : '') + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell">¥' + ((a.calcRebateSpend || a.dailyRebateSpend) || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + (a.edgeCase === 'estimated' ? ' <span style="font-size:10px;color:var(--orange)">(估算)</span>' : '') + '</td>' +
        '<td class="num-cell">¥' + (a.rebateBalance || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell ' + (isIn ? 'pos' : 'neg') + '">' + (isIn ? '+' : '-') + '¥' + absAmt.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell" style="color:var(--green);font-weight:600">' + targetDays + '.0 天</td>' +
        '</tr>';
    }
  } else {
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyAvgSpend" onclick="sortTable(\'dailyAvgSpend\')" style="text-align:right">日均消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyRebateSpend" onclick="sortTable(\'dailyRebateSpend\')" style="text-align:right">日均返货消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">普通返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="daysSupported" onclick="sortTable(\'daysSupported\')" style="text-align:right">可支撑天数 <span class="sort-icon">⇅</span></th>' +
      '<th style="text-align:center">状态</th>' +
      '</tr>';

    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      days = a.daysSupported || 0;
      daysStr = days >= 999999 ? '∞' : days.toFixed(1);
      rowClass = '';
      if (a.rebateBalance === 0 && a.dailyRebateSpend > 0) {
        rowClass = 'row-alert';
        statusHtml = '<span class="badge badge-danger">🔴 余额为0</span>';
      } else if (days < 5) {
        rowClass = 'row-alert';
        statusHtml = '<span class="badge badge-danger">🔴 严重不足</span>';
      } else if (days < targetDays) {
        rowClass = 'row-alert';
        statusHtml = '<span class="badge badge-warning">🟡 不足</span>';
      } else if (days >= 999999) {
        if (a.edgeCase === 'idle') {
          statusHtml = '<span class="badge badge-info">💤 闲置余额</span>';
        } else if (a.edgeCase === 'estimated') {
          statusHtml = '<span class="badge badge-info">🔶 按10%估算</span>';
        } else {
          statusHtml = '<span class="badge badge-info">🔵 无消耗</span>';
        }
      } else {
        statusHtml = '<span class="badge badge-success">🟢 充足</span>';
      }

      bodyHTML += '<tr class="' + rowClass + '">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell">¥' + (a.dailyAvgSpend || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell">¥' + (a.dailyRebateSpend || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell">¥' + (a.rebateBalance || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell" style="font-weight:600;color:' + (days < targetDays ? 'var(--red)' : days < targetDays * 1.5 ? 'var(--orange)' : 'var(--green)') + '">' + daysStr + ' 天</td>' +
        '<td style="text-align:center">' + statusHtml + '</td>' +
        '</tr>';
    }
  }

  document.getElementById('tableHead').innerHTML = headHTML;
  document.getElementById('tableBody').innerHTML = bodyHTML;

  var ths = document.querySelectorAll('thead th');
  for (i = 0; i < ths.length; i++) {
    ths[i].classList.toggle('sorted', ths[i].dataset.sort === currentSort.field);
  }
}

// ===== CHARTS =====
function renderCharts() {
  try {
    // --- Chart 1: Days Distribution ---
    var T = targetDays;
    var halfT = Math.round(T / 2);
    var ranges = [
      { label: '余额=0', min: -1, max: 0, color: '#e74c3c' },
      { label: '< ' + halfT + '天', min: 0.01, max: halfT, color: '#e74c3c' },
      { label: halfT + '-' + T + '天', min: halfT, max: T, color: '#f39c12' },
      { label: T + '-' + (2*T) + '天', min: T, max: 2*T, color: '#3498db' },
      { label: (2*T) + '-' + (5*T) + '天', min: 2*T, max: 5*T, color: '#27ae60' },
      { label: (5*T) + '天+', min: 5*T, max: 999998, color: '#6c5ce7' },
      { label: '无消耗', min: 999999, max: Infinity, color: '#95a5a6' }
    ];

    var distData = [];
    for (var ri = 0; ri < ranges.length; ri++) {
      var r = ranges[ri];
      var count = 0;
      for (var ai = 0; ai < allAccounts.length; ai++) {
        var a = allAccounts[ai];
        if (r.label === '余额=0') {
          if (a.rebateBalance === 0 && a.dailyRebateSpend > 0) count++;
        } else if (r.label === '无消耗') {
          if (a.daysSupported >= 999999) count++;
        } else {
          if (a.daysSupported > r.min && a.daysSupported <= r.max) count++;
        }
      }
      distData.push(count);
    }

    var labels = ranges.map(function(r) { return r.label; });
    var bgColors = ranges.map(function(r) { return r.color + '99'; });
    var bdColors = ranges.map(function(r) { return r.color; });

    var ctx1 = document.getElementById('daysChart');
    if (!ctx1) { console.error('daysChart canvas not found'); return; }
    var cctx1 = ctx1.getContext('2d');
    if (charts.daysChart) charts.daysChart.destroy();

    charts.daysChart = new Chart(cctx1, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '账户数',
          data: distData,
          backgroundColor: bgColors,
          borderColor: bdColors,
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0 },
            title: { display: true, text: '账户数' }
          }
        }
      }
    });

    // --- Chart 2: Transfer Overview ---
    if (!transferData) return;

    var topIn = transferData.insufficient.slice(0, 10);
    var topOut = transferData.sufficient.slice(0, 10);

    var tLabels = [];
    var tValues = [];
    var tBg = [];
    var tBd = [];

    for (var ti = 0; ti < topIn.length; ti++) {
      var name = topIn[ti].name;
      tLabels.push('📥 ' + (name.length > 16 ? name.substring(0,15) + '…' : name));
      tValues.push(topIn[ti].transferAmount);
      tBg.push('#e74c3c99');
      tBd.push('#e74c3c');
    }
    for (var to = 0; to < topOut.length; to++) {
      var oname = topOut[to].name;
      tLabels.push('📤 ' + (oname.length > 16 ? oname.substring(0,15) + '…' : oname));
      tValues.push(-Math.abs(topOut[to].transferAmount));
      tBg.push('#27ae6099');
      tBd.push('#27ae60');
    }

    var ctx2 = document.getElementById('transferChart');
    if (!ctx2) { console.error('transferChart canvas not found'); return; }
    var cctx2 = ctx2.getContext('2d');
    if (charts.transferChart) charts.transferChart.destroy();

    charts.transferChart = new Chart(cctx2, {
      type: 'bar',
      data: {
        labels: tLabels,
        datasets: [{
          label: '金额',
          data: tValues,
          backgroundColor: tBg,
          borderColor: tBd,
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                var v = ctx.raw;
                return (v > 0 ? '需转入' : '可转出') + ': ¥' + Math.abs(v).toLocaleString();
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: '金额 (¥)' },
            ticks: { callback: function(v) { return '¥' + (v/1000).toFixed(0) + 'k'; } }
          }
        }
      }
    });

    console.log('Charts rendered: days=' + distData + ', transfer bars=' + tLabels.length);

  } catch(e) {
    console.error('Chart render error:', e);
  }
}

// ===== TARGET DAYS (调拨天数可手动调整) =====
function isAlertAccount(a, T) {
  if (a.edgeCase === 'idle') return false;
  var rb = a.edgeCase === 'estimated' ? (a.estimatedRebateSpend || a.dailyRebateSpend || 0) : (a.dailyRebateSpend || 0);
  if (rb <= 0) return false;
  return (a.rebateBalance || 0) / rb < T;
}

function computeTransfer(accounts, T) {
  var insuf = [], suf = [];
  accounts.forEach(function(a) {
    var edge = a.edgeCase;
    var balance = a.rebateBalance;

    // 闲置账户：全额转出，优先
    if (edge === 'idle') {
      if (balance > 0) suf.push({ name: a.name, id: a.id, agent: a.agent, dailyRebateSpend: 0, rebateBalance: balance, targetBalance: 0, transferAmount: -balance, daysSupported: a.daysSupported, edgeCase: 'idle' });
      return;
    }

    // estimated：JSON 数据 dailyRebateSpend 即估算值；前端拖文件数据用 estimatedRebateSpend
    var calcRb = edge === 'estimated' ? (a.estimatedRebateSpend || a.dailyRebateSpend || 0) : (a.dailyRebateSpend || 0);
    if (calcRb <= 0 || (edge === null && a.daysSupported >= 999999)) return;

    var target = calcRb * T;
    var diff = Math.round((target - balance) * 100) / 100;
    var entry = { name: a.name, id: a.id, agent: a.agent, dailyRebateSpend: a.dailyRebateSpend, rebateBalance: balance, targetBalance: Math.round(target*100)/100, transferAmount: diff, daysSupported: a.daysSupported, edgeCase: edge, calcRebateSpend: Math.round(calcRb*100)/100 };
    if (diff > 0) insuf.push(entry);
    else if (diff < 0) suf.push(entry);
  });
  insuf.sort(function(a, b) { return b.transferAmount - a.transferAmount; });
  var idleSuf = suf.filter(function(a) { return a.edgeCase === 'idle'; }).sort(function(a, b) { return b.rebateBalance - a.rebateBalance; });
  var normalSuf = suf.filter(function(a) { return a.edgeCase !== 'idle'; }).sort(function(a, b) { return a.transferAmount - b.transferAmount; });
  suf = idleSuf.concat(normalSuf);

  var totalNeed = insuf.reduce(function(s, a) { return s + a.transferAmount; }, 0);
  var totalCan = Math.abs(suf.reduce(function(s, a) { return s + a.transferAmount; }, 0));

  return {
    targetDays: T, insufficient: insuf, sufficient: suf,
    totalNeedIn: Math.round(totalNeed*100)/100,
    totalCanOut: Math.round(totalCan*100)/100,
    gap: Math.round(Math.max(totalNeed - totalCan, 0)*100)/100,
    surplus: Math.round(Math.max(totalCan - totalNeed, 0)*100)/100
  };
}

function computeSummary(accounts, T) {
  var alertCnt = 0, zero = 0, idleCnt = 0;
  accounts.forEach(function(a) {
    if (isAlertAccount(a, T)) alertCnt++;
    if (a.rebateBalance === 0) zero++;
    if (a.edgeCase === 'idle') idleCnt++;
  });
  return {
    totalAccounts: accounts.length,
    alertAccounts: alertCnt,
    safeAccounts: accounts.length - alertCnt,
    zeroBalanceAccounts: zero,
    idleAccounts: idleCnt,
    reportDate: lastReportDate,
    dateRange: lastDateRange
  };
}

function renderDashboard() {
  var s = computeSummary(allAccounts, targetDays);
  document.getElementById('reportDate').textContent = s.reportDate;
  document.getElementById('dateRange').textContent = s.dateRange;
  document.getElementById('targetDaysLabel').textContent = targetDays;
  document.getElementById('targetDaysFooter').textContent = targetDays;
  document.getElementById('countAll').textContent = '(' + s.totalAccounts + ')';
  document.getElementById('countIn').textContent = transferData ? '(' + transferData.insufficient.length + ')' : '(0)';
  document.getElementById('countOut').textContent = transferData ? '(' + transferData.sufficient.length + ')' : '(0)';
  document.getElementById('countIdle').textContent = '(' + s.idleAccounts + ')';
  renderSummary(s);
  renderTransferSummary();
  renderTable();
  if (typeof Chart !== 'undefined') renderCharts();
}

function recomputeAll() {
  transferData = computeTransfer(allAccounts, targetDays);
  renderDashboard();
}

function updateTargetDays() {
  var v = parseInt(document.getElementById('targetDaysInput').value);
  if (!v || v < 1) v = 1;
  if (v > 60) v = 60;
  targetDays = v;
  document.getElementById('targetDaysInput').value = v;
  localStorage.setItem('rebateTargetDays', String(v));
  recomputeAll();
  showToast('✅ 调拨天数已调整为 ' + v + ' 天，转入/转出建议已重新计算');
}

// ===== LOAD NEW FILE =====
function loadNewFile(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rawData = XLSX.utils.sheet_to_json(ws);

      var accountMap = new Map();
      var allDates = new Set();
      rawData.forEach(function(row) {
        var accId = row['账户ID']; if (!accId) return;
        var spend = parseFloat(row['账户总消耗']) || 0;

        var dateStr = String(row['日期']); allDates.add(dateStr);
        var key = row['账户名称'] + '|' + accId;
        if (!accountMap.has(key)) {
          accountMap.set(key, {
            name: row['账户名称'] || '', id: accId,
            type: row['账户类型'] || '', entity: row['主体名称'] || '',
            agent: row['所属代理商'] || '',
            dates: new Set(), totalSpend: 0, totalRebateSpend: 0,
            latestRebateBalance: 0, latestDate: '', latestRow: null
          });
        }
        var acc = accountMap.get(key);
        acc.dates.add(dateStr); acc.totalSpend += spend;
        acc.totalRebateSpend += parseFloat(row['账户消耗-普通返货']) || 0;
        if (dateStr >= acc.latestDate) {
          acc.latestDate = dateStr;
          acc.latestRebateBalance = parseFloat(row['普通返货余额']) || 0;
          acc.latestRow = row;
        }
      });

      var accounts = [];
      accountMap.forEach(function(acc) {
        var numDays = acc.dates.size;
        var dailyAvg = numDays > 0 ? acc.totalSpend / numDays : 0;
        var dailyRebate = numDays > 0 ? acc.totalRebateSpend / numDays : 0;
        var edgeCase = null;

        // 无消耗但有返货余额 → 闲置
        if (acc.totalSpend === 0) {
          if (acc.latestRebateBalance > 0) {
            accounts.push({
              name: acc.name, id: acc.id, type: acc.type, entity: acc.entity, agent: acc.agent,
              statsDays: 0, totalSpend: 0, dailyAvgSpend: 0,
              dailyRebateSpend: 0, totalRebateSpend: 0, estimatedRebateSpend: 0,
              rebateBalance: Math.round(acc.latestRebateBalance * 100) / 100,
              daysSupported: 999999, latestDate: acc.latestDate,
              alert: false, edgeCase: 'idle'
            });
          }
          return;
        }

        // 有消耗但返货消耗为0 → 估算（按10%）
        var calcRebate = dailyRebate;
        var displayRebate = dailyRebate;
        if (dailyRebate === 0 && acc.totalSpend > 0) {
          calcRebate = dailyAvg * 0.10;
          displayRebate = 0;
          edgeCase = 'estimated';
        }

        var effectiveRebate = edgeCase === 'estimated' ? calcRebate : dailyRebate;
        var daysSupported = effectiveRebate > 0 ? acc.latestRebateBalance / effectiveRebate : 999999;
        var daysDisplay = edgeCase === 'estimated' ? 999999 : daysSupported;

        accounts.push({
          name: acc.name, id: acc.id, type: acc.type, entity: acc.entity, agent: acc.agent,
          statsDays: numDays,
          totalSpend: Math.round(acc.totalSpend * 100) / 100,
          dailyAvgSpend: Math.round(dailyAvg * 100) / 100,
          dailyRebateSpend: Math.round(displayRebate * 100) / 100,
          totalRebateSpend: Math.round(acc.totalRebateSpend * 100) / 100,
          estimatedRebateSpend: edgeCase === 'estimated' ? Math.round(calcRebate * 100) / 100 : 0,
          rebateBalance: Math.round(acc.latestRebateBalance * 100) / 100,
          daysSupported: daysDisplay >= 999999 ? 999999 : Math.round(daysDisplay * 10) / 10,
          latestDate: acc.latestDate,
          alert: daysSupported < targetDays,
          edgeCase: edgeCase
        });
      });
      accounts.sort(function(a, b) { return a.daysSupported - b.daysSupported; });

      allAccounts = accounts;
      lastReportDate = accounts[0] ? accounts[0].latestDate : '--';
      lastDateRange = allDates.size + '天数据（手动导入）';
      transferData = computeTransfer(accounts, targetDays);
      renderDashboard();
      showToast('✅ 成功加载 ' + accounts.length + ' 个账户数据');
    } catch(err) {
      showToast('❌ 文件解析失败：' + err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===== EXPORT =====
function exportCSV() {
  var filtered = getFiltered();
  var isTransfer = currentTab === 'insufficient' || currentTab === 'sufficient';

  var headers, rows;
  if (currentTab === 'idle') {
    headers = ['账户名称', '账户ID', '代理商', '返货余额', '建议转出金额'];
    rows = filtered.map(function(a) {
      return [a.name, a.id, a.agent || '', (a.rebateBalance || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2)];
    });
  } else if (isTransfer) {
    headers = ['账户名称', '账户ID', '代理商', '日均返货消耗', '当前返货余额', currentTab === 'insufficient' ? '建议转入金额' : '建议转出金额', '调拨后可支撑天数'];
    rows = filtered.map(function(a) {
      return [a.name, a.id, a.agent || '', (a.dailyRebateSpend || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2), Math.abs(a.transferAmount || 0).toFixed(2), String(targetDays)];
    });
  } else {
    headers = ['账户名称', '账户ID', '代理商', '日均消耗', '日均返货消耗', '普通返货余额', '可支撑天数', '状态'];
    rows = filtered.map(function(a) {
      var status = a.daysSupported < 5 ? '严重不足' : a.daysSupported < targetDays ? '不足' : a.daysSupported >= 999999 ? (a.edgeCase === 'idle' ? '闲置余额' : a.edgeCase === 'estimated' ? '按10%估算' : '无消耗') : '充足';
      return [a.name, a.id, a.agent || '', (a.dailyAvgSpend || 0).toFixed(2), (a.dailyRebateSpend || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2), a.daysSupported >= 999999 ? '∞' : (a.daysSupported || 0).toFixed(1), status];
    });
  }

  var BOM = '\uFEFF';
  var csv = BOM + [headers].concat(rows).map(function(r) { return r.map(function(c) { return '"' + c + '"'; }).join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '返货余额调拨建议_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg) {
  var toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;background:#333;color:#fff;border-radius:8px;font-size:14px;z-index:9999;transition:opacity 0.3s;opacity:0;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  setTimeout(function() { toast.style.opacity = '0'; }, 2500);
}

// ===== START =====
loadData();
