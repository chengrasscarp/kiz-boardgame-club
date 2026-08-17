/* ===== Data Dashboard (inline SVG charts, no external dependency) ===== */

var DASH_STATE = { heatYear: null, trendYear: null };

function dashEsc(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

function dashTruncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function ymdOf(d) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// 横向条形图（适合排行榜：游戏/玩家/胜率/搭子/分布）
// items: [{label, value, sub}] 已按数值降序
function dashHBar(items, opts) {
  opts = opts || {};
  var W = 680, rowH = 34, padTop = 8, padBottom = 8;
  var labelW = opts.labelW || 150, valW = opts.valW || 80;
  var plotX = labelW;
  var plotW = W - labelW - valW;
  var H = padTop + padBottom + items.length * rowH;
  var maxV = 0;
  for (var i = 0; i < items.length; i++) maxV = Math.max(maxV, items[i].value);
  if (maxV <= 0) maxV = 1;

  var svg = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMinYMin meet" xmlns="http://www.w3.org/2000/svg">';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var y = padTop + i * rowH;
    var bw = Math.max(2, plotW * it.value / maxV);
    var fill = (i === 0) ? '#E17055' : '#D4A574';
    svg += '<text x="0" y="' + (y + rowH / 2 + 4) + '" font-size="13" fill="#5a4a3a" font-family="sans-serif">' +
      dashEsc(dashTruncate(it.label, 12)) + '</text>';
    svg += '<rect x="' + plotX + '" y="' + (y + 6) + '" width="' + bw + '" height="' + (rowH - 14) + '" rx="4" fill="' + fill + '"></rect>';
    var valTxt = it.value + (it.sub ? it.sub : '');
    svg += '<text x="' + (plotX + bw + 6) + '" y="' + (y + rowH / 2 + 4) + '" font-size="12" fill="#8a7a6a" font-family="sans-serif">' +
      dashEsc(valTxt) + '</text>';
  }
  svg += '</svg>';
  return svg;
}

// 纵向柱状图（适合趋势/分布：月份/星期/时段/时长）
// items: [{label, value}]
function dashVBar(items, opts) {
  opts = opts || {};
  var W = 680, H = 320, padL = 36, padR = 12, padT = 20, padB = 46;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var maxV = 0;
  for (var i = 0; i < items.length; i++) maxV = Math.max(maxV, items[i].value);
  if (maxV <= 0) maxV = 1;
  if (opts.maxV && opts.maxV > maxV) maxV = opts.maxV; // 跨年统一刻度，便于对比
  var n = items.length;
  var slot = plotW / n;
  var bw = Math.min(42, slot * 0.6);

  var svg = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
  // 横向网格 + Y 轴刻度
  for (var g = 0; g <= 4; g++) {
    var gy = padT + plotH - (plotH * g / 4);
    var gv = Math.round(maxV * g / 4);
    svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#e8d5c0" stroke-width="1"></line>';
    svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" font-size="11" fill="#8a7a6a" text-anchor="end" font-family="sans-serif">' + gv + '</text>';
  }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var bh = plotH * it.value / maxV;
    var bx = padL + slot * i + (slot - bw) / 2;
    var by = padT + plotH - bh;
    var fill = (i === items.length - 1) ? '#E17055' : '#D4A574';
    svg += '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '" rx="3" fill="' + fill + '"></rect>';
    svg += '<text x="' + (bx + bw / 2) + '" y="' + (by - 5) + '" font-size="11" fill="#5a4a3a" text-anchor="middle" font-family="sans-serif">' + it.value + '</text>';
    svg += '<text x="' + (padL + slot * i + slot / 2) + '" y="' + (H - padB + 16) + '" font-size="11" fill="#5a4a3a" text-anchor="middle" font-family="sans-serif">' +
      dashEsc(dashTruncate(it.label, 6)) + '</text>';
  }
  svg += '</svg>';
  return svg;
}

// 热力图颜色阶梯：count 越大越深
function heatColor(c, maxc) {
  if (c <= 0) return '#f1ece4';
  var t = maxc > 1 ? (c - 1) / (maxc - 1) : 1;
  var steps = ['#f6d9c6', '#eeb892', '#e6956a', '#db7148', '#c0502f'];
  var idx = Math.min(steps.length - 1, Math.floor(t * steps.length));
  return steps[idx];
}

