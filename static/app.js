'use strict';
/* KubeScope UI. No external JS, CSS, CDNs, or frontend build step. */
const state = {snapshot:null, view:'overview', namespace:'*', context:'', kind:'all', search:'', selected:null,
  zoom:1, console:{action:'describe',kind:'pod',namespace:'',name:''}, result:null, busy:false};
const names = {overview:'Overview',topology:'Cluster map',workloads:'Workloads',nodes:'Nodes & system',events:'Issues & events',console:'Command center'};
const resourceTypes = ['deployments','statefulsets','daemonsets','pods','services','ingresses','jobs','cronjobs','pvcs'];
const singular = {Deployment:'deployment',StatefulSet:'statefulset',DaemonSet:'daemonset',Pod:'pod',Service:'service',Ingress:'ingress',Job:'job',CronJob:'cronjob',PersistentVolumeClaim:'pvc',Node:'node'};
const colored = ['#5979de','#13a894','#e3a444','#9b76d5','#e9787a','#5aa6ce','#7682a1'];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eattr = esc;
const el = id => document.getElementById(id);
const a = (x, n=0) => (x || []).slice(0,n || undefined);
const display = s => s || '—';
const trunc = (s,n=23) => s.length>n?s.slice(0,n-1)+'…':s;
const pct = (x,total) => total ? Math.max(0,Math.min(100,Math.round(x/total*100))) : 0;
function dateShort(s){if(!s)return '—';const d=new Date(s);return isNaN(d)?s:d.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function relDate(s){if(!s)return '—';const v=Date.now()-new Date(s).getTime();if(!Number.isFinite(v))return dateShort(s);const sec=Math.max(0,Math.round(v/1000));if(sec<60)return 'just now';if(sec<3600)return Math.floor(sec/60)+'m ago';if(sec<86400)return Math.floor(sec/3600)+'h ago';return dateShort(s);}
function isBad(s){return ['Degraded','Error','NotReady','Failed','CrashLoopBackOff'].includes(s)}
function statusHtml(status){const cls=isBad(status)?'bad':(['Pending','Unknown'].includes(status)?'warn':(['Active','Healthy','Bound','Running'].includes(status)?'':'neutral'));return `<span class="status ${cls}">${esc(status)}</span>`}
function allResources(){if(!state.snapshot)return [];return resourceTypes.flatMap(k=>state.snapshot.resources[k]||[])}
function inScope(x){return state.namespace==='*'||x.namespace===state.namespace}
function findById(id){if(!state.snapshot)return null;if(id?.startsWith('Namespace::')){const name=id.slice(11);return {id,kind:'Namespace',name,namespace:name,status:'Active',created:'',labels:{}}}return [...state.snapshot.nodes,...allResources()].find(x=>x.id===id)||null}
function buttons(){return `<button class="btn" data-view="topology">◎ Explore topology</button><button class="btn primary" data-view="console">⌘ Run a command</button>`}
function title(eyebrow,heading,sub,actions=''){return `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 class="page-title">${esc(heading)}</h1><p class="page-subtitle">${esc(sub)}</p></div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`}
function stat(label,value,foot,icon,color,portion=0){return `<div class="stat-card"><div class="stat-top"><div class="stat-label">${esc(label)}</div><span class="stat-icon ${color}">${icon}</span></div><div class="stat-num">${esc(value)}</div><div class="stat-foot">${esc(foot)}</div><div class="progress"><i class="${color}" style="width:${Math.min(100,Math.max(0,portion))}%"></i></div></div>`}
function cell(label,value,cls=''){return `<div class="info-row"><span>${esc(label)}</span><strong class="${cls}">${esc(value || '—')}</strong></div>`}
function environment(context){if(/(^|[-_/])(prod|production)([-_/]|$)/i.test(context))return 'PROD? · name inferred';if(/(^|[-_/])(stage|staging)([-_/]|$)/i.test(context))return 'STAGE? · name inferred';if(/(^|[-_/])(dev|development|local)([-_/]|$)/i.test(context))return 'DEV? · name inferred';return 'Environment not verified'}
function namespaceStats(ns){const res=allResources().filter(x=>x.namespace===ns);return {count:res.length,pods:res.filter(x=>x.kind==='Pod').length,issues:res.filter(x=>isBad(x.status)).length}}
function clusterSculpture(){return `<div class="cluster-visual" aria-hidden="true">
 <div class="visual-halo visual-halo-one"></div><div class="visual-halo visual-halo-two"></div>
 <svg class="cluster-art" viewBox="0 0 430 300" role="presentation" xmlns="http://www.w3.org/2000/svg">
 <defs>
  <linearGradient id="tileTop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffefc"/><stop offset="1" stop-color="#e5dff4"/></linearGradient>
  <linearGradient id="tileLeft" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bdafe1"/><stop offset="1" stop-color="#8a76c3"/></linearGradient>
  <linearGradient id="tileRight" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#927dbf"/><stop offset="1" stop-color="#655095"/></linearGradient>
  <linearGradient id="accentTop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d1c7ff"/><stop offset="1" stop-color="#a996f3"/></linearGradient>
  <linearGradient id="aquaTop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e5fffb"/><stop offset="1" stop-color="#9cdcd8"/></linearGradient>
  <filter id="shadowArt"><feGaussianBlur stdDeviation="11"/></filter>
 </defs>
 <ellipse cx="224" cy="254" rx="152" ry="24" fill="#554285" opacity=".15" filter="url(#shadowArt)"/>
 <path d="M30 209 L220 110 L410 211 L221 303 Z" fill="#faf8ff" opacity=".52"/>
 <path d="M57 211 L218 126 L376 209 L217 292 Z" fill="#fff" stroke="#dcd4f3" stroke-width="2"/>
 <path d="M60 211 L217 291 L217 302 L60 222Z" fill="#c9bee5"/>
 <path d="M217 291 L376 209 L376 221 L217 302Z" fill="#afa1d6"/>
 <path d="M124 212 L222 157 L313 212 L222 262 Z" fill="none" stroke="#c5b5e6" stroke-dasharray="6 5" stroke-width="2"/>
 <path d="M222 160V84M124 212L92 171M313 212L340 174" fill="none" stroke="#9c88d3" stroke-width="3" stroke-dasharray="5 6"/>
 <g transform="translate(165,37)">
  <path d="M0 40 L56 8 L112 40 L56 74Z" fill="url(#tileTop)"/>
  <path d="M0 40 L56 74 L56 147 L0 113Z" fill="url(#tileLeft)"/>
  <path d="M56 74 L112 40 L112 113 L56 147Z" fill="url(#tileRight)"/>
  <path d="M11 46 L56 71 L100 46 L100 101 L56 127 L11 101Z" fill="none" stroke="#ffffff" stroke-opacity=".24" stroke-width="2"/>
  <path d="M28 59 L56 76 L84 59 L56 43Z" fill="#f1e9ff" opacity=".95"/>
  <path d="M28 59 V88 L56 105 V76Z" fill="#c9bbf3"/>
  <path d="M56 76 L84 59 V88 L56 105Z" fill="#9a81dd"/>
  <path d="M46 66L56 60L66 66L56 72Z" fill="#ffffff" opacity=".95"/>
 </g>
 <g transform="translate(69,133)">
  <path d="M0 27L42 4L84 27L42 51Z" fill="url(#aquaTop)"/>
  <path d="M0 27L42 51V98L0 74Z" fill="#8bcfc9"/>
  <path d="M42 51L84 27V74L42 98Z" fill="#4faea9"/>
  <path d="M30 27L42 20L54 27L42 34Z" fill="#f9fffb"/>
  <path d="M30 27V42L42 50V34Z" fill="#d4fcf7"/>
  <path d="M42 34L54 27V42L42 50Z" fill="#80cfc7"/>
 </g>
 <g transform="translate(291,143)">
  <path d="M0 24L37 3L74 24L37 46Z" fill="url(#accentTop)"/>
  <path d="M0 24L37 46V89L0 67Z" fill="#9b84df"/>
  <path d="M37 46L74 24V67L37 89Z" fill="#7862be"/>
  <path d="M27 24L37 18L47 24L37 30Z" fill="#fff"/>
  <path d="M27 24V36L37 42V30Z" fill="#d9d0ff"/>
  <path d="M37 30L47 24V36L37 42Z" fill="#a996e9"/>
 </g>
 <circle cx="220" cy="154" r="6" fill="#fff" stroke="#8064d5" stroke-width="3"/>
 <circle cx="124" cy="212" r="5" fill="#fff" stroke="#43aca5" stroke-width="3"/>
 <circle cx="313" cy="212" r="5" fill="#fff" stroke="#9477de" stroke-width="3"/>
 <g transform="translate(300,51)"><rect x="0" y="0" width="87" height="29" rx="14.5" fill="#fff" opacity=".97"/><circle cx="14" cy="14.5" r="5" fill="#37bca7"/><text x="26" y="19" font-size="12" font-weight="700" fill="#4d4566" font-family="system-ui">Connected</text></g>
 </svg>
 <div class="floating-token token-top">03 <span>workloads</span></div>
 <div class="floating-token token-bottom"><span class="token-light"></span> cluster in sync</div>
 </div>`}
function renderOverview(){const d=state.snapshot, h=d.health, id=d.identity;
 const issues=[...d.nodes.filter(x=>isBad(x.status)),...allResources().filter(x=>['Deployment','StatefulSet','DaemonSet','Pod'].includes(x.kind)&&isBad(x.status))].filter(inScope).slice(0,5);
 const ns=d.namespaces.filter(n=>n.name!== 'kube-public'&&n.name!=='kube-node-lease').slice(0,9);
 return `${title('YOUR CLUSTER, WITHOUT THE GUESSWORK','See what’s running. Spot what’s wrong.','Everything you need to understand this cluster, in one place.',buttons())}
 <section class="hero hero-v2"><div class="hero-copy">
 <div class="hero-eyebrow"><span class="eyebrow-dot"></span> CURRENT CONNECTION &nbsp; / &nbsp; ${d.mode==='demo'?'SAMPLE DATA':'LIVE DATA'}</div>
 <h1>Know where you are.<br><em>Before you make a move.</em></h1>
 <p class="hero-description">Connected to <b>${esc(id.context)}</b>. Check your environment, follow the workloads, and find what needs attention without digging through commands.</p>
 <div class="hero-identity"><span class="hero-id-label">ACTIVE CONTEXT</span><span class="hero-id-value">${esc(id.context)}</span><span class="hero-id-meta">${esc(id.provider)} &nbsp;·&nbsp; Kubernetes ${esc(id.kubernetesVersion)}</span></div>
 <div class="identity-chips"><span class="identity-chip">${esc(environment(id.context))}</span><span class="identity-chip">${d.mode==='demo'?'Sample cluster':'Read-only access'}</span></div>
 </div><div class="hero-side">${clusterSculpture()}</div></section>
 <div class="quick-journey"><div class="journey-intro"><span class="journey-kicker">START HERE</span><strong>Three ways in.</strong><span>Pick up wherever you left off.</span></div>
 <button class="journey-step" data-view="topology"><span class="journey-num">01</span><span class="journey-step-text"><strong>Explore the map</strong><small>Follow resources and connections</small></span><span class="journey-arrow">↗</span></button>
 <button class="journey-step" data-view="workloads"><span class="journey-num">02</span><span class="journey-step-text"><strong>Find a workload</strong><small>Jump to a pod, service or deployment</small></span><span class="journey-arrow">↗</span></button>
 <button class="journey-step" data-view="console"><span class="journey-num">03</span><span class="journey-step-text"><strong>Check with kubectl</strong><small>Safe, guided read-only commands</small></span><span class="journey-arrow">↗</span></button></div>
 <div class="stats-grid">${stat('Ready nodes',`${h.readyNodes} / ${h.nodes}`,'Worker and control-plane nodes','⬡','teal',pct(h.readyNodes,h.nodes))}
 ${stat('Namespaces',h.namespaces,'Available in your current context','▦','',100)}
 ${stat('Healthy workloads',`${h.readyWorkloads} / ${h.workloads}`,'Deployments · StatefulSets · DaemonSets','▣','',pct(h.readyWorkloads,h.workloads))}
 ${stat('Ready pods',`${h.readyPods} / ${h.pods}`,'Across all namespaces','◌',h.readyPods<h.pods?'red':'teal',pct(h.readyPods,h.pods))}</div>
 <div class="two-cols"><section class="card card-p"><div class="card-head"><div><h2 class="card-title">Worth a closer look</h2><p class="card-desc">Workloads and nodes that may need checking</p></div><button class="faint-link" data-view="events">View events →</button></div>
 <div class="issues-list">${issues.length?issues.map(i=>`<div class="issue-row"><span class="severity-dot ${isBad(i.status)?'red':''}"></span><div style="min-width:0"><div class="issue-primary">${esc(i.name)}</div><div class="issue-secondary">${esc(i.kind)} ${i.namespace?'· '+esc(i.namespace):''} · ${esc(i.detail||i.status)}</div></div><button class="faint-link" data-action="inspect" data-id="${eattr(i.id)}">Inspect →</button></div>`).join(''):`<div class="empty-state"><span class="empty-icon">✓</span>No degraded workloads or nodes detected in the loaded data.</div>`}</div></section>
 <section class="card card-p"><div class="card-head"><div><h2 class="card-title">Connection details</h2><p class="card-desc">Your current Kubernetes context</p></div></div><div class="info-rows">
 ${cell('Cluster',id.cluster)}${cell('Cloud / runtime',id.provider)}${cell('Kubernetes',id.kubernetesVersion)}${cell('Principal',id.user)}${cell('Default namespace',id.defaultNamespace)}${cell('API server',id.server,'mono')}</div></section></div>
 <section class="section-gap"><div class="card-head"><div><h2 class="card-title">Browse namespaces</h2><p class="card-desc">Choose a namespace to see its workloads and services</p></div><button data-view="workloads" class="faint-link">View all resources →</button></div><div class="namespace-grid">
 ${ns.map(n=>{const s=namespaceStats(n.name);return `<button class="namespace-tile" data-action="scope-ns" data-ns="${eattr(n.name)}"><span class="namespace-icon">#</span><span style="min-width:0;flex:1"><b>${esc(n.name)}</b><small>${s.pods} pods · ${s.count} resources${s.issues?' · '+s.issues+' issues':''}</small></span><span class="arrow">›</span></button>`}).join('')}</div></section>`
}
function filteredResources(){return allResources().filter(x=>inScope(x)&&(state.kind==='all'||x.kind.toLowerCase()===state.kind)&&(!state.search||[x.name,x.namespace,x.kind,x.node].join(' ').toLowerCase().includes(state.search.toLowerCase())))}
function renderWorkloads(){const rows=filteredResources(), count=Math.min(rows.length,120), opts=[['all','All resources'],['deployment','Deployments'],['pod','Pods'],['service','Services'],['statefulset','StatefulSets'],['daemonset','DaemonSets'],['ingress','Ingress'],['job','Jobs'],['pvc','PVCs']];
 return `${title('RESOURCE EXPLORER','Find any workload','Search, filter and inspect live Kubernetes resources without memorizing commands.',`<button class="btn" data-view="topology">◎ View connections</button>`)}
 <div class="filterbar"><div class="filter-tabs">${opts.map(([kind,label])=>`<button data-action="filter-kind" data-kind="${kind}" class="filter-tab ${state.kind===kind?'active':''}">${esc(label)}</button>`).join('')}</div><label class="search-box"><span>⌕</span><input id="search-input" placeholder="Search resources..." autocomplete="off" value="${eattr(state.search)}" aria-label="Search workloads"></label></div>
 <div class="card table-wrap"><table class="resource-table"><thead><tr><th>RESOURCE</th><th>TYPE</th><th>NAMESPACE</th><th>HEALTH</th><th>READY / DETAIL</th><th>INSPECT</th></tr></thead><tbody>${rows.slice(0,120).map(x=>`<tr data-action="inspect" data-id="${eattr(x.id)}"><td><span class="resource-name">${esc(x.name)}</span><div class="muted-caption">${esc(x.node||((x.images||[])[0]||''))}</div></td><td><span class="kind-pill">${esc(x.kind)}</span></td><td>${esc(x.namespace)}</td><td>${statusHtml(x.status)}</td><td>${esc(x.detail)}</td><td><button class="tiny-btn" data-action="inspect" data-id="${eattr(x.id)}">Details ↗</button></td></tr>`).join('')||`<tr><td colspan="6"><div class="empty-state">No resources match your filters. Try a different namespace or resource type.</div></td></tr>`}</tbody></table></div>
 <div class="command-history">Showing ${count} of ${rows.length} matching resources. Select a row to inspect and run safe read-only commands.</div>`}
function renderNodes(){const d=state.snapshot;return `${title('INFRASTRUCTURE MAP','Nodes & system','Inspect where containers run, node health and cluster runtime details.',`<button class="btn" data-action="run-simple" data-op="top_nodes">⌘ Node utilization</button>`)}
 <div class="stats-grid">${stat('Node count',d.health.nodes,'Total cluster nodes','⬡','',100)}${stat('Ready',d.health.readyNodes,'Schedulable availability','✓','teal',pct(d.health.readyNodes,d.health.nodes))}
 ${stat('Not ready',d.health.nodes-d.health.readyNodes,'Require investigation','!','red',pct(d.health.nodes-d.health.readyNodes,d.health.nodes))}${stat('Kubernetes version',d.identity.kubernetesVersion,'API server version','⎈','',100)}</div>
 <div class="node-grid">${d.nodes.map(n=>`<div class="card node-card" data-action="inspect" data-id="${eattr(n.id)}"><div class="node-head"><span class="node-emblem">⬡</span>${statusHtml(n.status)}</div><div class="node-name">${esc(n.name)}</div><div class="node-role">${esc(n.role)}${n.unschedulable?' · CORDONED':''}</div><div class="node-details">
 <div><small>Kubelet</small><b>${esc(n.version)}</b></div><div><small>Instance type</small><b>${esc(display(n.instanceType))}</b></div>
 <div><small>CPU capacity</small><b>${esc(n.capacity.cpu||'—')}</b></div><div><small>Memory capacity</small><b>${esc(n.capacity.memory||'—')}</b></div>
 <div><small>Operating system</small><b>${esc(n.os)}</b></div><div><small>Runtime</small><b>${esc(n.runtime)}</b></div></div></div>`).join('')||`<div class="card empty-state">No nodes were returned. Your Kubernetes role might not allow listing nodes.</div>`}</div>`}
function renderEvents(){const events=state.snapshot.events.filter(inScope).filter(x=>!state.search||[x.reason,x.message,x.namespace,x.object].join(' ').toLowerCase().includes(state.search.toLowerCase()));return `${title('INCIDENT SIGNALS','Issues & events','Warning events from the cluster, newest first. Click the linked resource for more context.',`<button class="btn" data-action="run-simple" data-op="events">⌘ kubectl events</button>`)}
 <div class="filterbar"><span class="mode-badge demo" style="display:inline-block">${events.length} WARNING EVENTS</span><label class="search-box"><span>⌕</span><input id="search-input" placeholder="Filter warning events..." value="${eattr(state.search)}" aria-label="Search events"></label></div>
 ${events.length?events.map(x=>{const target=[...state.snapshot.nodes,...allResources()].find(r=>r.kind===x.kind&&r.name===x.object&&(!x.namespace||r.namespace===x.namespace));return `<div class="card event-card"><div class="event-icon">!</div><div style="min-width:0;flex:1"><div class="event-title">${esc(x.reason)} <span style="font-weight:500;color:#a1aec1">· ${esc(x.object)}</span></div><div class="event-message">${esc(x.message)}</div><div class="event-meta"><span>namespace: ${esc(x.namespace||'cluster')}</span><span>${esc(x.kind)}</span><span>${esc(relDate(x.when))}</span><span>× ${esc(x.count)}</span></div></div>${target?`<button class="btn small" data-action="inspect" data-id="${eattr(target.id)}">Inspect →</button>`:''}</div>`}).join(''):`<div class="card empty-state"><span class="empty-icon">✓</span>No warning events available in this scope. This may also reflect limited RBAC permissions.</div>`}`}
function matches(labels,selector){return selector&&Object.keys(selector).length&&Object.entries(selector).every(([k,v])=>labels?.[k]===v)}
function topologyData(){const d=state.snapshot,R=d.resources, scopes=state.namespace==='*'?
  [...d.namespaces].sort((a,b)=>namespaceStats(b.name).count-namespaceStats(a.name).count).slice(0,6).map(x=>x.name):[state.namespace];
 const nodes=[],links=[], seen=new Set();const cx=650,cy=500,pos=(r,ang)=>({x:cx+r*Math.cos(ang),y:cy+r*Math.sin(ang)});
 function push(resource,x,y,type,color,icon){if(seen.has(resource.id))return;seen.add(resource.id);nodes.push({...resource,x,y,type,color,icon});}
 const activeNodes=new Set();scopes.forEach((ns,i)=>{
  const base=-Math.PI/2+i*2*Math.PI/scopes.length;const color=colored[i%colored.length];const nid=`Namespace::${ns}`;
  const np=pos(142,base);push({id:nid,kind:'Namespace',name:ns,namespace:ns,status:'Active'},np.x,np.y,'ns',color,'#');links.push({from:'CLUSTER',to:nid,color});
  let ctrls=['deployments','statefulsets','daemonsets'].flatMap(k=>R[k]).filter(x=>x.namespace===ns).slice(0,state.namespace==='*'?3:10);
  ctrls.forEach((ctrl,j)=>{const angle=base+(j-(ctrls.length-1)/2)*(state.namespace==='*'?Math.min(.20,1/scopes.length):.29),pp=pos(270,angle);
   push(ctrl,pp.x,pp.y,'controller',color,'▣');links.push({from:nid,to:ctrl.id,color});
   const pods=R.pods.filter(p=>p.namespace===ns&&(matches(p.labels,ctrl.selector)||p.name.startsWith(ctrl.name+'-'))).slice(0,state.namespace==='*'?0:3);
   pods.forEach((pod,k)=>{const pa=angle+(k-(pods.length-1)/2)*.075,xy=pos(385,pa);push(pod,xy.x,xy.y,'pod',color,'◉');links.push({from:ctrl.id,to:pod.id,color});if(pod.node)activeNodes.add(pod.node)});
  });
  R.services.filter(s=>s.namespace===ns).slice(0,state.namespace==='*'?1:3).forEach((svc,j)=>{
   const xy=pos(350,base+(j-.45)*.42);push(svc,xy.x,xy.y,'service','#9675d2','◇');
   const owner=ctrls.find(c=>matches(c.selector,svc.selector));links.push({from:owner?owner.id:nid,to:svc.id,color:'#a98bd6'});
  });
 });
 d.nodes.filter(n=>activeNodes.has(n.name)).slice(0,6).forEach((node,i,arr)=>{const xy=pos(472,-Math.PI/2+(i+0.35)*Math.PI*2/Math.max(arr.length,1));push(node,xy.x,xy.y,'node','#8293b0','⬡');});
 nodes.filter(x=>x.type==='pod'&&x.node).forEach(x=>{if(seen.has(`Node::${x.node}`))links.push({from:x.id,to:`Node::${x.node}`,color:'#c1c9d8',dash:true});});
 return {nodes,links,scopes,omitted:d.namespaces.length-scopes.length};
}
function graphSvg(data){const cx=650,cy=500,positions=new Map(data.nodes.map(n=>[n.id,n]));positions.set('CLUSTER',{x:cx,y:cy});
 const edges=data.links.map(e=>{const f=positions.get(e.from),t=positions.get(e.to);if(!f||!t)return '';return `<path class="edge" d="M${f.x.toFixed(1)},${f.y.toFixed(1)} L${t.x.toFixed(1)},${t.y.toFixed(1)}" stroke="${e.color}" ${e.dash?'stroke-dasharray="4 6"':''}/>`}).join('');
 const nsNodes=data.nodes.map(n=>{const r=n.type==='ns'?22:n.type==='controller'?19:n.type==='node'?18:16;const sc=isBad(n.status)?'#e8757a':n.color;return `<g class="graph-node graph-node-${n.type}" data-action="inspect" data-id="${eattr(n.id)}"><title>${esc(n.kind+' · '+n.name+' · '+n.status)}</title><circle class="node-circle" cx="${n.x}" cy="${n.y}" r="${r}" stroke="${sc}"/><text class="symbol" x="${n.x}" y="${n.y}" style="fill:${sc}">${esc(n.icon)}</text><text class="node-text" x="${n.x}" y="${n.y+r+14}">${esc(trunc(n.name,n.type==='ns'?18:19))}</text>${isBad(n.status)?`<circle cx="${n.x+r-3}" cy="${n.y-r+3}" r="5" fill="#e8757a" stroke="white" stroke-width="2"/>`:''}</g>`}).join('');
 return `<svg class="topology-svg" id="topo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 1000" role="img" aria-label="Interactive cluster resource topology, click any node to inspect">
 <defs><radialGradient id="graphglow"><stop offset="0%" stop-color="#eff2ff"/><stop offset="100%" stop-color="#f9fbff"/></radialGradient></defs><g transform="translate(${cx} ${cy}) scale(${state.zoom}) translate(${-cx} ${-cy})"><circle cx="${cx}" cy="${cy}" r="490" fill="url(#graphglow)"/><circle class="orbit" cx="${cx}" cy="${cy}" r="142"/><circle class="orbit" cx="${cx}" cy="${cy}" r="270"/><circle class="orbit" cx="${cx}" cy="${cy}" r="385"/><circle class="orbit" cx="${cx}" cy="${cy}" r="472"/>
 ${edges}<circle class="topocenter" cx="${cx}" cy="${cy}" r="39"/><text x="${cx}" y="${cy}" class="topocenter-text">K</text><text class="node-text" x="${cx}" y="${cy+57}">CLUSTER</text>${nsNodes}</g></svg>`;
}
function renderTopology(){const t=topologyData(),h=state.snapshot.health;return `${title('SYSTEM RELATIONSHIPS','Interactive topology','Start with namespaces and workloads. Select one namespace above to reveal pods, services and nodes.',`<button class="btn" data-view="workloads">▤ Resource list</button>`)}
 <div class="topology-layout"><div class="card topology-card"><div class="topology-toolbar"><span class="topology-tag">◎ ${t.scopes.length} namespaces · ${t.nodes.length} visible resources</span><div class="zoom-ctrl"><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="zoom-reset" aria-label="Reset zoom">⌖</button><button data-action="zoom-in" aria-label="Zoom in">+</button></div></div>${graphSvg(t)}<div class="topology-legend">
 <span><i class="legend-dot" style="background:#5266e9"></i>Namespace</span><span><i class="legend-dot" style="background:#18ab9d"></i>Workload</span><span><i class="legend-dot" style="background:#e1a544"></i>Pod</span><span><i class="legend-dot" style="background:#9773d8"></i>Service</span><span><i class="legend-dot" style="background:#8796ad"></i>Node</span><span>Red corner = issue</span></div></div>
 <div class="card topo-insight"><h2 class="card-title">Map insights</h2><div class="insight-group"><div class="insight-label">Visible objects</div><div class="insight-num">${t.nodes.length}</div><div class="insight-text">The map starts small so you can find what matters.</div></div>
 <div class="insight-group"><div class="insight-label">Pods</div><div class="insight-num">${h.pods}</div><div class="insight-text">${h.readyPods} ready across the full cluster</div></div>
 <div class="insight-group"><div class="insight-label">Workload health</div><div class="insight-num">${h.readyWorkloads}/${h.workloads}</div><div class="insight-text">Healthy controllers detected</div></div>
 <div class="topo-tips">Select a namespace in the top bar to see pods and their nodes. Connections come from workload selectors, service selectors and pod node assignments.${t.omitted>0&&state.namespace==='*'?` ${t.omitted} namespaces hidden for clarity.`:''}</div></div></div>`;}
function resourcesForCommand(){const k=Object.entries(singular).find(([,v])=>v===state.console.kind)?.[0]||'Pod';return state.console.kind==='node'?state.snapshot.nodes:allResources().filter(x=>x.kind===k&&(!state.console.namespace||state.console.namespace==='*'||x.namespace===state.console.namespace))}
function commandPreview(){const c=state.console, ctx=state.context||state.snapshot?.identity.context||'current-context',ns=c.namespace||state.namespace||'*';let args='';
 if(c.action==='top_nodes')args='top nodes';else if(c.action==='top_pods')args=`top pods ${ns==='*'?'-A':'-n '+ns}`;else if(c.action==='events')args=`get events ${ns==='*'?'-A':'-n '+ns} --sort-by=.lastTimestamp`;else if(c.action==='cluster_info')args='cluster-info';else if(c.name){const scope=c.kind==='node'?'':' -n '+ns;const target=c.kind+'/'+c.name;if(c.action==='describe')args='describe '+c.kind+' '+c.name+scope;else if(c.action==='yaml')args='get '+target+scope+' -o yaml';else if(c.action==='get')args='get '+target+scope+' -o wide';else if(c.action==='logs')args='logs pod/'+c.name+scope+' --tail=100 --all-containers=true --prefix=true';else if(c.action==='rollout')args='rollout status '+target+scope+' --timeout=6s';}
 return 'kubectl --context '+ctx+(args?' '+args:' [select resource]')}
function commandNeedsResource(action){return !['top_nodes','top_pods','events','cluster_info'].includes(action)}
function renderConsole(){const c=state.console,requires=commandNeedsResource(c.action),kindOptions=[['pod','Pod'],['deployment','Deployment'],['statefulset','StatefulSet'],['daemonset','DaemonSet'],['service','Service'],['ingress','Ingress'],['job','Job'],['cronjob','CronJob'],['pvc','PVC'],['node','Node']].filter(([kind])=>c.action==='logs'?kind==='pod':c.action==='rollout'?['deployment','statefulset','daemonset'].includes(kind):true), items=resourcesForCommand(),ops=[['describe','Describe resource'],['get','Get resource (wide)'],['yaml','View YAML'],['logs','Read pod logs'],['rollout','Check rollout status'],['top_pods','Show pod CPU / memory'],['top_nodes','Show node CPU / memory'],['events','List events'],['cluster_info','Cluster info']];
 return `${title('GUIDED KUBECTL','Command center','Run useful, non-destructive Kubernetes commands through a guided workflow.',`<span class="mode-badge" style="display:inline-block">READ ONLY · NO SHELL</span>`)}
 <div class="console-grid"><section class="card card-p"><div class="card-head"><div><h2 class="card-title">Build an inspection command</h2><p class="card-desc">Each step updates the command preview.</p></div></div>
 <div class="form-field"><label for="cmd-action">1 · What do you want to do?</label><select id="cmd-action">${ops.map(([x,label])=>`<option value="${x}" ${c.action===x?'selected':''}>${esc(label)}</option>`).join('')}</select></div>
 ${requires?`<div class="form-field"><label for="cmd-kind">2 · Resource type</label><select id="cmd-kind">${kindOptions.map(([x,label])=>`<option value="${x}" ${c.kind===x?'selected':''}>${label}</option>`).join('')}</select></div>`:''}
 ${requires&&c.kind!=='node'||!requires&&c.action!=='top_nodes'&&c.action!=='cluster_info'?`<div class="form-field"><label for="cmd-namespace">${requires?'3':'2'} · Namespace</label><select id="cmd-namespace"><option value="*" ${c.namespace==='*'?'selected':''}>All namespaces</option>${state.snapshot.namespaces.map(x=>`<option value="${eattr(x.name)}" ${c.namespace===x.name?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`:''}
 ${requires?`<div class="form-field"><label for="cmd-name">${c.kind==='node'?'3':'4'} · Resource</label><select id="cmd-name"><option value="">Select a ${esc(c.kind)}...</option>${items.map(x=>`<option value="${eattr(x.name)}" ${x.name===c.name?'selected':''}>${esc(x.name)}${c.namespace==='*'&&c.kind!=='node'?' ('+esc(x.namespace)+')':''}</option>`).join('')}</select></div>`:''}
 <div class="console-safety">✓ All actions are read-only. Mutating operations such as delete, apply, exec, scale and restart are intentionally blocked.</div>
 <button class="btn primary" style="width:100%" data-action="execute" ${state.busy||requires&&!c.name?'disabled':''}>${state.busy?'Running command…':'▶ Run command'}</button></section>
 <section class="card card-p"><div class="card-head"><div><h2 class="card-title">Command preview</h2><p class="card-desc">Exactly what is sent to kubectl</p></div><button class="btn small" data-action="copy-command">⧉ Copy</button></div>
 <div class="command-preview"><span class="dollar">$</span>${esc(commandPreview())}</div>
 <div class="terminal"><div class="terminal-top"><div class="terminal-dots"><i></i><i></i><i></i></div>kubectl / output <span>${state.result?(state.result.ok?'✓ SUCCESS':'✕ ERROR'):'READY'}</span></div>
 <pre>${state.busy?'Executing command with your selected kubeconfig context…':state.result?esc('$ '+state.result.command+'\n\n'+state.result.output):'<span class="empty-console">Your command output will appear here.\n\nChoose an action and press Run command.\n\nNo commands are executed automatically.</span>'}</pre></div>
 <div class="command-history">${state.result?(state.result.demo?'Simulated output only — this is the built-in demo.':`Exit code: ${state.result.code} · From selected Kubernetes context`):'Tip: Inspect a resource from the Workloads or Topology views to prefill the command.'}</div></section></div>`;}
function renderInspector(){const mount=el('inspector-mount');if(!state.selected){mount.innerHTML='';return};const x=findById(state.selected);if(!x){mount.innerHTML='';state.selected=null;return};
 const cmds=x.kind==='Namespace'?[]:[['describe','Describe'],['yaml','View YAML'],...(x.kind==='Pod'?[['logs','Read logs']]:[]),...(['Deployment','StatefulSet','DaemonSet'].includes(x.kind)?[['rollout','Rollout status']]:[])];
 mount.innerHTML=`<div class="inspector-overlay" data-action="close-inspector"><div class="inspector" role="dialog" aria-label="${eattr(x.kind+' '+x.name)}"><div class="inspector-top"><div><small>${esc(x.kind.toUpperCase())} ${x.namespace?'· '+esc(x.namespace):''}</small><h2>${esc(x.name)}</h2><p>${esc(x.id)}</p></div><button class="inspector-close" data-action="close-inspector" aria-label="Close inspector">×</button></div><div class="inspector-body">
 <div class="inspector-actions">${cmds.map(([cmd,label])=>`<button class="btn small ${cmd==='describe'?'primary':''}" data-action="inspect-command" data-cmd="${cmd}" data-id="${eattr(x.id)}">${esc(label)}</button>`).join('')}${x.kind==='Namespace'?`<button class="btn primary" data-action="scope-ns" data-ns="${eattr(x.name)}">View namespace</button>`:''}</div>
 <div class="inspector-section"><h3>Resource identity</h3><div class="kv-grid"><div><small>Status</small>${statusHtml(x.status)}</div><div><small>Kind</small><b>${esc(x.kind)}</b></div><div><small>Namespace</small><b>${esc(x.namespace||'Cluster-scoped')}</b></div><div><small>Created</small><b>${esc(dateShort(x.created))}</b></div>
 ${x.ready!=null?`<div><small>Ready</small><b>${esc(x.ready)} / ${esc(x.desired)}</b></div>`:''}${x.node?`<div><small>Scheduled node</small><b>${esc(x.node)}</b></div>`:''}${x.restarts!=null?`<div><small>Restarts</small><b>${esc(x.restarts)}</b></div>`:''}${x.role?`<div><small>Node role</small><b>${esc(x.role)}</b></div>`:''}</div></div>
 ${x.images?.length?`<div class="inspector-section"><h3>Container images</h3><div class="tag-list">${x.images.map(i=>`<span class="tag mono">${esc(i)}</span>`).join('')}</div></div>`:''}
 ${x.selector&&Object.keys(x.selector).length?`<div class="inspector-section"><h3>Label selector</h3><div class="tag-list">${Object.entries(x.selector).map(([k,v])=>`<span class="tag mono">${esc(k)}=${esc(v)}</span>`).join('')}</div></div>`:''}
 ${x.labels&&Object.keys(x.labels).length?`<div class="inspector-section"><h3>Labels</h3><div class="tag-list">${Object.entries(x.labels).slice(0,25).map(([k,v])=>`<span class="tag mono">${esc(k)}=${esc(v)}</span>`).join('')}</div></div>`:''}
 ${x.kind==='Node'?`<div class="inspector-section"><h3>Node system</h3><div class="info-rows">${cell('Kubelet',x.version)}${cell('OS',x.os)}${cell('Runtime',x.runtime)}${cell('Provider ID',x.providerID)}${cell('CPU capacity',x.capacity.cpu)}${cell('Memory capacity',x.capacity.memory)}${cell('Unschedulable',x.unschedulable?'Yes':'No')}</div></div>`:''}
 ${x.ports?.length?`<div class="inspector-section"><h3>Service ports</h3><div class="tag-list">${x.ports.map(i=>`<span class="tag">${esc(i)}</span>`).join('')}</div></div>`:''}</div></div></div>`;
}
function render(){if(!state.snapshot)return;const d=state.snapshot;
 document.querySelectorAll('[data-view]').forEach(n=>{if(n.classList.contains('nav-button')||n.classList.contains('mobile-tab'))n.classList.toggle('active',n.dataset.view===state.view)});
 el('breadcrumb').textContent=names[state.view]||'Overview';el('sidebar-mode').textContent=d.mode==='demo'?'Demo connection':'Connected · read only';
 el('sidebar-context').textContent=d.identity.context;el('sidebar-provider').textContent=d.identity.provider;
 el('mode-badge').textContent=d.mode==='demo'?'DEMO MODE':'LIVE CLUSTER';el('mode-badge').classList.toggle('demo',d.mode==='demo');
 const cx=el('context-select');cx.innerHTML=d.contexts.map(x=>`<option value="${eattr(x)}" ${x===d.identity.context?'selected':''}>${esc(x)}</option>`).join('');
 const ns=el('namespace-select');ns.innerHTML=`<option value="*">All namespaces</option>`+d.namespaces.map(x=>`<option value="${eattr(x.name)}">${esc(x.name)}</option>`).join('');ns.value=state.namespace;
 const view={overview:renderOverview,topology:renderTopology,workloads:renderWorkloads,nodes:renderNodes,events:renderEvents,console:renderConsole}[state.view]||renderOverview;
 el('content').innerHTML=view();
 const warning=d.errors||[];if(warning.length){el('notice').classList.remove('hidden');el('notice').textContent=`Limited cluster access: ${warning.map(x=>x.source).join(', ')} could not be read. Results may be incomplete; check RBAC and kubectl connectivity.`}else el('notice').classList.add('hidden');
 renderInspector();
}
let toastTimer;
function toast(msg){el('toast').textContent=msg;el('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el('toast').classList.add('hidden'),3000)}
async function load(context=null){el('refresh-btn').disabled=true;if(!state.snapshot)el('content').innerHTML='<div class="loading-state"><div class="spinner"></div><h2>Mapping your cluster</h2><p>Discovering namespaces, nodes and workloads…</p></div>';
 try{const url='/api/snapshot'+(context?'?context='+encodeURIComponent(context):'');const resp=await fetch(url,{cache:'no-store'});const data=await resp.json();if(!resp.ok)throw Error(data.error||'Unable to connect');
 state.snapshot=data;state.context=data.identity.context;if(!data.namespaces.find(n=>n.name===state.namespace))state.namespace='*';
 if(!state.console.namespace||!data.namespaces.find(n=>n.name===state.console.namespace))state.console.namespace=state.namespace==='*'?'*':state.namespace;
 render();
 }catch(e){if(state.snapshot){toast('Refresh failed: '+e.message)}else{el('content').innerHTML=`<section class="card card-p" style="max-width:700px;margin:70px auto"><div class="eyebrow">CONNECTION NEEDED</div><h1>Couldn't read Kubernetes</h1><p class="page-subtitle">${esc(e.message)}</p><p class="page-subtitle" style="margin-top:20px">Verify <code>kubectl config current-context</code> and <code>kubectl get nodes</code>. For a no-cluster preview, stop the server and run <code>python server.py --demo</code>.</p><button data-action="refresh" class="btn primary" style="margin-top:22px">Retry connection</button></section>`;}}
 finally{el('refresh-btn').disabled=false}}
function updateConsoleChoices(){const c=state.console;if(c.action==='logs')c.kind='pod';if(c.action==='rollout'&&!['deployment','statefulset','daemonset'].includes(c.kind))c.kind='deployment';
 const matches=resourcesForCommand();if(!matches.some(x=>x.name===c.name&&(!c.namespace||c.namespace==='*'||x.namespace===c.namespace)))c.name='';}
function inspectCommand(x,op){const c=state.console;c.action=op;c.kind=singular[x.kind]||'pod';c.namespace=x.kind==='Node'?'*':x.namespace;c.name=x.name;state.selected=null;state.view='console';state.result=null;render();}
async function execute(){const c=state.console;const requires=commandNeedsResource(c.action);if(requires&&!c.name){toast('Select a resource first');return}
 if(requires&&c.kind!=='node'&&c.namespace==='*'){
  const matches=resourcesForCommand().filter(x=>x.name===c.name);if(matches.length===1)c.namespace=matches[0].namespace;
  else {toast('Select a specific namespace to inspect a resource');return}
 }
 state.busy=true;state.result=null;render();
 try{const res=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,context:state.context})});const obj=await res.json();if(!res.ok)throw Error(obj.error||'Command failed');state.result=obj}
 catch(e){state.result={ok:false,code:-1,command:commandPreview(),output:e.message}}finally{state.busy=false;render()}}
