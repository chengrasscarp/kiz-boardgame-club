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
  // Prefer game thumb, fallback to copy thumb (skip preview thumbs)
  var thumb = game.urlThumb || '';
  if ((!thumb || thumb.indexOf('previewthumb') !== -1) && game.copies && game.copies.length > 0) {
    var copyThumb = game.copies[0].urlThumb || '';
    if (copyThumb && copyThumb.indexOf('previewthumb') === -1) {
      thumb = copyThumb;
    }
  }
  // Only allow BGG CDN URLs (not preview thumbs)
  if (thumb && thumb.indexOf('https://cf.geekdo-images.com/') === 0 && thumb.indexOf('previewthumb') === -1) {
    return thumb;
  }
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
    return '<div class="game-card" onclick="window.open(\'' + bggUrl + '\', \'_blank\')">' +
      '<div class="game-card-image">' +
        (thumb ? '<img src="' + thumb + '" alt="' + g.name + '" loading="lazy">' : '<span class="game-card-placeholder">🎲</span>') +
        rankBadge +
      '</div>' +
      '<div class="game-card-body">' +
        '<div class="game-card-title">' + g.name + '</div>' +
        '<div class="game-card-meta">' +
          (stars ? '<span class="meta-stars">' + stars + '</span>' : '') +
          (complexityHtml || '') +
        '</div>' +
        '<div class="game-card-plays">🏆 ' + count + '次游玩</div>' +
        gpHtml +
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

  function filterAndRender() {
    var gameId = gameFilter ? gameFilter.value : '';
    var locId = locFilter ? locFilter.value : '';

    var filtered = sortedPlays.filter(function(p) {
      if (gameId && String(p.gameRefId) !== gameId) return false;
      if (locId && String(p.locationRefId) !== locId) return false;
      return true;
    });

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
      html += '<div class="podium-card ' + podiumClasses[i] + '">' +
        '<div class="podium-medal">' + medals[i] + '</div>' +
        renderAvatar(p.name, ' style="margin:8px auto;' + (p.avatarColor ? 'background:' + p.avatarColor + ';' : 'background:white;') + '"') +
        '<div class="podium-name">' + p.name + '</div>' +
        '<div class="podium-plays">' + (playCount[p.id] || 0) + '场</div>' +
      '</div>';
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
      html += '<div class="member-card">' +
        renderAvatar(p.name, (p.avatarColor ? ' style="background:' + p.avatarColor + ';"' : '')) +
        '<div class="member-name">' + p.name + '</div>' +
        '<div class="member-plays">' + (playCount[p.id] || 0) + '场</div>' +
        bgHtml +
      '</div>';
    }
    gridEl.innerHTML = html;
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
