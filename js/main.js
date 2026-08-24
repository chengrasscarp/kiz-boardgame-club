/* ===== Navigation Toggle ===== */
function initNavigation() {
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function() {
      links.classList.toggle('open');
    });
  }
}

/* ===== Shared Date Helpers ===== */
// 把 20250411 这类数字/字符串 ymd 解析为 Date
function parseYmdToDate(ymd) {
  ymd = String(ymd);
  if (ymd.length < 8) return null;
  return new Date(
    parseInt(ymd.slice(0, 4), 10),
    parseInt(ymd.slice(4, 6), 10) - 1,
    parseInt(ymd.slice(6, 8), 10)
  );
}

// 平移到所在周的周一
function getMonday(d) {
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = date.getDay(); // 0=周日 .. 6=周六
  var diff = (day === 0) ? -6 : (1 - day);
  date.setDate(date.getDate() + diff);
  return date;
}

// ISO 周序号
function isoWeekNumber(d) {
  var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  var firstThursday = new Date(target.getFullYear(), 0, 4);
  var diff = (target - firstThursday) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

/* ===== Helpers ===== */
var GAME_CARD_COLORS = [
  'linear-gradient(135deg, #E17055, #D4A574)',
  'linear-gradient(135deg, #2D5A3D, #4a8a5a)',
  'linear-gradient(135deg, #D4A574, #c49565)',
  'linear-gradient(135deg, #E17055, #c06045)',
  'linear-gradient(135deg, #2D5A3D, #3a6a4a)',
  'linear-gradient(135deg, #c06045, #D4A574)',
];

var GAME_EMOJIS = ['💣', '🏰', '🔍', '🗺️', '🎯', '♠️', '🎲', '🃏', '🏆', '⚔️', '🛡️', '👑'];

function getGameEmoji(index) {
  return GAME_EMOJIS[index % GAME_EMOJIS.length];
}

function getGameById(id) {
  var games = window.KIZ_DATA.games;
  for (var i = 0; i < games.length; i++) {
    if (games[i].id === id) return games[i];
  }
  return null;
}

// 依据背景色计算首字母文字颜色，保证彩色头像上的字高对比可读
function pickAvatarTextColor(bg) {
  if (!bg) return '#333333';
  var m = /hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i.exec(bg);
  var L;
  if (m) {
    L = parseFloat(m[3]);
  } else {
    var h = String(bg).replace('#', '');
    if (h.length === 6) {
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      L = (0.299 * r + 0.587 * g + 0.114 * b) / 255 * 100;
    } else {
      L = 60;
    }
  }
  return L > 62 ? '#2b2b2b' : '#ffffff';
}

// bgColor: 头像底色（如 player.avatarColor）；extraStyle: 附加内联样式（无需 style= 前缀）
function renderAvatar(name, bgColor, extraStyle) {
  var imgPath = 'img/' + name + '.jpg';
  var styleAttr = (bgColor ? 'background:' + bgColor + ';' : '') + (extraStyle || '');
  var tc = pickAvatarTextColor(bgColor);
  return '<div class="member-avatar"' + (styleAttr ? ' style="' + styleAttr + '"' : '') + '>' +
    '<img src="' + imgPath + '" class="avatar-img" onerror="this.style.display=\'none\'" onload="this.style.display=\'block\'">' +
    '<span class="avatar-initial" style="color:' + tc + '">' + name.charAt(0) + '</span>' +
  '</div>';
}

function renderComplexity(weight) {
  // 把 1-5 的 weight 转成方块可视化: ▰▰▰▱▱
  var filled = Math.round(weight);
  var result = '';
  for (var i = 0; i < 5; i++) {
    result += i < filled ? '▰' : '▱';
  }
  return result;
}

function getGameThumb(game) {
  // 候选优先级：拥有版本专属图(需为真实 BGG CDN 封面) -> 游戏默认图(可为本地相对路径) -> 副本图
  function valid(u) {
    if (!u || u.indexOf('previewthumb') !== -1) return false;
    // 允许 BGG CDN 图，或本地相对路径(如 img/xxx.jpg)
    return u.indexOf('https://cf.geekdo-images.com/') === 0 || u.indexOf('http') !== 0;
  }
  var owned = game.ownedThumb || '';
  var copyThumb = (game.copies && game.copies.length > 0) ? (game.copies[0].urlThumb || '') : '';
  if (valid(owned)) return owned;
  if (valid(game.urlThumb)) return game.urlThumb;
  if (valid(copyThumb)) return copyThumb;
  return '';
}

function getGameNameById(id) {
  var games = window.KIZ_DATA.games;
  for (var i = 0; i < games.length; i++) {
    if (games[i].id === id) return games[i].name;
  }
  return 'Unknown';
}

/* ===== Win Rate Stats ===== */
// 某玩家对某游戏至少玩过这么多场，才计入"最高胜率"候选，避免少数场次 100% 的偶然
var WIN_RATE_MIN_PLAYS = 3;

// 统计每位玩家在每个游戏上的胜场/场次，key 为 "玩家id:游戏id"
function buildWinRateMaps() {
  var data = window.KIZ_DATA;
  // 只统计在玩家名单内的人，排除被筛选掉的非研究生等"幽灵玩家"
  var validPids = {};
  for (var i = 0; i < data.players.length; i++) validPids[data.players[i].id] = true;
  var wins = {};
  var plays = {};
  for (var i = 0; i < data.plays.length; i++) {
    var play = data.plays[i];
    if (play.ignored) continue;
    var gid = play.gameRefId;
    var scores = play.playerScores || [];
    for (var j = 0; j < scores.length; j++) {
      var pid = scores[j].playerRefId;
      if (!validPids[pid]) continue;
      var key = pid + ':' + gid;
      plays[key] = (plays[key] || 0) + 1;
      if (scores[j].winner) wins[key] = (wins[key] || 0) + 1;
    }
  }
  return { wins: wins, plays: plays };
}

// 某玩家胜率最高的游戏（tie-break：胜场更多者优先）
function getPlayerBestGame(pid, maps) {
  var best = null;
  for (var key in maps.plays) {
    var parts = key.split(':');
    if (Number(parts[0]) !== pid) continue;
    var pc = maps.plays[key];
    if (pc < WIN_RATE_MIN_PLAYS) continue;
    var wc = maps.wins[key] || 0;
    var rate = Math.round(wc / pc * 100);
    var gid = Number(parts[1]);
    // 跳过已下架/不在游戏库中的对局（gameRefId 在 games 里找不到，getGameNameById 返回 "Unknown"）
    var gameName = getGameNameById(gid);
    if (gameName === null || gameName === 'Unknown') continue;
    if (!best || rate > best.rate || (rate === best.rate && wc > best.wins)) {
      best = { gameId: gid, gameName: gameName, rate: rate, wins: wc, plays: pc };
    }
  }
  return (best && best.rate > 0) ? best : null;
}

// 某游戏胜率最高的玩家（并列则全部列出；二级 tie-break：胜场更多者优先；再用玩家 id 稳定排序避免出现"随机"胜者）
function getGameBestPlayer(gid, maps) {
  var cands = [];
  for (var key in maps.plays) {
    var parts = key.split(':');
    if (Number(parts[1]) !== gid) continue;
    var pc = maps.plays[key];
    if (pc < WIN_RATE_MIN_PLAYS) continue;
    var wc = maps.wins[key] || 0;
    var rate = Math.round(wc / pc * 100);
    var pid = Number(parts[0]);
    var pname = getPlayerNameById(pid);
    if (pname === null) continue;
    cands.push({ playerId: pid, name: pname, rate: rate, wins: wc, plays: pc });
  }
  cands = cands.filter(function (c) { return c.rate > 0; });
  if (!cands.length) return null;
  var bestRate = -1, bestWins = -1;
  for (var i = 0; i < cands.length; i++) {
    if (cands[i].rate > bestRate) bestRate = cands[i].rate;
  }
  for (var j = 0; j < cands.length; j++) {
    if (cands[j].rate === bestRate && cands[j].wins > bestWins) bestWins = cands[j].wins;
  }
  var winners = cands.filter(function (c) { return c.rate === bestRate && c.wins === bestWins; });
  winners.sort(function (a, b) { return a.playerId - b.playerId; });
  return {
    names: winners.map(function (w) { return w.name; }),
    rate: bestRate,
    wins: bestWins,
    plays: winners[0].plays,
  };
}

function getPlayerNameById(id) {
  var players = window.KIZ_DATA.players;
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === id) return players[i].name;
  }
  // BGA 线上对局中的匿名玩家（歪果人）存于独立字段，不污染成员墙
  var pseudo = window.KIZ_DATA.pseudoPlayers;
  if (pseudo) {
    for (var j = 0; j < pseudo.length; j++) {
      if (pseudo[j].id === id) return pseudo[j].name;
    }
  }
  return '玩家';
}

