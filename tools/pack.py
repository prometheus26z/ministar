from pathlib import Path
import json,struct,gzip,hashlib,base64
root=Path(__file__).resolve().parents[1];dist=root/'dist';paths=sorted(p for p in (dist/'assets').rglob('*') if p.is_file());raw=bytearray(b'MSTAR001')
for p in paths:
 name=p.relative_to(dist/'assets').as_posix().encode();b=p.read_bytes();assert b,p;raw+=struct.pack('<HI',len(name),len(b))+name+b
packed=gzip.compress(raw,compresslevel=6,mtime=0);parts=[];size=512*1024
for p in (root/'resources').glob('assets-*.b64'):p.unlink()
for i in range(0,len(packed),size):
 name=f'assets-{i//size:04}.b64';(root/'resources'/name).write_bytes(base64.b64encode(packed[i:i+size]));parts.append(name)
(root/'resources/manifest.json').write_text(json.dumps({'format':'MSTAR001+gzip+base64','sha256':hashlib.sha256(packed).hexdigest(),'files':len(paths),'bytes':len(packed),'parts':parts},indent=2))
print('packed',len(paths),'files',len(packed),'bytes',len(parts),'chunks')
