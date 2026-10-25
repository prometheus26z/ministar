"""Build the missing original Protoss Warp Anchor from its checked HD2 source."""
import base64,hashlib,json,struct,sys
from pathlib import Path
from PIL import Image
import numpy as np
import sc_iscript as iscript

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'resources/original-warp'
manifest=json.loads((SOURCE/'manifest.json').read_text())
for entry in manifest['files']:
 path=SOURCE/entry['path'];data=path.read_bytes()
 if len(data)!=entry['bytes'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:
  raise SystemExit('Original Warp Anchor source checksum mismatch: '+entry['path'])

scripts=json.loads((ROOT/'resources/original-animation-scripts.json').read_text())
script_bytes=base64.b64decode(scripts['scripts/iscript.bin']['base64'])
image_bytes=base64.b64decode(scripts['arr/images.dat']['base64'])
sprite_bytes=base64.b64decode(scripts['arr/sprites.dat']['base64'])
for key,raw in [('scripts/iscript.bin',script_bytes),('arr/images.dat',image_bytes),('arr/sprites.dat',sprite_bytes)]:
 if hashlib.sha256(raw).hexdigest()!=scripts[key]['sha256']:raise SystemExit('Original iscript source checksum mismatch: '+key)
iscript.load_bytes(script_bytes,image_bytes,sprite_bytes)

raw=(SOURCE/'HD2/anim/main_211.anim').read_bytes()
magic,version,unused,layers,entries=struct.unpack_from('<I4H',raw)
if magic!=0x4d494e41 or entries!=1:raise SystemExit('Invalid original Warp Anchor .anim header')
count,reference,canvas_w,canvas_h,frame_offset=struct.unpack_from('<4HI',raw,332)
if reference!=65535:raise SystemExit('Warp Anchor unexpectedly aliases another atlas')
names=[raw[12+i*32:44+i*32].split(b'\0')[0].decode() for i in range(10)]
textures={}
for index in range(layers):
 pointer,size,width,height=struct.unpack_from('<IIHH',raw,344+index*12)
 if size:textures[names[index]]=Image.open(__import__('io').BytesIO(raw[pointer:pointer+size])).convert('RGBA')
diffuse=textures.get('diffuse')
if diffuse is None:raise SystemExit('Warp Anchor source has no diffuse layer')
metadata=json.loads((SOURCE/'HD2/anim/main_211.json').read_text())
if count!=metadata['frame_count'] or count!=14:raise SystemExit('Unexpected Warp Anchor frame count')
mask=textures.get('teamcolor')
frames=[]
for index in range(count):
 x,y,ox,oy,width,height,u,v=struct.unpack_from('<HHhh4H',raw,frame_offset+index*16)
 frames.append([x/2,y/2,ox/2,oy/2,width/2,height/2])

out=ROOT/'dist/original-animation-assets';out.mkdir(exist_ok=True)
sheet=Image.new('RGBA',diffuse.size)
if mask is None:
 sheet.alpha_composite(diffuse)
else:
 arr=np.array(diffuse).astype(float);m=np.array(mask).astype(float);alpha=(m[:,:,0]/255)*(m[:,:,3]/255);luma=arr[:,:,:3].max(axis=2)/255
 arr[:,:,:3]=arr[:,:,:3]*(1-alpha[:,:,None])+np.array([60,112,245])[None,None,:]*np.maximum(.25,luma[:,:,None])*alpha[:,:,None]
 sheet.alpha_composite(Image.fromarray(np.clip(arr,0,255).astype('uint8')))
asset=out/'211.webp';sheet.save(asset,'WEBP',quality=90,method=4)

init=iscript.trace(211,0)
special=iscript.trace(211,13,stop_at_signal=1,include_signals=True)
texture=iscript.trace(210,0,include_signals=True)
if not init or not init['loop'] or not special or special['ticks']!=4:raise SystemExit('Warp Anchor state trace did not match the source signal')
if len(texture.get('warpOverlayEvents',[]))!=20:raise SystemExit('Warp Texture overlay track did not decode its 20 source frames')
source_image=iscript.image_script(211)
graphic={'canvas':[canvas_w/2,canvas_h/2],'frames':frames,'images':{'blue':'original-animation-assets/211.webp','red':'original-animation-assets/211.webp'},'shadows':[],'sourceFrameCount':count,'turns':bool(image_bytes[999*4+211]),'drawFunction':image_bytes[999*8+211],'sourceImage':211,'iscriptId':source_image,'tracks':{'idle':init,'anchorSpecial':special},'warpTextureTrack':texture,'warpFlashModifier':{'start':48,'end':63,'stepEveryFrames':3,'completionSignal':1},'sourceNote':'HD2 atlas is from the checked existing archive; state slots and warpOverlay frames are decoded from resources/original-animation-scripts.json.'}

data_path=ROOT/'dist/original-animation-data.json';data=json.loads(data_path.read_text());data['211']=graphic;data_path.write_text(json.dumps(data,separators=(',',':')))
print('Imported checked Warp Anchor 211 and decoded its original state/overlay tracks.')