// 日历热力图（GitHub 贡献图风格）：每日一格，颜色越深对局越多
// 仅展示 year 这一年
function dashHeatmap(dayCounts, year, maxDay) {
  var cell = 13, gap = 4, step = cell + gap;
  var padL = 32, padT = 22;
  var minDate = new Date(year, 0, 1);
  var maxDate = new Date(year, 11, 31);
  var start = getMonday(minDate);
  var end = getMonday(maxDate);
  end.setDate(end.getDate() + 6); // 周日
  var weeks = Math.round((end - start) / (7 * 86400000)) + 1;
  var W = padL + weeks * step + 8;
  var H = padT + 7 * step + 4;

  var svg = '<svg class="chart-svg chart-heat" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" style="width:' + W + 'px;max-width:none" xmlns="http://www.w3.org/2000/svg">';

  // 左侧星期标签（周一/三/五/日）
  var dayLabels = ['一', '三', '五', '日'];
  var dayRows = [0, 2, 4, 6];
  for (var r = 0; r < dayRows.length; r++) {
    var row = dayRows[r];
    svg += '<text x="' + (padL - 6) + '" y="' + (padT + row * step + cell - 2) +
      '" font-size="10" fill="#8a7a6a" text-anchor="end" font-family="sans-serif">周' + dayLabels[r] + '</text>';
  }

  var lastMonth = -1;
  for (var w = 0; w < weeks; w++) {
    var colDate = new Date(start);
    colDate.setDate(colDate.getDate() + w * 7);
    // 以本周首个有效日期所在月份来标注：避免跨年残缺周把 12月/1月 标签挤在一起
    var labelMonth = -1;
    for (var d = 0; d < 7; d++) {
      var cd = new Date(start);
      cd.setDate(cd.getDate() + w * 7 + d);
      if (cd >= minDate && cd <= maxDate) { labelMonth = cd.getMonth(); break; }
    }
    if (labelMonth !== -1 && labelMonth !== lastMonth) {
      svg += '<text x="' + (padL + w * step) + '" y="' + (padT - 6) +
        '" font-size="10" fill="#8a7a6a" font-family="sans-serif">' + (labelMonth + 1) + '月</text>';
      lastMonth = labelMonth;
    }
    for (var day = 0; day < 7; day++) {
      var cd = new Date(start);
      cd.setDate(cd.getDate() + w * 7 + day);
      var inRange = (cd >= minDate && cd <= maxDate);
      var k = ymdOf(cd);
      var c = dayCounts[k] || 0;
      var x = padL + w * step;
      var y = padT + day * step;
      var fill = inRange ? heatColor(c, maxDay) : '#faf7f2';
      var op = inRange ? '1' : '0.35';
      svg += '<rect x="' + x + '" y="' + y + '" width="' + cell + '" height="' + cell +
        '" rx="2" fill="' + fill + '" opacity="' + op + '"></rect>';
    }
  }
  svg += '</svg>';
  return svg;
}

