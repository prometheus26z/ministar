export function healthBarPixels(nominal){
 let original=Math.max(19,Math.min(81,Math.floor(nominal)));
 original-=((original-1)%3);
 return Math.round(Math.max(19,original)*.85);
}

export function constructionVisual(unit,data){
 const task=unit.construction;
 if(!unit.alive||!unit.def.building||!task?.started)return null;
 const progress=Math.max(0,Math.min(1,task.time/task.total));
 if(unit.def.race==='terran'){
  const [width,height]=unit.def.footprint||[96,64],generic=width>=128?325:width>=96?327:329;
  const own=data.graphics[unit.def.image];
  if(progress>=.75&&own?.frames.length>1)return{image:unit.def.image,frame:1+Math.min(own.frames.length===5?3:0,Math.floor((progress-.75)*16)),progress};
  return{image:generic,frame:Math.min(2,Math.floor(progress/.25)),progress};
 }
 if(unit.def.race==='zerg'){
  const stage=Math.min(2,Math.floor(progress*3)),start=[1,12,21][stage];
  return{image:102,frame:start+Math.floor(task.time*12)%7,progress};
 }
 return{image:208,warp:true,progress};
}

export function waveDescription(type,groups,data){
 if(!groups?.length)return ({106:'건설 기반 · SCV 모집은 건설 명령으로 통합',131:'건설 기반 · 레어 변태',154:'건설 기반',110:'미네랄 수입 증가',149:'미네랄 수입 증가',157:'미네랄 수입 증가',116:'코버트 옵스 · 피직스 랩 부착',122:'미사일 터렛 해금',124:'완성 후 본진 대공 방어',125:'완성 후 본진 벙커 방어',144:'완성 후 본진 대공 방어',146:'완성 후 본진 지상 방어',162:'완성 후 본진 지상 · 대공 방어',115:'Heal & Repair! · 병력 HP 회복 · 사용 후 소모',134:'Broodling! · 적 병력을 브루들링으로 전환 · 사용 후 소모',172:'Mind Control! · 적 병력 절반 전환 · 사용 후 소모',139:'스포어 해금 · 최초 100 미네랄',143:'성큰 · 스포어 변태',156:'건설 기반',166:'포톤 캐논 해금',155:'옵저버토리 · 리버 테크 해금',120:'팩토리 부속 건물'})[type]||'출격 없음';
 return groups.map(({unit,count})=>`${data.units[unit].name} ${Number(type)===142?'5~6':count}기`).join(' · ');
}

export function buildingDestruction(unit){
 const [w,h]=unit.def.footprint||[64,64],large=w*h>=8192;
 const race=unit.def.race;
 return{explosion:race==='zerg'?60:race==='protoss'?215:334,rubble:race==='zerg'?(large?111:110):race==='protoss'?(large?217:216):(large?336:335)};
}
