"""Audit extracted scenario.chk bytes; no trigger execution or inferred unit counts.

Usage: python tools/audit-desertstrike.py scenario.chk desert-tileset-directory
Extract SCX with chklib.mpq.read_scenario(Path(scx).read_bytes()).
Tile directory needs Desert.cv5, Desert.vf4 (case insensitive filenames).
"""
import base64, hashlib, json, struct, sys, gzip
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
raw=Path(sys.argv[1]).read_bytes(); sections={}; offset=0
while offset<len(raw):
    key,size=struct.unpack_from('<4sI',raw,offset);offset+=8
    assert offset+size<=len(raw)
    sections[key.decode('latin1')]=raw[offset:offset+size];offset+=size
assert len(sections['TRIG'])==328*2400
st=sections['STR ']; strings=['']
for pos in struct.unpack_from('<'+'H'*struct.unpack_from('<H',st)[0],st,2):
    strings.append(st[pos:st.index(0,pos)].decode('cp1252',errors='replace'))
cn='None CountdownTimer Command Bring Accumulate Kill CommandTheMost CommandTheMostAt MostKills HighestScore MostResources Switch ElapsedTime IsBriefing Opponents Deaths CommandTheLeast CommandTheLeastAt LeastKills LowestScore LeastResources Score Always Never'.split()
an='None Victory Defeat PreserveTrigger Wait PauseGame UnpauseGame Transmission PlaySound DisplayTextMessage CenterView CreateUnitWithProperties SetMissionObjectives SetSwitch SetCountdownTimer RunAiScript RunAiScriptAtLocation LeaderboardCtrl LeaderboardCtrlAtLoc LeaderboardResources LeaderboardKills LeaderboardPoints KillUnit KillUnitAtLocation RemoveUnit RemoveUnitAtLocation SetResources SetScore MinimapPing TalkingPortrait MuteUnitSpeech UnmuteUnitSpeech LeaderboardCompPlayers LeaderboardGoalCtrl LeaderboardGoalCtrlAtLoc LeaderboardGoalResources LeaderboardGoalKills LeaderboardGoalPoints MoveLocation MoveUnit LeaderboardGreed SetNextScenario SetDoodadState SetInvincibility CreateUnit SetDeaths Order Comment GiveUnitsToPlayer ModifyUnitHitpoints ModifyUnitEnergy ModifyUnitShieldPoints ModifyUnitResourceAmount ModifyUnitHangarCount PauseTimer UnpauseTimer Draw SetAllianceStatus DisableDebugMode EnableDebugMode'.split()
# Every physical TRIG record is assigned exactly once. IDs are one-based (prior
# extraction used zero-based IDs; audit documents this rather than shifting bytes).
groups=[
 (1,1,'변환 적용','core.js: carrier/reaver ammunition; minerals-only economy'),
 (2,2,'제외','decorative beacon doodad state'),
 (3,3,'변환 적용','autobattle.begin: +300; hidden builder replaces civilian selection'),
 (4,4,'제외','engine leaderboard'),
 (5,6,'변환 적용','team ownership and shared vision'),
 (7,8,'제외','all human opponents left; no multiplayer disconnect model'),
 (9,14,'제외','3v3 civilian/leaver ownership'),
 (15,24,'변환 적용','addonReason: parent attachment validated before payment'),
 (25,30,'제외','leaver cleanup and leaderboard'),
 (31,31,'변환 적용','deploymentPoint: battlefield boundaries'),
 (32,34,'변환 적용','die: main objective destruction; production elimination not a loss'),
 (35,37,'변환 적용','team-owned fortifications, no computer proxy ownership'),
 (38,50,'변환 적용','single hidden builder; worker recruitment disabled in lane mode'),
 (51,64,'변환 적용','makeBunker/fireBunkers: garrison combat without proxy players'),
 (65,66,'제외','civilian BOOM command; current touch command model has no civilian'),
 (67,84,'적용','tickIncome: separate 16-cycle income, duplicate zero-gas trigger redundant'),
 (85,87,'변환 적용','placement/botBuildGas: reject sixth facility before payment'),
 (88,88,'변환 적용','incomePauseLeft UI'),
 (89,100,'적용','tickIncome: add investment counters once per level'),
 (101,105,'버그 수정','team-symmetric tribunal maximum 2 and active arbiter maximum 3'),
 (106,107,'변환 적용','waveClock: simultaneous 1v1 countdown'),
 (108,112,'버그 수정','building limits; Evolution Chamber first +100 only, reject duplicate exploit'),
 (113,119,'변환 적용','spawnWave: simultaneous teams, remove 3v3 turn ownership'),
 (120,123,'제외','civilian movement restriction'),
 (124,138,'변환 적용','checkBaseWarning: unit approach; production buildings isolated'),
 (139,156,'제외','3v3 worker attack-count accounting'),
 (157,157,'변환 적용','checkBaseWarning: reset after units leave'),
 (158,175,'제외','3v3 worker attack-count accounting'),
 (176,193,'제외','unequal-player special refunds'),
 (194,197,'변환 적용','specials: Archives prerequisite and consume battery'),
 (198,198,'변환 적용','waveProducers excludes flying/unfinished producers'),
 (199,201,'제외','engine unit ceiling/leaver messages'),
 (202,203,'변환 적용','buildReason: arbiter limit notice before payment'),
 (204,205,'제외','civilian BOOM notification'),
 (206,208,'변환 적용','special activation notice'),
 (209,217,'변환 적용','maintainAdvance/autocast replaces periodic engine orders'),
 (218,218,'제외','Never: section-heading comment'),
 (219,276,'버그 수정','waveGroups/spawnWave: actual action counts/properties; symmetric pool threshold 6'),
 (277,282,'변환 적용','waveClock ends one snapshot for each team; no owner cycling'),
 (283,293,'변환 적용','formation spawn; Never old movement excluded'),
 (294,295,'제외','Never: development cheats'),
 (296,301,'제외','engine nuclear missile ownership workaround; no lane missile construction command'),
 (302,307,'버그 수정','special mind: finite immutable snapshot, every other enemy unit'),
 (308,317,'버그 수정','special broodling: finite snapshot replacement; no bunker recursion'),
 (318,322,'변환 적용','special heal: 45 pulses, every 13 hyper cycles'),
 (323,325,'변환 적용','fixed-time counters replace Wait(0) hyper engine loop'),
 (326,326,'제외','Never: unused AI script'),
 (327,328,'제외','nuclear ownership timeout counters (296–301)')]