function renderDashboard() {
  var data = window.KIZ_DATA;
  if (!data) return;
  var container = document.getElementById('dashboard');
  if (!container) return;

  // 仅统计真实成员（与排行榜口径一致）
  var memberIds = {};
  for (var mi = 0; mi < data.players.length; mi++) memberIds[data.players[mi].id] = true;

  // 每日对局数（热力图）+ 每月趋势 + 起止日期 + 年份列表
  var dayCounts = {};
  var monthCount = {};
  var minD = null, maxD = null;
  var yearSet = {};
  for (var i = 0; i < data.plays.length; i++) {
    var ymd = data.plays[i].playDateYmd;
    if (!ymd) continue;
    var d = parseYmdToDate(ymd);
    if (!d) continue;
    var k = ymdOf(d);
    dayCounts[k] = (dayCounts[k] || 0) + 1;
    var mk = String(ymd).slice(0, 6);
    monthCount[mk] = (monthCount[mk] || 0) + 1;
    yearSet[d.getFullYear()] = true;
    if (minD === null || d < minD) minD = d;
    if (maxD === null || d > maxD) maxD = d;
  }
  // 年份列表（所有有对局的年份）
  var yearList = Object.keys(yearSet).map(Number).sort(function (a, b) { return a - b; });

  // 热力图：确定当前展示年份（默认最新年）
  if (DASH_STATE.heatYear === null || yearList.indexOf(DASH_STATE.heatYear) === -1) {
    DASH_STATE.heatYear = yearList.length ? yearList[yearList.length - 1] : new Date().getFullYear();
  }
  var curYear = DASH_STATE.heatYear;

  // 每月趋势：按年份分开展示（与热力图一致的年份切换）
  if (DASH_STATE.trendYear === null || yearList.indexOf(DASH_STATE.trendYear) === -1) {
    DASH_STATE.trendYear = yearList.length ? yearList[yearList.length - 1] : new Date().getFullYear();
  }
  var trendYear = DASH_STATE.trendYear;
  var monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  var trendItems = monthLabels.map(function (name, i) {
    var mm = (i + 1 < 10 ? '0' : '') + (i + 1);
    return { label: name, value: monthCount[String(trendYear) + mm] || 0 };
  });
  var trendTotal = trendItems.reduce(function (s, it) { return s + it.value; }, 0);
  // 跨年统一 Y 轴刻度，避免早期稀疏年份的 1 场被放大成满格
  var globalMaxMonth = 1;
  for (var mk2 in monthCount) { if (monthCount[mk2] > globalMaxMonth) globalMaxMonth = monthCount[mk2]; }
  var yearDayCount = 0, yearTotalPlays = 0;
  for (var yk in dayCounts) {
    var y = Math.floor(Number(yk) / 10000);
    if (y === curYear) { yearDayCount++; yearTotalPlays += dayCounts[yk]; }
  }

  // 活动日分布（按星期几）
  var wd = [0, 0, 0, 0, 0, 0, 0];
  var wdNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  for (var i = 0; i < data.plays.length; i++) {
    var dd = parseYmdToDate(data.plays[i].playDateYmd);
    if (!dd) continue;
    wd[(dd.getDay() + 6) % 7]++;
  }
  var wdItems = wdNames.map(function (n, i) { return { label: n, value: wd[i] }; });

  // 时段分布（按 playDate 的小时）
  var todNames = ['深夜', '上午', '下午', '晚上'];
  var tod = [0, 0, 0, 0];
  for (var i = 0; i < data.plays.length; i++) {
    var pd = data.plays[i].playDate;
    if (!pd || pd.length < 13) continue;
    var hh = parseInt(pd.slice(11, 13), 10);
    if (isNaN(hh)) continue;
    var b = hh < 6 ? 0 : (hh < 12 ? 1 : (hh < 18 ? 2 : 3));
    tod[b]++;
  }
  var todItems = todNames.map(function (n, i) { return { label: n, value: tod[i] }; });

  // 对局时长分布（分桶，仅统计有记录的）
  var durDefs = [['<30', 0, 30], ['30-60', 30, 60], ['60-120', 60, 120], ['120-180', 120, 180], ['180+', 180, 1e9]];
  var dur = [0, 0, 0, 0, 0];
  var durTotal = 0;
  for (var i = 0; i < data.plays.length; i++) {
    var dm = data.plays[i].durationMin;
    if (!dm || dm <= 0) continue;
    durTotal++;
    for (var b = 0; b < durDefs.length; b++) {
      if (dm >= durDefs[b][1] && dm < durDefs[b][2]) { dur[b]++; break; }
    }
  }
  var durItems = durDefs.map(function (def, i) { return { label: def[0], value: dur[i] }; });

  // 游戏复杂度分布（按已玩游戏的 BGG 权重分桶）
  var cxDefs = [
    { label: '轻量 (1-2)', lo: 1.0, hi: 2.0 },
    { label: '中量 (2-3)', lo: 2.0, hi: 3.0 },
    { label: '重量 (3-4)', lo: 3.0, hi: 4.0 },
    { label: '超重 (4+)', lo: 4.0, hi: 99 }
  ];
  var cx = [0, 0, 0, 0];
  var cxTotal = 0;
  for (var i = 0; i < data.games.length; i++) {
    var g = data.games[i];
    if ((g.playCount || 0) <= 0) continue;
    var c = g.complexity;
    if (c == null) continue;
    cxTotal++;
    for (var b = 0; b < cxDefs.length; b++) {
      if (c >= cxDefs[b].lo && c < cxDefs[b].hi) { cx[b]++; break; }
      if (b === cxDefs.length - 1 && c >= cxDefs[b].lo) { cx[b]++; break; }
    }
  }
  var cxItems = cxDefs.map(function (def, i) { return { label: def.label, value: cx[i] }; });

  // 每局人数分布（按 playerScores 人数）
  var ppl = {};
  for (var i = 0; i < data.plays.length; i++) {
    var n = data.plays[i].playerScores.length;
    if (n >= 1 && n <= 8) ppl[n] = (ppl[n] || 0) + 1;
  }
  var pplItems = [];
  for (var n = 1; n <= 8; n++) {
    if (ppl[n]) pplItems.push({ label: n + '人' + (n === 1 ? '*' : ''), value: ppl[n] });
  }

  // 游戏年代分布（已玩游戏的出版年）
  var yrDefs = [
    { label: '<2000', lo: 0, hi: 2000 },
    { label: '2000-09', lo: 2000, hi: 2010 },
    { label: '2010-14', lo: 2010, hi: 2015 },
    { label: '2015-19', lo: 2015, hi: 2020 },
    { label: '2020-24', lo: 2020, hi: 2025 },
    { label: '2025+', lo: 2025, hi: 9999 }
  ];
  var yrCnt = [0, 0, 0, 0, 0, 0];
  var yrTotal = 0;
  for (var i = 0; i < data.games.length; i++) {
    var g = data.games[i];
    if ((g.playCount || 0) <= 0) continue;
    var y = g.yearPublished;
    if (y == null) continue;
    yrTotal++;
    for (var b = 0; b < yrDefs.length; b++) {
      if (y >= yrDefs[b].lo && y < yrDefs[b].hi) { yrCnt[b]++; break; }
    }
  }
  var yrItems = yrDefs.map(function (def, i) { return { label: def.label, value: yrCnt[i] }; });

  // 热力图最大单日值（跨年统一色阶，便于年份对比）
  var maxDay = 1;
  for (var kk in dayCounts) { if (dayCounts[kk] > maxDay) maxDay = dayCounts[kk]; }

  function stat(v, l) {
    return '<div class="stat-item"><div class="stat-number">' + v + '</div><div class="stat-label">' + l + '</div></div>';
  }
  function panel(title, svg, note) {
    return '<div class="dash-card"><h3>' + title + '</h3>' + svg +
      (note ? '<div class="chart-note">' + note + '</div>' : '') + '</div>';
  }

  // 年份切换按钮
  var yearBtns = yearList.map(function (y) {
    var active = (y === curYear) ? ' active' : '';
    return '<button type="button" class="heat-year-btn' + active + '" onclick="window.__setDashYear(' + y + ')">' + y + '</button>';
  }).join('');

  var html = '';
  html += '<div class="stats-row">' +
    stat(data.plays.length, '总对局') +
    stat(data.games.length, '游戏库') +
    stat(data.players.length, '玩家') +
    stat(data.locations.length, '地点') +
    stat((data.plays.length / Math.max(1, data.players.length)).toFixed(1), '人均局数') +
    '</div>';

  // 每月趋势的年份切换按钮（与热力图同款）
  var trendYearBtns = yearList.map(function (y) {
    var active = (y === trendYear) ? ' active' : '';
    return '<button type="button" class="heat-year-btn' + active + '" onclick="window.__setTrendYear(' + y + ')">' + y + '</button>';
  }).join('');
  html += panel('📈 每月对局趋势',
    '<div class="heat-year-bar">' + trendYearBtns + '</div>' +
    dashVBar(trendItems, { maxV: globalMaxMonth }),
    '单位：场（' + trendYear + ' 年共 ' + trendTotal + ' 场，1–12 月）');

  html += panel('🗓️ 每日活跃热力图',
    '<div class="heat-year-bar">' + yearBtns + '</div>' +
    '<div class="chart-scroll">' + dashHeatmap(dayCounts, curYear, maxDay) + '</div>',
    '颜色越深 = 当天对局越多（共 ' + yearDayCount + ' 个有对局日，' + yearTotalPlays + ' 场）');

  html += '<div class="dash-grid">' +
    panel('⏰ 时段分布', dashVBar(todItems), '按开局时间（深夜 0-6 / 上午 6-12 / 下午 12-18 / 晚上 18-24）') +
    panel('⏱️ 对局时长分布', dashVBar(durItems), '基于 ' + durTotal + ' 场有记录对局（分钟）') +
    '</div>';

  html += '<div class="dash-grid">' +
    panel('📅 活动日分布', dashVBar(wdItems), '单位：场') +
    panel('🎚️ 游戏复杂度分布', dashHBar(cxItems), '基于 ' + cxTotal + ' 款已玩游戏（BGG 权重：轻 1-2 / 中 2-3 / 重 3-4 / 超重 4+）') +
    '</div>';

  html += '<div class="dash-grid">' +
    panel('👥 每局人数分布', dashVBar(pplItems), '单位：局（*为单人局，如《罪案疑云》）') +
    panel('🎲 游戏年代分布', dashHBar(yrItems), '基于 ' + yrTotal + ' 款已玩游戏的出版年') +
    '</div>';

  container.innerHTML = html;
}

// 年份切换：更新状态后重渲染整个看板
window.__setDashYear = function (y) {
  DASH_STATE.heatYear = y;
  renderDashboard();
};

// 每月趋势年份切换
window.__setTrendYear = function (y) {
  DASH_STATE.trendYear = y;
  renderDashboard();
};