function runSimple(op){state.console.action=op;state.console.namespace=state.namespace;state.view='console';state.result=null;execute()}
async function copyCommand(){try{await navigator.clipboard.writeText(commandPreview());toast('Command copied')}catch{toast('Copy unavailable in this browser')}}
document.addEventListener('click',e=>{const node=e.target.closest('[data-view],[data-action]');if(!node)return;
 if(node.dataset.view){state.view=node.dataset.view;state.selected=null;state.search='';render();window.scrollTo({top:0,behavior:'instant'});return}
 const op=node.dataset.action;
 if(op==='inspect'){state.selected=node.dataset.id;renderInspector();return}
 if(op==='close-inspector'){if(node.classList.contains('inspector')||node.closest('.inspector')&&!node.classList.contains('inspector-close'))return;state.selected=null;renderInspector();return}
 if(op==='scope-ns'){state.namespace=node.dataset.ns;state.console.namespace=state.namespace;state.view='workloads';state.selected=null;state.kind='all';state.search='';render();return}
 if(op==='filter-kind'){state.kind=node.dataset.kind;render();return}
 if(op==='refresh'){load(state.context);return}
 if(op==='zoom-in'||op==='zoom-out'||op==='zoom-reset'){state.zoom=op==='zoom-reset'?1:Math.max(.7,Math.min(1.6,state.zoom+(op==='zoom-in'?.16:-.16)));render();return}
 if(op==='inspect-command'){const x=findById(node.dataset.id);if(x)inspectCommand(x,node.dataset.cmd);return}
 if(op==='run-simple'){runSimple(node.dataset.op);return}
 if(op==='execute'){execute();return}
 if(op==='copy-command'){copyCommand();return}
});
document.addEventListener('change',e=>{
 if(e.target.id==='context-select'){state.context=e.target.value;state.selected=null;state.namespace='*';state.result=null;load(state.context)}
 if(e.target.id==='namespace-select'){state.namespace=e.target.value;state.selected=null;state.console.namespace=state.namespace;render()}
 if(e.target.id==='cmd-action'){state.console.action=e.target.value;updateConsoleChoices();render()}
 if(e.target.id==='cmd-kind'){state.console.kind=e.target.value;updateConsoleChoices();render()}
 if(e.target.id==='cmd-namespace'){state.console.namespace=e.target.value;updateConsoleChoices();render()}
 if(e.target.id==='cmd-name'){state.console.name=e.target.value;render()}
});
document.addEventListener('input',e=>{if(e.target.id==='search-input'){const caret=e.target.selectionStart;state.search=e.target.value;render();const newInput=el('search-input');if(newInput){newInput.focus();newInput.setSelectionRange(caret,caret)}}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.selected){state.selected=null;renderInspector()}else if(e.key.toLowerCase()==='r'&&!/input|select|textarea/i.test(e.target.tagName)&&!e.metaKey&&!e.ctrlKey){load(state.context)}});
load();