triggers=[]
for i in range(328):
    t=sections['TRIG'][i*2400:(i+1)*2400];conditions=[];actions=[]
    for pos in range(0,320,20):
        vals=struct.unpack_from('<IIIHBBBB',t,pos)
        if vals[5]: conditions.append(dict(zip(['location','player','amount','unit','comparison','type','resource','flags'],vals),name=cn[vals[5]]))
    for pos in range(320,2368,32):
        vals=struct.unpack_from('<IIIIIIHBBB',t,pos)
        if vals[7]:
            a=dict(zip(['location','string','wav','time','player','amount','unit','type','count','flags'],vals),name=an[vals[7]])
            if a['string']:a['text']=strings[a['string']]
            actions.append(a)
    matches=[g for g in groups if g[0]<=i+1<=g[1]];assert len(matches)==1,(i+1,matches)
    g=matches[0]
    triggers.append(dict(id=i+1,sourceIndex=i,owners=[p for p in range(28)if t[2372+p]],conditions=conditions,actions=actions,portStatus=g[2],mappedRule=g[3],executionFlags=struct.unpack_from('<I',t,2368)[0]))
locations=[]
for pos in range(0,len(sections['MRGN']),20):
    l,top,r,b,name,flags=struct.unpack_from('<IIIIHH',sections['MRGN'],pos)
    if any([l,top,r,b,name,flags]):locations.append(dict(id=pos//20+1,left=l,top=top,right=r,bottom=b,name=strings[name],flags=flags))
units=[]
for pos in range(0,len(sections['UNIT']),36):
    x,y,type=struct.unpack_from('<HHH',sections['UNIT'],pos+4)
    units.append(dict(x=x,y=y,unitId=type,owner=sections['UNIT'][pos+16]))
tile_dir=Path(sys.argv[2]); cv=(tile_dir/'desert.cv5').read_bytes();vf=(tile_dir/'desert.vf4').read_bytes()
tiles=list(struct.unpack('<9216H',sections['MTXM']));buildable=[];walkable=[]
for tile in tiles:
    group=(tile&0x7fff)>>4; flags=struct.unpack_from('<H',cv,group*52+2)[0];mega=struct.unpack_from('<H',cv,group*52+20+(tile&15)*2)[0]
    mini=struct.unpack_from('<16H',vf,mega*32);walk=all(v&1 for v in mini)
    buildable.append(int(not flags&0x80 and walk));walkable.append(int(sum(bool(v&1)for v in mini)>12))
# A crop is a declared adaptation, NOT an invented original exclusive area.
# Left upper starting slot: x=0..1056 before the wall, y=0..608 above shared battlefield.
region=dict(left=0,top=0,tileWidth=33,tileHeight=19,exclusiveInOriginal=False,selection='upper-left starting slot crop; original permits shared team territory')
region['buildable']=[buildable[y*96+x] for y in range(19)for x in range(33)]
region['buildableTileCount']=sum(region['buildable'])
props=[]
for pos in range(0,len(sections['UPRP']),20):
    sf,pf,owner,hp,shield,energy,res,hangar,status,unused=struct.unpack_from('<HHBBBBIHHI',sections['UPRP'],pos)
    props.append(dict(id=pos//20+1,specialValid=sf,propertyValid=pf,hp=hp,shield=shield,energy=energy,hangar=hangar,status=status))
snapshot=dict(source=dict(url='https://staredit.net/sc1db/file/1246/',sha256=hashlib.sha256((ROOT/'resources/desertstrike/original.scx').read_bytes()).hexdigest(),chkSha256=hashlib.sha256(raw).hexdigest(),triggerNumbering='one-based; prior evidence file is zero-based'),map=dict(tileWidth=96,tileHeight=96,tileset='Desert',terrain=tiles,buildable=buildable,walkable=walkable,locations=locations,units=units,productionRegion=region,gasSlots=[u for u in units if u['unitId']==188]),properties=props,originalTriggers=triggers)
(ROOT/'resources/original-desertstrike.json').write_text(json.dumps(snapshot,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'resources/desertstrike/scenario.chk.gz').write_bytes(gzip.compress(raw,mtime=0))
rules=json.loads((ROOT/'resources/desert-strike-v1.json').read_text());unix=sections['UNIx'];rules['costs']={id:[struct.unpack_from('<H',unix,2280+int(id)*2)[0],struct.unpack_from('<H',unix,2736+int(id)*2)[0]]for id in rules['costs']}
for trigger in triggers[218:247]:
    buildings=[c['unit']for c in trigger['conditions']if c['name']=='Bring'and str(c['unit'])in rules['costs']]
    groups=[[a['unit'],a['count']]for a in trigger['actions']if a['name']=='CreateUnitWithProperties'and not a['flags']&2]
    if buildings and groups:rules['waves'][str(buildings[0])]=groups
rules['map']=dict(productionRegion=region,gasSlots=[[64,32],[192,32],[320,32],[64,96],[64,160]])
rules['properties']=props;rules['poolBonusThreshold']=[6,6];rules['maxBuildings']={'166':1,'122':1,'139':1,'155':1,'170':2};rules['maxActiveUnits']={'71':3}
rules['specials']={'115':dict(effect='heal',pulses=45,intervalCycles=13,consumeBuilding=True),'134':dict(effect='broodlings',consumeBuilding=True),'172':dict(effect='mind',requires=[165],consumeBuilding=True)}
unix=sections['UNIx'];rules['unitOverrides']={str(i):dict(hp=struct.unpack_from('<I',unix,228+i*4)[0]/256,shield=struct.unpack_from('<H',unix,1140+i*2)[0],armor=unix[1596+i])for i in range(228)if not unix[i]}
(ROOT/'resources/desert-strike-v1.json').write_text(json.dumps(rules,ensure_ascii=False,indent=2)+'\n')
def desc(items):
    return '; '.join(a['name']+' '+','.join(f'{k}={v}'for k,v in a.items()if k not in ['name','text','wav','string','flags','type'] and v) for a in items)
lines=['# Desert Strike v1.0 original audit','','Source: '+snapshot['source']['url'],'','SCX SHA-256: `'+snapshot['source']['sha256']+'`','', 'All 328 physical TRIG records below are reviewed once. Numbers are **one-based**; old `desert-strike-evidence.json` keys are **zero-based**. Full decoded conditions, actions, strings, owners and flags: `resources/original-desertstrike.json`. Rebuild with `tools/audit-desertstrike.py` from the verified extracted CHK and acquired Desert CV5/VF4.','','## Corrections to supplied plan','','- CreateUnitWithProperties byte +27 is count; uint32 +20 is property index. Marine=6, Academy=1 Firebat+1 Medic, Vessel=1, Lurker=2. Tank count is 3 on both sides; property indices differ (4 versus 8), not counts.','- Gas delays are one-shot additive SetDeaths actions (#89–100), not reset timers. No income is paid during adjustment.','- Original production is in shared team territory. The map has no per-player exclusive build rectangle. Our 33×19 upper-left crop is an explicit 1v1 adaptation, not a claimed original limit. Buildable cells in the crop: '+str(region['buildableTileCount'])+'. Source CV5 bit 0x80 plus all 16 VF4 walkable minitiles decide placement.','- The production crop retains original orientation/footprints to avoid rotating SC building sprites and gas footprints; battlefield alone rotates left→bottom. This is an explicit presentation exception.','- Countdown uses 46 game seconds; current 46/1.5 wall time is provisional. No original-engine play/replay measurement was available. Hyper cycles are 84 ms at Fastest. This unresolved timing calibration must not be reported as measured.','- Construction remains the established MiniStar 5% construction timing; original engine build timing is not claimed.','- Source nuclear proxy ownership and civilian BOOM commands are excluded explicitly; lane UI does not expose those engine commands.','- Runtime combat keeps existing SC1 stats/weapon engine. UNIx unit HP/shield/armor overrides are applied in lane mode; full original upgrade/weapon-damage parity still needs engine comparison. The fixed objective HP values and the projected paid-defense positions are MiniStar adaptations. Broodling special replaces each snapshot enemy with one broodling (the source creates a sentinel in addition to units moved into battle).','','## Trigger mapping','','| Trigger | Status | Runtime mapping / reason | Source conditions | Source actions |','|---|---|---|---|---|']
for t in triggers:
    esc=lambda s:s.replace('|','/').replace('\n',' ').replace('\r','')
    lines.append(f"| #{t['id']} | {t['portStatus']} | {esc(t['mappedRule'])} | {esc(desc(t['conditions']))} | {esc(desc(t['actions']))} |")
lines+=['','## Original building costs and actual production','','| Building ID | Minerals | Gas | Unit ID × count |','|---|---:|---:|---|']
for id,cost in rules['costs'].items():lines.append(f"| {id} | {cost[0]} | {cost[1]} | "+', '.join(f'{u} × {n}'for u,n in rules['waves'].get(id,[]))+' |')
(ROOT/'docs/desertstrike-original-audit.md').write_text('\n'.join(lines)+'\n')
print('Audited',len(triggers),'triggers;',region['buildableTileCount'],'buildable crop cells')
