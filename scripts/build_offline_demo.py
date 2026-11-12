#!/usr/bin/env python3
"""Build the offline KubeScope preview from the archived v1.0.1 UI."""
from pathlib import Path
import json, re, runpy, zipfile
source=Path('legacy')
target=Path('demo')
target.mkdir(exist_ok=True)
mock=runpy.run_path(str(source/'server.py'))['demo_snapshot']
contexts=['gke-acme-platform-prod','kind-local-playground','aks-acme-stage']
fixtures={ctx:mock(ctx) for ctx in contexts}
for item in fixtures.values(): item['collectedAt']='2026-11-12T12:00:00Z'
js=(source/'static/app.js').read_text()
css=(source/'static/app.css').read_text()
html=(source/'static/index.html').read_text()
start=js.index('async function load(context=null){')
end=js.index('function updateConsoleChoices(){',start)
load='''const DEMO_DATA=__DATA__;
function load(context=null){
 const key=Object.prototype.hasOwnProperty.call(DEMO_DATA,context)?context:Object.keys(DEMO_DATA)[0];
 state.snapshot=DEMO_DATA[key];state.context=key;
 if(!state.snapshot.namespaces.some(n=>n.name===state.namespace))state.namespace='*';
 if(!state.console.namespace||!state.snapshot.namespaces.some(n=>n.name===state.console.namespace))state.console.namespace='*';
 render();
}
'''.replace('__DATA__',json.dumps(fixtures,separators=(',',':')))
js=js[:start]+load+js[end:]
start=js.index('async function execute(){')
end=js.index('// Keep theme selection local',start)
run='''function execute(){
 const c=state.console;
 if(commandNeedsResource(c.action)&&!c.name){toast('Choose a sample resource');return;}
 const r=resourcesForCommand().find(x=>x.name===c.name),cmd=commandPreview();
 const content=c.action==='events'?state.snapshot.events.map(e=>e.reason+'  '+e.object).join('\\n'):
 c.action==='top_nodes'?state.snapshot.nodes.map(n=>n.name+'  '+n.status).join('\\n'):
 c.action==='top_pods'?state.snapshot.resources.pods.slice(0,12).map(p=>p.name+'  '+p.status).join('\\n'):
 c.action==='cluster_info'?'Demo cluster only — no API server contacted':
 JSON.stringify(r||{name:c.name,namespace:c.namespace,kind:c.kind,status:'Sample'},null,2);
 state.result={ok:true,demo:true,code:0,command:cmd,output:'OFFLINE SAMPLE · NOT EXECUTED\\n\\n'+content};render();
}
function runSimple(op){state.console.action=op;state.console.namespace=state.namespace;state.view='console';state.result=null;execute();}
'''
js=js[:start]+run+js[end:]
js=js.replace("try{localStorage.setItem('kubescope-theme',next)}catch(e){};",'')
js=js.replace("async function copyCommand(){try{await navigator.clipboard.writeText(commandPreview());toast('Command copied')}catch{toast('Copy unavailable in this browser')}}",'')
js=js.replace("if(op==='copy-command'){copyCommand();return}",'')
js=js.replace('<button class="btn small" data-action="copy-command">⧉ Copy</button>','<span class="mode-badge demo">SAMPLE ONLY</span>')
js=js.replace('▶ Run command','▶ Show sample output').replace('Read-only access','Demo data only')
js=js.replace('✓ All actions are read-only. Mutating operations such as delete, apply, exec, scale and restart are intentionally blocked.','No commands are executed. All results are examples from bundled sample data.')
js=js.replace('Exactly what is sent to kubectl','Example only — not sent anywhere')
js=js.replace('READ ONLY · NO SHELL','DEMO ONLY · NO EXECUTION')
js=js.replace('No commands are executed automatically.','No commands can execute.')
js=js.replace('Read pod logs','Sample pod logs')
js=js.replace('Run useful, non-destructive Kubernetes commands through a guided workflow.','Preview command examples without running anything.')
js=re.sub(r'function dateShort\(s\)\{.*?\}\nfunction relDate\(s\)\{.*?\}\n',"function dateShort(s){return s?String(s).slice(0,16).replace('T',' ')+' UTC':'—';}\nfunction relDate(s){return dateShort(s);}\n",js,count=1,flags=re.S)
assert not any(term in js for term in ('fetch(', 'navigator.', 'localStorage', 'sessionStorage','XMLHttpRequest','WebSocket','Date.now','new Date(', 'matchMedia('))
html=re.sub(r'  <script>try\{let p=localStorage.*?</script>\n','',html,flags=re.S)
html=html.replace('  <link rel="stylesheet" href="/app.css" />\n  <script src="/app.js" defer></script>',"<style>"+css+"\n.demo-banner{margin:12px 25px 0;padding:11px 16px;border:1px solid #b7a9df;border-radius:10px;background:#efe9ff;color:#514079;font:600 13px system-ui}\n:root[data-theme=dark] .demo-banner{background:#31254f;color:#e2d5ff}\n</style>\n<script>document.addEventListener('DOMContentLoaded',()=>{\n"+js+"\n});</script>")
html=html.replace('<html lang="en">','<html lang="en" data-theme="light">')
html=html.replace('<meta name="color-scheme" content="light dark" />','<meta name="color-scheme" content="light dark" />\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; img-src data:; font-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; object-src \'none\'; base-uri \'none\'; form-action \'none\';">')
html=html.replace('v1.0.1 DEV · READ ONLY','v1.0.1 · OFFLINE DEMO')
html=html.replace('<div id="notice" class="notice hidden" role="alert"></div>','<div class="demo-banner">OFFLINE DEMO · FICTIONAL SAMPLE DATA · NO COMMANDS OR NETWORK ACCESS</div><div id="notice" class="notice hidden" role="alert"></div>')
html=html.replace('KubeScope — Kubernetes Developer Workbench','KubeScope — Offline Demo')
assert '<script src=' not in html and '<link rel="stylesheet"' not in html
(target/'index.html').write_text(html)
(target/'README.md').write_text('# KubeScope v1.0.1 — Offline demo\n\nOpen index.html in any browser. This is sample data only; no cluster connection, server, kubectl, installation or internet access. Command output is always simulated. The theme switch lasts only for the open page.\n')
archive=Path('KubeScope-v1.0.1-OFFLINE-DEMO.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for f in target.iterdir():z.write(f,f'KubeScope-v1.0.1-demo/{f.name}')
print('Built',archive,archive.stat().st_size,'bytes')
