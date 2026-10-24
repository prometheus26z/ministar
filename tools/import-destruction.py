"""Import original building explosions and race-specific rubble from the supplied HD2 archive."""
import io,json,math,sys,zipfile
from pathlib import Path
from PIL import Image
import numpy as np

root=Path(__file__).resolve().parents[1]
archive=zipfile.ZipFile(sys.argv[1])
prefix='MINISTAR_Remastered_v0.2/web_assets/HD2/anim/'
out=root/'dist/destruction-assets';out.mkdir(exist_ok=True)
graphics={}
for image in [60,110,111,216,217,334,335,336]:
    key=prefix+f'main_{image:03d}'
    meta=json.loads(archive.read(key+'.json'))
    diffuse=Image.open(io.BytesIO(archive.read(key+'.diffuse.png'))).convert('RGBA')
    mask=Image.open(io.BytesIO(archive.read(key+'.teamcolor.png'))).convert('L') if key+'.teamcolor.png' in archive.namelist() else None
    frames=meta['frames'];cols=math.ceil(math.sqrt(len(frames)))
    cw=max(f['width'] for f in frames)+4;ch=max(f['height'] for f in frames)+4
    sheets={c:Image.new('RGBA',(cw*cols,ch*math.ceil(len(frames)/cols))) for c in ['blue','red']}
    table=[]
    for n,f in enumerate(frames):
        x,y,w,h=f['atlas_x'],f['atlas_y'],f['width'],f['height']
        crop=diffuse.crop((x,y,x+w,y+h));m=mask.crop((x,y,x+w,y+h)) if mask else None
        dx=n%cols*cw+2;dy=n//cols*ch+2
        for color,rgb in [('blue',[60,112,245]),('red',[224,56,48])]:
            arr=np.array(crop).astype(float)
            if m is not None:
                a=np.array(m).astype(float)/255;lum=arr[:,:,:3].max(axis=2)/255
                arr[:,:,:3]=arr[:,:,:3]*(1-a[:,:,None])+np.array(rgb)[None,None,:]*np.maximum(.25,lum[:,:,None])*a[:,:,None]
            sheets[color].paste(Image.fromarray(np.clip(arr,0,255).astype('uint8')),(dx,dy))
        table.append([dx,dy,f['x_offset'],f['y_offset'],w,h])
    paths={}
    for color,sheet in sheets.items():
        name=f'{image}-{color}.webp';sheet.save(out/name,'WEBP',quality=85,method=6);paths[color]='destruction-assets/'+name
    directional=image==421
    frameset=[[i,2] for i in range(0,len(frames),17 if directional else 1)]
    track={'frames':frameset,'ticks':len(frameset)*2,'loop':True,'overlays':[],'sounds':[]}
    graphics[str(image)]={'images':paths,'canvas':[meta['canvas_width'],meta['canvas_height']],'frames':table,'turns':directional,'tracks':{'idle':track,'attack':track},'shadows':[]}
(root/'dist/destruction-data.json').write_text(json.dumps(graphics,separators=(',',':')))
print('Imported original building destruction sprites:',len(graphics))
