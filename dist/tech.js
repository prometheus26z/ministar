// Brood War production graph. IDs are the original units.dat IDs.
export const BASE={terran:106,zerg:131,protoss:154},WORKER={terran:7,zerg:41,protoss:64};
const b=(race,requires=[],extra={})=>({race,requires,...extra});
export const BUILDINGS={
106:b('terran',[],{supply:10,townhall:true}),107:b('terran',[112],{addon:106}),108:b('terran',[117],{addon:106}),109:b('terran',[],{supply:8}),110:b('terran',[],{gas:true}),111:b('terran',[106]),112:b('terran',[111]),113:b('terran',[111]),114:b('terran',[113]),115:b('terran',[],{addon:114}),116:b('terran',[114]),117:b('terran',[],{addon:116}),118:b('terran',[],{addon:116}),120:b('terran',[],{addon:113}),122:b('terran',[106]),123:b('terran',[113]),124:b('terran',[122]),125:b('terran',[111]),
131:b('zerg',[],{supply:1,townhall:true,creepSource:true}),132:b('zerg',[142],{morph:131,supply:1,townhall:true,creepSource:true}),133:b('zerg',[138],{morph:132,supply:1,townhall:true,creepSource:true}),134:b('zerg',[133],{creep:true}),135:b('zerg',[142],{creep:true}),136:b('zerg',[133],{creep:true}),137:b('zerg',[133],{morph:141,creep:true}),138:b('zerg',[132],{creep:true}),139:b('zerg',[131],{creep:true}),140:b('zerg',[133],{creep:true}),141:b('zerg',[132],{creep:true}),142:b('zerg',[131],{creep:true}),143:b('zerg',[131],{creep:true,creepSource:true}),144:b('zerg',[139],{morph:143,creep:true,creepSource:true}),146:b('zerg',[142],{morph:143,creep:true,creepSource:true}),149:b('zerg',[],{gas:true}),
154:b('protoss',[],{supply:9,townhall:true}),155:b('protoss',[164],{psi:true}),156:b('protoss',[],{supply:8}),157:b('protoss',[],{gas:true}),159:b('protoss',[155],{psi:true}),160:b('protoss',[154],{psi:true}),162:b('protoss',[166],{psi:true}),163:b('protoss',[164],{psi:true}),164:b('protoss',[160],{psi:true}),165:b('protoss',[163],{psi:true}),166:b('protoss',[154],{psi:true}),167:b('protoss',[164],{psi:true}),169:b('protoss',[167],{psi:true}),170:b('protoss',[167,165],{psi:true}),171:b('protoss',[155],{psi:true}),172:b('protoss',[160],{psi:true})
};
const u=(producer,requires=[],extra={})=>({producer,requires,...extra});
export const PRODUCTION={
7:u(106),0:u(111),32:u(111,[112]),34:u(111,[112]),1:u(111,[112,117]),2:u(113),5:u(113,[],{addon:120}),3:u(113,[123]),8:u(114),11:u(114,[],{addon:115}),9:u(114,[116],{addon:115}),12:u(114,[118],{addon:115}),58:u(114,[123],{addon:115}),
41:u(35),42:u(35),37:u(35,[142]),38:u(35,[135]),43:u(35,[141]),47:u(35,[141]),45:u(35,[138]),46:u(35,[136]),39:u(35,[140]),103:u(38,[132,135],{research:'lurker',morph:true}),44:u(43,[137],{morph:true}),62:u(43,[137],{morph:true}),
64:u(154),65:u(160),66:u(160,[164]),67:u(160,[165]),61:u(160,[165]),69:u(155),83:u(155,[171]),84:u(155,[159]),70:u(167),60:u(167),72:u(167,[169]),71:u(167,[170]),68:u(67,[],{merge:2}),63:u(61,[],{merge:2})
};
export const RESEARCH={
 stim:{name:'스팀팩',at:112,cost:[100,100],time:80,ability:'stim',types:[0,32],icon:231},
 siege:{name:'시즈 모드',at:120,cost:[150,150],time:80,ability:'siege',types:[5],icon:259},
 cloak:{name:'클로킹 필드',at:115,cost:[150,150],time:100,ability:'cloak',types:[8],icon:253},
 ghostCloak:{name:'퍼스널 클로킹',at:117,cost:[100,100],time:80,ability:'cloak',types:[1],icon:253},
 lockdown:{name:'락다운',at:117,cost:[200,200],time:100,ability:'lockdown',types:[1],icon:250},
 yamato:{name:'야마토 포',at:118,cost:[100,100],time:120,ability:'yamato',types:[12],icon:249},
 emp:{name:'EMP 쇼크웨이브',at:116,cost:[200,200],time:120,ability:'emp',types:[9],icon:246},
 irradiate:{name:'이레디에이트',at:116,cost:[200,200],time:80,ability:'irradiate',types:[9],icon:248},
 mine:{name:'스파이더 마인',at:120,cost:[100,100],time:80,ability:'mine',types:[2],icon:234},
 restore:{name:'리스토레이션',at:112,cost:[100,100],time:80,ability:'restore',types:[34],icon:321},
 flare:{name:'옵티컬 플레어',at:112,cost:[100,100],time:80,ability:'flare',types:[34],icon:322},
 burrow:{name:'버로우',at:131,cost:[100,100],time:80,ability:'burrow',types:[37,38,41,46],icon:237},
 lurker:{name:'러커 변태',at:135,requires:[132],cost:[200,200],time:120,icon:103},
 zergTransport:{name:'배주머니',at:132,cost:[200,200],time:240,ability:'load',types:[42],icon:236},
 broodlings:{name:'스폰 브루들링',at:138,cost:[100,100],time:80,ability:'broodlings',types:[45],icon:241},
 ensnare:{name:'인스네어',at:138,cost:[100,100],time:80,ability:'ensnare',types:[45],icon:242},
 plague:{name:'플레이그',at:136,cost:[200,200],time:100,ability:'plague',types:[46],icon:245},
 consume:{name:'컨슘',at:136,cost:[100,100],time:100,ability:'consume',types:[46],icon:251},
 storm:{name:'사이오닉 스톰',at:165,cost:[200,200],time:120,ability:'storm',types:[67],icon:244},
 hallucinate:{name:'할루시네이션',at:165,cost:[150,150],time:80,ability:'hallucinate',types:[67],icon:238},
 mind:{name:'마인드 컨트롤',at:165,cost:[200,200],time:120,ability:'mind',types:[63],icon:319},
 maelstrom:{name:'메일스트롬',at:165,cost:[100,100],time:100,ability:'maelstrom',types:[63],icon:318},
 recall:{name:'리콜',at:170,cost:[150,150],time:120,ability:'recall',types:[71],icon:253},
 stasis:{name:'스테이시스 필드',at:170,cost:[150,150],time:100,ability:'stasis',types:[71],icon:252},
 web:{name:'디스럽션 웹',at:169,cost:[200,200],time:80,ability:'web',types:[60],icon:317}
};
// A more advanced Zerg structure also satisfies the earlier structure's requirement.
export const SATISFIES={131:[131,132,133],132:[132,133],141:[141,137]};
export const researchAt=(at,key)=>RESEARCH[key]?.at===at||(RESEARCH[key]?.at===131&&[132,133].includes(at))||(RESEARCH[key]?.at===132&&at===133);
