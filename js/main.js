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

function renderAvatar(name, extraStyle) {
  var imgPath = 'img/' + name + '.jpg';
  return '<div class="member-avatar"' + (extraStyle || '') + '>' +
    '<img src="' + imgPath + '" class="avatar-img" onerror="this.style.display=\'none\'" onload="this.style.display=\'block\'">' +
    '<span class="avatar-initial">' + name.charAt(0) + '</span>' +
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

// 某游戏胜率最高的玩家（tie-break：胜场更多者优先）
function getGameBestPlayer(gid, maps) {
  var best = null;
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
    if (!best || rate > best.rate || (rate === best.rate && wc > best.wins)) {
      best = { playerId: pid, name: pname, rate: rate, wins: wc, plays: pc };
    }
  }
  return (best && best.rate > 0) ? best : null;
}

function getPlayerNameById(id) {
  var players = window.KIZ_DATA.players;
  for (var i = 0; i < players.length; i++) {
    if (players[i].id === id) return players[i].name;
  }
  return '玩家';
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
    var game = sorted[i];
    var name = game.name;
    var thumb = getGameThumb(game);
    html += '<div class="game-card" onclick="location.href=\'games.html\'">' +
      '<div class="game-card-image">' +
        (thumb ? '<img src="' + thumb + '" alt="' + name + '" loading="lazy">' : '<span class="game-card-placeholder">🎲</span>') +
      '</div>' +
      '<div class="game-card-body">' +
        '<div class="game-card-title">' + name + '</div>' +
        '<div class="game-card-plays">🏆 ' + (game.playCount || 0) + '次游玩</div>' +
      '</div>' +
    '</div>';
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
    var gameName = getGameNameById(play.gameRefId);
    var locName = getLocationNameById(play.locationRefId);
    var winner = getWinnerFromScores(play.playerScores);

    var playerNames = play.playerScores.map(function(ps) {
      return getPlayerNameById(ps.playerRefId);
    }).join(' · ');

    html += '<div class="timeline-item">' +
      '<div class="timeline-dot"></div>' +
      '<div class="timeline-card">' +
        '<div class="timeline-date">' + formatDate(play.playDateYmd) + ' · ' + locName + '</div>' +
        '<div class="timeline-game">' + gameName +
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
    var bggUrl = g.bggId ? 'https://boardgamegeek.com/boardgame/' + g.bggId : '#';
    var rankBadge = g.bggRank ? '<span class="bgg-rank-badge">#' + g.bggRank + '</span>' : '';
    var stars = g.bggRating ? '⭐' + g.bggRating.toFixed(1) : '';
    var complexityHtml = g.complexity ? '<span class="complexity" title="复杂度 ' + g.complexity.toFixed(1) + '/5">' + renderComplexity(g.complexity) + ' ' + g.complexity.toFixed(1) + '</span>' : '';
    var gp = getGameBestPlayer(g.id, winMaps);
    var gpHtml = gp ? '<div class="winrate-line">👑 胜率王：' + gp.name + '（' + gp.rate + '%）</div>' : '';
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
    return '<div class="game-card" onclick="window.open(\'' + bggUrl + '\', \'_blank\')">' +
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
  if (countEl) countEl.textContent = data.plays.length + '场线下对局';

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

    if (countEl) countEl.textContent = filtered.length + '场线下对局';
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
      var gameName = getGameNameById(play.gameRefId);
      var locName = getLocationNameById(play.locationRefId);

      var winner = getWinnerFromScores(play.playerScores);

      var playerNames = pagePlays[i].playerScores.map(function(ps) {
        return getPlayerNameById(ps.playerRefId);
      }).join(' · ');

      html += '<div class="timeline-item">' +
        '<div class="timeline-dot"></div>' +
        '<div class="timeline-card">' +
          '<div class="timeline-date">' + formatDate(play.playDateYmd) + ' · ' + locName + '</div>' +
          '<div class="timeline-game">' + gameName +
            (winner ? ' <span class="timeline-winner">🏆 ' + winner.name + (winner.score > 0 ? ' ' + winner.score + '分' : '') + '</span>' : '') +
          '</div>' +
          '<div class="timeline-players">👥 ' + playerNames + '</div>' +
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

  // Fill count
  var countEl = document.getElementById('memberCount');
  if (countEl) countEl.textContent = data.players.length + '位研究生玩家';

  // Count plays per player
  var playCount = {};
  for (var i = 0; i < data.plays.length; i++) {
    var scores = data.plays[i].playerScores;
    for (var j = 0; j < scores.length; j++) {
      var pid = scores[j].playerRefId;
      playCount[pid] = (playCount[pid] || 0) + 1;
    }
  }

  // Sort players by play count descending
  var sorted = data.players.slice().sort(function(a, b) {
    return (playCount[b.id] || 0) - (playCount[a.id] || 0);
  });

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
        renderAvatar(p.name, ' style="margin:8px auto;' + (p.avatarColor ? 'background:' + p.avatarColor + ';' : 'background:white;') + '"') +
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
        renderAvatar(p.name, (p.avatarColor ? ' style="background:' + p.avatarColor + ';"' : '')) +
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
      renderAvatar(player.name, (player.avatarColor ? ' style="width:80px;height:80px;font-size:32px;background:' + player.avatarColor + ';"' : ' style="width:80px;height:80px;font-size:32px;"')) +
    '</div>' +
    '<div class="profile-info">' +
      '<h1 class="profile-name">' + player.name + '</h1>';

  if (player.bggUsername) {
    html += '<div class="profile-bgg">🎲 <a href="https://boardgamegeek.com/user/' + encodeURIComponent(player.bggUsername) + '" target="_blank" rel="noopener">BGG: ' + player.bggUsername + '</a></div>';
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

  // Recent plays (last 10)
  if (sortedPlays.length > 0) {
    html += '<h2 class="profile-section-title">🕐 最近对局</h2><div class="profile-recent">';
    var recentCount = Math.min(10, sortedPlays.length);
    for (var ri2 = 0; ri2 < recentCount; ri2++) {
      var sp = sortedPlays[ri2];
      var gn3 = getGameNameById(sp.gameRefId) || 'Unknown';
      var loc = getLocationNameById(sp.locationRefId) || '';
      // Find this player's score in this play
      var myPs = null;
      for (var ssi = 0; ssi < sp.playerScores.length; ssi++) {
        if (sp.playerScores[ssi].playerRefId === playerId) { myPs = sp.playerScores[ssi]; break; }
      }
      var scoreStr = myPs && myPs.score ? ' · ' + myPs.score + '分' : '';
      var winStr = myPs && myPs.winner ? ' 🏆' : '';
      html += '<div class="profile-recent-item">' +
        '<span class="profile-recent-date">' + formatDate(sp.playDateYmd) + '</span>' +
        '<span class="profile-recent-game">' + gn3 + winStr + '</span>' +
        '<span class="profile-recent-loc">' + loc + '</span>' +
        '<span class="profile-recent-score">' + scoreStr + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  document.getElementById('memberProfile').innerHTML = html;
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
