import site
import os

psycopg_dylibs = []
search_paths = site.getsitepackages() + [site.getusersitepackages(), '../.venv/lib/python3.13/site-packages', '../venv/lib/python3.14/site-packages']
try:
    import psycopg2
    search_paths.append(os.path.dirname(psycopg2.__file__))
except:
    pass

for s in search_paths:
	# Check for psycopg2 (v2)
	p2 = os.path.join(s, '.dylibs') if s.endswith('psycopg2') else os.path.join(s, 'psycopg2', '.dylibs')
	if os.path.exists(p2):
		psycopg_dylibs.append((p2, 'psycopg2/.dylibs'))
		break

for s in search_paths:
	# Check for psycopg (v3) binary
	p3 = os.path.join(s, '.dylibs') if s.endswith('psycopg_binary') else os.path.join(s, 'psycopg_binary', '.dylibs')
	if os.path.exists(p3):
		psycopg_dylibs.append((p3, 'psycopg_binary/.dylibs'))
		break

data_files_server = [
  ('omnidb.db','.'),
  ('config.py','.'),
  ('OmniDB_app/static','OmniDB_app/static'),
  ('OmniDB_app/include','OmniDB_app/include'),
  ('OmniDB_app/templates','OmniDB_app/templates'),
  ('OmniDB_app/plugins','OmniDB_app/plugins')
]

data_files_server.extend(psycopg_dylibs)

block_cipher = None



a = Analysis(['omnidb-server.py'],
			 pathex=['.'],
			 binaries=[],
			 datas=data_files_server,
			  hiddenimports=['cheroot.ssl','cheroot.ssl.builtin','psycopg2','paramiko', 'pgspecial', 'sqlparse', 'psycopg2.extras', 'psycopg2.extensions'],
			 hookspath=[],
			 runtime_hooks=[],
			 excludes=[],
			 win_no_prefer_redirects=False,
			 win_private_assemblies=False,
			 cipher=block_cipher,
			 noarchive=False)
pyz = PYZ(a.pure, a.zipped_data,
			 cipher=block_cipher)
exe = EXE(pyz,
		  a.scripts,
		  [],
		  exclude_binaries=True,
		  name='omnidb-server',
		  debug=False,
		  bootloader_ignore_signals=False,
		  strip=False,
		  upx=True,
		  console=True )
coll = COLLECT(exe,
			   a.binaries,
			   a.zipfiles,
			   a.datas,
			   strip=False,
			   upx=True,
			   upx_exclude=[],
			   name='omnidb-server')
