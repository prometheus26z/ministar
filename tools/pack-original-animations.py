"""Pack restored original visual assets into reproducible, checksummed git parts."""
import base64,gzip,hashlib,json,struct
from pathlib import Path
root=Path(__file__).resolve().parents[1];paths=[root/'dist/original-animation-data.json']+sorted((root/'dist/original-animation-assets').glob('*.webp'));data=bytearray(b'MSTAR001')
for path in paths:
 name=path.relative_to(root/'dist').as_posix().encode();content=path.read_bytes();data+=struct.pack('<HI',len(name),len(content))+name+content
packed=gzip.compress(data,compresslevel=6,mtime=0);parts=[]
for path in (root/'resources').glob('original-animations-*.b64'):path.unlink()
for offset in range(0,len(packed),128*1024):
 name=f'original-animations-{offset//(128*1024):04}.b64';(root/'resources'/name).write_text(base64.b64encode(packed[offset:offset+128*1024]).decode());parts.append(name)
manifest={'sha256':hashlib.sha256(packed).hexdigest(),'files':len(paths),'parts':parts,'dataSha256':hashlib.sha256(paths[0].read_bytes()).hexdigest()};(root/'resources/original-animations-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Packed',len(paths),'files;',len(packed),'bytes;',len(parts),'parts')
