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
// 金额缩写：≥1万 → ¥26.5万，否则带千分位
function fmtMoney(v) {
  v = v || 0;
  if (Math.abs(v) >= 10000) return '¥' + (v / 10000).toFixed(1) + '万';
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
}

function renderSummary(s) {
  document.getElementById('summaryRow').innerHTML =
    '<div class="summary-card"><div class="icon" style="background:#eef1ff">📋</div><div><div class="value">' + s.totalAccounts + '</div><div class="label">在投账户总数</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--red-bg)">⚠️</div><div><div class="value" style="color:var(--red)">' + s.alertAccounts + '</div><div class="label">普通返货不足' + targetDays + '天</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--green-bg)">✅</div><div><div class="value" style="color:var(--green)">' + s.safeAccounts + '</div><div class="label">普通返货充足</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--orange-bg)">🪫</div><div><div class="value" style="color:var(--orange)">' + s.zeroBalanceAccounts + '</div><div class="label">普通返货余额为0</div></div></div>' +
    '<div class="summary-card"><div class="icon" style="background:var(--blue-bg)">💤</div><div><div class="value" style="color:var(--blue)">' + (s.idleAccounts || 0) + '</div><div class="label">闲置余额(无消耗)</div></div></div>' +
    '<div class="summary-card" title="赔付返货不可抵扣消耗，只能转账/提现 ⇒ 全额计入「可转出」侧"><div class="icon" style="background:#f3e8ff">💸</div><div><div class="value" style="color:#8e44ad;font-size:22px">' + fmtMoney(s.totalPayoutBalance || 0) + '</div><div class="label">赔付返货余额（' + (s.payoutBalanceAccounts || 0) + ' 户）</div></div></div>';
}

