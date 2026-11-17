// Sanity check run before each publish: the data loads and the engines produce sane output.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const D = JSON.parse(fs.readFileSync(path.join(root, 'data/data.json')));
const ENGINE = require(path.join(root, 'src/engine.js'));
global.ENGINE = ENGINE;
const SUITE = require(path.join(root, 'src/engine2.js'));
function ok(c, m) { if (!c) { console.error('FAIL: ' + m); process.exit(1); } }
ok(Object.keys(D.teams).length === 12, '12 teams');
ok(D.players.length > 300, 'players loaded');
ok(D.players.filter(p => p.s === 'market').length >= 100, 'market values present');
ok(D.players.every(p => p.p === 'DEF' || (p.v > 0 && isFinite(p.v))), 'every player has a value');
const me = String(D.me), mine = D.players.filter(p => String(p.o) === me && p.p !== 'DEF').sort((a, b) => b.v - a.v);
const other = Object.keys(D.teams).find(t => t !== me), theirs = D.players.filter(p => String(p.o) === other && p.p !== 'DEF').sort((a, b) => b.v - a.v);
const r = ENGINE.analyze(D, me, other, [mine[0]], [theirs[0]]);
ok(r.edge > 0 && r.edge < 100 && isFinite(r.valueEdge) && isFinite(r.winEdge), 'trade analyzer');
const same = ENGINE.analyze(D, me, other, [], []);
ok(same.edge === 50, 'empty trade is 50%');
ok(Object.keys(SUITE.hub(D)).length === 12, 'hub');
ok(SUITE.rankings(D, 'ros').rows.length > 100, 'rankings');
SUITE.finder(D, me, {});
console.log('smoke ok: week', D.week, '|', D.players.length, 'players |', D.values.n, 'market values from', D.values.asof, '| example edge', r.edge.toFixed(1), '(value', r.valueEdge.toFixed(1), 'win-now', r.winEdge.toFixed(1), 'weight', r.winWeight + ')');
