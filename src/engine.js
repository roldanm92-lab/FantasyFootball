// Trade engine: pure functions, shared by the page and the test run.
var ENGINE = (function () {
  var PENALTY = 0.30;
  var SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, SF: 1 };
  var DEPTH = { QB: 2, RB: 3, WR: 4, TE: 1 };
  var POS = ['QB', 'RB', 'WR', 'TE'];

  function ppg(p) { return p.g ? p.r / p.g : 0; }

  // Best starting lineup by rest-of-season points per game.
  function lineup(roster) {
    var pool = roster.filter(function (p) { return p.g > 0; })
      .slice().sort(function (a, b) { return ppg(b) - ppg(a); });
    var used = {}, starters = [];
    function take(ok, n) {
      for (var i = 0; i < pool.length && n > 0; i++) {
        var p = pool[i];
        if (!used[p.id] && ok(p)) { used[p.id] = 1; starters.push(p); n--; }
      }
    }
    take(function (p) { return p.p === 'QB'; }, SLOTS.QB);
    take(function (p) { return p.p === 'RB'; }, SLOTS.RB);
    take(function (p) { return p.p === 'WR'; }, SLOTS.WR);
    take(function (p) { return p.p === 'TE'; }, SLOTS.TE);
    take(function (p) { return p.p !== 'QB'; }, SLOTS.FLEX);
    take(function () { return true; }, SLOTS.SF);
    var pts = starters.reduce(function (s, p) { return s + ppg(p); }, 0);
    return { ids: used, list: starters, ppg: pts };
  }

  function posScore(roster, pos) {
    return roster.filter(function (p) { return p.p === pos; })
      .map(function (p) { return p.r; }).sort(function (a, b) { return b - a; })
      .slice(0, DEPTH[pos]).reduce(function (s, x) { return s + x; }, 0);
  }

  function rank(scores, team) {
    var mine = scores[team];
    return 1 + Object.keys(scores).filter(function (t) { return scores[t] > mine; }).length;
  }

  function verdict(edge) {
    if (edge >= 55) return { label: 'Strong Accept', tone: 'good' };
    if (edge >= 52) return { label: 'Lean Accept', tone: 'good' };
    if (edge > 48) return { label: 'Fair Trade', tone: 'even' };
    if (edge > 45) return { label: 'Lean Pass', tone: 'bad' };
    return { label: 'Strong Pass', tone: 'bad' };
  }

  // give/get: arrays of asset objects (players have .p, picks have .rd)
  function analyze(D, me, partner, give, get) {
    var rosters = {};
    Object.keys(D.teams).forEach(function (t) { rosters[t] = []; });
    D.players.forEach(function (p) { if (p.o && p.p !== 'DEF' && rosters[p.o]) rosters[p.o].push(p); });
    var giveIds = {}, getIds = {};
    give.forEach(function (a) { giveIds[a.id] = 1; });
    get.forEach(function (a) { getIds[a.id] = 1; });

    var after = {};
    Object.keys(rosters).forEach(function (t) { after[t] = rosters[t].slice(); });
    after[me] = rosters[me].filter(function (p) { return !giveIds[p.id]; })
      .concat(get.filter(function (a) { return a.p; }));
    after[partner] = rosters[partner].filter(function (p) { return !getIds[p.id]; })
      .concat(give.filter(function (a) { return a.p; }));

    var myLine = lineup(after[me]), theirLine = lineup(after[partner]);
    var myBefore = lineup(rosters[me]);

    function side(assets, line) {
      var gross = 0, pen = 0, benched = [];
      assets.forEach(function (a) {
        gross += a.v;
        if (a.p && !line.ids[a.id]) { pen += a.v * PENALTY; benched.push(a); }
      });
      return { gross: gross, penalty: Math.round(pen), net: Math.round(gross - pen), benched: benched };
    }
    var out = side(give, theirLine);   // what the partner receives, judged by their lineup
    var inn = side(get, myLine);       // what I receive, judged by my lineup
    var total = inn.net + out.net;
    var edge = total ? (inn.net / total) * 100 : 50;

    var impact = POS.map(function (pos) {
      var b = {}, a = {};
      Object.keys(rosters).forEach(function (t) {
        b[t] = posScore(rosters[t], pos); a[t] = posScore(after[t], pos);
      });
      return { pos: pos, before: rank(b, me), after: rank(a, me) };
    });

    // bye conflicts: incoming players vs my starters after the trade
    var byes = [];
    get.forEach(function (a) {
      if (!a.p) return;
      var wk = (D.bye[a.t] || []).filter(function (w) { return w >= D.week; })[0];
      if (!wk) { byes.push({ asset: a, week: null, clash: [] }); return; }
      var clash = myLine.list.filter(function (s) {
        return s.id !== a.id && (D.bye[s.t] || []).indexOf(wk) >= 0;
      });
      byes.push({ asset: a, week: wk, clash: clash });
    });

    function avgAge(list) {
      var ps = list.filter(function (a) { return a.p && a.a; });
      var w = ps.reduce(function (s, a) { return s + a.v; }, 0);
      return w ? ps.reduce(function (s, a) { return s + a.a * a.v; }, 0) / w : null;
    }

    return {
      edge: edge, verdict: verdict(edge), give: out, get: inn,
      netValue: inn.net - out.net,
      lineupBefore: myBefore.ppg, lineupAfter: myLine.ppg,
      impact: impact, byes: byes,
      ageGive: avgAge(give), ageGet: avgAge(get),
      rosGive: give.reduce(function (s, a) { return s + (a.r || 0); }, 0),
      rosGet: get.reduce(function (s, a) { return s + (a.r || 0); }, 0)
    };
  }

  return { analyze: analyze, lineup: lineup, verdict: verdict, ppg: ppg };
})();
if (typeof module !== 'undefined') module.exports = ENGINE;