function renderTransferSummary() {
  if (!transferData) return;
  var t = transferData;
  var nOut = t.totalNormalOut || 0, pOut = t.totalPayoutOut || 0;
  var money = function(v) { return '¥' + v.toLocaleString('zh-CN',{minimumFractionDigits:2}); };
  document.getElementById('transferSummary').innerHTML =
    '<div class="transfer-card card-in"><div class="title">📥 需转入总额（' + t.insufficient.length + ' 个账户）</div><div class="amount" style="color:var(--red)">' + money(t.totalNeedIn) + '</div><div class="sub">日均普通返货消耗 × ' + targetDays + '天 - 普通返货余额<br>（赔付返货不可抵扣消耗，不参与缺口）</div></div>' +
    '<div class="transfer-card card-out"><div class="title">📤 可转出总额（' + t.sufficient.length + ' 个账户）</div><div class="amount" style="color:var(--green)">' + money(t.totalCanOut) + '</div><div class="sub">普通返货盈余 ' + money(nOut) + ' ＋ 赔付返货余额 ' + money(pOut) + '</div></div>' +
    '<div class="transfer-card card-net"><div class="title">' + (t.gap > 0 ? '⚠️ 资金缺口' : '✅ 净盈余') + '</div><div class="amount" style="color:' + (t.gap > 0 ? 'var(--red)' : 'var(--green)') + '">' + money(t.gap > 0 ? t.gap : t.surplus) + '</div><div class="sub">仅按普通返货口径：盈余 ' + money(nOut) + ' - 需转入 ' + money(t.totalNeedIn) + '<br>' + (t.gap > 0 ? '普通返货转出不足覆盖，需额外充值' : '普通返货盈余完全覆盖转入需求') + '</div></div>';
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
  var isIn = currentTab === 'insufficient';
  var isOut = currentTab === 'sufficient';
  var isIdle = currentTab === 'idle';

  // ⚠️「闲置余额」是「可转出」的子集（闲置账户的钱全额计入可转出）
  // ⇒ 在同一行计数旁把两者关系写清楚，避免看起来像重复统计
  var statsTxt = '显示 ' + filtered.length + ' / ' + allAccounts.length + ' 个账户';
  var sufAll = transferData ? transferData.sufficient : [];
  if (isIdle) {
    var idleAllN = allAccounts.filter(function(x) { return x.edgeCase === 'idle'; }).length;
    statsTxt += '　｜　💤闲置 = 无消耗账户的余额，属于「可转出」的子集（' + idleAllN + ' / ' + sufAll.length + ' 户）';
  } else if (isOut) {
    var idleInSufN = sufAll.filter(function(x) { return x.edgeCase === 'idle'; }).length;
    statsTxt += '　｜　= 💤闲置 ' + idleInSufN + ' 户 ＋ 在投账户盈余 ' + (sufAll.length - idleInSufN) + ' 户';
  }
  document.getElementById('tableStats').textContent = statsTxt;

  var headHTML, bodyHTML = '';
  var i, a, days, daysStr, rowClass, statusHtml, amt, absAmt;
  var num = function(v) { return '¥' + (v || 0).toLocaleString('zh-CN', {minimumFractionDigits:2}); };
  var numDim = function(v) { return (v > 0) ? num(v) : '<span style="color:#c0c4cc">—</span>'; };

  if (isIdle) {
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">普通返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="payoutBalance" onclick="sortTable(\'payoutBalance\')" style="text-align:right">赔付返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="totalBalance" onclick="sortTable(\'totalBalance\')" style="text-align:right">建议转出合计 <span class="sort-icon">⇅</span></th>' +
      '</tr>';
    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      var idleTotal = (a.rebateBalance || 0) + (a.payoutBalance || 0);
      bodyHTML += '<tr class="row-alert">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell" style="font-weight:600">' + num(a.rebateBalance) + '</td>' +
        '<td class="num-cell" style="font-weight:600;color:#8e44ad">' + numDim(a.payoutBalance) + '</td>' +
        '<td class="num-cell neg">-¥' + idleTotal.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '</tr>';
    }
  } else if (isIn) {
    // 需转入：只按普通返货缺口算（赔付返货不可抵扣消耗，不参与转入）
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyRebateSpend" onclick="sortTable(\'dailyRebateSpend\')" style="text-align:right">日均返货消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">普通返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="payoutBalance" onclick="sortTable(\'payoutBalance\')" style="text-align:right">赔付返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="transferAmount" onclick="sortTable(\'transferAmount\')" style="text-align:right">建议转入金额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="daysSupported" onclick="sortTable(\'daysSupported\')" style="text-align:right">调拨后可支撑 <span class="sort-icon">⇅</span></th>' +
      '</tr>';

    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      absAmt = Math.abs(a.transferAmount || 0);
      bodyHTML += '<tr class="row-alert">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) + ((a.payoutBalance || 0) > 0 ? ' <span class="badge badge-info" style="font-size:9px">💸赔付可转出</span>' : '') + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell">¥' + ((a.calcRebateSpend || a.dailyRebateSpend) || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + (a.edgeCase === 'estimated' ? ' <span style="font-size:10px;color:var(--orange)">(估算)</span>' : '') + '</td>' +
        '<td class="num-cell">' + num(a.rebateBalance) + '</td>' +
        '<td class="num-cell" style="color:#8e44ad">' + numDim(a.payoutBalance) + '</td>' +
        '<td class="num-cell pos">+¥' + absAmt.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell" style="color:var(--green);font-weight:600">' + targetDays + '.0 天</td>' +
        '</tr>';
    }
  } else if (isOut) {
    // 可转出：普通返货盈余 + 赔付返货余额（全额），拆分展示
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyRebateSpend" onclick="sortTable(\'dailyRebateSpend\')" style="text-align:right">日均返货消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">普通返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="payoutBalance" onclick="sortTable(\'payoutBalance\')" style="text-align:right">赔付返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="normalOut" onclick="sortTable(\'normalOut\')" style="text-align:right">普通返货可转出 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="payoutOut" onclick="sortTable(\'payoutOut\')" style="text-align:right">赔付可转出 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="transferAmount" onclick="sortTable(\'transferAmount\')" style="text-align:right">转出合计 <span class="sort-icon">⇅</span></th>' +
      '</tr>';

    for (i = 0; i < filtered.length; i++) {
      a = filtered[i];
      amt = Math.abs(a.transferAmount || 0);
      rowClass = (a.edgeCase === 'idle' && (a.rebateBalance || 0) > 0) ? 'row-alert' : '';
      bodyHTML += '<tr class="' + rowClass + '">' +
        '<td><div class="name-cell" title="' + esc(a.name) + '">' + esc(a.name) +
          (a.edgeCase === 'idle' ? ' <span class="badge badge-info" style="font-size:9px">💤闲置</span>' : '') +
          (a.edgeCase === 'estimated' ? ' <span class="badge badge-warning" style="font-size:9px">🔶估算</span>' : '') + '</div></td>' +
        '<td>' + esc(a.agent || '') + '</td>' +
        '<td class="num-cell">¥' + ((a.calcRebateSpend || a.dailyRebateSpend) || 0).toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '<td class="num-cell">' + num(a.rebateBalance) + '</td>' +
        '<td class="num-cell" style="color:#8e44ad;font-weight:600">' + numDim(a.payoutBalance) + '</td>' +
        '<td class="num-cell">' + numDim(a.normalOut) + '</td>' +
        '<td class="num-cell" style="color:#8e44ad">' + numDim(a.payoutOut) + '</td>' +
        '<td class="num-cell neg">-¥' + amt.toLocaleString('zh-CN',{minimumFractionDigits:2}) + '</td>' +
        '</tr>';
    }
  } else {
    headHTML = '<tr>' +
      '<th data-sort="name" onclick="sortTable(\'name\')">账户名称 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="agent" onclick="sortTable(\'agent\')">代理商 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyAvgSpend" onclick="sortTable(\'dailyAvgSpend\')" style="text-align:right">日均消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="dailyRebateSpend" onclick="sortTable(\'dailyRebateSpend\')" style="text-align:right">日均返货消耗 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="rebateBalance" onclick="sortTable(\'rebateBalance\')" style="text-align:right">普通返货余额 <span class="sort-icon">⇅</span></th>' +
      '<th data-sort="payoutBalance" onclick="sortTable(\'payoutBalance\')" style="text-align:right">赔付返货余额 <span class="sort-icon">⇅</span></th>' +
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
        '<td class="num-cell">' + num(a.dailyAvgSpend) + '</td>' +
        '<td class="num-cell">' + num(a.dailyRebateSpend) + '</td>' +
        '<td class="num-cell">' + num(a.rebateBalance) + '</td>' +
        '<td class="num-cell" style="color:#8e44ad">' + numDim(a.payoutBalance) + '</td>' +
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

// 与 Python 内置 round(x, 2) 对齐（银行家舍入：恰好 .5 时取偶），
// 保证「上传 Excel 现场计算」与「update_data.py 生成 account_data.json」两套结果逐分一致
function r2(v) {
  var x = (v || 0) * 100;
  var fl = Math.floor(x);
  var d = x - fl;
  if (Math.abs(d - 0.5) < 1e-9) return (fl % 2 === 0 ? fl : fl + 1) / 100;
  return Math.round(x) / 100;
}

function computeTransfer(accounts, T) {
  var insuf = [], suf = [];
  accounts.forEach(function(a) {
    var edge = a.edgeCase;
    var balance = a.rebateBalance || 0;
    var pbal = a.payoutBalance || 0;   // 赔付返货余额：不可抵扣消耗 ⇒ 全额计入可转出

    // 闲置账户：普通 + 赔付全额转出，优先
    if (edge === 'idle') {
      if (balance + pbal > 0) suf.push({
        name: a.name, id: a.id, agent: a.agent, dailyRebateSpend: 0, rebateBalance: r2(balance),
        payoutBalance: r2(pbal), targetBalance: 0,
        normalOut: r2(balance), payoutOut: r2(pbal), transferAmount: -r2(balance + pbal),
        daysSupported: a.daysSupported, edgeCase: 'idle', calcRebateSpend: 0
      });
      return;
    }

    // estimated：JSON 数据 dailyRebateSpend 即估算值；前端拖文件数据用 estimatedRebateSpend
    var calcRb = edge === 'estimated' ? (a.estimatedRebateSpend || a.dailyRebateSpend || 0) : (a.dailyRebateSpend || 0);
    if (calcRb <= 0 && pbal <= 0) return;

    // 目标水位只针对普通返货；赔付返货不设水位（全额可转出）
    // target 用未舍入值参与差额计算 ⇒ 与 update_data.py 口径逐分一致
    var targetRaw = calcRb * T;
    var target = r2(targetRaw);
    var needIn = r2(targetRaw - balance);
    var normalOut = r2(Math.max(balance - targetRaw, 0));
    var payoutOut = r2(pbal);
    var base = { name: a.name, id: a.id, agent: a.agent, dailyRebateSpend: a.dailyRebateSpend,
                 rebateBalance: r2(balance), payoutBalance: r2(pbal), targetBalance: target,
                 daysSupported: a.daysSupported, edgeCase: edge, calcRebateSpend: r2(calcRb) };

    // 同一账户可同时进两侧：普通返货缺口走转入，赔付余额走转出（两笔钱性质不同）
    if (needIn > 0) insuf.push(Object.assign({}, base, { normalOut: 0, payoutOut: payoutOut, transferAmount: needIn }));
    if (normalOut + payoutOut > 0) suf.push(Object.assign({}, base, { normalOut: normalOut, payoutOut: payoutOut, transferAmount: -r2(normalOut + payoutOut) }));
  });
  insuf.sort(function(a, b) { return b.transferAmount - a.transferAmount; });
  var idleSuf = suf.filter(function(a) { return a.edgeCase === 'idle'; }).sort(function(a, b) { return (b.rebateBalance + b.payoutBalance) - (a.rebateBalance + a.payoutBalance); });
  var normalSuf = suf.filter(function(a) { return a.edgeCase !== 'idle'; }).sort(function(a, b) { return (b.normalOut + b.payoutOut) - (a.normalOut + a.payoutOut); });
  suf = idleSuf.concat(normalSuf);

  var totalNeed = 0, totalNormalOut = 0, totalPayoutOut = 0;
  insuf.forEach(function(a) { totalNeed += a.transferAmount; });
  suf.forEach(function(a) { totalNormalOut += a.normalOut; totalPayoutOut += a.payoutOut; });
  var totalCan = totalNormalOut + totalPayoutOut;

  return {
    targetDays: T, insufficient: insuf, sufficient: suf,
    totalNeedIn: r2(totalNeed),
    totalNormalOut: r2(totalNormalOut),
    totalPayoutOut: r2(totalPayoutOut),
    totalCanOut: r2(totalCan),
    // 净额只看普通返货盈余 —— 赔付返货不可抵扣消耗，不能覆盖缺口
    gap: r2(Math.max(totalNeed - totalNormalOut, 0)),
    surplus: r2(Math.max(totalNormalOut - totalNeed, 0))
  };
}

function computeSummary(accounts, T) {
  var alertCnt = 0, zero = 0, idleCnt = 0, payoutCnt = 0, payoutTotal = 0;
  accounts.forEach(function(a) {
    if (isAlertAccount(a, T)) alertCnt++;
    if (a.rebateBalance === 0) zero++;
    if (a.edgeCase === 'idle') idleCnt++;
    var pb = a.payoutBalance || 0;
    if (pb > 0) { payoutCnt++; payoutTotal += pb; }
  });
  return {
    totalAccounts: accounts.length,
    alertAccounts: alertCnt,
    safeAccounts: accounts.length - alertCnt,
    zeroBalanceAccounts: zero,
    idleAccounts: idleCnt,
    payoutBalanceAccounts: payoutCnt,
    totalPayoutBalance: r2(payoutTotal),
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
// Excel 解析库按需加载（不阻塞首屏、不依赖外网 CDN）。
// 两套部署环境共用同一份代码，按顺序回退：
//   ① GitHub Pages：同目录 xlsx.full.min.js
//   ② 内网机 /tools/rebate-monitor/：复用 /tools/_vendor/xlsx-0.18.5.full.min.js
var _xlsxLoading = null;
var XLSX_PATHS = ['xlsx.full.min.js', '../_vendor/xlsx-0.18.5.full.min.js'];

function ensureXLSX() {
  if (typeof XLSX !== 'undefined') return Promise.resolve();
  if (_xlsxLoading) return _xlsxLoading;
  _xlsxLoading = new Promise(function(resolve, reject) {
    var idx = 0;
    function tryNext() {
      if (idx >= XLSX_PATHS.length) {
        _xlsxLoading = null;
        reject(new Error('已试过 ' + XLSX_PATHS.join(' / ') + '，均加载失败'));
        return;
      }
      var s = document.createElement('script');
      s.src = XLSX_PATHS[idx++];
      s.onload = function() { if (typeof XLSX !== 'undefined') { resolve(); } else { tryNext(); } };
      s.onerror = function() { tryNext(); };
      document.head.appendChild(s);
    }
    tryNext();
  });
  return _xlsxLoading;
}

function loadNewFile(event) {
  var file = event.target.files[0];
  if (!file) return;
  var input = event.target;
  showToast('⏳ 正在解析报表…');
  ensureXLSX().then(function() {
    parseReportFile(file, input);
  }).catch(function(err) {
    input.value = '';
    showToast('❌ Excel 解析库加载失败：' + err.message);
    console.error(err);
  });
}

function parseReportFile(file, input) {
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
            dates: new Set(), spendDates: new Set(), totalSpend: 0, totalRebateSpend: 0, totalPayoutSpend: 0,
            latestRebateBalance: 0, latestPayoutBalance: 0, latestDate: '', latestRow: null
          });
        }
        var acc = accountMap.get(key);
        acc.dates.add(dateStr);
        acc.totalSpend += spend;
        // 返货消耗只在「有消耗的天」累加 ⇒ 与 update_data.py 口径一致（分子分母同源）
        if (spend > 0) {
          acc.spendDates.add(dateStr);
          acc.totalRebateSpend += parseFloat(row['账户消耗-普通返货']) || 0;
          acc.totalPayoutSpend += parseFloat(row['账户消耗-赔付返货']) || 0;
        }
        if (dateStr >= acc.latestDate) {
          acc.latestDate = dateStr;
          acc.latestRebateBalance = parseFloat(row['普通返货余额']) || 0;
          acc.latestPayoutBalance = parseFloat(row['赔付返货余额']) || 0;
          acc.latestRow = row;
        }
      });

      var accounts = [];
      accountMap.forEach(function(acc) {
        var numDays = acc.spendDates.size;
        var dailyAvg = numDays > 0 ? acc.totalSpend / numDays : 0;
        var dailyRebate = numDays > 0 ? acc.totalRebateSpend / numDays : 0;
        var edgeCase = null;

        // 无消耗但（普通或赔付）有返货余额 → 闲置，全额可转出
        if (acc.totalSpend === 0) {
          if (acc.latestRebateBalance > 0 || acc.latestPayoutBalance > 0) {
            accounts.push({
              name: acc.name, id: acc.id, type: acc.type, entity: acc.entity, agent: acc.agent,
              statsDays: 0, totalSpend: 0, dailyAvgSpend: 0,
              dailyRebateSpend: 0, totalRebateSpend: 0, estimatedRebateSpend: 0,
              totalPayoutSpend: 0, dailyPayoutSpend: 0,
              rebateBalance: r2(acc.latestRebateBalance),
              payoutBalance: r2(acc.latestPayoutBalance),
              totalBalance: r2(acc.latestRebateBalance + acc.latestPayoutBalance),
              daysSupported: 999999, latestDate: acc.latestDate,
              alert: false, edgeCase: 'idle'
            });
          }
          return;
        }

        // 有消耗但返货消耗为0 → 按日均总消耗×10% 估算；估算值直接写入 dailyRebateSpend，
        // 与 update_data.py 口径一致（展示层用 calcRebateSpend 标注「估算」来源）
        var calcRebate = dailyRebate;
        if (dailyRebate === 0 && acc.totalSpend > 0) {
          calcRebate = dailyAvg * 0.10;
          edgeCase = 'estimated';
        }

        var daysSupported = calcRebate > 0 ? acc.latestRebateBalance / calcRebate : 999999;
        var daysDisplay = daysSupported;

        accounts.push({
          name: acc.name, id: acc.id, type: acc.type, entity: acc.entity, agent: acc.agent,
          statsDays: numDays,
          totalSpend: r2(acc.totalSpend),
          dailyAvgSpend: r2(dailyAvg),
          dailyRebateSpend: r2(calcRebate),
          totalRebateSpend: r2(acc.totalRebateSpend),
          estimatedRebateSpend: edgeCase === 'estimated' ? r2(calcRebate) : 0,
          totalPayoutSpend: r2(acc.totalPayoutSpend),
          dailyPayoutSpend: numDays > 0 ? r2(acc.totalPayoutSpend / numDays) : 0,
          rebateBalance: r2(acc.latestRebateBalance),
          payoutBalance: r2(acc.latestPayoutBalance),
          totalBalance: r2(acc.latestRebateBalance + acc.latestPayoutBalance),
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
      var payN = accounts.filter(function(x) { return (x.payoutBalance || 0) > 0; }).length;
      showToast('✅ 成功加载 ' + accounts.length + ' 个账户（含赔付返货余额 ' + payN + ' 户）');
    } catch(err) {
      showToast('❌ 文件解析失败：' + err.message);
      console.error(err);
    } finally {
      if (input) input.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===== EXPORT =====
function exportCSV() {
  var filtered = getFiltered();
  var isIn = currentTab === 'insufficient';
  var isOut = currentTab === 'sufficient';

  var headers, rows;
  if (currentTab === 'idle') {
    headers = ['账户名称', '账户ID', '代理商', '普通返货余额', '赔付返货余额', '建议转出合计'];
    rows = filtered.map(function(a) {
      var tot = (a.rebateBalance || 0) + (a.payoutBalance || 0);
      return [a.name, a.id, a.agent || '', (a.rebateBalance || 0).toFixed(2), (a.payoutBalance || 0).toFixed(2), tot.toFixed(2)];
    });
  } else if (isIn) {
    headers = ['账户名称', '账户ID', '代理商', '日均返货消耗', '普通返货余额', '赔付返货余额', '建议转入金额', '调拨后可支撑天数'];
    rows = filtered.map(function(a) {
      return [a.name, a.id, a.agent || '', (a.dailyRebateSpend || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2), (a.payoutBalance || 0).toFixed(2), Math.abs(a.transferAmount || 0).toFixed(2), String(targetDays)];
    });
  } else if (isOut) {
    headers = ['账户名称', '账户ID', '代理商', '日均返货消耗', '普通返货余额', '赔付返货余额', '普通返货可转出', '赔付可转出', '转出合计'];
    rows = filtered.map(function(a) {
      return [a.name, a.id, a.agent || '', (a.dailyRebateSpend || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2), (a.payoutBalance || 0).toFixed(2), (a.normalOut || 0).toFixed(2), (a.payoutOut || 0).toFixed(2), Math.abs(a.transferAmount || 0).toFixed(2)];
    });
  } else {
    headers = ['账户名称', '账户ID', '代理商', '日均消耗', '日均返货消耗', '普通返货余额', '赔付返货余额', '可支撑天数', '状态'];
    rows = filtered.map(function(a) {
      var status = a.daysSupported < 5 ? '严重不足' : a.daysSupported < targetDays ? '不足' : a.daysSupported >= 999999 ? (a.edgeCase === 'idle' ? '闲置余额' : a.edgeCase === 'estimated' ? '按10%估算' : '无消耗') : '充足';
      return [a.name, a.id, a.agent || '', (a.dailyAvgSpend || 0).toFixed(2), (a.dailyRebateSpend || 0).toFixed(2), (a.rebateBalance || 0).toFixed(2), (a.payoutBalance || 0).toFixed(2), a.daysSupported >= 999999 ? '∞' : (a.daysSupported || 0).toFixed(1), status];
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
