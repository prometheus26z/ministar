import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {DESERT_STRIKE,BUILDING_COSTS,BUILDING_WAVES,isLaneBuildingAvailable} from '../dist/lane-rules.js';
import {BUILDINGS} from '../dist/tech.js';
import {deriveBuildingCatalog,readChkSections,readPuniAvailability,SOURCE_PLAYER_BY_COMMANDER} from '../tools/desert-strike-source.mjs';

const root=new URL('../',import.meta.url);
const readJson=name=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
const evidence=readJson('resources/desert-strike-evidence.json');
const rules=readJson('resources/desert-strike-v1.json');
const chk=zlib.gunzipSync(fs.readFileSync(new URL('resources/desertstrike/scenario.chk.gz',root)));

// Independent byte readers are the test oracle; do not call the product extractor here.
function sourceSections(bytes){
 const sections=new Map();let offset=0;
 while(offset<bytes.length){
  assert.ok(offset+8<=bytes.length,'complete section header');
  const tag=bytes.toString('latin1',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
  assert.ok(end<=bytes.length,`complete ${tag} section`);assert.equal(sections.has(tag),false,`unique ${tag} section`);
  sections.set(tag,bytes.subarray(start,end));offset=end;
 }
 return sections;
}
function sourceString(str,id){
 if(!id)return '';
 const count=str.readUInt16LE(0),tableEnd=2+count*2;assert.ok(id<=count);
 const start=str.readUInt16LE(2+(id-1)*2);assert.ok(start>=tableEnd&&start<str.length);
 const end=str.indexOf(0,start);assert.ok(end>=0);
 return new TextDecoder('windows-1252').decode(str.subarray(start,end)).replace(/[\u0000-\u001f]/g,'');
}
function sourceAvailable(puni,id,player){
 const override=puni[player*228+id],defaultAvailable=puni[2736+id],useDefault=puni[2964+player*228+id];
 return useDefault!==0?defaultAvailable!==0:override!==0;
}
function sourceProduction(trig,candidateIds){
 const byBuilding=new Map(),threshold=[null,null],branches=[new Set(),new Set()];
 for(let id=219;id<=276;id++){
  const record=trig.subarray((id-1)*2400,id*2400),owners=[];
  for(let player=0;player<28;player++)if(record[2372+player])owners.push(player);
  const owner=owners.find(player=>player===18||player===20);if(owner===undefined)continue;
  const team=owner===18?0:1,conditions=[],outputs=[];
  for(let i=0;i<16;i++){
   const at=i*20,type=record[at+15],flags=record[at+17];
   if(type===3&&!(flags&2))conditions.push({player:record.readUInt32LE(at+4),amount:record.readUInt32LE(at+8),unit:record.readUInt16LE(at+12),comparison:record[at+14]});
  }
  for(let i=0;i<64;i++){
   const at=320+i*32;
   if(record[at+26]===11&&!(record[at+28]&2))outputs.push({property:record.readUInt32LE(at+20),unit:record.readUInt16LE(at+24),count:record[at+27]});
  }
  const brings=conditions.filter(c=>c.player===13&&candidateIds.has(c.unit));if(!brings.length||!outputs.length)continue;
  const building=brings.find(c=>c.unit!==142&&c.amount===1)?.unit??(brings.some(c=>c.unit===142)?142:null);if(building===null)continue;
  const groups=outputs.map(({unit,count})=>[unit,count]);
  if(building===142){
   assert.equal(groups.length,1);assert.equal(groups[0][0],37);assert.ok([5,6].includes(groups[0][1]));
   branches[team].add(groups[0][1]);
   if(groups[0][1]===6){const matches=brings.filter(c=>c.unit===142&&c.comparison===0&&c.amount>1).map(c=>c.amount);assert.equal(matches.length,1);assert.equal(threshold[team],null);threshold[team]=matches[0]}
   groups[0][1]=5;
  }
  const teams=byBuilding.get(building)||new Map(),list=teams.get(team)||[];list.push({id,groups,outputs});teams.set(team,list);byBuilding.set(building,teams);
 }
 return {byBuilding,threshold,branches};
}

test('original CHK evidence, costs, names, PUNI permission and building catalog match independently decoded bytes',()=>{
 assert.deepEqual(SOURCE_PLAYER_BY_COMMANDER,{0:0,1:1,2:2,3:4,4:5,5:6});
 const sections=sourceSections(chk),puni=sections.get('PUNI'),unix=sections.get('UNIx'),str=sections.get('STR ');
 for(const tag of ['PUNI','UNIx','STR ','FORC','OWNR'])assert.deepEqual(sections.get(tag),Buffer.from(evidence[tag],'base64'),`${tag} evidence bytes`);
 assert.deepEqual(readChkSections(chk).get('PUNI'),puni);
 const ids=Object.keys(BUILDINGS).map(Number).sort((a,b)=>a-b),sourceIds=Object.keys(rules.costs).map(Number).sort((a,b)=>a-b);
 assert.equal(ids.length,50);assert.deepEqual(ids,sourceIds);assert.deepEqual(Object.keys(BUILDING_COSTS).map(Number).sort((a,b)=>a-b),ids);
 const derived=deriveBuildingCatalog(chk,rules).buildingCatalog;
 assert.deepEqual(Object.keys(derived).map(Number).sort((a,b)=>a-b),ids);
 let allowed=0;const byRace={terran:0,zerg:0,protoss:0};
 for(const id of ids){
  const expected=[0,1,2,4,5,6].map(player=>sourceAvailable(puni,id,player));
  assert.deepEqual([0,1,2,4,5,6].map(player=>derived[id].availableByPlayer[player]),expected,`PUNI ID ${id}`);
  assert.deepEqual(derived[id].availableByPlayer,Array.from({length:12},(_,player)=>sourceAvailable(puni,id,player)));
  assert.deepEqual([unix.readUInt16LE(2280+id*2),unix.readUInt16LE(2736+id*2)],rules.costs[id],`UNIx cost ${id}`);
  const nameId=unix.readUInt16LE(3192+id*2);assert.equal(derived[id].sourceNameStringId,nameId);
  assert.equal(derived[id].originalName,sourceString(str,nameId));
  const universallyAllowed=[0,1,2,4,5,6].every(player=>sourceAvailable(puni,id,player));
  if(universallyAllowed){allowed++;byRace[BUILDINGS[id].race]++}
  for(const [commanderId,player]of [0,1,2,4,5,6].entries())assert.equal(isLaneBuildingAvailable(id,commanderId),sourceAvailable(puni,id,player),`commander ${commanderId} → source player ${player}, building ${id}`);
 }
 assert.equal(allowed,49);assert.deepEqual(byRace,{terran:17,zerg:16,protoss:16});
 assert.deepEqual(ids.filter(id=>[0,1,2,4,5,6].some(player=>sourceAvailable(puni,id,player))&&! [0,1,2,4,5,6].every(player=>sourceAvailable(puni,id,player))),[]);
 assert.deepEqual(ids.filter(id=>![0,1,2,4,5,6].some(player=>sourceAvailable(puni,id,player))),[120]);
 assert.equal(BUILDING_COSTS[120][0],600);assert.equal(isLaneBuildingAvailable(120,0),false);assert.equal(isLaneBuildingAvailable('120',0),false);
 assert.equal(derived[117].originalName,'3 Siege Tanks');assert.equal(derived[116].originalName,'Tech: Siege Tank, Battle C.');assert.equal(derived[115].originalName,'Heal & Repair!');
 assert.equal(isLaneBuildingAvailable(111,99),false);assert.equal(isLaneBuildingAvailable(999,0),false);
});

test('PUNI default, override and use-default byte paths are explicit and fail closed on malformed input',()=>{
 const fixture=Buffer.alloc(5700),id=120;
 fixture[2736+id]=0;fixture[1*228+id]=1;fixture[2964+1*228+id]=0;
 fixture[2736+id]=1;fixture[2*228+id]=0;fixture[2964+2*228+id]=0;
 fixture[2736+id]=0;fixture[3*228+id]=0;fixture[2964+3*228+id]=1;
 assert.deepEqual([1,2,3].map(player=>readPuniAvailability(fixture,id)[player]),[true,false,false]);
 assert.throws(()=>readPuniAvailability(fixture.subarray(1),id),/PUNI section length/);
 assert.throws(()=>readPuniAvailability(fixture,228),/unit ID/);
 assert.throws(()=>readChkSections(Buffer.from('PUNI')),/section header/);
 const missing=Buffer.alloc(8);missing.write('TEST',0,'latin1');missing.writeUInt32LE(0,4);assert.throws(()=>readChkSections(missing),/Missing CHK section PUNI/);
});

test('original one-based TRIG records independently pin every producer group and asymmetric pool threshold',()=>{
 const sections=sourceSections(chk),candidateIds=new Set(Object.keys(rules.costs).map(Number));
 const {byBuilding,threshold,branches}=sourceProduction(sections.get('TRIG'),candidateIds);
 assert.deepEqual(Object.keys(BUILDING_WAVES).map(Number).sort((a,b)=>a-b),[...byBuilding.keys()].sort((a,b)=>a-b));
 for(const [id,teams]of byBuilding){
  assert.equal(teams.size,2,`both source forces for building ${id}`);
  const normalized=[];
  for(const [team,records]of teams){
   const groups=records.map(record=>record.groups);
   assert.ok(groups.every(value=>JSON.stringify(value)===JSON.stringify(groups[0])),`source branches agree: ${id}/${team}`);
   normalized.push(groups[0]);
  }
  assert.ok(normalized.every(value=>JSON.stringify(value)===JSON.stringify(normalized[0])),`source teams agree: ${id}`);
  assert.deepEqual(normalized[0],rules.waves[id],`source group ${id}`);
  assert.deepEqual(BUILDING_WAVES[id],normalized[0].map(([unit,count])=>({unit,count})));
 }
 assert.deepEqual(threshold,[6,8]);assert.deepEqual(DESERT_STRIKE.poolBonusThreshold,[6,8]);
 assert.deepEqual([...branches].map(set=>[...set].sort()),[[5,6],[5,6]]);
 assert.deepEqual(BUILDING_WAVES[111],[{unit:0,count:6}]);
 assert.deepEqual(BUILDING_WAVES[112],[{unit:32,count:1},{unit:34,count:1}]);
 assert.deepEqual(BUILDING_WAVES[133],[{unit:103,count:2},{unit:42,count:1}]);
 for(const [id,expectedProperties]of [[225,4],[254,8]]){
  const record=sections.get('TRIG').subarray((id-1)*2400,id*2400),action=320+Array.from({length:64},(_,i)=>i).find(i=>record[320+i*32+26]===11)*32;
  assert.equal(record.readUInt16LE(action+24),5);assert.equal(record[action+27],3);assert.equal(record.readUInt32LE(action+20),expectedProperties);
 }
 assert.deepEqual(BUILDING_WAVES[117],[{unit:5,count:3}]);
});

test('source extractor fails when source-backed costs, wave thresholds or groups drift',()=>{
 const badCost=structuredClone(rules);badCost.costs[117][0]++;
 assert.throws(()=>deriveBuildingCatalog(chk,badCost),/UNIx cost mismatch/);
 const badThreshold=structuredClone(rules);badThreshold.poolBonusThreshold=[6,6];
 assert.throws(()=>deriveBuildingCatalog(chk,badThreshold),/threshold mismatch/);
 const badWave=structuredClone(rules);badWave.waves[117][0][1]++;
 assert.throws(()=>deriveBuildingCatalog(chk,badWave),/TRIG production mismatch/);
});
