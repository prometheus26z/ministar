import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MIME = Object.freeze({
 '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.ogg':'audio/ogg'
});
const MEDIA_MIME = Object.freeze({'.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg'});
const RESOURCE_DIRS = ['assets','rts-assets','original-animation-assets','construction-assets','destruction-assets','turret-assets','ds-assets'];
const METADATA = [
 'assets/data.json','rts-data.json','construction-data.json','turret-data.json','destruction-data.json','original-animation-data.json','spell-visual-data.json'
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function walk(root, relative, output) {
 const absolute = path.join(root, relative);
 if (!fs.existsSync(absolute)) return;
 for (const entry of fs.readdirSync(absolute, {withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
  const child = path.posix.join(relative, entry.name);
  if (entry.isDirectory()) walk(root, child, output);
  else if (entry.isFile() && MEDIA_MIME[path.extname(entry.name).toLowerCase()]) output.push(child);
 }
}

function referencedMedia(distRoot) {
 const documents = METADATA.map(relative => {
  const file = path.join(distRoot, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing cache manifest input: ${relative}`);
  return JSON.parse(fs.readFileSync(file,'utf8'));
 });
 const refs = new Set();
 for (const document of documents) {
  for (const graphic of Object.values(document.graphics || {})) {
   for (const url of Object.values(graphic?.images || {})) if (typeof url === 'string') refs.add(url);
  }
  for (const unit of Object.values(document.units || {})) if (typeof unit?.portrait === 'string') refs.add(unit.portrait);
  for (const url of Object.values(document.audio || {})) if (typeof url === 'string') refs.add(url);
 }
 return refs;
}

export function buildResourceManifest(distRoot, appVersion) {
 const files = new Set(METADATA);
 const media=[];
 for (const directory of RESOURCE_DIRS) walk(distRoot, directory, media);
 for (const relative of media) files.add(relative);
 const refs=new Set();
 for (const url of referencedMedia(distRoot)) {
  const normalized=url.split('?')[0].replace(/^\.\//,'');
  if (!MIME[path.extname(normalized).toLowerCase()]) continue; // Native videos are intentionally excluded.
  refs.add(normalized);
 }
 const entries={};
 for (const relative of [...files].sort()) {
  const ext=path.extname(relative).toLowerCase(), mime=MIME[ext];
  if (!mime) throw new Error(`Unsupported resource manifest type: ${relative}`);
  const bytes=fs.readFileSync(path.join(distRoot,relative));
  entries[relative]={sha256:hash(bytes),bytes:bytes.byteLength,mime,kind:relative.endsWith('.json')?'metadata':ext==='.ogg'?'audio':'image'};
 }
 for (const url of refs) {
  const normalized=url.split('?')[0].replace(/^\.\//,'');
  if (normalized.startsWith('http:')||normalized.startsWith('https:')||normalized.startsWith('/')||normalized.split('/').includes('..')) throw new Error(`Unsafe media reference in game data: ${url}`);
  if (!entries[normalized]) throw new Error(`Referenced media is missing from resource manifest: ${url}`);
 }
 const manifest={schema:1,appVersion,entries};
 manifest.buildId=hash(Buffer.from(JSON.stringify(manifest)));
 return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(import.meta.filename)) {
 const root=path.resolve(import.meta.dirname,'..'),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const manifest=buildResourceManifest(path.join(root,'dist'),pkg.version);
 fs.writeFileSync(path.join(root,'dist/resource-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(`Generated ${Object.keys(manifest.entries).length} verified resource entries (${manifest.buildId}).`);
}