// 取对局游戏名：优先使用 BGA 线上对局自带的名称兜底（库外游戏也能显示真名）
function getGameNameForPlay(play) {
  if (play && play.gameNameOverride) return play.gameNameOverride;
  return getGameNameById(play.gameRefId);
}

// 线上对局徽标（BGA）
function onlineBadge(play) {
  return (play && play.source === 'bga') ? ' <span class="timeline-online">🌐线上</span>' : '';
}

function getLocationNameById(id) {
  var locations = window.KIZ_DATA.locations;
  for (var i = 0; i < locations.length; i++) {
    if (locations[i].id === id) return locations[i].name;
  }
  return '未知地点';
}

function formatDate(ymd) {
  var s = String(ymd);
  return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
}

/* Determine winner: handle cooperative, team, and competitive games */
function getWinnerFromScores(playerScores) {
  var winners = [];
  var losers = [];
  for (var i = 0; i < playerScores.length; i++) {
    if (playerScores[i].winner) {
      winners.push(playerScores[i]);
    } else {
      losers.push(playerScores[i]);
    }
  }

  var total = playerScores.length;

  // Cooperative: everyone wins
  if (winners.length === total && total > 0) {
    return {
      name: '全体获胜',
      score: 0,
      isTeam: true
    };
  }

  // Cooperative: everyone loses
  if (losers.length === total && total > 0) {
    return {
      name: '全体落败',
      score: 0,
      isTeam: true
    };
  }

  // Team game: some win, some lose
  if (winners.length > 1 && losers.length > 0) {
    var winnerNames = winners.map(function(w) { return getPlayerNameById(w.playerRefId); }).join(' · ');
    return {
      name: winnerNames,
      score: 0,
      isTeam: true
    };
  }

  // Solo winner
  if (winners.length === 1) {
    var score = parseInt(winners[0].score) || 0;
    return {
      name: getPlayerNameById(winners[0].playerRefId),
      score: score,
      isTeam: false
    };
  }

  // No explicit winner: compare scores
  var best = null;
  var maxScore = -1;
  for (var i = 0; i < playerScores.length; i++) {
    var s = parseInt(playerScores[i].score);
    if (!isNaN(s) && s > maxScore) {
      maxScore = s;
      best = { name: getPlayerNameById(playerScores[i].playerRefId), score: s, isTeam: false };
    }
  }
  if (best) return best;

  // No scores: compare rank
  var bestRank = 999;
  for (var i = 0; i < playerScores.length; i++) {
    var rank = playerScores[i].rank || 99;
    if (rank < bestRank) {
      bestRank = rank;
      best = { name: getPlayerNameById(playerScores[i].playerRefId), score: 0, isTeam: false };
    }
  }
  return best;
}

/* ===== Home Page: Stats ===== */
function fillStats() {
  var data = window.KIZ_DATA;
  if (!data) return;

  var gamesEl = document.getElementById('statGames');
  var playsEl = document.getElementById('statPlays');
  var playersEl = document.getElementById('statPlayers');

  if (gamesEl) gamesEl.textContent = data.games.length;
  if (playsEl) playsEl.textContent = data.plays.length;
  if (playersEl) playersEl.textContent = data.players.length;
}

/* ===== Home Page: Hot Games ===== */
// 通用游戏卡片（点击跳转详情页），供热门游戏 / 近期上新复用
function buildGameCardHtml(game, subline) {
  var name = game.name;
  var thumb = getGameThumb(game);
  return '<div class="game-card" onclick="location.href=\'game.html?id=' + game.id + '\'">' +
    '<div class="game-card-image">' +
      (thumb ? '<img src="' + thumb + '" alt="' + name + '" loading="lazy">' : '<span class="game-card-placeholder">🎲</span>') +
    '</div>' +
    '<div class="game-card-body">' +
      '<div class="game-card-title">' + name + '</div>' +
      '<div class="game-card-plays">' + (subline != null ? subline : ('🏆 ' + (game.playCount || 0) + '次游玩')) + '</div>' +
    '</div>' +
  '</div>';
}

// 计算每款游戏在全数据集中的「首次游玩日期」
function computeGameFirstPlay() {
  var data = window.KIZ_DATA;
  var first = {};
  for (var i = 0; i < data.plays.length; i++) {
    var p = data.plays[i];
    if (!p.gameRefId || !p.playDateYmd) continue;
    if (first[p.gameRefId] == null || p.playDateYmd < first[p.gameRefId]) {
      first[p.gameRefId] = p.playDateYmd;
    }
  }
  return first;
}

function renderHotGames() {
  var container = document.getElementById('hotGames');
  if (!container) return;

  var data = window.KIZ_DATA;
  // 热门游戏只展示本体游戏，以及"既是本体又是扩展"的游戏（如沙丘：帝国-起义）；
  // 纯扩展（isExpansion 且从未作为本体开过局）不展示
  var hotPool = data.games.filter(function(g) {
    if (!g.isExpansion) return true;
    return !!g.playedStandalone;
  });
  // Sort games by pre-computed playCount descending
  var sorted = hotPool.slice().sort(function(a, b) {
    return (b.playCount || 0) - (a.playCount || 0);
  }).slice(0, 16);

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    html += buildGameCardHtml(sorted[i]);
  }

  container.innerHTML = html;
}

/* ===== 近期上新：最近 N 天内「首次被搬上桌」的游戏 ===== */
function renderNewGames(containerId, titleId) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var data = window.KIZ_DATA;
  var first = computeGameFirstPlay();
  // 以数据集最新对局日期为基准，往前 NEW_GAME_WINDOW_DAYS 天为「近期」
  var NEW_GAME_WINDOW_DAYS = 120;
  var latest = 0;
  for (var i = 0; i < data.plays.length; i++) {
    if (data.plays[i].playDateYmd > latest) latest = data.plays[i].playDateYmd;
  }
  if (!latest) { container.innerHTML = ''; return; }

  var newGames = data.games.filter(function(g) {
    var f = first[g.id];
    if (f == null) return false;
    var d = parseYmdToDate(f), l = parseYmdToDate(latest);
    if (!d || !l) return false;
    var diff = Math.round((l - d) / 86400000);
    return diff >= 0 && diff <= NEW_GAME_WINDOW_DAYS;
  }).sort(function(a, b) {
    return (first[b.id] || 0) - (first[a.id] || 0);
  });

  if (titleId) {
    var titleEl = document.getElementById(titleId);
    if (titleEl) titleEl.style.display = newGames.length ? '' : 'none';
  }

  if (!newGames.length) { container.innerHTML = ''; return; }

  var html = '';
  for (var j = 0; j < newGames.length; j++) {
    var g = newGames[j];
    var fp = parseYmdToDate(first[g.id]);
    var sub = fp ? ('🆕 首玩 ' + (fp.getMonth() + 1) + '月' + fp.getDate() + '日') : '';
    html += buildGameCardHtml(g, sub);
  }
  container.innerHTML = html;
}

