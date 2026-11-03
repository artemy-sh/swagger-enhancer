"""Build a reproducible Chrome Web Store ZIP using an explicit runtime allowlist."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import zipfile

root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'manifest.json').read_text())
package=json.loads((root/'package.json').read_text())
lock=json.loads((root/'package-lock.json').read_text())
version=manifest['version']
assert re.fullmatch(r'\d+\.\d+\.\d+',version),'Expected a three-part release version'
assert package['version']==lock['version']==lock['packages']['']['version']==version,'Release versions differ'
assert f"version: '{version}'" in (root/'js/main.js').read_text(),'Runtime version differs'
assert len(manifest['description'])<=132,'Manifest description exceeds 132 characters'

files={Path(name) for name in ['manifest.json','popup.html','LICENSE','privacy.md']}
excluded={'test_runner.js','page_test_functions.js'}
for folder,extensions in [('js',{'.js'}),('css',{'.css'}),('assets',{'.png'})]:
    files.update(path.relative_to(root) for path in (root/folder).rglob('*')
                 if path.is_file() and path.suffix in extensions and path.name not in excluded)

references=set(manifest['icons'].values())|set(manifest['action']['default_icon'].values())
references.update([manifest['action']['default_popup'],manifest['background']['service_worker']])
for entry in manifest['content_scripts']:references.update(entry.get('js',[])+entry.get('css',[]))

class PopupReferences(HTMLParser):
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='script' and attrs.get('src'):references.add(attrs['src'])
        if tag=='link' and attrs.get('href'):references.add(attrs['href'])

PopupReferences().feed((root/'popup.html').read_text())
for path in (root/'js').glob('*.js'):
    if path.name not in excluded:references.update(re.findall(r"['\"](css/[\w.-]+\.css)['\"]",path.read_text()))
missing=sorted(name for name in references if Path(name) not in files)
assert not missing,f'Runtime files missing from package: {missing}'
for path in files:assert not (root/path).is_symlink(),f'Unexpected symlink: {path}'

dist=root/'dist';dist.mkdir(exist_ok=True)
archive=dist/f'swagger-enhancer-{version}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as zip:
    for path in sorted(files):
        info=zipfile.ZipInfo(path.as_posix(),date_time=(1980,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
        zip.writestr(info,(root/path).read_bytes(),compresslevel=9)
with zipfile.ZipFile(archive) as zip:
    assert zip.testzip() is None
    assert len(zip.namelist())==len(files) and 'manifest.json' in zip.namelist()
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
checksum=archive.with_suffix('.zip.sha256')
checksum.write_text(f'{digest}  {archive.name}\n')
print(f'{archive.name}: {len(files)} files, {archive.stat().st_size:,} bytes')
print(f'SHA-256: {digest}')
