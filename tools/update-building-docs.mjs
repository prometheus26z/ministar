import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {BUILDINGS} from '../dist/tech.js';
import {deriveBuildingCatalog,SOURCE_PLAYER_BY_COMMANDER} from './desert-strike-source.mjs';

const root=path.resolve(import.meta.dirname,'..');
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const rules=readJson('resources/desert-strike-v1.json');
const data=readJson('dist/assets/data.json');
const extra=readJson('dist/rts-data.json');
Object.assign(data.units,extra.units);
const chk=zlib.gunzipSync(fs.readFileSync(path.join(root,'resources/desertstrike/scenario.chk.gz')));
const catalog=deriveBuildingCatalog(chk,rules).buildingCatalog;
const sourcePlayers=Object.values(SOURCE_PLAYER_BY_COMMANDER);
const ids=Object.keys(BUILDINGS).map(Number).sort((a,b)=>a-b);
if(JSON.stringify(ids)!==JSON.stringify(Object.keys(rules.costs).map(Number).sort((a,b)=>a-b)))throw Error('README catalog candidates differ from BUILDINGS and rules.costs');
const enabled=ids.filter(id=>sourcePlayers.every(player=>catalog[id].availableByPlayer[player]));
const disabled=ids.filter(id=>!sourcePlayers.some(player=>catalog[id].availableByPlayer[player]));
if(enabled.length!==49||JSON.stringify(disabled)!=='[120]')throw Error(`Expected 49 universally allowed buildings and disabled [120], got ${enabled.length} and ${JSON.stringify(disabled)}`);
const names=id=>{const name=data.units[id]?.name;if(!name)throw Error(`Missing Korean unit name for building ${id}`);return name};
const groups=id=>{
 const wave=rules.waves[String(id)];
 if(wave)return wave.map(([unit,count])=>`${names(unit)} ${id===142?'5~6':count}기`).join(' · ');
 const role=rules.buildingRoles?.[String(id)];if(!role)throw Error(`Missing production/function description for building ${id}`);
 return role;
};
const escape=value=>String(value).replaceAll('|','/').replace(/[\r\n]+/g,' ').trim();
const method=id=>{
 const spec=BUILDINGS[id];
 if(spec.addon)return `부착: ${names(spec.addon)}`;
 if(spec.morph)return `변태: ${names(spec.morph)}`;
 return '일반 건설';
};
const rows=[];
for(const race of ['terran','zerg','protoss']){
 const raceName={terran:'테란',zerg:'저그',protoss:'프로토스'}[race];
 rows.push(`### ${raceName}`,'','| 건물 (ID) | 미네랄 | 건설 방식 | 출격·기능 |','|---|---:|---|---|');
 for(const id of enabled.filter(id=>BUILDINGS[id].race===race))rows.push(`| ${escape(names(id))} (${id}) | ${rules.costs[id][0]} | ${escape(method(id))} | ${escape(groups(id))} |`);
 rows.push('');
}
const prerequisiteRows=enabled.map(id=>{
 const spec=BUILDINGS[id],parent=spec.addon||spec.morph;
 const requires=[...new Set([...(spec.requires||[]),...(rules.specials?.[String(id)]?.requires||[])])].filter(req=>req!==parent);
 return requires.length?`- ${escape(names(id))} (${id}): ${requires.map(req=>`${escape(names(req))} (${req})`).join(', ')}`:null;
}).filter(Boolean);
const generated=[
 ...rows,
 `> **건설 불가:** 머신샵 (ID 120) — 원본 UNIx에는 ${rules.costs[120][0]} 미네랄 비용값이 있지만 PUNI가 인간 슬롯 P1/P2/P3/P5/P6/P7 모두의 건설을 금지합니다. 생산 트리거도 없어 구매 목록에서 제외합니다.`,
 '',
 '#### 추가 선행 건물',
 '',
 '아래 조건은 현재 미니스타의 `BUILDINGS`·특수 건물 규칙에 따른 완성 건물 조건입니다. 부착·변태 부모는 건설 방식 열에 표시합니다.',
 '',
 ...prerequisiteRows,
 ''
].join('\n');

const file=path.join(root,'README.md'),original=fs.readFileSync(file,'utf8');
const begin='<!-- BEGIN GENERATED BUILDING CATALOG -->',end='<!-- END GENERATED BUILDING CATALOG -->';
if(original.split(begin).length!==2||original.split(end).length!==2)throw Error('README must contain exactly one generated building catalog marker pair');
const start=original.indexOf(begin)+begin.length,finish=original.indexOf(end);
if(finish<start)throw Error('README generated building catalog markers are out of order');
const updated=original.slice(0,start)+'\n\n'+generated+original.slice(finish);
if(process.argv.includes('--check')){
 if(updated!==original){console.error('README building catalog is stale; run npm run docs:buildings');process.exitCode=1}
 else console.log('README building catalog is current (49 allowed, 1 disabled).');
}else{
 fs.writeFileSync(file,updated);
 console.log('Updated README building catalog from PUNI, UNIx, TRIG, BUILDINGS and buildingRoles.');
}
