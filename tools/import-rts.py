"""Build small in-game atlases from the previously acquired Remastered source bundles."""
import json,zipfile,io,sys,math,struct,gzip,base64,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]);prefix='MINISTAR_Remastered_v0.2/'
ui=zipfile.ZipFile(source/'MINISTAR_Remastered_v0.2_08_UI_Data_Index.zip');hd=zipfile.ZipFile(source/'MINISTAR_Remastered_v0.2_04_HD2_WebSprites.zip')
raw=json.loads(ui.read(prefix+'data_json/units.dat.json'));catalog=json.loads(ui.read(prefix+'data_json/unit_asset_catalog.json'));tech=json.loads(ui.read(prefix+'data_json/techdata.dat.json'))
original=json.loads((root/'dist/assets/data.json').read_text());supp={'units':{},'graphics':{},'research':{}}
names={35:'애벌레',36:'에그',59:'코쿤',97:'러커 에그',107:'콤샛 스테이션',108:'뉴클리어 사일로',110:'리파이너리',112:'아카데미',113:'팩토리',114:'스타포트',115:'컨트롤 타워',116:'사이언스 퍼실리티',117:'코버트 옵스',118:'피직스 랩',120:'머신샵',122:'엔지니어링 베이',123:'아머리',132:'레어',133:'하이브',134:'나이더스 커널',135:'히드라리스크 덴',136:'디파일러 마운드',137:'그레이터 스파이어',138:'퀸즈 네스트',139:'에볼루션 챔버',140:'울트라리스크 캐번',141:'스파이어',142:'스포닝 풀',143:'크립 콜로니',149:'익스트랙터',155:'로보틱스 퍼실리티',157:'어시밀레이터',159:'옵저버토리',160:'게이트웨이',162:'포톤 캐논',163:'시타델 오브 아둔',164:'사이버네틱스 코어',165:'템플러 아카이브',166:'포지',167:'스타게이트',169:'플릿 비콘',170:'아비터 트리뷰널',171:'로보틱스 서포트 베이',172:'실드 배터리'}
for i in sorted(set(map(int,original['units']))|set(names)):
 r=raw[i];f=r['special_ability_flags'];race=next((race for race in ['terran','zerg','protoss'] if r['staredit_group_flags'][race]),'neutral');d=dict(original['units'].get(str(i),{}))
 if not d:d={'id':i,'name':names[i],'en':catalog[i]['reference_name_en'],'race':race,'image':catalog[i]['image_id'],'hp':r['hit_points']['whole'],'shield':r['shield_amount'] if r['shield_enabled'] else 0,'energy':0,'armor':r['armor'],'speed':0,'radius':max(8,min(50,max(r['staredit_placement_size'].values())/2)),'supply':r['supply_required']['whole']+(.5 if r['supply_required']['half'] else 0),'cost':[r['mineral_cost'],r['vespene_cost']],'qty':1,'groundWeapon':r['ground_weapon'],'airWeapon':r['air_weapon'],'groundHits':r['max_ground_hits'],'airHits':r['max_air_hits'],'size':r['unit_size'],'air':f['flyer'],'building':f['building'],'organic':f['organic'],'mechanical':f['mechanical'],'detector':f['detector'],'cloak':f['permanent_cloak'],'sight':r['sight_range']*32,'abilities':[],'subunit':None,'space':r['space_required'],'capacity':r['space_provided'],'voice':{'select':[],'yes':[],'ready':[]},'portrait':None}
 d['buildTime']=r['build_time']/24;d['footprint']=[r['staredit_placement_size']['width'],r['staredit_placement_size']['height']];supp['units'][str(i)]=d
