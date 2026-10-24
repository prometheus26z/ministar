"""Restore the original Missile Turret's separate directional weapon head."""
import io,json,math,sys,zipfile
from pathlib import Path
from PIL import Image
import numpy as np

root=Path(__file__).resolve().parents[1]
archive=zipfile.ZipFile(sys.argv[1]);key='MINISTAR_Remastered_v0.2/web_assets/HD2/anim/main_297'
meta=json.loads(archive.read(key+'.json'))
diffuse=Image.open(io.BytesIO(archive.read(key+'.diffuse.png'))).convert('RGBA')
mask=Image.open(io.BytesIO(archive.read(key+'.teamcolor.png'))).convert('L')
frames=meta['frames'];cols=math.ceil(math.sqrt(len(frames)))
cw=max(f['width'] for f in frames)+4;ch=max(f['height'] for f in frames)+4
out=root/'dist/turret-assets';out.mkdir(exist_ok=True)
sheets={c:Image.new('RGBA',(cw*cols,ch*math.ceil(len(frames)/cols))) for c in ['blue','red']};table=[]
for n,f in enumerate(frames):
 x,y,w,h=f['atlas_x'],f['atlas_y'],f['width'],f['height'];crop=diffuse.crop((x,y,x+w,y+h));m=mask.crop((x,y,x+w,y+h))
 dx=n%cols*cw+2;dy=n//cols*ch+2
 for color,rgb in [('blue',[60,112,245]),('red',[224,56,48])]:
  arr=np.array(crop).astype(float);a=np.array(m).astype(float)/255;lum=arr[:,:,:3].max(axis=2)/255
  arr[:,:,:3]=arr[:,:,:3]*(1-a[:,:,None])+np.array(rgb)[None,None,:]*np.maximum(.25,lum[:,:,None])*a[:,:,None]
  sheets[color].paste(Image.fromarray(np.clip(arr,0,255).astype('uint8')),(dx,dy))
 table.append([dx,dy,f['x_offset'],f['y_offset'],w,h])
for color,sheet in sheets.items():sheet.save(out/f'297-{color}.webp','WEBP',quality=90,method=6)
idle={'frames':[[0,125]],'ticks':125,'loop':True,'overlays':[],'sounds':[]}
attack={'frames':[[0,2],[17,2]],'ticks':4,'loop':False,'overlays':[],'sounds':[]}
g={'images':{c:f'turret-assets/297-{c}.webp' for c in sheets},'canvas':[meta['canvas_width'],meta['canvas_height']],'frames':table,'turns':True,'tracks':{'idle':idle,'attack':attack,'airAttack':attack},'shadows':[]}
(root/'dist/turret-data.json').write_text(json.dumps({'297':g},separators=(',',':'))+'\n')
print('Imported all',len(frames),'original turret head frames')
