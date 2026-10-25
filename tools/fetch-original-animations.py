"""Recover pinned original sprite/script bytes from Blizzard CDN; validate every file.
Usage: python tools/fetch-original-animations.py /path/to/cache/raw
"""
import hashlib,json,struct,sys,urllib.request,zlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

def decode_blte(data):
 if data[:4]!=b'BLTE':raise ValueError('Invalid BLTE signature')
 def chunk(raw):
  if raw[:1]==b'N':return raw[1:]
  if raw[:1]==b'Z':return zlib.decompress(raw[1:])
  raise ValueError('Unsupported BLTE compression '+repr(raw[:1]))
 header=int.from_bytes(data[4:8],'big')
 if not header:return chunk(data[8:])
 count=int.from_bytes(data[9:12],'big');offset=header;out=[]
 for i in range(count):
  size,expected,checksum=struct.unpack_from('>II16s',data,12+i*24);raw=data[offset:offset+size];offset+=size
  if hashlib.md5(raw).digest()!=checksum:raise ValueError('BLTE chunk checksum mismatch')
  plain=chunk(raw)
  if len(plain)!=expected:raise ValueError('BLTE chunk length mismatch')
  out.append(plain)
 return b''.join(out)

def recover(record,destination,cdn):
 path=(destination/record['path']).resolve()
 if not path.is_relative_to(destination.resolve()):raise ValueError('Unsafe source path')
 def verify(data):
  return len(data)==record['bytes']and hashlib.md5(data).hexdigest()==record['md5']and hashlib.sha256(data).hexdigest()==record['sha256']
 if path.exists()and verify(path.read_bytes()):return record['path']
 key=record.get('archive',record['encodedKey']);url=cdn+'data/'+key[:2]+'/'+key[2:4]+'/'+key;headers={}
 if 'archive'in record:
  off,size=record['offset'],record['encodedSize'];headers['Range']=f'bytes={off}-{off+size-1}'
 with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=90)as response:
  if headers and response.status!=206:raise ValueError('CDN did not honor range request')
  raw=response.read(record.get('encodedSize',record['bytes']*2)+1)
 if 'encodedSize'in record and len(raw)!=record['encodedSize']:raise ValueError('Encoded length mismatch')
 data=decode_blte(raw)
 if not verify(data):raise ValueError('Original source hash mismatch: '+record['path'])
 path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data);return record['path']

if __name__=='__main__':
 meta=json.loads((Path(__file__).resolve().parents[1]/'resources/original-animation-source.json').read_text());destination=Path(sys.argv[1])
 with ThreadPoolExecutor(max_workers=6)as pool:
  for path in pool.map(lambda r:recover(r,destination,meta['cdn']),meta['files']):print('Verified',path,flush=True)
