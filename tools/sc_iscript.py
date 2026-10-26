"""Decode original StarCraft visual script instructions; operand formats follow PyMS."""
import struct,re
from pathlib import Path
b=images=sprites=b""
headers={}
ops=[('playfram', ['frame']), ('playframtile', ['frame']), ('sethorpos', ['sbyte']), ('setvertpos', ['sbyte']), ('setpos', ['sbyte', 'sbyte']), ('wait', ['byte']), ('waitrand', ['byte', 'byte']), ('goto', ['label']), ('imgol', ['imageid', 'sbyte', 'sbyte']), ('imgul', ['imageid', 'sbyte', 'sbyte']), ('imgolorig', ['imageid']), ('switchul', ['imageid']), ('__0c', []), ('imgoluselo', ['imageid', 'sbyte', 'sbyte']), ('imguluselo', ['imageid', 'sbyte', 'sbyte']), ('sprol', ['spriteid', 'sbyte', 'sbyte']), ('highsprol', ['spriteid', 'sbyte', 'sbyte']), ('lowsprul', ['spriteid', 'sbyte', 'sbyte']), ('uflunstable', ['flingyid']), ('spruluselo', ['spriteid', 'sbyte', 'sbyte']), ('sprul', ['spriteid', 'sbyte', 'sbyte']), ('sproluselo', ['spriteid', 'overlayid']), ('end', []), ('setflipstate', ['flipstate']), ('playsnd', ['soundid']), ('playsndrand', ['sounds', 'soundid']), ('playsndbtwn', ['soundid', 'soundid']), ('domissiledmg', []), ('attackmelee', ['sounds', 'soundid']), ('followmaingraphic', []), ('randcondjmp', ['byte', 'label']), ('turnccwise', ['byte']), ('turncwise', ['byte']), ('turn1cwise', []), ('turnrand', ['byte']), ('setspawnframe', ['byte']), ('sigorder', ['signalid']), ('attackwith', ['weapon']), ('attack', []), ('castspell', []), ('useweapon', ['weaponid']), ('move', ['byte']), ('gotorepeatattk', []), ('engframe', ['bframe']), ('engset', ['frameset']), ('__2d', []), ('nobrkcodestart', []), ('nobrkcodeend', []), ('ignorerest', []), ('attkshiftproj', ['byte']), ('tmprmgraphicstart', []), ('tmprmgraphicend', []), ('setfldirect', ['byte']), ('call', ['label']), ('return', []), ('setflspeed', ['speed']), ('creategasoverlays', ['gasoverlay']), ('pwrupcondjmp', ['label']), ('trgtrangecondjmp', ['short', 'label']), ('trgtarccondjmp', ['short', 'short', 'label']), ('curdirectcondjmp', ['short', 'short', 'label']), ('imgulnextid', ['sbyte', 'sbyte']), ('__3e', []), ('liftoffcondjmp', ['label']), ('warpoverlay', ['frame']), ('orderdone', ['signalid']), ('grdsprol', ['spriteid', 'sbyte', 'sbyte']), ('__43', []), ('dogrddamage', [])]
TYPES={0: 2, 1: 2, 2: 4, 12: 14, 13: 14, 14: 16, 15: 16, 20: 22, 21: 22, 23: 24, 24: 26, 26: 28, 27: 28, 28: 28, 29: 28}
def load_sources(raw):
 raw=Path(raw);load_bytes((raw/'scripts/iscript.bin').read_bytes(),(raw/'arr/images.dat').read_bytes(),(raw/'arr/sprites.dat').read_bytes())
def load_bytes(script_bytes,image_bytes,sprite_bytes):
 global b,images,sprites,headers
 b=script_bytes;images=image_bytes;sprites=sprite_bytes;headers={};pos=struct.unpack_from('<H',b)[0]
 while True:
  id,off=struct.unpack_from('<HH',b,pos);pos+=4
  if id==65535 and off==0:break
  assert b[off:off+4]==b'SCPE';n=TYPES[b[off+4]];headers[id]=list(struct.unpack_from('<'+str(n)+'H',b,off+8))
SIZE2={'frame','label','imageid','spriteid','flingyid','soundid','short','speed'}
def instruction(p):
 op=b[p];p+=1;name,params=ops[op];args=[]
 if params and params[0]=='sounds':
  n=b[p];p+=1;args=[n]+list(struct.unpack_from('<'+str(n)+'H',b,p));p+=n*2
 else:
  for param in params:
   size=2 if param in SIZE2 else 1;args.append(int.from_bytes(b[p:p+size],'little',signed=param=='sbyte'));p+=size
 return name,args,p

