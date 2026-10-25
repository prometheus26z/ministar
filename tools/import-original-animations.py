"""Import all recovered frames and source-script timing. Run after npm run build."""
import json,struct,io,math,hashlib
from pathlib import Path
from PIL import Image
import numpy as np
import sc_iscript as iscript
import sys
SOURCE=Path(sys.argv[1]);iscript.load_sources(SOURCE)
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist/original-animation-assets';OUT.mkdir(exist_ok=True)
base=json.load(open(ROOT/'dist/assets/data.json'))['graphics'];graphics={};slots={'idle':0,'death':1,'attack':2,'airAttack':3,'cast':7,'walk':11,'built':16,'burrow':25,'unburrow':26}
paths=sorted((SOURCE/'HD2/anim').glob('*.anim'));ids=sorted(set([int(p.stem.split('_')[1])for p in paths]+[153,442]))
for id in ids:
 source_id={153:151,442:427}.get(id,id);path=(SOURCE/f'HD2/anim/main_{source_id:03d}.anim')
 b=path.read_bytes();magic,version,unused,layers,entries=struct.unpack_from('<I4H',b);assert magic==0x4d494e41 and entries==1
 count,ref,cw,ch,fp=struct.unpack_from('<4HI',b,332);assert ref==65535
 names=[b[12+i*32:44+i*32].split(b'\0')[0].decode()for i in range(10)]
 textures={}
 for i in range(layers):
  ptr,size,w,h=struct.unpack_from('<IIHH',b,344+i*12)
  if size:textures[names[i]]=Image.open(io.BytesIO(b[ptr:ptr+size])).convert('RGBA')
 diffuse=textures['diffuse'];mask=textures.get('teamcolor');frames=[]
 for i in range(count):
  x,y,ox,oy,w,h,u,v=struct.unpack_from('<HHhh4H',b,fp+i*16);frames.append([x/2,y/2,ox/2,oy/2,w/2,h/2])
 images={}
 for team,rgb in [('blue',[60,112,245]),('red',[224,56,48])]:
  im=diffuse
  if mask:
   arr=np.array(diffuse).astype(float);m=np.array(mask);a=(m[:,:,0]/255)*(m[:,:,3]/255);lum=arr[:,:,:3].max(axis=2)/255
   arr[:,:,:3]=arr[:,:,:3]*(1-a[:,:,None])+np.array(rgb)[None,None,:]*np.maximum(.25,lum[:,:,None])*a[:,:,None];im=Image.fromarray(np.clip(arr,0,255).astype('uint8'))
  dest=OUT/f'{id}-{team}.webp';
  if not dest.exists()or dest.stat().st_size==0:im.save(dest,'WEBP',quality=90,method=4)
  images[team]=dest.relative_to(ROOT/'dist').as_posix()
 g={'canvas':[cw/2,ch/2],'frames':frames,'images':images,'shadows':[],'sourceFrameCount':count}
 for x,y,ox,oy,w,h in frames:
  if x<0 or y<0 or x+w>diffuse.width or y+h>diffuse.height:raise ValueError('Original frame outside DDS atlas: '+str(id))
 g['turns']=bool(iscript.images[999*4+id]);g['drawFunction']=iscript.images[999*8+id];g['sourceImage']=source_id;g['iscriptId']=iscript.image_script(id)
 tracks={}
 for action,slot in slots.items():
  try:t=iscript.trace(id,slot)
  except ValueError as e:
   assert e.args[0][0]=='conditional'and e.args[0][3]=='trgtrangecondjmp',e
   threshold=e.args[0][4][0];t=iscript.trace(id,slot,False);t['rangeVariants']={'threshold':threshold,'near':iscript.trace(id,slot,True)}
  tracks[action]=t
 g['tracks']=tracks
 if id in [134,925]:g['persistentOverlays']=tracks['idle']['overlayEvents']
 graphics[str(id)]=g;print('converted',id,len(g['frames']),flush=True)
# Existing base sheets already contain their full frame atlas. Replace death
# timelines from the same original script so end/spawn timing is preserved.
for key,original in base.items():
 if key in graphics or int(key)>=999:continue
 try:death=iscript.trace(int(key),1)
 except (ValueError,KeyError):continue
 if not death:continue
 if any(frame[0]>=len(original['frames'])for frame in death['frames']):raise ValueError('Source frame missing for '+key)
 g={**original,'tracks':{**original['tracks'],'death':death},'sourceImage':int(key),'iscriptId':iscript.image_script(int(key))}
 graphics[key]=g
# Neutral/effect layers and image aliases often share the same original texture.
# Store identical sprite sheets once, without changing any frame metadata.
textures={};used=set()
for g in graphics.values():
 for team,url in g['images'].items():
  if not url.startswith('original-animation-assets/'):continue
  path=ROOT/'dist'/url;digest=hashlib.sha256(path.read_bytes()).hexdigest()
  if digest in textures:g['images'][team]=textures[digest]
  else:textures[digest]=url
  used.add(g['images'][team])
for path in OUT.glob('*.webp'):
 if path.relative_to(ROOT/'dist').as_posix()not in used:path.unlink()
(ROOT/'dist/original-animation-data.json').write_text(json.dumps(graphics,separators=(',',':')))
print('GRAPHICS',len(graphics),'BYTES',sum(p.stat().st_size for p in OUT.glob('*')))
