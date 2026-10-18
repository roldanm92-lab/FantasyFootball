import json, math, collections, csv
S='raw/'
P=json.load(open(S+'players.json')); R=json.load(open(S+'rosters.json')); U={u['user_id']:u for u in json.load(open(S+'users.json'))}
L=json.load(open(S+'league.json')); sc=L['scoring_settings']; TP=json.load(open(S+'picks.json'))
POS=('QB','RB','WR','TE')
WEEK=json.load(open(S+'state.json'))['week']
LOG0=max(1,WEEK-5)  # first week shown in game logs (last 5 weeks)
def ncdf(x): return 0.5*(1+math.erf(x/math.sqrt(2)))
def pbo(m,sd,t): return 0 if m<=0 else 1-ncdf((t-m)/max(sd,1e-6))
LIN=['pass_yd','pass_td','pass_int','pass_2pt','rush_yd','rush_td','rush_2pt','rec','rec_yd','rec_td','rec_2pt','fum_lost']
def proj_score(st,pos):
    if pos=='DEF': return actual_score(st,pos)
    g=lambda k: st.get(k,0) or 0
    pts=sum(g(k)*sc[k] for k in LIN)
    if pos=='TE': pts+=g('rec')*sc['bonus_rec_te']
    for k,b1,b2,t1,t2,cv in [('rec_yd','bonus_rec_yd_100','bonus_rec_yd_200',100,200,.6),('rush_yd','bonus_rush_yd_100','bonus_rush_yd_200',100,200,.6),('pass_yd','bonus_pass_yd_300','bonus_pass_yd_400',300,400,.25)]:
        m=g(k); pts+=sc[b1]*pbo(m,cv*m,t1)+sc[b2]*pbo(m,cv*m,t2)
    return pts
def actual_score(st,pos):
    pts=sum((st.get(k) or 0)*v for k,v in sc.items() if k in st)
    if pos=='TE' and 'bonus_rec_te' not in st: pts+=(st.get('rec') or 0)*sc['bonus_rec_te']
    return pts
def posof(pid,e):
    if (e.get('player') or {}).get('position')=='DEF' or pid.isalpha(): return 'DEF'
    return (P.get(pid) or {}).get('position')
# --- projections weeks 6-18
ros=collections.defaultdict(float); games=collections.defaultdict(int); wk={}; opp6={}; wkp=collections.defaultdict(dict)
sched=collections.defaultdict(dict); played=collections.defaultdict(set)
for w in range(WEEK,19):
    for e in json.load(open(S+f'proj{w}.json')):
        pid=e['player_id']; st=e.get('stats') or {}; tm=e.get('team'); op=e.get('opponent')
        if tm and op: sched[tm][w]=op
        pos=posof(pid,e)
        if pos not in POS+('DEF',): continue
        if not (st.get('gp') or pos=='DEF'): continue
        pts=proj_score(st,pos)
        if pos=='DEF' and not op: continue
        ros[pid]+=pts; games[pid]+=1; wkp[pid][w]=round(pts,1)
        if w==WEEK: wk[pid]=pts; opp6[pid]=op
weeks_left=list(range(WEEK,19))
bye={t:[w for w in weeks_left if w not in sched[t]] for t in sched}
# --- actuals weeks 1-5 + defense vs position
logs=collections.defaultdict(dict); allowed=collections.defaultdict(lambda: collections.defaultdict(float)); dgames=collections.defaultdict(set)
for w in range(1,WEEK):
    for e in json.load(open(S+f'stats{w}.json')):
        pid=e['player_id']; st=e.get('stats') or {}; pos=posof(pid,e); op=e.get('opponent')
        if pos not in POS+('DEF',) or not st.get('gp'): continue
        pts=round(actual_score(st,pos),1); logs[pid][w]=[pts,op]
        if pos in POS and op: allowed[op][pos]+=pts; dgames[op].add(w)
