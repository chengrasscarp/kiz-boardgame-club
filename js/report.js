/* ===== Weekly Report ===== */
// 自动按数据生成「每周对局简报」，默认展示最近一个完整周（周一–周日），可前后翻周。
// 依赖 main.js 提供的 parseYmdToDate / getMonday / isoWeekNumber 共享日期工具。

function renderWeeklyReport() {
  var data = window.KIZ_DATA;
  if (!data) return;
  var root = document.getElementById('weeklyReport');
  if (!root) return;

  // 1) 把每场对局归入其所在周（周一为起点）
  var weekMap = {}; // key = 周一的 YYYYMMDD -> {monday, plays:[]}
  for (var i = 0; i < data.plays.length; i++) {
    var p = data.plays[i];
    if (!p.playDateYmd) continue;
    var d = parseYmdToDate(p.playDateYmd);
    if (!d) continue;
    var mon = getMonday(d);
    var key = mon.getFullYear() * 10000 + (mon.getMonth() + 1) * 100 + mon.getDate();
    if (!weekMap[key]) weekMap[key] = { monday: mon, plays: [] };
    weekMap[key].plays.push(p);
  }
  var weekKeys = Object.keys(weekMap).sort(function (a, b) { return a - b; });
  var weeks = weekKeys.map(function (k) {
    var wm = weekMap[k];
    var sun = new Date(wm.monday);
    sun.setDate(sun.getDate() + 6);
    return { monday: wm.monday, sunday: sun, plays: wm.plays };
  });

  if (weeks.length === 0) {
    root.innerHTML = '<div class="section-subtitle">暂无对局数据</div>';
    return;
  }

  // 2) 默认选中「最近一个完整周」（周日早于今天）
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var defIdx = weeks.length - 1;
  for (var wi = weeks.length - 1; wi >= 0; wi--) {
    if (weeks[wi].sunday < today) { defIdx = wi; break; }
    if (wi === 0) defIdx = 0;
  }
  if (defIdx < 0) defIdx = 0;
  if (defIdx >= weeks.length) defIdx = weeks.length - 1;
  var currentIdx = defIdx;

  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  function render() {
    var week = weeks[currentIdx];
    var plays = week.plays.slice().sort(function (a, b) { return b.playDate.localeCompare(a.playDate); });
    var total = plays.length;
    var participations = 0;
    var active = {};
    var gameCount = {};
    var pg = {};
    var pw = {};
    for (var i = 0; i < plays.length; i++) {
      var pl = plays[i];
      participations += pl.playerScores.length;
      for (var j = 0; j < pl.playerScores.length; j++) {
        var ps = pl.playerScores[j];
        active[ps.playerRefId] = true;
        var nm = getPlayerNameById(ps.playerRefId);
        pg[nm] = (pg[nm] || 0) + 1;
        if (ps.winner) pw[nm] = (pw[nm] || 0) + 1;
      }
      var gn = getGameNameForPlay(pl);
      if (gn && gn !== 'Unknown') gameCount[gn] = (gameCount[gn] || 0) + 1;
    }
    var activeCount = Object.keys(active).length;
    var gameKinds = Object.keys(gameCount).length;

    // 周标签
    document.getElementById('weekLabel').textContent =
      week.monday.getFullYear() + '年' + fmtMD(week.monday) + ' – ' + fmtMD(week.sunday) +
      '（第' + isoWeekNumber(week.monday) + '周）';

    // 概览卡片
    document.getElementById('repTotal').textContent = total;
    document.getElementById('repParticipations').textContent = participations;
    document.getElementById('repActive').textContent = activeCount;
    document.getElementById('repGames').textContent = gameKinds;

    // 玩家战绩榜
    var pgArr = Object.keys(pg).map(function (n) {
      return { name: n, plays: pg[n], wins: pw[n] || 0 };
    }).sort(function (a, b) {
      return b.plays - a.plays || (b.wins / b.plays) - (a.wins / a.plays);
    });
    var rankHtml = '';
    for (var ri = 0; ri < pgArr.length; ri++) {
      var r = pgArr[ri];
      var rate = Math.round(100 * r.wins / r.plays);
      rankHtml += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (ri < 3 ? ' top' : '') + '">' + (ri + 1) + '</span>' +
        '<span class="leaderboard-name">' + r.name + '</span>' +
        '<span class="leaderboard-value">' + r.plays + '场 · ' + r.wins + '胜（' + rate + '%）</span>' +
        '</div>';
    }
    document.getElementById('repPlayers').innerHTML =
      rankHtml || '<div class="leaderboard-row"><span class="leaderboard-name">本周无对局</span></div>';

    // 游戏热度
    var gcArr = Object.keys(gameCount).map(function (n) {
      return { name: n, count: gameCount[n] };
    }).sort(function (a, b) { return b.count - a.count; });
    var gameHtml = '';
    for (var gi = 0; gi < gcArr.length; gi++) {
      var g = gcArr[gi];
      gameHtml += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (gi < 3 ? ' top' : '') + '">' + (gi + 1) + '</span>' +
        '<span class="leaderboard-name">' + g.name + '</span>' +
        '<span class="leaderboard-value">' + g.count + '场</span>' +
        '</div>';
    }
    document.getElementById('repGames2').innerHTML =
      gameHtml || '<div class="leaderboard-row"><span class="leaderboard-name">本周无对局</span></div>';

    // 对局明细（timeline）
    var tl = '';
    for (var ti = 0; ti < plays.length; ti++) {
      var pp = plays[ti];
      var gname = getGameNameForPlay(pp);
      var loc = getLocationNameById(pp.locationRefId);
      var winner = getWinnerFromScores(pp.playerScores);
      var players = pp.playerScores.map(function (s) { return getPlayerNameById(s.playerRefId); }).join(' · ');
      tl += '<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-card">' +
        '<div class="timeline-date">' + formatDate(pp.playDateYmd) + ' · ' + loc + '</div>' +
        '<div class="timeline-game">' + gname + onlineBadge(pp) +
        (winner ? ' <span class="timeline-winner">🏆 ' + winner.name + (winner.score > 0 ? ' ' + winner.score + '分' : '') + '</span>' : '') +
        '</div>' +
        '<div class="timeline-players">👥 ' + players + '</div>' +
        '</div></div>';
    }
    document.getElementById('repTimeline').innerHTML = tl;

    // 核心发现
    var hl = '';
    if (total > 0) {
      var dayCount = {};
      for (var di = 0; di < plays.length; di++) {
        var dd = plays[di].playDateYmd;
        dayCount[dd] = (dayCount[dd] || 0) + 1;
      }
      var busiestDay = null, bc = -1;
      for (var dk in dayCount) { if (dayCount[dk] > bc) { bc = dayCount[dk]; busiestDay = dk; } }
      var perfect = pgArr.filter(function (r) { return r.wins === r.plays && r.plays >= 1; }).map(function (r) { return r.name; });
      hl = '📌 本周共 <b>' + total + '</b> 场对局，<b>' + formatDate(busiestDay) + '</b> 单日 ' + bc + ' 场最为活跃；' +
        '<b>' + pgArr[0].name + '</b> 出战 ' + pgArr[0].plays + ' 场领跑，<b>' + (gcArr.length ? gcArr[0].name : '—') + '</b> 以 ' +
        (gcArr.length ? gcArr[0].count : 0) + ' 场成为最热门游戏。';
      if (perfect.length) hl += ' 🔥 ' + perfect.join('、') + ' 本周全胜！';
    } else {
      hl = '本周暂无对局记录。';
    }
    document.getElementById('repHighlight').innerHTML = hl;

    // 翻周按钮可用性
    var prevBtn = document.getElementById('weekPrev');
    var nextBtn = document.getElementById('weekNext');
    if (prevBtn) prevBtn.disabled = (currentIdx <= 0);
    if (nextBtn) nextBtn.disabled = (currentIdx >= weeks.length - 1);
  }

  var prevBtn = document.getElementById('weekPrev');
  var nextBtn = document.getElementById('weekNext');
  if (prevBtn) prevBtn.addEventListener('click', function () {
    if (currentIdx > 0) { currentIdx--; render(); window.scrollTo(0, 0); }
  });
  if (nextBtn) nextBtn.addEventListener('click', function () {
    if (currentIdx < weeks.length - 1) { currentIdx++; render(); window.scrollTo(0, 0); }
  });

  render();
}
