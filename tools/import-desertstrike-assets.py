"""Build original Desert tiles and objective sprites from previously acquired bundles.
Usage: python tools/import-desertstrike-assets.py source-bundle-directory
"""
import io,json,struct,zipfile,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
from battlefield_terrain import render_battlefield
root=Path(__file__).resolve().parents[1];source=Path(__import__('sys').argv[1]);prefix='MINISTAR_Remastered_v0.2/'
terrain=zipfile.ZipFile(source/'MINISTAR_Remastered_v0.2_05_Terrain_Effects.zip');hd=zipfile.ZipFile(source/'MINISTAR_Remastered_v0.2_04_HD2_WebSprites.zip');classic=zipfile.ZipFile(source/'MINISTAR_Resources_v0.1.zip')
raw=json.loads(classic.read('MINISTAR_Resources_v0.1/data_json/units.dat.json'));sprites=json.loads(classic.read('MINISTAR_Resources_v0.1/data_json/sprites.dat.json'));flingy=json.loads(classic.read('MINISTAR_Resources_v0.1/data_json/flingy.dat.json'))
extra=json.loads((root/'dist/rts-data.json').read_text());dest=root/'dist/ds-assets';dest.mkdir(exist_ok=True)
for id,name in [(173,'케이다린 수정 형성부'),(174,'프로토스 사원')]:
 r=raw[id];image=sprites[flingy[r['graphics']]['sprite']]['image'];p=prefix+f'web_assets/HD2/anim/main_{image:03d}';meta=json.loads(hd.read(p+'.json'));im=Image.open(io.BytesIO(hd.read(p+'.diffuse.png'))).convert('RGBA');frames=meta['frames'][:1 if id!=40 else 17];table=[];width=max(f['width']for f in frames)+4;height=sum(f['height']+4 for f in frames);sheet=Image.new('RGBA',(width,height));y=2
 for f in frames:
  x0,y0,w,h=f['atlas_x'],f['atlas_y'],f['width'],f['height'];sheet.paste(im.crop((x0,y0,x0+w,y0+h)),(2,y));table.append([2,y,f['x_offset'],f['y_offset'],w,h]);y+=h+4
 namepath=f'ds-assets/{image}.webp';sheet.save(root/'dist'/namepath,'WEBP',quality=90,method=6)
 track={'frames':[[0,125]],'ticks':125,'loop':True};extra['graphics'][str(image)]={'canvas':[meta['canvas_width'],meta['canvas_height']],'frames':table,'images':{'blue':namepath,'red':namepath},'turns':id==40,'shadows':[],'tracks':{a:track for a in ['idle','walk','attack','death']}}
 if str(id) not in extra['units']:
  extra['units'][str(id)]={'id':id,'name':name,'en':name,'race':'neutral' if id!=40 else 'zerg','image':image,'hp':r['hit_points']['whole'],'shield':0,'energy':0,'armor':r['armor'],'speed':80 if id==40 else 0,'radius':10 if id==40 else 48,'supply':0,'cost':[r['mineral_cost'],r['vespene_cost']],'qty':1,'groundWeapon':r['ground_weapon'],'airWeapon':r['air_weapon'],'groundHits':1,'airHits':0,'size':r['unit_size'],'air':False,'building':id!=40,'organic':id==40,'mechanical':False,'detector':False,'cloak':False,'sight':320,'abilities':[],'subunit':None,'space':r['space_required'],'capacity':0,'voice':{'select':[],'yes':[],'ready':[]},'portrait':None,'footprint':list(r['staredit_placement_size'].values()),'buildTime':r['build_time']/24}
 extra['units'][str(id)]['image']=image
 extra['units'][str(id)]['race']='protoss' if id!=40 else 'zerg'
(root/'dist/rts-data.json').write_text(json.dumps(extra,ensure_ascii=False,separators=(',',':')))
cv=terrain.read(prefix+'raw/TileSet/Desert.cv5');vx=terrain.read(prefix+'raw/TileSet/Desert.vx4ex');vr=terrain.read(prefix+'raw/TileSet/Desert.vr4');wpe=terrain.read(prefix+'raw/TileSet/Desert.wpe');snapshot=json.loads((root/'resources/original-desertstrike.json').read_text());tiles=snapshot['map']['terrain'];cache={}
def tile(v):
 if v not in cache:
  mega=struct.unpack_from('<H',cv,(v>>4)*52+20+(v&15)*2)[0];im=Image.new('P',(32,32));im.putpalette([wpe[i*4+c]for i in range(256)for c in range(3)])
  for j in range(16):
   m=struct.unpack_from('<I',vx,mega*64+j*4)[0];mini=Image.frombytes('P',(8,8),vr[(m>>1)*64:(m>>1)*64+64]);im.paste(mini.transpose(Image.Transpose.FLIP_LEFT_RIGHT)if m&1 else mini,(j%4*8,j//4*8))
  cache[v]=im.convert('RGB')
 return cache[v]
original=Image.new('RGB',(3072,3072))
for i,v in enumerate(tiles):original.paste(tile(v),(i%96*32,i//96*32))
original.resize((960,960)).save(root/'docs/desertstrike-original-terrain.webp','WEBP',quality=90)
original.crop((0,0,1056,608)).save(dest/'production.webp','WEBP',quality=90)
# Mobile scenery is a continuous upright source crop, not a rotated raster.
# The crop keeps the original cliff at the right edge and the central lane open.
# Source resolution is normalized to the committed recovered crop (800x1280).
upright=original.crop((0,80,1200,2000)).resize((800,1280),Image.Resampling.LANCZOS)
upright.save(root/'resources/desertstrike/upright-field.webp','WEBP',lossless=True,method=6)
metadata_path=root/'resources/desertstrike/upright-field.json'
metadata=json.loads(metadata_path.read_text())
metadata['sourceSha256']=hashlib.sha256((root/'resources/desertstrike/upright-field.webp').read_bytes()).hexdigest()
metadata['recoveredFrom']={'operation':'Rendered directly from original Desert cv5/vx4ex/vr4/wpe and MTXM, then cropped without rotation.'}
metadata_path.write_text(json.dumps(metadata,indent=2)+'\n')
render_battlefield(upright).save(dest/'battlefield.webp','WEBP',quality=90,method=6)
print('Imported Desert terrain, crystal formation and temple sprites')