# Use the game's raw technology timing and costs rather than guide display-speed seconds.
techids={'stim':0,'lockdown':1,'emp':2,'mine':3,'siege':5,'irradiate':7,'yamato':8,'cloak':9,'ghostCloak':10,'burrow':11,'broodlings':13,'plague':15,'consume':16,'ensnare':17,'storm':19,'hallucinate':20,'recall':21,'stasis':22,'restore':24,'web':25,'mind':27,'flare':30,'maelstrom':31,'lurker':32}
for key,i in techids.items():supp['research'][key]={'cost':[tech[i]['mineral_cost'],tech[i]['vespene_cost']],'time':tech[i]['research_time']/24}
needed=sorted({d['image'] for id,d in supp['units'].items() if id not in original['units']}|{347,344,21,11,914})
outdir=root/'dist/rts-assets';outdir.mkdir(exist_ok=True)
for image in needed:
 if str(image) in original['graphics']:continue
 p=prefix+f'web_assets/HD2/anim/main_{image:03d}';meta=json.loads(hd.read(p+'.json'));im=Image.open(io.BytesIO(hd.read(p+'.diffuse.png'))).convert('RGBA');mask=Image.open(io.BytesIO(hd.read(p+'.teamcolor.png'))).convert('L') if p+'.teamcolor.png' in hd.namelist() else None
 frames=meta['frames'][:min(7,meta['frame_count'])];width=max(f['width'] for f in frames)+4;height=sum(f['height']+4 for f in frames);sheets={color:Image.new('RGBA',(width,height)) for color in ['blue','red']};table=[];y=2
 for f in frames:
  x0,y0,w,h=f['atlas_x'],f['atlas_y'],f['width'],f['height'];crop=im.crop((x0,y0,x0+w,y0+h));m=mask.crop((x0,y0,x0+w,y0+h)) if mask else None
  for color,rgb in [('blue',[60,112,245]),('red',[224,56,48])]:
   arr=np.array(crop).astype(float)
   if m:
    a=np.array(m).astype(float)/255;lum=arr[:,:,:3].max(axis=2)/255;replacement=np.array(rgb)[None,None,:]*np.maximum(.25,lum[:,:,None]);arr[:,:,:3]=arr[:,:,:3]*(1-a[:,:,None]) + replacement*a[:,:,None]
   sheets[color].paste(Image.fromarray(np.clip(arr,0,255).astype('uint8')),(2,y))
  table.append([2,y,f['x_offset'],f['y_offset'],w,h]);y+=h+4
 paths={}
 for color,sheet in sheets.items():name=f'{image}-{color}.webp';sheet.save(outdir/name,'WEBP',quality=85,method=6);paths[color]='rts-assets/'+name
 track={'frames':[[i,5] for i in range(len(frames))],'ticks':len(frames)*5,'loop':True};static={'frames':[[0,125]],'ticks':125,'loop':True}
 supp['graphics'][str(image)]={'canvas':[meta['canvas_width'],meta['canvas_height']],'frames':table,'images':paths,'turns':False,'shadows':[],'tracks':{'idle':track if image in [36,21,11,914] else static,'built':track,'walk':track,'attack':static,'death':static}}
(root/'dist/rts-data.json').write_text(json.dumps(supp,ensure_ascii=False,separators=(',',':')))
# A separate verified bundle avoids rewriting the original large resource archive.
paths=sorted(outdir.glob('*.webp'));packed=bytearray(b'MSTAR001')
for p in paths:
 name=p.relative_to(root/'dist').as_posix().encode();content=p.read_bytes();packed+=struct.pack('<HI',len(name),len(content))+name+content
compressed=gzip.compress(packed,compresslevel=6,mtime=0);parts=[]
for p in (root/'resources').glob('rts-*.b64'):p.unlink()
for offset in range(0,len(compressed),16384):
 name=f'rts-{offset//16384:04}.b64';(root/'resources'/name).write_text(base64.b64encode(compressed[offset:offset+16384]).decode());parts.append(name)
(root/'resources/rts-manifest.json').write_text(json.dumps({'sha256':hashlib.sha256(compressed).hexdigest(),'files':len(paths),'parts':parts},indent=2))
print('Imported',len(supp['units']),'definitions,',len(supp['graphics']),'sprite sets;',len(compressed),'bytes in',len(parts),'parts')