teams=sorted(t for t in dgames)
dvp={}
for pos in POS:
    vals={t:allowed[t][pos]/len(dgames[t]) for t in teams}
    lo,hi=min(vals.values()),max(vals.values()); order=sorted(teams,key=lambda t:vals[t])  # first = toughest
    for t in teams:
        dvp.setdefault(t,{})[pos]=dict(pg=round(vals[t],1),tough=order.index(t)+1,score=round(10+90*(vals[t]-lo)/(hi-lo)))
# remaining SOS per team & position: avg points allowed by remaining opponents vs league avg
lgavg={pos:sum(dvp[t][pos]['pg'] for t in teams)/len(teams) for pos in POS}
sos={}
for t in sched:
    sos[t]={}
    for pos in POS:
        ops=[sched[t][w] for w in weeks_left if w in sched[t] and sched[t][w] in dvp]
        sos[t][pos]=round(100*(sum(dvp[o][pos]['pg'] for o in ops)/len(ops)/lgavg[pos]-1),1) if ops else 0
# --- values
fc={}
for line in open('data/fc.txt'):
    sid,n,pos,v=line.strip().split('|'); fc[sid]=int(v)
dpf=json.load(open('data/dpfit.json'))['dp']
ratios=sorted(fc[k]/dpf[k] for k in fc if k in dpf and dpf[k]>0 and fc[k]<3500); RATIO=ratios[len(ratios)//2]
import re
RB=json.load(open('data/rbscore.json'))
def norm(x): return re.sub(r'[^a-z]','',x.lower().replace(' jr','').replace(' sr','').replace(' iii','').replace(' ii',''))
rbs={}
for n,pos,sc_ in RB['rows']:
    if sc_ is not None: rbs[(norm(n),pos)]=sc_
rbs[('traviskelce','TE')]=80   # from RotoBot's Trade Finder suggestion
def from_score(pid):
    pl=P.get(pid) or {}; s_=rbs.get((norm(pl.get('full_name') or ''),pl.get('position')))
    if s_ is None: return None
    a,b=RB['fit']['QB' if pl.get('position')=='QB' else 'X']
    return int(min(2290,max(5,math.exp(a+b*s_))))
# recalibrate DP->value on players that have a score-based value
pairs=[(from_score(k),dpf[k]) for k in dpf if dpf[k]>50 and k not in fc and from_score(k)]
import numpy as np
xs=np.log([p[1] for p in pairs]); ys=np.log([p[0] for p in pairs]); DPB,DPA=np.polyfit(xs,ys,1)
print('DP refit on',len(pairs),'players: log v = %.3f + %.3f log dp'%(DPA,DPB))
def value(pid):
    if pid in fc: return fc[pid],'market'
    v=from_score(pid)
    if v is not None: return v,'est'
    d=dpf.get(pid)
    if d is None or d<=0: return 50,'est'
    return int(min(2290,max(30,math.exp(DPA+DPB*math.log(d))))),'est'
owner={}; starters=set()
for r in R:
    for pid in (r['players'] or []): owner[pid]=r['roster_id']
    for pid in (r['starters'] or []): starters.add(pid)
# include rostered players + best free agents
cand=set(owner)
fa=[pid for pid in ros if pid not in owner and posof(pid,{}) in POS and (P.get(pid) or {}).get('team')]
fa=sorted(fa,key=lambda p:-ros[p])[:80]; cand|=set(fa)
players=[]
for pid in cand:
    pl=P.get(pid) or {}
    pos='DEF' if pid.isalpha() else pl.get('position')
    if pos not in POS+('DEF',): continue
    v,src=(0,'n/a') if pos=='DEF' else value(pid)
    tm=pid if pos=='DEF' else (pl.get('team') or 'FA')
    players.append(dict(id=pid,n=(pl.get('full_name') if pos!='DEF' else f"{pid} D/ST"),p=pos,t=tm,a=pl.get('age'),inj=pl.get('injury_status') or '',
        r=round(ros[pid],1),g=games[pid],w=round(wk.get(pid,0),1),op=opp6.get(pid) or sched.get(tm,{}).get(WEEK) or '',
        v=v,s=src,o=owner.get(pid,0),st=1 if pid in starters else 0,
        log=[logs[pid].get(w,[None,None])[0] for w in range(LOG0,WEEK)],
        wp=[wkp[pid].get(w,0) for w in range(WEEK,19)], ib=pl.get('injury_body_part') or '', inote=(pl.get('injury_notes') or '')[:140]))
# picks
own={(s,rd,r['roster_id']):r['roster_id'] for s in ('2027','2028') for rd in (1,2,3) for r in R}
for t in TP:
    k=(t['season'],t['round'],t['roster_id'])
    if k in own: own[k]=t['owner_id']
stand=sorted(R,key=lambda r:(r['settings']['wins'],r['settings']['fpts']+r['settings'].get('fpts_decimal',0)/100))
slot={r['roster_id']:i for i,r in enumerate(stand)}
picks=[]
for (s,rd,orig),cur in own.items():
    i=slot[orig]; tier=0 if i<4 else 1 if i<8 else 2; tag=['Early','Mid','Late'][tier] if s=='2027' else ''
    if rd==1 and s=='2027': v,src=[5049,3325,2562][tier],'market'
    elif rd==1: v,src=3042,'market'
    elif rd==2 and s=='2027': v,src=[2000,1700,1450][tier],'est'
    elif rd==2: v,src=1600,'est'
    elif s=='2027': v,src=[900,800,700][tier],'est'
    else: v,src=800,'est'
    picks.append(dict(id=f'{s}-{rd}-{orig}',s=s,rd=rd,orig=orig,o=cur,v=v,tag=tag,src=src))
teamsinfo={}
for r in R:
    u=U.get(r['owner_id'],{}); md=u.get('metadata') or {}; s_=r['settings']
    teamsinfo[r['roster_id']]=dict(name=md.get('team_name') or u.get('display_name'),user=u.get('display_name'),w=s_['wins'],l=s_['losses'],
        pf=round(s_['fpts']+s_.get('fpts_decimal',0)/100,1),pa=round(s_.get('fpts_against',0)+s_.get('fpts_against_decimal',0)/100,1))
sched_l={}; scores=collections.defaultdict(list)
for w in range(1,19):
    try: M=json.load(open(S+f'm{w}.json'))
    except FileNotFoundError: continue
    pairs=collections.defaultdict(list)
    for m in M:
        if m.get('matchup_id'): pairs[m['matchup_id']].append(m['roster_id'])
        if w<WEEK and m.get('points'): scores[m['roster_id']].append(m['points'])
    sched_l[w]=[v for v in pairs.values() if len(v)==2]
import statistics
resid=[x-statistics.mean(v) for v in scores.values() if len(v)>1 for x in v]
team_sd=round(statistics.pstdev(resid),1) if resid else 25.0
ls=L['settings']
# live scoring for the week in progress: actual points + projections for players yet to finish
live=None
try:
    SCH=[g for g in json.load(open(S+'schedule.json')) if g['week']==WEEK]
    MW=json.load(open(S+f'm{WEEK}.json'))
except FileNotFoundError:
    SCH,MW=[],[]
status={}; frac={}
for g in SCH: status[g['home']]=g['status']; status[g['away']]=g['status']
def _left(m):
    # share of the game still to play, from Sleeper's live clock
    q=m.get('quarter'); qn=m.get('quarter_num'); tr=m.get('time_remaining') or '0:00'
    if q=='HALF': return 0.5
    try:
        qn=int(qn); mm,ss=[int(v) for v in tr.split(':')]
    except (TypeError,ValueError): return 0.5
    if qn>=5: return 0.05
    return max(0.0,min(1.0,((4-qn)*15+mm+ss/60)/60))
try:
    for g in json.load(open(S+'scores.json')):
        m=g.get('metadata') or {}
        if g.get('status')=='in_game':
            fr=_left(m); frac[m.get('home_team')]=fr; frac[m.get('away_team')]=fr
except FileNotFoundError: pass
if any(v in ('complete','in_game') for v in status.values()):
    REMAIN={'complete':0.0,'in_game':0.5,'pre_game':1.0}
    lt={}
    for m in MW:
        rid=m['roster_id']; pts=m.get('points') or 0; rem=0; full=0; left=[]
        for pid in (m.get('starters') or []):
            if pid=='0': continue
            pl=P.get(pid) or {}; tm=pid if pid.isalpha() else pl.get('team')
            stt=status.get(tm,'complete'); pr=wk.get(pid,0)
            full+=pr; r=pr*(frac.get(tm,0.5) if stt=='in_game' else REMAIN.get(stt,0)); rem+=r
            if stt!='complete': left.append(dict(id=pid,n=(pl.get('full_name') or (pid+' D/ST')),st=stt,frac=round(frac.get(tm,1.0 if stt=='pre_game' else 0.5),2),proj=round(pr,1),now=round((m.get('players_points') or {}).get(pid,0),1)))
        sd=team_sd*math.sqrt(rem/full) if full>0 else 0
        lt[str(rid)]=dict(pts=round(pts,2),rem=round(rem,1),proj=round(pts+rem,1),sd=round(sd,1),left=left)
    live=dict(week=WEEK,teams=lt)
# FAAB: budgets, remaining, and $ -> value rate from this league's winning bids
budget=ls.get('waiver_budget') or 0
faab_left={r['roster_id']:max(0,budget-(r['settings'].get('waiver_budget_used') or 0)) for r in R}
vals={p['id']:p['v'] for p in players}
ratios=[]
for w in range(1,WEEK+1):
    try: T=json.load(open(S+f'tx{w}.json'))
    except FileNotFoundError: continue
    for t in T:
        if t['type']=='waiver' and t['status']=='complete':
            bid=(t.get('settings') or {}).get('waiver_bid') or 0
            for pid in (t.get('adds') or {}):
                if bid>=10 and vals.get(pid): ratios.append(vals[pid]/bid)
faab_rate=round(statistics.median(ratios)) if len(ratios)>=5 else 15
from zoneinfo import ZoneInfo
import datetime as _dt
out=dict(asofLabel=_dt.datetime.now(ZoneInfo('America/New_York')).strftime('%b %d, %Y, %I:%M %p ET'),week=WEEK,logStart=LOG0,league=dict(id=L['league_id'],name=L['name'],slots=L['roster_positions']),me=12,
    teams=teamsinfo,players=players,picks=picks,bye=bye,sched={t:{str(w):o for w,o in d.items()} for t,d in sched.items()},dvp=dvp,sos=sos,lsched={str(w):v for w,v in sched_l.items()},teamSd=team_sd,playoffTeams=ls.get('playoff_teams',6),live=live,faab=dict(budget=budget,left={str(k):v for k,v in faab_left.items()},rate=faab_rate,bids=len(ratios)),tradeDeadline=ls.get('trade_deadline'),playoffStart=ls.get('playoff_week_start',15))
json.dump(out,open('data/data.json','w'),separators=(',',':'))
print(len(players),'players;',sum(1 for p in players if p['o']==0),'free agents;',len(dvp),'defenses')
for nm in ['Jaxon Smith-Njigba','Travis Kelce','Jayden Daniels','Trevor Lawrence','Drake Maye']:
    x=[p for p in players if p['n']==nm][0]; print(nm,x['w'],x['op'],x['r'],x['st'],x['log'])
print('DEN',dvp['DEN'],'SEA def proj', [p for p in players if p['id']=='SEA'][0])
