import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export function buildCombatData(root=path.resolve(import.meta.dirname,'..')){
 const sourcePath=path.join(root,'resources/broodwar-combat-source.json');
 const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
 const chk=zlib.gunzipSync(fs.readFileSync(path.join(root,'resources/desertstrike/scenario.chk.gz')));
 const checksum=crypto.createHash('sha256').update(chk).digest('hex');
 if(checksum!==source.hashes.scenarioChkSha256)throw Error(`Combat source CHK checksum mismatch: ${checksum}`);
 if(source.players.length!==12||Object.keys(source.units).length!==103||Object.keys(source.weapons).length!==130)throw Error('Incomplete Brood War combat evidence');
 const players=new Map(source.players.map(player=>[player.player,player]));
 for(const id of [3,7])if(players.get(id)?.initial.slice(0,16).some(level=>level!==3))throw Error(`Combat player ${id} must begin with upgrades 0-15 at level 3`);
 for(const id of [0,1,2,4,5,6])if(players.get(id)?.initial[15]!==8)throw Error(`Production player ${id} must retain Plasma Shields level 8`);
 if(source.weapons[82]?.damageUpgrade!==35||source.weapons[82]?.mapDamage!==100||source.weapons[82]?.mapBonus!==25)throw Error('Scarab weapon override changed');
 if(players.get(3)?.initial[35]!==0||players.get(7)?.initial[35]!==0)throw Error('Scarab Damage starting level changed');
 const data={schema:source.schema,baseline:source.baseline,sourcePins:source.sourcePins,hashes:source.hashes,sourceCombatPlayerByTeam:source.sourceCombatPlayerByTeam,sourceProductionPlayerByCommander:source.sourceProductionPlayerByCommander,players:source.players,units:source.units,weapons:source.weapons,refillTriggers:source.refillTriggers,scriptEvents:source.scriptEvents,sourceScriptHashes:source.sourceScriptHashes};
 const output=`// Generated from resources/broodwar-combat-source.json. Do not edit by hand.\nexport const COMBAT_SOURCE=Object.freeze(${JSON.stringify(data)});\n`;
 fs.writeFileSync(path.join(root,'dist/broodwar-combat-data.js'),output);
 return {players:source.players.length,units:Object.keys(source.units).length,weapons:Object.keys(source.weapons).length,checksum};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const result=buildCombatData();
 console.log(`Generated Brood War combat profiles (${result.players} players, ${result.units} units, ${result.weapons} weapons).`);
}
