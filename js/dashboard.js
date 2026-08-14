/* ===== Data Dashboard (inline SVG charts, no external dependency) ===== */

function dashEsc(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

function dashTruncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// 横向条形图（适合排行榜：游戏/玩家/胜率）
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
      dashEsc(dashTruncate(it.label, 10)) + '</text>';
    svg += '<rect x="' + plotX + '" y="' + (y + 6) + '" width="' + bw + '" height="' + (rowH - 14) + '" rx="4" fill="' + fill + '"></rect>';
    var valTxt = it.value + (it.sub ? it.sub : '');
    svg += '<text x="' + (plotX + bw + 6) + '" y="' + (y + rowH / 2 + 4) + '" font-size="12" fill="#8a7a6a" font-family="sans-serif">' +
      dashEsc(valTxt) + '</text>';
  }
  svg += '</svg>';
  return svg;
}

// 纵向柱状图（适合趋势/分布：月份/星期）
// items: [{label, value}]
function dashVBar(items, opts) {
  opts = opts || {};
  var W = 680, H = 320, padL = 36, padR = 12, padT = 20, padB = 46;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var maxV = 0;
  for (var i = 0; i < items.length; i++) maxV = Math.max(maxV, items[i].value);
  if (maxV <= 0) maxV = 1;
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

function renderDashboard() {
  var data = window.KIZ_DATA;
  if (!data) return;
  var container = document.getElementById('dashboard');
  if (!container) return;

  // 仅统计真实成员（与排行榜口径一致）
  var memberIds = {};
  for (var mi = 0; mi < data.players.length; mi++) memberIds[data.players[mi].id] = true;

  // 每月对局趋势
  var monthCount = {};
  for (var i = 0; i < data.plays.length; i++) {
    var ymd = String(data.plays[i].playDateYmd || '');
    if (ymd.length < 6) continue;
    var mk = ymd.slice(0, 6);
    monthCount[mk] = (monthCount[mk] || 0) + 1;
  }
  var months = Object.keys(monthCount).sort();
  var monthItems = months.map(function (m) {
    return { label: parseInt(m.slice(4, 6), 10) + '月', value: monthCount[m] };
  });

  // 游戏热度 Top 10（按 playCount）
  var gameItems = data.games.slice().sort(function (a, b) {
    return (b.playCount || 0) - (a.playCount || 0);
  }).slice(0, 10).map(function (g) {
    return { label: g.name, value: g.playCount || 0, sub: '场' };
  });

  // 玩家活跃 Top 10（仅成员，按参与人次）
  var pc = {};
  for (var i = 0; i < data.plays.length; i++) {
    var sc = data.plays[i].playerScores;
    for (var j = 0; j < sc.length; j++) {
      var pid = sc[j].playerRefId;
      if (!memberIds[pid]) continue;
      pc[pid] = (pc[pid] || 0) + 1;
    }
  }
  var playerItems = Object.keys(pc).map(function (id) {
    return { name: getPlayerNameById(Number(id)), count: pc[id] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10).map(function (p) {
    return { label: p.name, value: p.count, sub: '场' };
  });

  // 胜率 Top 10（仅成员，≥10 场）
  var tc = {}, wc = {};
  for (var i = 0; i < data.plays.length; i++) {
    var s = data.plays[i].playerScores;
    for (var j = 0; j < s.length; j++) {
      var pid = s[j].playerRefId;
      if (!memberIds[pid]) continue;
      tc[pid] = (tc[pid] || 0) + 1;
      if (s[j].winner) wc[pid] = (wc[pid] || 0) + 1;
    }
  }
  var wrItems = Object.keys(tc).filter(function (id) { return tc[id] >= 10; }).map(function (id) {
    return { id: Number(id), plays: tc[id], wins: wc[id] || 0 };
  }).sort(function (a, b) {
    return (b.wins / b.plays) - (a.wins / a.plays) || b.wins - a.wins;
  }).slice(0, 10).map(function (p) {
    return { label: getPlayerNameById(p.id), value: Math.round(100 * p.wins / p.plays), sub: '%' };
  });

  // 星期分布
  var wd = [0, 0, 0, 0, 0, 0, 0];
  var wdNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  for (var i = 0; i < data.plays.length; i++) {
    var d = parseYmdToDate(data.plays[i].playDateYmd);
    if (!d) continue;
    wd[(d.getDay() + 6) % 7]++;
  }
  var wdItems = wdNames.map(function (n, i) { return { label: n, value: wd[i] }; });

  // 地点分布 Top 8
  var lc = {};
  for (var i = 0; i < data.plays.length; i++) {
    var lid = data.plays[i].locationRefId;
    lc[lid] = (lc[lid] || 0) + 1;
  }
  var locItems = Object.keys(lc).map(function (id) {
    return { name: getLocationNameById(Number(id)), count: lc[id] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 8).map(function (l) {
    return { label: l.name, value: l.count, sub: '场' };
  });

  function stat(v, l) {
    return '<div class="stat-item"><div class="stat-number">' + v + '</div><div class="stat-label">' + l + '</div></div>';
  }
  function panel(title, svg, note) {
    return '<div class="dash-card"><h3>' + title + '</h3>' + svg +
      (note ? '<div class="chart-note">' + note + '</div>' : '') + '</div>';
  }

  var html = '';
  html += '<div class="stats-row">' +
    stat(data.plays.length, '总对局') +
    stat(data.games.length, '游戏库') +
    stat(data.players.length, '玩家') +
    stat(data.locations.length, '地点') +
    stat((data.plays.length / Math.max(1, data.players.length)).toFixed(1), '人均局数') +
    '</div>';

  html += panel('📈 每月对局趋势', dashVBar(monthItems), '单位：场');
  html += '<div class="dash-grid">' +
    panel('🎮 游戏热度 Top 10', dashHBar(gameItems)) +
    panel('👥 玩家活跃 Top 10', dashHBar(playerItems)) +
    '</div>';
  html += '<div class="dash-grid">' +
    panel('🏆 胜率 Top 10（≥10场）', dashHBar(wrItems)) +
    panel('📅 星期分布', dashVBar(wdItems)) +
    '</div>';
  html += panel('📍 地点分布 Top 8', dashHBar(locItems));

  container.innerHTML = html;
}
