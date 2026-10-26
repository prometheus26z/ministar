"""Restore persistent unit-shadow links from the checked original Iscript bytes."""
import base64
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
import sc_iscript as iscript

source=json.loads((ROOT/'resources/original-animation-scripts.json').read_text())
iscript.load_bytes(*[base64.b64decode(source[key]['base64']) for key in ('scripts/iscript.bin','arr/images.dat','arr/sprites.dat')])
base=json.loads((ROOT/'dist/assets/data.json').read_text())
extra=json.loads((ROOT/'dist/rts-data.json').read_text())
original_path=ROOT/'dist/original-animation-data.json'
original=json.loads(original_path.read_text())
graphics={**base.get('graphics',{}),**extra.get('graphics',{}),**original}
changed=0

def source_layers(image_id,graphic):
 try:
  init=iscript.trace(image_id,0,stop_on_conditional=True)
 except (ValueError,KeyError):
  init=None
 layers={}
 for event in (init or {}).get('overlayEvents',[]):
  shadow_id=int(event['image'])
  if 0<=shadow_id<999 and iscript.images[999*8+shadow_id]==10:
   try:
    shadow_init=iscript.trace(shadow_id,0,stop_on_conditional=True)
   except (ValueError,KeyError):
    shadow_init=None
   layers[shadow_id]={'image':shadow_id,'x':event.get('x',0),'y':event.get('y',0),'tick':event.get('tick',0),'followParent':bool((shadow_init or {}).get('followParent'))}
 for shadow_id in graphic.get('shadows',[]):
  shadow_id=int(shadow_id)
  if shadow_id in layers or not 0<=shadow_id<999 or iscript.images[999*8+shadow_id]!=10:
   continue
  try:
   shadow_init=iscript.trace(shadow_id,0,stop_on_conditional=True)
  except (ValueError,KeyError):
   shadow_init=None
  layers[shadow_id]={'image':shadow_id,'x':0,'y':0,'tick':0,'followParent':bool((shadow_init or {}).get('followParent'))}
 return layers

for raw_id,source_graphic in sorted(graphics.items(),key=lambda pair:int(pair[0])):
 image_id=int(raw_id)
 if image_id>=999:continue
 layers=source_layers(image_id,source_graphic)
 if not layers:continue
 parent=original.get(raw_id)
 if parent is None:
  parent=dict(source_graphic)
  original[raw_id]=parent
 combined={int(layer['image']):layer for layer in parent.get('shadowLayers',[]) if isinstance(layer,dict) and isinstance(layer.get('image'),int)}
 combined.update(layers)
 parent['shadowLayers']=[combined[key] for key in sorted(combined)]
 parent['shadows']=sorted(set(parent.get('shadows',[]))|set(combined))
 for shadow_id in layers:
  shadow_key=str(shadow_id)
  shadow=original.get(shadow_key)
  if shadow is None:
   shadow=dict(graphics.get(shadow_key,{}))
   if not shadow:continue
   original[shadow_key]=shadow
  shadow['drawFunction']=10
  try:
   shadow_init=iscript.trace(shadow_id,0,stop_on_conditional=True)
  except (ValueError,KeyError):
   shadow_init=None
  shadow.setdefault('tracks',{})['idle']={**(shadow.get('tracks',{}).get('idle') or {}),'followParent':bool((shadow_init or {}).get('followParent'))}
 changed+=len(layers)

original_path.write_text(json.dumps(original,separators=(',',':')))
print(f'Restored {changed} original shadow links across {len(original)} animation graphics.')