/* ===== Home Page: Recent Plays ===== */
function renderRecentPlays() {
  var container = document.getElementById('recentPlays');
  if (!container) return;

  var data = window.KIZ_DATA;
  // Sort plays by date descending
  var sorted = data.plays.slice().sort(function(a, b) {
    return b.playDate.localeCompare(a.playDate);
  }).slice(0, 3);

  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var play = sorted[i];
    var gameName = getGameNameForPlay(play);
    var locName = getLocationNameById(play.locationRefId);
    var winner = getWinnerFromScores(play.playerScores);

    var playerNames = play.playerScores.map(function(ps) {
      return getPlayerNameById(ps.playerRefId);
    }).join(' · ');

    html += '<div class="timeline-item">' +
      '<div class="timeline-dot"></div>' +
      '<div class="timeline-card">' +
        '<div class="timeline-date">' + formatDate(play.playDateYmd) + ' · ' + locName + '</div>' +
        '<div class="timeline-game">' + gameName + onlineBadge(play) +
          (winner ? ' <span class="timeline-winner">🏆 ' + winner.name + (winner.score > 0 ? ' ' + winner.score + '分' : '') + '</span>' : '') +
        '</div>' +
        '<div class="timeline-players">👥 ' + playerNames + '</div>' +
      '</div>' +
    '</div>';
  }

  container.innerHTML = html;
}

