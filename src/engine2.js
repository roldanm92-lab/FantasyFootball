// League tools built on ENGINE: rankings, sit/start, team hub, trade finder.
var SUITE = (function () {
  var POS = ['QB', 'RB', 'WR', 'TE'];
  function ppg(p) { return p.g ? p.r / p.g : 0; }

  function rostersOf(D) {
    var R = {};
    Object.keys(D.teams).forEach(function (t) { R[t] = []; });
    D.players.forEach(function (p) { if (p.o && p.p !== 'DEF') R[p.o].push(p); });
    return R;
  }

  // ---------- rankings: value over replacement with league-derived replacement levels
  function rankings(D, mode) {
    var R = rostersOf(D), counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    Object.keys(R).forEach(function (t) { ENGINE.lineup(R[t]).list.forEach(function (p) { counts[p.p]++; }); });
    var score = mode === 'week' ? function (p) { return p.w; } : function (p) { return ppg(p); };
    var pool = D.players.filter(function (p) { return POS.indexOf(p.p) >= 0 && p.g > 0; });
    var repl = {};
    POS.forEach(function (pos) {
      var xs = pool.filter(function (p) { return p.p === pos; }).map(score).sort(function (a, b) { return b - a; });
      repl[pos] = xs[Math.min(counts[pos], xs.length - 1)] || 0;
    });
    var games = mode === 'week' ? function () { return 1; } : function (p) { return p.g; };
    var rows = pool.map(function (p) {
      return { p: p, pts: mode === 'week' ? p.w : p.r, vor: (score(p) - repl[p.p]) * games(p) };
    }).sort(function (a, b) { return b.vor - a.vor; });
    var tier = 1, gap = mode === 'week' ? 1.6 : 14;
    rows.forEach(function (r, i) { if (i && rows[i - 1].vor - r.vor > gap && i < 150) tier++; r.tier = tier; r.rank = i + 1; });
    var posRank = {};
    rows.forEach(function (r) { posRank[r.p.p] = (posRank[r.p.p] || 0) + 1; r.posRank = r.p.p + posRank[r.p.p]; });
    return { rows: rows, repl: repl, counts: counts };
  }

  // ---------- weekly lineup for sit/start (DEF slot included)
  function weeklyLineup(roster) {
    var off = roster.filter(function (p) { return p.p !== 'DEF'; }).map(function (p) {
      return { id: p.id, p: p.p, g: p.w > 0 ? 1 : 0, r: p.w, src: p };
    });
    var lu = ENGINE.lineup(off);
    var defs = roster.filter(function (p) { return p.p === 'DEF'; }).sort(function (a, b) { return b.w - a.w; });
    var ids = {}; lu.list.forEach(function (x) { ids[x.id] = 1; });
    if (defs[0]) ids[defs[0].id] = 1;
    return { ids: ids, pts: lu.ppg + (defs[0] ? defs[0].w : 0), def: defs[0] || null };
  }

  function sitStart(D, team) {
    var roster = D.players.filter(function (p) { return String(p.o) === String(team); });
    var best = weeklyLineup(roster);
    var current = roster.filter(function (p) { return p.st; });
    var curPts = current.reduce(function (s, p) { return s + p.w; }, 0);
    var swapsIn = roster.filter(function (p) { return best.ids[p.id] && !p.st; });
    var swapsOut = roster.filter(function (p) { return p.st && !best.ids[p.id]; });
    return { roster: roster, best: best, currentPts: curPts, bestPts: best.pts, ins: swapsIn, outs: swapsOut };
  }

  function matchup(D, p) {
    if (p.p === 'DEF' || !p.op || !D.dvp[p.op]) return null;
    return D.dvp[p.op][p.p];
  }

  function form(p) {
    var xs = (p.log || []).filter(function (x) { return x !== null; });
    if (!xs.length) return null;
    var avg = xs.reduce(function (s, x) { return s + x; }, 0) / xs.length;
    return { avg: avg, lo: Math.min.apply(null, xs), hi: Math.max.apply(null, xs), n: xs.length };
  }

  // ---------- league hub
  function grade(rank) { return rank <= 2 ? 'A' : rank <= 4 ? 'B' : rank <= 7 ? 'C' : rank <= 10 ? 'D' : 'F'; }
  function hub(D) {
    var R = rostersOf(D), DEPTH = { QB: 2, RB: 3, WR: 4, TE: 1 }, teams = Object.keys(D.teams), out = {};
    var posPts = {};
    POS.forEach(function (pos) {
      posPts[pos] = {};
      teams.forEach(function (t) {
        posPts[pos][t] = R[t].filter(function (p) { return p.p === pos; }).map(function (p) { return p.r; })
          .sort(function (a, b) { return b - a; }).slice(0, DEPTH[pos]).reduce(function (s, x) { return s + x; }, 0);
      });
    });
    function rk(map, t) { return 1 + teams.filter(function (u) { return map[u] > map[t]; }).length; }
    var lineupMap = {}, valueMap = {};
    teams.forEach(function (t) {
      lineupMap[t] = ENGINE.lineup(R[t]).ppg;
      valueMap[t] = R[t].reduce(function (s, p) { return s + p.v; }, 0) +
        D.picks.filter(function (k) { return String(k.o) === t; }).reduce(function (s, k) { return s + k.v; }, 0);
    });
    teams.forEach(function (t) {
      var pr = {}; POS.forEach(function (pos) { pr[pos] = rk(posPts[pos], t); });
      var lr = rk(lineupMap, t), vr = rk(valueMap, t);
      var mode = lr <= 4 ? 'Contender' : (vr <= 4 && lr > 6) ? 'Rebuilding with assets' : lr >= 9 ? 'Rebuild candidate' : 'Middle of the pack';
      out[t] = { posRank: pr, grades: POS.reduce(function (o, pos) { o[pos] = grade(pr[pos]); return o; }, {}),
        lineup: lineupMap[t], lineupRank: lr, value: valueMap[t], valueRank: vr, mode: mode };
    });
    return out;
  }

  // ---------- trade finder
  function finder(D, me, opts) {
    opts = opts || {};
    var goal = opts.goal || 'balanced';
    var R = rostersOf(D), teams = Object.keys(D.teams).filter(function (t) { return t !== String(me); });
    var myPicks = D.picks.filter(function (k) { return String(k.o) === String(me) && k.rd === 1; });
    var mine = R[me].filter(function (p) { return p.v >= 700; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 14)
      .concat(myPicks);
    var baseMe = ENGINE.lineup(R[me]).ppg;
    var results = [];
    function evalTrade(t, give, get, baseThem) {
      var gi = {}, ge = {};
      give.forEach(function (a) { gi[a.id] = 1; }); get.forEach(function (a) { ge[a.id] = 1; });
      var myAfter = R[me].filter(function (p) { return !gi[p.id]; }).concat(get.filter(function (a) { return a.p; }));
      var thAfter = R[t].filter(function (p) { return !ge[p.id]; }).concat(give.filter(function (a) { return a.p; }));
      var ml = ENGINE.lineup(myAfter), tl = ENGINE.lineup(thAfter);
      function net(list, line) { return list.reduce(function (s, a) { return s + a.v * (a.p && !line.ids[a.id] ? 0.7 : 1); }, 0); }
      var inn = net(get, ml), out = net(give, tl), edge = 100 * inn / (inn + out);
      var myGain = ml.ppg - baseMe, theirGain = tl.ppg - baseThem;
      var ok, score;
      if (goal === 'win-now') { ok = myGain > 0.8 && edge >= 46 && edge <= 58 && theirGain > -3; score = myGain * 3 + (edge - 50) * 0.3; }
      else if (goal === 'value') { ok = edge >= 52 && edge <= 60 && theirGain > 0 && myGain > -4; score = (inn - out) / 400 + theirGain; }
      else { ok = edge >= 50 && edge <= 60 && myGain > -0.5 && theirGain > -1.5; score = (edge - 50) * 0.6 + myGain * 1.5 + Math.max(theirGain, 0) * 0.5; }
      if (ok) results.push({ team: t, give: give, get: get, edge: edge, myGain: myGain, theirGain: theirGain, score: score, netValue: inn - out });
    }
    teams.forEach(function (t) {
      var theirs = R[t].filter(function (p) { return p.v >= 700; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 12);
      var baseThem = ENGINE.lineup(R[t]).ppg, i, j, k;
      for (i = 0; i < mine.length; i++) for (k = 0; k < theirs.length; k++) evalTrade(t, [mine[i]], [theirs[k]], baseThem);
      for (i = 0; i < mine.length; i++) for (j = i + 1; j < mine.length; j++) for (k = 0; k < theirs.length; k++) evalTrade(t, [mine[i], mine[j]], [theirs[k]], baseThem);
      for (i = 0; i < mine.length; i++) for (k = 0; k < theirs.length; k++) for (j = k + 1; j < theirs.length; j++) evalTrade(t, [mine[i]], [theirs[k], theirs[j]], baseThem);
    });
    results.sort(function (a, b) { return b.score - a.score; });
    // keep variety: at most 2 per partner and per main incoming player
    var seenTeam = {}, seenGet = {}, picked = [];
    results.forEach(function (r) {
      var key = r.get.map(function (a) { return a.id; }).join('+');
      if ((seenTeam[r.team] || 0) >= 2 || seenGet[key]) return;
      seenTeam[r.team] = (seenTeam[r.team] || 0) + 1; seenGet[key] = 1; picked.push(r);
    });
    return picked.slice(0, opts.limit || 12);
  }

  return { rankings: rankings, sitStart: sitStart, matchup: matchup, form: form, hub: hub, finder: finder, ppg: ppg, POS: POS };
})();
if (typeof module !== 'undefined') module.exports = SUITE;

// ---------- needs/surplus and goal-driven finder (v2)
SUITE.needs = function (D, me) {
  var h = SUITE.hub(D)[me], ranks = h.posRank;
  var order = SUITE.POS.slice().sort(function (a, b) { return ranks[b] - ranks[a]; });
  return { need: order.slice(0, 2), surplus: order[order.length - 1], ranks: ranks };
};
SUITE.find = function (D, me, opts) {
  var POS = SUITE.POS, DEPTH = { QB: 2, RB: 3, WR: 4, TE: 1 };
  me = String(me);
  var R = {}; Object.keys(D.teams).forEach(function (t) { R[t] = []; });
  D.players.forEach(function (p) { if (p.o && p.p !== 'DEF') R[p.o].push(p); });
  function posScore(list, pos) { return list.filter(function (p) { return p.p === pos; }).map(function (p) { return p.r; }).sort(function (a, b) { return b - a; }).slice(0, DEPTH[pos]).reduce(function (s, x) { return s + x; }, 0); }
  var base = {}; POS.forEach(function (pos) { base[pos] = {}; Object.keys(R).forEach(function (t) { base[pos][t] = posScore(R[t], pos); }); });
  function rankWith(pos, team, score, other, otherScore) {
    var r = 1; Object.keys(R).forEach(function (t) { if (t === team) return; var s = t === other ? otherScore : base[pos][t]; if (s > score) r++; }); return r;
  }
  var picks = D.picks.filter(function (k) { return String(k.o) === me && k.rd <= 2; });
  var mineAll = R[me].filter(function (p) { return p.v >= 300; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 16).concat(picks);
  var gives = opts.mode === 'shop' ? [opts.shop] : mineAll;
  var baseMe = ENGINE.lineup(R[me]).ppg, out = [];
  Object.keys(R).forEach(function (t) {
    if (t === me) return;
    var theirs = R[t].filter(function (p) { return p.v >= 300; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 14);
    if (opts.mode === 'target') { if (String(opts.target.o) !== t) return; }
    var baseThem = ENGINE.lineup(R[t]).ppg;
    function ev(give, get) {
      if (opts.mode === 'target' && get.indexOf(opts.target) < 0) return;
      if (opts.mode === 'position' && !get.some(function (a) { return a.p === opts.pos; })) return;
      if (opts.mode === 'shop' && give.indexOf(opts.shop) < 0) return;
      var gi = {}, ge = {}; give.forEach(function (a) { gi[a.id] = 1; }); get.forEach(function (a) { ge[a.id] = 1; });
      var mA = R[me].filter(function (p) { return !gi[p.id]; }).concat(get.filter(function (a) { return a.p; }));
      var tA = R[t].filter(function (p) { return !ge[p.id]; }).concat(give.filter(function (a) { return a.p; }));
      var ml = ENGINE.lineup(mA), tl = ENGINE.lineup(tA);
      function net(list, line) { return list.reduce(function (s, a) { return s + a.v * (a.p && !line.ids[a.id] ? 0.7 : 1); }, 0); }
      var inn = net(get, ml), outv = net(give, tl), edge = 100 * inn / (inn + outv);
      if (edge < 48 || edge > 60) return;
      var myGain = ml.ppg - baseMe, theirGain = tl.ppg - baseThem;
      if (theirGain < -2.5 && edge > 55) return;
      var focus = opts.mode === 'position' ? opts.pos : (get.filter(function (a) { return a.p; })[0] || {}).p;
      var room = null;
      if (focus) {
        var mS = posScore(mA, focus), tS = posScore(tA, focus);
        room = { pos: focus, myBefore: rankWith(focus, me, base[focus][me], null, 0), myAfter: rankWith(focus, me, mS, t, tS),
          theirBefore: rankWith(focus, t, base[focus][t], null, 0), theirAfter: rankWith(focus, t, tS, me, mS) };
      }
      var score;
      if (opts.mode === 'position') { if (!room || room.myAfter >= room.myBefore) return; score = (room.myBefore - room.myAfter) * 3 + myGain - Math.abs(edge - 53) * 0.3; }
      else if (opts.mode === 'target') score = 10 - Math.abs(edge - 52) + myGain * 0.5;
      else score = inn / 500 + myGain + Math.max(theirGain, 0) * 0.3;
      out.push({ team: t, give: give, get: get, edge: edge, myGain: myGain, theirGain: theirGain, netValue: inn - outv, room: room, score: score });
    }
    var i, j, k;
    for (i = 0; i < gives.length; i++) for (k = 0; k < theirs.length; k++) ev([gives[i]], [theirs[k]]);
    for (i = 0; i < mineAll.length; i++) for (j = i + 1; j < mineAll.length; j++) for (k = 0; k < theirs.length; k++) ev([mineAll[i], mineAll[j]], [theirs[k]]);
    for (i = 0; i < gives.length; i++) for (k = 0; k < theirs.length; k++) for (j = k + 1; j < theirs.length; j++) ev([gives[i]], [theirs[k], theirs[j]]);
  });
  out.sort(function (a, b) { return b.score - a.score; });
  var seenT = {}, seenK = {}, res = [];
  out.forEach(function (r) { var key = r.get.map(function (a) { return a.id; }).join('+') + '|' + r.give.map(function (a) { return a.id; }).join('+'); var gk = r.get.map(function (a) { return a.id; }).join('+');
    if ((seenT[r.team] || 0) >= (opts.mode === 'target' ? 12 : 2) || seenK[key] || (opts.mode !== 'target' && seenK[gk])) return; seenT[r.team] = (seenT[r.team] || 0) + 1; seenK[key] = 1; seenK[gk] = 1; res.push(r); });
  return res.slice(0, opts.limit || 10);
};
