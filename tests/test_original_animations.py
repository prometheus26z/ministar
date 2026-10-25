import base64,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('original_iscript',ROOT/'tools/sc_iscript.py');script=importlib.util.module_from_spec(spec);spec.loader.exec_module(script)
class OriginalAnimationSourceTests(unittest.TestCase):
 def test_exported_timelines_match_original_script_bytes(self):
  fixtures=json.loads((ROOT/'resources/original-animation-scripts.json').read_text());graphics=json.loads((ROOT/'dist/original-animation-data.json').read_text())
  with tempfile.TemporaryDirectory()as directory:
   for name,item in fixtures.items():
    data=base64.b64decode(item['base64']);self.assertEqual(hashlib.md5(data).hexdigest(),item['md5']);self.assertEqual(hashlib.sha256(data).hexdigest(),item['sha256']);path=Path(directory)/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
   script.load_sources(directory)
   for ident in [134,135,136,925,926,927,928,241,920]:
    self.assertEqual(graphics[str(ident)]['tracks']['idle'],script.trace(ident,0))
   near=graphics['135']['tracks']['attack']['rangeVariants']['near'];self.assertEqual(near,script.trace(135,2,True))