def image_script(id):return struct.unpack_from('<I',images,999*10+id*4)[0]
def debug(id,action=0):
 h=headers[image_script(id)];p=h[action]if action<len(h)else 0;seen=set();print('IMAGE',id,'ISCRIPT',image_script(id),'HEADERS',h)
 while p and p not in seen:
  seen.add(p);name,a,n=instruction(p);print(p,name,a);p=a[0]if name=='goto'else n
  if name in ['end','ignorerest']:break

def trace(id,slot,target_near=None,stop_at_signal=None,include_signals=False,inherit_initial=False,stop_on_conditional=False):
 h=headers.get(image_script(id),[])
 if slot>=len(h)or not h[slot]:return None
 p=h[slot];seen={};stack=[];frame=None if inherit_initial else 0;frames=[];overlays=[];warp_overlays=[];ticks=0;hidden=False;loop=False;loopstart=0;sounds=[];fixed=None;follow=False;ended=False;signal_ticks={}
 for step in range(10000):
  state=(p,tuple(stack))
  if state in seen:loop=True;loopstart=seen[state];break
  seen[state]=len(frames);name,a,n=instruction(p);p=n
  if name in ['playfram','playframtile']:frame=a[0]
  elif name=='engframe':frame=a[0]
  elif name=='engset':frame=a[0]*17
  elif name in ['wait','waitrand']:
   extra={}
   if hidden:extra['hidden']=True
   if frame is None:extra['inheritFrame']=True
   if name=='waitrand':extra['randomWait']=a
   frames.append([frame,a[0]]+([extra]if extra else []));ticks+=a[0]
  elif name=='goto':p=a[0]
  elif name=='call':stack.append(p);p=a[0]
  elif name=='return':
   if not stack:raise ValueError(('empty call',id,slot))
   p=stack.pop()
  elif name in ['end','ignorerest']:ended=name=='end';break
  elif name in ['imgol','imgul','imgolorig','imgoluselo','imguluselo','imgulnextid']:
   image=id+1 if name=='imgulnextid'else a[0];xy=a if name=='imgulnextid'else a[1:];overlays.append({'image':image,'x':xy[0]if xy else 0,'y':xy[1]if len(xy)>1 else 0,'tick':ticks,'under':name in ['imgul','imguluselo','imgulnextid']})
  elif name in ['sprol','highsprol','lowsprul','spruluselo','sprul','sproluselo','grdsprol']:
   image=struct.unpack_from('<H',sprites,a[0]*2)[0];overlays.append({'image':image,'x':a[1]if len(a)>1 else 0,'y':a[2]if len(a)>2 else 0,'tick':ticks,'under':name in ['lowsprul','sprul','spruluselo']})
  elif name=='setfldirect':fixed=a[0]
  elif name=='followmaingraphic':follow=True
  elif name in ['tmprmgraphicstart','tmprmgraphicend']:hidden=name=='tmprmgraphicstart'
  elif name=='playsnd':sounds+=a
  elif name in ['playsndrand','playsndbtwn']:pass
  elif name=='trgtrangecondjmp' and target_near is not None:
   if target_near:p=a[1]
  elif name in ['randcondjmp','pwrupcondjmp','trgtrangecondjmp','trgtarccondjmp','curdirectcondjmp','liftoffcondjmp']:
   if stop_on_conditional:break
   raise ValueError(('conditional',id,slot,name,a))
  elif name=='sigorder':
   signal_ticks[str(a[0])]=ticks
   if stop_at_signal==a[0]:break
  elif name=='warpoverlay':warp_overlays.append({'frame':a[0],'tick':ticks})
  elif name in ['sethorpos','setvertpos','setpos','setflipstate','turnccwise','turncwise','turn1cwise','turnrand','setspawnframe','attackwith','attack','castspell','useweapon','move','gotorepeatattk','__2d','nobrkcodestart','nobrkcodeend','attkshiftproj','setflspeed','orderdone','domissiledmg','attackmelee','__0c','__3e','__43','dogrddamage','creategasoverlays','switchul']:pass
  else:raise ValueError(('unknown',id,slot,name))
 else:raise ValueError(('too long',id,slot))
 track={'frames':frames,'ticks':ticks,'loop':loop,'loopStart':loopstart,'ended':ended,'overlayEvents':overlays,'overlays':list(dict.fromkeys(x['image']for x in overlays)),'sounds':sounds,'fixedDirection':fixed,'followParent':follow}
 if warp_overlays:track['warpOverlayEvents']=warp_overlays
 if include_signals:track['signalTicks']=signal_ticks
 return track
