const EXPECTED_SECTIONS=Object.freeze({PUNI:5700,UNIx:4168,FORC:20,OWNR:12,TRIG:328*2400});
const TEAM_BY_TRIGGER_OWNER=Object.freeze({18:0,20:1});
export const SOURCE_PLAYER_BY_COMMANDER=Object.freeze({0:0,1:1,2:2,3:4,4:5,5:6});
const BUILDING_TRIGGER_START=219;
const BUILDING_TRIGGER_END=276;

function readCString(bytes,offset){
 if(!Number.isInteger(offset)||offset<0||offset>=bytes.length)throw Error('Invalid STR string offset');
 const end=bytes.indexOf(0,offset);if(end<0)throw Error('Unterminated STR string');
 return new TextDecoder('windows-1252').decode(bytes.subarray(offset,end)).replace(/[\u0000-\u001f]/g,'');
}

export function readChkSections(input){
 const bytes=Buffer.from(input),sections=new Map();let offset=0;
 while(offset<bytes.length){
  if(offset+8>bytes.length)throw Error('Truncated CHK section header');
  const name=bytes.toString('latin1',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8,end=start+size;
  if(end>bytes.length)throw Error(`Truncated CHK section ${JSON.stringify(name)}`);
  if(sections.has(name))throw Error(`Duplicate CHK section ${JSON.stringify(name)}`);
  sections.set(name,bytes.subarray(start,end));offset=end;
 }
 for(const [name,size]of Object.entries(EXPECTED_SECTIONS)){
  const section=sections.get(name);if(!section)throw Error(`Missing CHK section ${name}`);
  if(section.length!==size)throw Error(`Invalid ${name} section length: ${section.length}`);
 }
 const strings=sections.get('STR ');if(!strings||strings.length<2)throw Error('Missing or invalid CHK STR section');
 return sections;
}

function readStrings(bytes){
 if(bytes.length<2)throw Error('Invalid STR section');
 const count=bytes.readUInt16LE(0),tableEnd=2+count*2;
 if(tableEnd>bytes.length)throw Error('Truncated STR offset table');
 const values=[''];
 for(let id=1;id<=count;id++){
  const offset=bytes.readUInt16LE(2+(id-1)*2);
  if(offset<tableEnd)throw Error(`Invalid STR string offset for ID ${id}`);
  values.push(readCString(bytes,offset));
 }
 return values;
}

export function readPuniAvailability(puni,unitId){
 const bytes=Buffer.from(puni);
 if(bytes.length!==EXPECTED_SECTIONS.PUNI)throw Error(`Invalid PUNI section length: ${bytes.length}`);
 if(!Number.isInteger(unitId)||unitId<0||unitId>=228)throw Error(`Invalid PUNI unit ID: ${unitId}`);
 const defaultAvailable=bytes[2736+unitId]!==0;
 return Array.from({length:12},(_,player)=>bytes[2964+player*228+unitId]!==0?defaultAvailable:bytes[player*228+unitId]!==0);
}

function parseTriggers(bytes,candidateIds){
 if(bytes.length!==328*2400)throw Error('Invalid TRIG section length');
 const records=[];
 for(let sourceIndex=BUILDING_TRIGGER_START-1;sourceIndex<BUILDING_TRIGGER_END;sourceIndex++){
  const base=sourceIndex*2400,trigger=bytes.subarray(base,base+2400),owners=[];
  for(let i=0;i<28;i++)if(trigger[2372+i])owners.push(i);
  const owner=owners.find(id=>Object.hasOwn(TEAM_BY_TRIGGER_OWNER,id));
  if(owner===undefined)continue;
  const team=TEAM_BY_TRIGGER_OWNER[owner],conditions=[],outputs=[];
  for(let i=0;i<16;i++){
   const at=i*20,type=trigger[at+15],flags=trigger[at+17];if(!type||flags&2)continue;
   conditions.push({player:trigger[at+4],amount:trigger.readUInt32LE(at+8),unit:trigger.readUInt16LE(at+12),comparison:trigger[at+14],type,flags});
  }
  for(let i=0;i<64;i++){
   const at=320+i*32,type=trigger[at+26],flags=trigger[at+28];if(type!==11||flags&2)continue;
   outputs.push({propertyIndex:trigger.readUInt32LE(at+20),unit:trigger.readUInt16LE(at+24),count:trigger[at+27]});
  }
  const bring=conditions.filter(c=>c.type===3&&candidateIds.has(c.unit)&&c.player===13&&c.comparison===0);
  if(!bring.length||!outputs.length)continue;
  const buildingId=bring.find(c=>c.unit!==142&&c.amount===1)?.unit??(bring.some(c=>c.unit===142)?142:null);
  if(buildingId===null)continue;
  records.push({triggerId:sourceIndex+1,team,owner,buildingId,bringConditions:bring,outputs});
 }
 return records;
}

function wavesAndThresholds(records){
 const byBuilding=new Map(),thresholds=[null,null],poolCounts=[new Set(),new Set()];
 for(const record of records){
  const groups=record.outputs.map(a=>[a.unit,a.count]);
  if(record.buildingId===142){
   const poolConditions=record.bringConditions.filter(c=>c.unit===142);
   if(groups.length!==1||groups[0][0]!==37||![5,6].includes(groups[0][1]))throw Error(`Unexpected Spawning Pool output in trigger #${record.triggerId}`);
   poolCounts[record.team].add(groups[0][1]);
   if(groups[0][1]===6){
    const threshold=poolConditions.filter(c=>c.comparison===0&&c.amount>1).map(c=>c.amount);
    if(threshold.length!==1||thresholds[record.team]!==null)throw Error(`Unexpected Spawning Pool bonus threshold in trigger #${record.triggerId}`);
    thresholds[record.team]=threshold[0];
   }
   groups[0][1]=5;
  }
  const key=String(record.buildingId),list=byBuilding.get(key)||[];list.push({team:record.team,groups});byBuilding.set(key,list);
 }
 for(let team=0;team<2;team++)if(thresholds[team]===null||!poolCounts[team].has(5)||!poolCounts[team].has(6))throw Error(`Missing Spawning Pool branch for team ${team}`);
 const waves={};
 for(const [id,entries]of byBuilding){
  if(entries.some(e=>JSON.stringify(e.groups)!==JSON.stringify(entries[0].groups)))throw Error(`Unequal source production groups for building ${id}`);
  if(new Set(entries.map(e=>e.team)).size!==2)throw Error(`Missing source production side for building ${id}`);
  waves[id]=entries[0].groups;
 }
 return {waves,poolBonusThreshold:thresholds};
}

export function deriveBuildingCatalog(chk,rules){
 const sections=readChkSections(chk),unix=sections.get('UNIx'),puni=sections.get('PUNI'),strings=readStrings(sections.get('STR '));
 if(!sections.get('FORC').subarray(0,8).equals(Buffer.from([0,0,0,1,2,2,2,3])))throw Error('Unexpected original Force player layout');
 const owners=sections.get('OWNR');
 for(const player of Object.values(SOURCE_PLAYER_BY_COMMANDER))if(owners[player]!==6)throw Error(`Original player ${player} is not a human slot`);
 const ids=Object.keys(rules?.costs||{}).map(Number).sort((a,b)=>a-b);
 if(ids.length!==50||new Set(ids).size!==50)throw Error(`Expected exactly 50 supported building IDs, got ${ids.length}`);
 const candidateIds=new Set(ids),buildingCatalog={};
 for(const id of ids){
  if(id<0||id>=228)throw Error(`Building ID outside UNIx range: ${id}`);
  if(unix[id]!==0)throw Error(`Building ${id} uses default UNIx values; refusing to treat defaults as custom cost/name`);
  const cost=[unix.readUInt16LE(2280+id*2),unix.readUInt16LE(2736+id*2)];
  if(JSON.stringify(cost)!==JSON.stringify(rules.costs[id]))throw Error(`Original UNIx cost mismatch for building ${id}`);
  const stringId=unix.readUInt16LE(3192+id*2);
  if(stringId>strings.length-1)throw Error(`Invalid UNIx STR reference for building ${id}`);
  const availableByPlayer=readPuniAvailability(puni,id);
  buildingCatalog[id]={originalName:strings[stringId],sourceNameStringId:stringId,availableByPlayer};
 }
 const decoded=wavesAndThresholds(parseTriggers(sections.get('TRIG'),candidateIds));
 if(JSON.stringify(decoded.poolBonusThreshold)!==JSON.stringify(rules.poolBonusThreshold))throw Error(`Original pool bonus threshold mismatch: source=${decoded.poolBonusThreshold}, rules=${rules.poolBonusThreshold}`);
 if(JSON.stringify(Object.keys(decoded.waves).sort((a,b)=>Number(a)-Number(b)))!==JSON.stringify(Object.keys(rules.waves||{}).sort((a,b)=>Number(a)-Number(b))))throw Error('Original production building set mismatch');
 for(const [id,groups]of Object.entries(decoded.waves))if(JSON.stringify(groups)!==JSON.stringify(rules.waves[id]))throw Error(`Original TRIG production mismatch for building ${id}`);
 for(const id of ids)if(buildingCatalog[id].availableByPlayer.length!==12)throw Error(`Invalid PUNI player vector for building ${id}`);
 return {buildingCatalog,poolBonusThreshold:decoded.poolBonusThreshold};
}