/* ===== Games Page ===== */
function renderGameLibrary() {
  var container = document.getElementById('gameGrid');
  if (!container) return;

  var data = window.KIZ_DATA;
  var winMaps = buildWinRateMaps();

  // Split games
  var baseGames = data.games.filter(function(g) { return !g.isExpansion; });
  var expGames = data.games.filter(function(g) { return g.isExpansion; });

  // Fill counts
  var countEl = document.getElementById('gameCount');
  if (countEl) countEl.textContent = baseGames.length + '款桌游本体 + ' + expGames.length + '款扩展';
  var baseCountEl = document.getElementById('baseCount');
  if (baseCountEl) baseCountEl.textContent = '🎮 桌游本体（' + baseGames.length + '款）';
  var expCountEl = document.getElementById('expCount');
  if (expCountEl) expCountEl.textContent = '📦 游戏扩展（' + expGames.length + '款）';

  function sortList(list, sortBy) {
    sortBy = sortBy || 'plays';
    var sorted = list.slice();
    if (sortBy === 'name') {
      sorted.sort(function(a, b) { return a.name.localeCompare(b.name, 'zh'); });
    } else if (sortBy === 'players') {
      sorted.sort(function(a, b) { return b.maxPlayers - a.maxPlayers || a.minPlayers - b.minPlayers; });
    } else if (sortBy === 'rating') {
      sorted.sort(function(a, b) { return (b.bggRating || 0) - (a.bggRating || 0); });
    } else if (sortBy === 'rank') {
      sorted.sort(function(a, b) {
        var ra = a.bggRank, rb = b.bggRank;
        if (ra == null && rb == null) return 0;
        if (ra == null) return 1;
        if (rb == null) return -1;
        return ra - rb;
      });
    } else if (sortBy === 'complexity') {
      sorted.sort(function(a, b) { return (b.complexity || 0) - (a.complexity || 0); });
    } else {
      sorted.sort(function(a, b) { return (b.playCount || 0) - (a.playCount || 0); });
    }
    return sorted;
  }

  function renderCard(g) {
    var count = g.playCount || 0;
    var thumb = getGameThumb(g);
    var rankBadge = g.bggRank ? '<span class="bgg-rank-badge">#' + g.bggRank + '</span>' : '';
    var stars = g.bggRating ? '⭐' + g.bggRating.toFixed(1) : '';
    var complexityHtml = g.complexity ? '<span class="complexity" title="复杂度 ' + g.complexity.toFixed(1) + '/5">' + renderComplexity(g.complexity) + ' ' + g.complexity.toFixed(1) + '</span>' : '';
    var gp = getGameBestPlayer(g.id, winMaps);
    var gpHtml = '';
    if (gp) {
      var crownLabel = gp.names.length > 1 ? '👑 胜率王（并列）' : '👑 胜率王';
      gpHtml = '<div class="winrate-line">' + crownLabel + '：' + gp.names.join('、') + '（' + gp.rate + '%）</div>';
    }
    var verBadge = g.ownedVersionLabel ? '<span class="version-badge">' + g.ownedVersionLabel + '</span>' : '';
    var rec = g.recordHolder;
    var recHtml = '';
    if (rec && rec.names && rec.names.length) {
      var names = rec.names.join('、');
      var titleParts = [];
      for (var ri = 0; ri < rec.names.length; ri++) {
        var rd = (rec.dates && rec.dates[ri]) ? rec.dates[ri] : '';
        var rpd = (rd.length === 8) ? rd.slice(0,4) + '-' + rd.slice(4,6) + '-' + rd.slice(6,8) : rd;
        titleParts.push(rec.names[ri] + (rpd ? ' ' + rpd : ''));
      }
      var recTitle = titleParts.length ? ' title="记录保持者：' + titleParts.join('、') + '"' : '';
      recHtml = '<div class="record-line"' + recTitle + '>🏅 记录：' + names + ' ' + rec.score + '分</div>';
    }
    return '<div class="game-card" onclick="location.href=\'game.html?id=' + g.id + '\'">' +
      '<div class="game-card-image">' +
        (thumb ? '<img src="' + thumb + '" alt="' + g.name + '" loading="lazy">' : '<span class="game-card-placeholder">🎲</span>') +
        rankBadge +
        verBadge +
      '</div>' +
      '<div class="game-card-body">' +
        '<div class="game-card-title">' + g.name + '</div>' +
        '<div class="game-card-meta">' +
          (stars ? '<span class="meta-stars">' + stars + '</span>' : '') +
          (complexityHtml || '') +
        '</div>' +
        '<div class="game-card-plays">🏆 ' + count + '次游玩</div>' +
        gpHtml +
        recHtml +
        '<div class="game-card-tags">' +
          '<span class="tag tag-primary">👥 ' + g.minPlayers + '-' + g.maxPlayers + '人</span>' +
          (g.bestPlayers ? '<span class="tag tag-accent">👍 ' + g.bestPlayers + '人</span>' : '') +
          (g.yearPublished ? '<span class="tag tag-secondary">📅 ' + g.yearPublished + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render(filterText, sortBy) {
    filterText = (filterText || '').toLowerCase();
    sortBy = sortBy || 'plays';

    var filteredBase = baseGames.filter(function(g) {
      return g.name.toLowerCase().indexOf(filterText) !== -1;
    });
    var filteredExp = expGames.filter(function(g) {
      return g.name.toLowerCase().indexOf(filterText) !== -1;
    });

    filteredBase = sortList(filteredBase, sortBy);
    filteredExp = sortList(filteredExp, sortBy);

    var total = filteredBase.length + filteredExp.length;
    var noResults = document.getElementById('noResults');
    if (total === 0) {
      if (noResults) noResults.style.display = 'block';
      document.getElementById('gameGrid').innerHTML = '';
      document.getElementById('expGrid').innerHTML = '';
      return;
    }
    if (noResults) noResults.style.display = 'none';

    var baseHtml = '';
    for (var i = 0; i < filteredBase.length; i++) { baseHtml += renderCard(filteredBase[i]); }
    document.getElementById('gameGrid').innerHTML = baseHtml;

    var expHtml = '';
    for (var i = 0; i < filteredExp.length; i++) { expHtml += renderCard(filteredExp[i]); }
    document.getElementById('expGrid').innerHTML = expHtml;
  }

  render();

  var searchInput = document.getElementById('gameSearch');
  var sortSelect = document.getElementById('gameSort');

  if (searchInput) {
    searchInput.addEventListener('input', function() {
      render(this.value, sortSelect ? sortSelect.value : 'plays');
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      render(searchInput ? searchInput.value : '', this.value);
    });
  }
}

/* ===== Game Profile Page ===== */
function renderGameProfile() {
  var container = document.getElementById('gameProfile');
  if (!container) return;

  var data = window.KIZ_DATA;
  var params = new URLSearchParams(window.location.search);
  var gameId = parseInt(params.get('id'));

  var game = null;
  for (var i = 0; i < data.games.length; i++) {
    if (data.games[i].id === gameId) { game = data.games[i]; break; }
  }
  if (!game) {
    container.innerHTML = '<div class="member-profile-error">未找到该游戏 <p style="margin-top:12px;"><a href="games.html" class="profile-back">← 返回游戏库</a></p></div>';
    return;
  }

  // 该游戏的全部对局（时间倒序）
  var gamePlays = [];
  for (var pi = 0; pi < data.plays.length; pi++) {
    if (data.plays[pi].gameRefId === gameId) gamePlays.push(data.plays[pi]);
  }
  gamePlays.sort(function(a, b) { return b.playDate.localeCompare(a.playDate); });

  // 成员维度统计（仅真实成员）
  var memberNameById = {};
  for (var mi = 0; mi < data.players.length; mi++) { memberNameById[data.players[mi].id] = data.players[mi].name; }
  var memberStat = {};
  var participantIds = {};
  // 扩展/变体使用统计
  var expCount = {};
  var boardCount = {};
  for (var gj = 0; gj < gamePlays.length; gj++) {
    var gp2 = gamePlays[gj];
    for (var gs = 0; gs < gp2.playerScores.length; gs++) {
      var ps = gp2.playerScores[gs];
      if (!memberNameById[ps.playerRefId]) continue;
      participantIds[ps.playerRefId] = true;
      var st = memberStat[ps.playerRefId] || (memberStat[ps.playerRefId] = { plays: 0, wins: 0 });
      st.plays++;
      if (ps.winner) st.wins++;
    }
    var eps = gp2.expansionPlays || [];
    for (var ge = 0; ge < eps.length; ge++) {
      var expName = getGameNameById(eps[ge].gameRefId);
      if (expName) expCount[expName] = (expCount[expName] || 0) + 1;
    }
    if (gp2.board) boardCount[gp2.board] = (boardCount[gp2.board] || 0) + 1;
  }
  var participantCount = Object.keys(participantIds).length;

  // 成员胜率榜（与"胜率王"一致：仅统计参与 ≥3 场的成员，避免少数场次 100% 的偶然；按胜率降序，同率比胜场、再比名字）
  var memberRows = Object.keys(memberStat).map(function(id) {
    var n = Number(id);
    return { id: n, name: memberNameById[n], plays: memberStat[n].plays, wins: memberStat[n].wins };
  }).filter(function(r) { return r.plays >= WIN_RATE_MIN_PLAYS; })
    .sort(function(a, b) {
      return (b.wins / b.plays) - (a.wins / a.plays) || b.wins - a.wins || a.name.localeCompare(b.name, 'zh');
    });

  // 胜率王（复用全局逻辑，含 ≥3 场门槛与并列）
  var winMaps = buildWinRateMaps();
  var bestPlayer = getGameBestPlayer(gameId, winMaps);

  // ===== Header =====
  var thumb = getGameThumb(game);
  var html = '<div class="profile-header">' +
    '<div class="profile-avatar-wrap">' +
      (thumb
        ? '<img class="game-profile-cover" src="' + thumb + '" alt="' + game.name + '">'
        : '<div class="game-profile-cover game-profile-cover-empty">🎲</div>') +
    '</div>' +
    '<div class="profile-info">' +
      '<h1 class="profile-name">' + game.name +
        (game.ownedVersionLabel ? ' <span class="version-badge">' + game.ownedVersionLabel + '</span>' : '') +
      '</h1>' +
      '<div class="game-card-tags" style="margin-top:8px;">' +
        '<span class="tag tag-primary">👥 ' + game.minPlayers + '-' + game.maxPlayers + '人</span>' +
        (game.bestPlayers ? '<span class="tag tag-accent">👍 ' + game.bestPlayers + '人</span>' : '') +
        (game.yearPublished ? '<span class="tag tag-secondary">📅 ' + game.yearPublished + '</span>' : '') +
        (game.bggRating ? '<span class="tag tag-secondary">⭐ BGG ' + game.bggRating.toFixed(1) + '</span>' : '') +
        (game.bggRank ? '<span class="tag tag-secondary">#️⃣ BGG Rank ' + game.bggRank + '</span>' : '') +
        (game.complexity ? '<span class="tag tag-secondary">🧠 重度 ' + game.complexity.toFixed(1) + '</span>' : '') +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">' +
        (game.bggId ? '<a href="https://boardgamegeek.com/boardgame/' + game.bggId + '" target="_blank" rel="noopener" class="profile-back">🔗 在 BGG 查看</a>' : '') +
        '<a href="games.html" class="profile-back">← 返回游戏库</a>' +
      '</div>' +
    '</div></div>';

  // ===== 统计卡片 =====
  var rec = game.recordHolder;
  var recText = (rec && rec.names && rec.names.length) ? rec.names.join('、') + ' ' + rec.score + '分' : '—';
  var bpText = bestPlayer ? bestPlayer.names.join('、') + '（' + bestPlayer.rate + '%）' : '—';
  html += '<div class="profile-stats">' +
    '<div class="profile-stat-card"><div class="stat-value">' + gamePlays.length + '</div><div class="stat-label">总场次</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value">' + participantCount + '</div><div class="stat-label">参与成员</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value stat-value-sm">' + recText + '</div><div class="stat-label">🏅 记录保持者</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value stat-value-sm">' + bpText + '</div><div class="stat-label">👑 胜率王</div></div>' +
  '</div>';

  // ===== 成员胜率榜 =====
  if (memberRows.length > 0) {
    html += '<h2 class="profile-section-title">📊 成员战绩</h2>' +
      '<p class="profile-section-note">仅统计参与 ≥' + WIN_RATE_MIN_PLAYS + ' 场的成员</p>' +
      '<div class="profile-game-list">';
    var crownNames = bestPlayer ? bestPlayer.names : [];
    for (var mr = 0; mr < memberRows.length; mr++) {
      var row = memberRows[mr];
      var rate = Math.round(row.wins / row.plays * 100);
      var crown = crownNames.indexOf(row.name) !== -1 ? '👑 ' : '';
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">' + crown + row.name + '</span>' +
        '<span class="profile-game-stat">' + rate + '%</span>' +
        '<span class="profile-game-detail">（' + row.wins + '胜/' + row.plays + '局）</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // ===== 扩展与变体 =====
  var expNames = Object.keys(expCount).sort(function(a, b) { return expCount[b] - expCount[a]; });
  var boardNames = Object.keys(boardCount).sort(function(a, b) { return boardCount[b] - boardCount[a]; });
  if (expNames.length > 0 || boardNames.length > 0) {
    html += '<h2 class="profile-section-title">🧩 扩展与变体</h2><div class="profile-game-list">';
    for (var en = 0; en < expNames.length; en++) {
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">🧩 ' + expNames[en] + '</span>' +
        '<span class="profile-game-detail">使用 ' + expCount[expNames[en]] + ' 次</span>' +
      '</div>';
    }
    for (var bn = 0; bn < boardNames.length; bn++) {
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">🎲 ' + boardNames[bn] + '</span>' +
        '<span class="profile-game-detail">使用 ' + boardCount[boardNames[bn]] + ' 次</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // ===== 全部对局 =====
  if (gamePlays.length > 0) {
    html += '<h2 class="profile-section-title">📋 全部对局（' + gamePlays.length + '场）</h2><div class="timeline">';
    for (var gi2 = 0; gi2 < gamePlays.length; gi2++) {
      var play = gamePlays[gi2];
      var locName = getLocationNameById(play.locationRefId);
      var winner = getWinnerFromScores(play.playerScores);

      var hasScoring = false;
      for (var si = 0; si < play.playerScores.length; si++) {
        if (play.playerScores[si].score) { hasScoring = true; break; }
      }
      var playerNames = '';
      for (var si2 = 0; si2 < play.playerScores.length; si2++) {
        var ps2 = play.playerScores[si2];
        if (si2 > 0) playerNames += ' · ';
        playerNames += getPlayerNameById(ps2.playerRefId);
        if (hasScoring && ps2.score && !ps2.winner) playerNames += ' ' + ps2.score + '分';
      }

      var expHtml = '';
      if (play.expansionPlays && play.expansionPlays.length > 0) {
        var exNames = [];
        for (var ei = 0; ei < play.expansionPlays.length; ei++) {
          var en2 = getGameNameById(play.expansionPlays[ei].gameRefId);
          if (en2) exNames.push(en2);
        }
        if (exNames.length > 0) expHtml = '<div class="timeline-expansion">🧩 ' + exNames.join('、') + '</div>';
      }
      var boardHtml = play.board ? '<div class="timeline-board">🎲 变体：' + play.board + '</div>' : '';
      var commentHtml = play.comments ? '<div class="timeline-comment">📝 ' + play.comments + '</div>' : '';

      html += '<div class="timeline-item">' +
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-date">' + formatDate(play.playDateYmd) + ' · ' + locName + '</div>' +
          '<div class="timeline-game">' +
            (winner ? '<span class="timeline-winner">🏆 ' + winner.name + (winner.score > 0 ? ' ' + winner.score + '分' : '') + '</span>' : '') +
            onlineBadge(play) +
          '</div>' +
          expHtml + boardHtml +
          '<div class="timeline-players">👥 ' + playerNames + '</div>' +
          commentHtml +
        '</div>' +
      '</div>';
    }
    html += '</div>';
  } else {
    html += '<p class="section-subtitle">本站暂无该游戏的对局记录</p>';
  }

  container.innerHTML = html;
}

/* ===== Plays Page ===== */
var playsPageConfig = {
  pageSize: 20,
  currentPage: 0,
  filteredPlays: [],
};

function renderPlayRecords() {
  var data = window.KIZ_DATA;

  // Fill count
  var countEl = document.getElementById('playCount');
  if (countEl) countEl.textContent = data.plays.length + '场对局';

  // Sort plays by date descending
  var sortedPlays = data.plays.slice().sort(function(a, b) {
    return b.playDate.localeCompare(a.playDate);
  });

  // 游戏 id -> 游戏对象（含简繁名，供名称搜索双向匹配）
  var gameById = {};
  for (var gi = 0; gi < data.games.length; gi++) {
    gameById[data.games[gi].id] = data.games[gi];
  }

  // Fill game filter
  var gameFilter = document.getElementById('playGameFilter');
  if (gameFilter) {
    var gameNames = {};
    for (var i = 0; i < data.games.length; i++) {
      gameNames[data.games[i].id] = data.games[i].name;
    }
    var sortedGameIds = Object.keys(gameNames).sort(function(a, b) {
      return gameNames[a].localeCompare(gameNames[b], 'zh');
    });
    for (var j = 0; j < sortedGameIds.length; j++) {
      var opt = document.createElement('option');
      opt.value = sortedGameIds[j];
      opt.textContent = gameNames[sortedGameIds[j]];
      gameFilter.appendChild(opt);
    }
  }

  // Fill location filter
  var locFilter = document.getElementById('playLocationFilter');
  if (locFilter) {
    for (var k = 0; k < data.locations.length; k++) {
      var opt = document.createElement('option');
      opt.value = data.locations[k].id;
      opt.textContent = data.locations[k].name;
      locFilter.appendChild(opt);
    }
  }

  // 填充玩家筛选（仅真实成员，按对局数降序；不含歪果人等伪玩家）
  // 第二个下拉用于「同局查询」：两人都选时只显示两人同场的对局
  var playerFilter = document.getElementById('playPlayerFilter');
  var player2Filter = document.getElementById('playPlayer2Filter');
  if (playerFilter || player2Filter) {
    var pCount = {};
    for (var pi = 0; pi < data.plays.length; pi++) {
      var pScores = data.plays[pi].playerScores;
      for (var pj = 0; pj < pScores.length; pj++) {
        var ppid = pScores[pj].playerRefId;
        pCount[ppid] = (pCount[ppid] || 0) + 1;
      }
    }
    var sortedPlayers = data.players.slice().sort(function(a, b) {
      return (pCount[b.id] || 0) - (pCount[a.id] || 0);
    });
    for (var pk = 0; pk < sortedPlayers.length; pk++) {
      if (playerFilter) {
        var pOpt = document.createElement('option');
        pOpt.value = sortedPlayers[pk].id;
        pOpt.textContent = sortedPlayers[pk].name;
        playerFilter.appendChild(pOpt);
      }
      if (player2Filter) {
        var pOpt2 = document.createElement('option');
        pOpt2.value = sortedPlayers[pk].id;
        pOpt2.textContent = sortedPlayers[pk].name;
        player2Filter.appendChild(pOpt2);
      }
    }
  }

  // 填充月份筛选（所有有对局的月份，倒序）
  var monthFilter = document.getElementById('playMonthFilter');
  if (monthFilter) {
    var monthSet = {};
    for (var mi = 0; mi < data.plays.length; mi++) {
      var ymd = String(data.plays[mi].playDateYmd || '');
      if (ymd.length >= 6) monthSet[ymd.slice(0, 6)] = true;
    }
    var months = Object.keys(monthSet).sort().reverse();
    for (var mj = 0; mj < months.length; mj++) {
      var mOpt = document.createElement('option');
      mOpt.value = months[mj];
      var y = months[mj].slice(0, 4);
      var mo = months[mj].slice(4, 6);
      mOpt.textContent = y + '年' + mo + '月';
      monthFilter.appendChild(mOpt);
    }
  }

  function setMonthDates(monthVal) {
    var fromEl = document.getElementById('playFromDate');
    var toEl = document.getElementById('playToDate');
    if (!fromEl || !toEl) return;
    if (!monthVal) return;
    var y = monthVal.slice(0, 4);
    var m = monthVal.slice(4, 6);
    fromEl.value = y + '-' + m + '-01';
    // 当月最后一天：new Date(y, m, 0) 即下个月的第0天=当月最后一天
    var lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
    var lastDayStr = lastDay < 10 ? '0' + lastDay : '' + lastDay;
    toEl.value = y + '-' + m + '-' + lastDayStr;
  }

  function filterAndRender() {
    var gameId = gameFilter ? gameFilter.value : '';
    var locId = locFilter ? locFilter.value : '';
    var playerId = playerFilter ? playerFilter.value : '';
    var playerId2 = player2Filter ? player2Filter.value : '';
    var fromEl = document.getElementById('playFromDate');
    var toEl = document.getElementById('playToDate');
    var from = fromEl ? fromEl.value.replace(/-/g, '') : '';
    var to = toEl ? toEl.value.replace(/-/g, '') : '';
    // 游戏名搜索（简繁通用：与 原名/简体版/繁体版 任一匹配即命中）
    var searchEl = document.getElementById('playSearch');
    var term = (searchEl ? searchEl.value : '').trim().toLowerCase();

    var filtered = sortedPlays.filter(function(p) {
      if (gameId && String(p.gameRefId) !== gameId) return false;
      if (locId && String(p.locationRefId) !== locId) return false;
      // 玩家筛选：含所选玩家即命中；两个都选时须两人同局
      if (playerId || playerId2) {
        var foundIds = {};
        for (var fp = 0; fp < p.playerScores.length; fp++) {
          foundIds[String(p.playerScores[fp].playerRefId)] = true;
        }
        if (playerId && !foundIds[playerId]) return false;
        if (playerId2 && !foundIds[playerId2]) return false;
      }
      // 日期范围（playDateYmd 为 YYYYMMDD 数字，统一转字符串比较）
      var ymd = String(p.playDateYmd || '');
      if (from && (!ymd || ymd < from)) return false;
      if (to && (!ymd || ymd > to)) return false;
      // 名称搜索（简繁双向匹配）
      if (term) {
        var gm = gameById[p.gameRefId];
        if (!gm) return false;
        var hay = (gm.name + ' ' + gm.nameSim + ' ' + gm.nameTrad).toLowerCase();
        if (hay.indexOf(term) === -1) return false;
      }
      return true;
    });

    if (countEl) countEl.textContent = filtered.length + '场对局';
    playsPageConfig.filteredPlays = filtered;
    playsPageConfig.currentPage = 0;
    renderTimelinePage();
  }

  function renderTimelinePage() {
    var config = playsPageConfig;
    var start = config.currentPage * config.pageSize;
    var end = Math.min(start + config.pageSize, config.filteredPlays.length);
    var pagePlays = config.filteredPlays.slice(start, end);

    var container = document.getElementById('playTimeline');
    var html = '';
    for (var i = 0; i < pagePlays.length; i++) {
      var play = pagePlays[i];
      var gameName = getGameNameForPlay(play);
      var locName = getLocationNameById(play.locationRefId);

      var winner = getWinnerFromScores(play.playerScores);

      // 判断是否为记分对局（有 scoringSetting 或任一玩家有分数）
      var hasScoring = false;
      for (var si = 0; si < play.playerScores.length; si++) {
        if (play.playerScores[si].score) { hasScoring = true; break; }
      }

      // 玩家列表：记分对局中非冠军玩家展示分数，冠军的分数/🏆 已在顶部游戏名行展示不重复
      var playerNames = '';
      for (var si2 = 0; si2 < play.playerScores.length; si2++) {
        var ps = play.playerScores[si2];
        var pn = getPlayerNameById(ps.playerRefId);
        if (si2 > 0) playerNames += ' · ';
        playerNames += pn;
        // 非冠军玩家才记分数（冠军的分数已显示在游戏名右边）
        if (hasScoring && ps.score && !ps.winner) {
          playerNames += ' ' + ps.score + '分';
        }
      }

      // 扩展信息
      var expHtml = '';
      if (play.expansionPlays && play.expansionPlays.length > 0) {
        var expNames = [];
        for (var ei = 0; ei < play.expansionPlays.length; ei++) {
          var expGid = play.expansionPlays[ei].gameRefId;
          var expGame = gameById[expGid];
          if (expGame) expNames.push(expGame.name);
        }
        if (expNames.length > 0) {
          expHtml = '<div class="timeline-expansion">🧩 ' + expNames.join('、') + '</div>';
        }
      }

      // 变体/版图信息
      var boardHtml = '';
      if (play.board) {
        boardHtml = '<div class="timeline-board">🎲 变体：' + play.board + '</div>';
      }

      var commentHtml = '';
      if (play.comments) {
        commentHtml = '<div class="timeline-comment">📝 ' + play.comments + '</div>';
      }

      html += '<div class="timeline-item">' +
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-date">' + formatDate(play.playDateYmd) + ' · ' + locName + '</div>' +
          '<div class="timeline-game">' + gameName + onlineBadge(play) +
            (winner ? ' <span class="timeline-winner">🏆 ' + winner.name + (winner.score > 0 ? ' ' + winner.score + '分' : '') + '</span>' : '') +
          '</div>' +
          expHtml +
          boardHtml +
          '<div class="timeline-players">👥 ' + playerNames + '</div>' +
          commentHtml +
        '</div>' +
      '</div>';
    }

    if (config.currentPage === 0) {
      container.innerHTML = html;
    } else {
      container.innerHTML += html;
    }

    // Show/hide load more
    var loadMore = document.getElementById('loadMoreContainer');
    if (loadMore) {
      loadMore.style.display = end >= config.filteredPlays.length ? 'none' : 'block';
    }
  }

  // Load more
  var loadMoreBtn = document.getElementById('loadMoreBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function() {
      playsPageConfig.currentPage++;
      renderTimelinePage();
    });
  }

  // Filters
  if (gameFilter) gameFilter.addEventListener('change', filterAndRender);
  if (locFilter) locFilter.addEventListener('change', filterAndRender);
  if (playerFilter) playerFilter.addEventListener('change', filterAndRender);
  if (player2Filter) player2Filter.addEventListener('change', filterAndRender);

  var fromEl = document.getElementById('playFromDate');
  var toEl = document.getElementById('playToDate');
  var clearBtn = document.getElementById('playDateClear');

  // 手动改了日期 → 月份下拉重置为"不限"
  function onDateChange() {
    if (monthFilter) monthFilter.value = '';
    filterAndRender();
  }

  if (fromEl) fromEl.addEventListener('change', onDateChange);
  if (toEl) toEl.addEventListener('change', onDateChange);
  if (clearBtn) clearBtn.addEventListener('click', function() {
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
    if (monthFilter) monthFilter.value = '';
    filterAndRender();
  });

  // 月份下拉
  if (monthFilter) monthFilter.addEventListener('change', function() {
    setMonthDates(this.value);
    filterAndRender();
  });

  // 上/下个月切换按钮
  var monthPrev = document.getElementById('playMonthPrev');
  var monthNext = document.getElementById('playMonthNext');
  function moveMonth(dir) {
    if (!monthFilter) return;
    var opts = monthFilter.options;
    var cur = monthFilter.selectedIndex;
    // 如果当前是"不限"，跳到第一个真实月份（index=1）
    if (cur === 0 || cur < 0) cur = 1;
    else cur += dir;
    if (cur < 0 || cur >= opts.length) return;
    monthFilter.selectedIndex = cur;
    setMonthDates(opts[cur].value);
    filterAndRender();
  }
  if (monthPrev) monthPrev.addEventListener('click', function() { moveMonth(-1); });
  if (monthNext) monthNext.addEventListener('click', function() { moveMonth(1); });

  // 游戏名搜索（输入即筛选）
  var searchEl = document.getElementById('playSearch');
  var searchClear = document.getElementById('playSearchClear');
  if (searchEl) searchEl.addEventListener('input', filterAndRender);
  if (searchClear) searchClear.addEventListener('click', function() {
    if (searchEl) searchEl.value = '';
    filterAndRender();
    if (searchEl) searchEl.focus();
  });

  filterAndRender();
}

/* ===== Members Page ===== */
function renderMemberWall() {
  var data = window.KIZ_DATA;
  var winMaps = buildWinRateMaps();

  // 只统计仍在游戏库中的对局（与个人主页口径一致，避免库外/已下架游戏导致两边数字不符）
  var validGameIds = {};
  for (var vi = 0; vi < data.games.length; vi++) { validGameIds[data.games[vi].id] = true; }

  // Count plays per player
  var playCount = {};
  for (var i = 0; i < data.plays.length; i++) {
    if (!validGameIds[data.plays[i].gameRefId]) continue;
    var scores = data.plays[i].playerScores;
    for (var j = 0; j < scores.length; j++) {
      var pid = scores[j].playerRefId;
      playCount[pid] = (playCount[pid] || 0) + 1;
    }
  }

  // 屏蔽 0 对局的玩家（暂不展示），再按对局数降序排序
  var sorted = data.players.filter(function(p) {
    return (playCount[p.id] || 0) > 0;
  }).sort(function(a, b) {
    return (playCount[b.id] || 0) - (playCount[a.id] || 0);
  });

  // Fill count
  var countEl = document.getElementById('memberCount');
  if (countEl) countEl.textContent = sorted.length + '位研究生玩家';

  // Top 3 podium
  var podiumEl = document.getElementById('podium');
  if (podiumEl && sorted.length >= 3) {
    var podiumClasses = ['podium-gold', 'podium-silver', 'podium-bronze'];
    var medals = ['🥇', '🥈', '🥉'];
    var html = '';
    for (var i = 0; i < Math.min(3, sorted.length); i++) {
      var p = sorted[i];
      html += '<a href="member.html?id=' + p.id + '" class="podium-card-link">' +
        '<div class="podium-card ' + podiumClasses[i] + '">' +
        '<div class="podium-medal">' + medals[i] + '</div>' +
        renderAvatar(p.name, p.avatarColor, 'margin:8px auto;') +
        '<div class="podium-name">' + p.name + '</div>' +
        '<div class="podium-plays">' + (playCount[p.id] || 0) + '场</div>' +
      '</div></a>';
    }
    podiumEl.innerHTML = html;
  }

  // Member grid (all members)
  var gridEl = document.getElementById('memberGrid');
  if (gridEl) {
    var html = '';
    for (var i = 0; i < sorted.length; i++) {
      var p = sorted[i];
      var initial = p.name.charAt(0);
      var bg = getPlayerBestGame(p.id, winMaps);
      var bgHtml = bg ? '<div class="member-best">🏆 最擅长：' + bg.gameName + '（' + bg.rate + '%，' + bg.wins + '/' + bg.plays + '）</div>' : '';
      html += '<a href="member.html?id=' + p.id + '" class="member-card-link">' +
      '<div class="member-card">' +
        renderAvatar(p.name, p.avatarColor, '') +
        '<div class="member-name">' + p.name + '</div>' +
        '<div class="member-plays">' + (playCount[p.id] || 0) + '场</div>' +
        bgHtml +
      '</div></a>';
    }
    gridEl.innerHTML = html;
  }
}

/* ===== Member Profile Page ===== */
function renderMemberProfile() {
  var data = window.KIZ_DATA;
  var params = new URLSearchParams(window.location.search);
  var playerId = parseInt(params.get('id'));
  if (!playerId) {
    document.getElementById('memberProfile').innerHTML = '<div class="member-profile-error">未指定成员 ID</div>';
    return;
  }

  // Find player
  var player = null;
  for (var i = 0; i < data.players.length; i++) {
    if (data.players[i].id === playerId) { player = data.players[i]; break; }
  }
  if (!player) {
    document.getElementById('memberProfile').innerHTML = '<div class="member-profile-error">未找到该成员</div>';
    return;
  }

  var winMaps = buildWinRateMaps();

  // Build valid game ID set (仅统计仍在游戏库中的游戏)
  var validGameIds = {};
  for (var vi = 0; vi < data.games.length; vi++) { validGameIds[data.games[vi].id] = true; }

  var playsByPlayer = {};
  var playerGames = {};

  // Gather all plays and game stats for this player
  for (var pi = 0; pi < data.plays.length; pi++) {
    var play = data.plays[pi];
    var gid = play.gameRefId;
    // 跳过已不在游戏库里的对局
    if (!validGameIds[gid]) continue;
    for (var sj = 0; sj < play.playerScores.length; sj++) {
      var ps = play.playerScores[sj];
      if (ps.playerRefId === playerId) {
        playsByPlayer[play.uuid] = play;
        if (!playerGames[gid]) playerGames[gid] = { plays: 0, wins: 0, totalScore: 0, scoreRounds: 0 };
        playerGames[gid].plays++;
        if (ps.winner) playerGames[gid].wins++;
        if (ps.score) { playerGames[gid].totalScore += ps.score; playerGames[gid].scoreRounds++; }
      }
    }
  }

  // Sort plays by date descending
  var sortedPlays = Object.keys(playsByPlayer).map(function(u) { return playsByPlayer[u]; })
    .sort(function(a, b) { return b.playDate.localeCompare(a.playDate); });

  // Compute stats
  var totalPlays = sortedPlays.length;
  var totalGames = Object.keys(playerGames).length;
  var totalWins = 0;
  for (var gk in playerGames) { totalWins += playerGames[gk].wins; }
  var winRate = totalPlays > 0 ? Math.round(totalWins / totalPlays * 100) : 0;

  // Game names + play counts
  var gameNames = {};
  for (var gi = 0; gi < data.games.length; gi++) { gameNames[data.games[gi].id] = data.games[gi].name; }

  // Most played games (top 8)
  var gamePlayList = [];
  for (var gk in playerGames) { gamePlayList.push({ id: parseInt(gk), plays: playerGames[gk].plays, wins: playerGames[gk].wins }); }
  gamePlayList.sort(function(a, b) { return b.plays - a.plays; });
  var topPlayed = gamePlayList.slice(0, 8);

  // Best win rate games (min 3 plays)
  var bestRateGames = gamePlayList.filter(function(g) { return g.plays >= 3; })
    .sort(function(a, b) { return (b.wins / b.plays) - (a.wins / a.plays) || b.plays - a.plays; })
    .slice(0, 5);

  // Record holder games
  var recordGames = [];
  for (var rg = 0; rg < data.games.length; rg++) {
    var rec = data.games[rg].recordHolder;
    if (rec && rec.names && rec.names.indexOf(player.name) !== -1) {
      recordGames.push({ game: data.games[rg], record: rec });
    }
  }

  // Build HTML
  var html = '';

  // Header
  html += '<div class="profile-header">' +
    '<div class="profile-avatar-wrap">' +
      renderAvatar(player.name, player.avatarColor, 'width:80px;height:80px;font-size:32px;') +
    '</div>' +
    '<div class="profile-info">' +
      '<h1 class="profile-name">' + player.name + '</h1>';

  if (player.bgaUsername) {
    html += '<div class="profile-bgg">🎮 <a href="https://boardgamearena.com/" target="_blank" rel="noopener">BGA: ' + player.bgaUsername + '</a></div>';
  }

  html += '<a href="members.html" class="profile-back">← 返回成员墙</a>' +
    '</div></div>';

  // Stats cards
  html += '<div class="profile-stats">' +
    '<div class="profile-stat-card"><div class="stat-value">' + totalPlays + '</div><div class="stat-label">总对局</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value">' + totalGames + '</div><div class="stat-label">游戏种类</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value">' + totalWins + '</div><div class="stat-label">总胜场</div></div>' +
    '<div class="profile-stat-card"><div class="stat-value">' + winRate + '%</div><div class="stat-label">总胜率</div></div>' +
  '</div>';

  // Best win rate games
  if (bestRateGames.length > 0) {
    html += '<h2 class="profile-section-title">🎯 最擅长的游戏</h2><div class="profile-game-list">';
    for (var bi = 0; bi < bestRateGames.length; bi++) {
      var bg = bestRateGames[bi];
      var gn = gameNames[bg.id] || 'Unknown';
      var rate = Math.round(bg.wins / bg.plays * 100);
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">' + gn + '</span>' +
        '<span class="profile-game-stat">' + rate + '%</span>' +
        '<span class="profile-game-detail">（' + bg.wins + '胜/' + bg.plays + '局）</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // Most played games
  if (topPlayed.length > 0) {
    html += '<h2 class="profile-section-title">📊 玩得最多的游戏</h2><div class="profile-game-list">';
    for (var ti = 0; ti < topPlayed.length; ti++) {
      var tg = topPlayed[ti];
      var gn2 = gameNames[tg.id] || 'Unknown';
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">' + gn2 + '</span>' +
        '<span class="profile-game-stat">' + tg.plays + '局</span>' +
        '<span class="profile-game-detail">（' + tg.wins + '胜）</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // Record holder games
  if (recordGames.length > 0) {
    html += '<h2 class="profile-section-title">🏅 记录保持者</h2><div class="profile-game-list">';
    for (var ri = 0; ri < recordGames.length; ri++) {
      var r = recordGames[ri];
      var scoreLabel = r.record.lowerBetter ? '最低' : '最高';
      var namesDisplay = r.record.names.join('、') + ' ' + r.record.score + '分';
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">' + r.game.name + '</span>' +
        '<span class="profile-game-stat">' + namesDisplay + '</span>' +
        '<span class="profile-game-detail">（' + scoreLabel + '分记录）</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // 交手记录：仅统计真实成员对手（排除歪果人/未解析玩家），≥3 场门槛
  var memberNameById = {};
  for (var mbi = 0; mbi < data.players.length; mbi++) { memberNameById[data.players[mbi].id] = data.players[mbi].name; }
  var h2h = {};
  for (var hi = 0; hi < sortedPlays.length; hi++) {
    var hPlay = sortedPlays[hi];
    var myEntry = null;
    for (var hs = 0; hs < hPlay.playerScores.length; hs++) {
      if (hPlay.playerScores[hs].playerRefId === playerId) { myEntry = hPlay.playerScores[hs]; break; }
    }
    if (!myEntry) continue;
    for (var ht = 0; ht < hPlay.playerScores.length; ht++) {
      var op = hPlay.playerScores[ht];
      if (op.playerRefId === playerId) continue;
      if (!memberNameById[op.playerRefId]) continue;
      var rec = h2h[op.playerRefId] || (h2h[op.playerRefId] = { plays: 0, win: 0, loss: 0, draw: 0 });
      rec.plays++;
      // 我赢他没赢=胜；他赢我没赢=负；都赢（合作）或都没赢=平
      if (myEntry.winner && !op.winner) rec.win++;
      else if (!myEntry.winner && op.winner) rec.loss++;
      else rec.draw++;
    }
  }
  var h2hList = Object.keys(h2h).map(function(id) {
    var rr = h2h[id];
    return { id: Number(id), name: memberNameById[id], plays: rr.plays, win: rr.win, loss: rr.loss, draw: rr.draw };
  }).filter(function(rr) { return rr.plays >= 3; })
    .sort(function(a, b) { return b.plays - a.plays; })
    .slice(0, 10);

  if (h2hList.length > 0) {
    html += '<h2 class="profile-section-title">🤝 交手记录</h2><div class="profile-game-list">';
    for (var hli = 0; hli < h2hList.length; hli++) {
      var hh = h2hList[hli];
      html += '<div class="profile-game-item">' +
        '<span class="profile-game-name">' + hh.name + '</span>' +
        '<span class="profile-game-stat">' + hh.win + '胜' + hh.loss + '负' + (hh.draw > 0 ? hh.draw + '平' : '') + '</span>' +
        '<span class="profile-game-detail">（共' + hh.plays + '局）</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // 对局历史：初始显示 10 场，「加载更多」每次追加 10 场
  var recentItems = [];
  for (var ri2 = 0; ri2 < sortedPlays.length; ri2++) {
    var sp = sortedPlays[ri2];
    var gn3 = getGameNameForPlay(sp) || 'Unknown';
    var loc = getLocationNameById(sp.locationRefId) || '';
    // Find this player's score in this play
    var myPs = null;
    for (var ssi = 0; ssi < sp.playerScores.length; ssi++) {
      if (sp.playerScores[ssi].playerRefId === playerId) { myPs = sp.playerScores[ssi]; break; }
    }
    // 判断这局是否有分数（有任一玩家记了分就算记分局）
    var playHasScore = false;
    for (var ssi2 = 0; ssi2 < sp.playerScores.length; ssi2++) {
      if (sp.playerScores[ssi2].score) { playHasScore = true; break; }
    }
    // 计分局显示分数，不计分局显示胜负（胜负文字放分数列对齐）
    var scoreStr = '';
    var trophyStr = '';
    if (myPs) {
      if (playHasScore) {
        if (myPs.score) {
          scoreStr = ' · ' + myPs.score + '分';
          if (myPs.winner) trophyStr = ' 🏆';
        }
        // 记分局但此人无分数 → 不显示结果
      } else {
        // 不计分对局：🏆 留在游戏名右边，胜/败放到分数列
        if (myPs.winner) {
          trophyStr = ' 🏆';
          scoreStr = '胜';
        } else {
          scoreStr = '败';
        }
      }
    }
    recentItems.push('<div class="profile-recent-item">' +
      '<span class="profile-recent-date">' + formatDate(sp.playDateYmd) + '</span>' +
      '<span class="profile-recent-game">' + gn3 + trophyStr + '</span>' +
      '<span class="profile-recent-loc">' + loc + '</span>' +
      '<span class="profile-recent-score">' + scoreStr + '</span>' +
    '</div>');
  }
  if (recentItems.length > 0) {
    html += '<h2 class="profile-section-title">🕐 对局历史（' + recentItems.length + '场）</h2>' +
      '<div class="profile-recent" id="profileRecentList"></div>' +
      '<div class="load-more" id="profileRecentMore"></div>';
  }

  document.getElementById('memberProfile').innerHTML = html;

  // 对局历史分页加载
  var recentListEl = document.getElementById('profileRecentList');
  if (recentListEl) {
    var recentShown = 0;
    var renderRecentMore = function() {
      recentShown = Math.min(recentShown + 10, recentItems.length);
      recentListEl.innerHTML = recentItems.slice(0, recentShown).join('');
      var moreEl = document.getElementById('profileRecentMore');
      if (moreEl) {
        if (recentShown < recentItems.length) {
          moreEl.innerHTML = '<button id="profileRecentMoreBtn">加载更多</button>';
          document.getElementById('profileRecentMoreBtn').addEventListener('click', renderRecentMore);
        } else {
          moreEl.innerHTML = '';
        }
      }
    };
    renderRecentMore();
  }
}

/* ===== Leaderboard Page ===== */
function renderLeaderboard() {
  var data = window.KIZ_DATA;

  // Count plays per game
  // Use pre-computed top games (already filtered for owned games)
  var topGames = data.stats.topGames;

  // Count plays per player
  var playerPlayCount = {};
  for (var i = 0; i < data.plays.length; i++) {
    var scores = data.plays[i].playerScores;
    for (var j = 0; j < scores.length; j++) {
      var pid = scores[j].playerRefId;
      playerPlayCount[pid] = (playerPlayCount[pid] || 0) + 1;
    }
  }
  var topPlayers = Object.keys(playerPlayCount)
    .map(function(id) { return {id: Number(id), count: playerPlayCount[id]}; })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, 10);

  // Count plays per location
  var locPlayCount = {};
  for (var i = 0; i < data.plays.length; i++) {
    var lid = data.plays[i].locationRefId;
    locPlayCount[lid] = (locPlayCount[lid] || 0) + 1;
  }

  // Render top games
  var gamesEl = document.getElementById('leaderboardGames');
  if (gamesEl) {
    var html = '';
    for (var i = 0; i < topGames.length; i++) {
      var name = getGameNameById(topGames[i].gameRefId);
      html += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + name + '</span>' +
        '<span class="leaderboard-value">' + topGames[i].count + '场</span>' +
      '</div>';
    }
    gamesEl.innerHTML = html;
  }

  // Render top players
  var playersEl = document.getElementById('leaderboardPlayers');
  if (playersEl) {
    var html = '';
    for (var i = 0; i < topPlayers.length; i++) {
      var name = getPlayerNameById(topPlayers[i].id);
      html += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + name + '</span>' +
        '<span class="leaderboard-value">' + topPlayers[i].count + '场</span>' +
      '</div>';
    }
    playersEl.innerHTML = html;
  }

  // 胜率榜：仅真实成员，≥10 场门槛，按胜率降序（同胜率比胜场、再比场次）
  var winRateEl = document.getElementById('leaderboardWinRate');
  if (winRateEl) {
    var memberIds = {};
    for (var mi = 0; mi < data.players.length; mi++) { memberIds[data.players[mi].id] = true; }
    var totalCount = {};
    var winCount = {};
    for (var wi = 0; wi < data.plays.length; wi++) {
      var wScores = data.plays[wi].playerScores;
      for (var wj = 0; wj < wScores.length; wj++) {
        var wpid = wScores[wj].playerRefId;
        if (!memberIds[wpid]) continue;
        totalCount[wpid] = (totalCount[wpid] || 0) + 1;
        if (wScores[wj].winner) winCount[wpid] = (winCount[wpid] || 0) + 1;
      }
    }
    var winRateList = Object.keys(totalCount)
      .map(function(id) {
        var n = Number(id);
        return { id: n, plays: totalCount[n], wins: winCount[n] || 0 };
      })
      .filter(function(p) { return p.plays >= 10; })
      .sort(function(a, b) {
        return (b.wins / b.plays) - (a.wins / a.plays) || b.wins - a.wins || b.plays - a.plays;
      })
      .slice(0, 10);
    var wrHtml = '';
    for (var wri = 0; wri < winRateList.length; wri++) {
      var wp = winRateList[wri];
      var wrate = Math.round(wp.wins / wp.plays * 100);
      wrHtml += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (wri < 3 ? ' top' : '') + '">' + (wri + 1) + '</span>' +
        '<span class="leaderboard-name">' + getPlayerNameById(wp.id) + '</span>' +
        '<span class="leaderboard-value">' + wrate + '% · ' + wp.wins + '胜/' + wp.plays + '场</span>' +
      '</div>';
    }
    winRateEl.innerHTML = wrHtml || '<div class="leaderboard-row"><span class="leaderboard-name">暂无足够数据（≥10场）</span></div>';
  }

  // Render locations
  var locsEl = document.getElementById('leaderboardLocations');
  if (locsEl) {
    var html = '';
    for (var i = 0; i < data.locations.length; i++) {
      var loc = data.locations[i];
      var count = locPlayCount[loc.id] || 0;
      html += '<div class="leaderboard-row">' +
        '<span class="leaderboard-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
        '<span class="leaderboard-name">' + loc.name + '</span>' +
        '<span class="leaderboard-value">' + count + '场</span>' +
      '</div>';
    }
    locsEl.innerHTML = html;
  }

  // Render stats row
  var statsEl = document.getElementById('statsRow');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="stat-item"><div class="stat-number">' + data.plays.length + '</div><div class="stat-label">总对局</div></div>' +
      '<div class="stat-item"><div class="stat-number green">' + data.games.length + '</div><div class="stat-label">游戏库</div></div>' +
      '<div class="stat-item"><div class="stat-number gold">' + data.players.length + '</div><div class="stat-label">玩家</div></div>' +
      '<div class="stat-item"><div class="stat-number">' + data.locations.length + '</div><div class="stat-label">地点</div></div>' +
      '<div class="stat-item"><div class="stat-number green">' + (data.plays.length / Math.max(1, data.players.length)).toFixed(1) + '</div><div class="stat-label">人均局数</div></div>';
  }
}
