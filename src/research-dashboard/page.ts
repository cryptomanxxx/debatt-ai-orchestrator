// Presentation helpers also used by the browser bundle; no server credentials.
export function githubRunUrl(row, technical) {
  const id = technical?.run_id ?? row.github_run_id;
  return /^[1-9]\d{0,19}$/.test(String(id ?? ''))
    ? 'https://github.com/cryptomanxxx/debatt-ai-orchestrator/actions/runs/' + id
    : null;
}
export function runMessage(row, technical) {
  const report = row.report;
  const evidence =
    {
      completed: 'Underlag klart',
      partial: 'Delvis underlag',
      insufficient_evidence: 'Otillräckligt underlag',
      insufficient_relevant_hits: 'Inga relevanta träffar',
      insufficient_abstract_identifiers: 'Abstract saknar identifierare',
      error: 'Steg misslyckades'
    }[report?.status] ?? 'Utfall saknas';
  const newer = technical?.run_attempt > row.github_run_attempt;
  if (technical?.status === 'completed') {
    const outcome =
      {
        success: 'slutförd',
        failure: 'misslyckad',
        cancelled: 'avbruten',
        timed_out: 'avslutad efter att tidsgränsen nåddes'
      }[technical.conclusion] ?? 'avslutad';
    if (newer || !report?.finished_at)
      return (
        'GitHub-körningen är ' +
        outcome +
        '. Ett slutligt forskningsresultat för den här körningsversionen saknas; visade värden är senast sparade underlag.'
      );
    return 'Körningen är ' + outcome + '. Evidensstatus: ' + evidence + '.';
  }
  if (newer)
    return 'En ny körningsversion väntar eller pågår. Visade forskningsresultat hör till en tidigare version.';
  if (technical?.status === 'in_progress' || technical?.status === 'waiting')
    return 'Körningen pågår. Följ forskningsstegen nedan.';
  if (technical && ['queued', 'pending', 'requested'].includes(technical.status))
    return 'Körningen väntar på att GitHub startar. De första forskningsstegen visas här.';
  if (report?.finished_at)
    return (
      'Forskningsresultatet är sparat. Evidensstatus: ' +
      evidence +
      '. GitHubs aktuella körstatus kunde inte kontrolleras.'
    );
  if (report?.status === 'running')
    return 'Forskningskedjan pågår enligt senaste sparade checkpoint. GitHubs aktuella körstatus kunde inte kontrolleras.';
  if (row.dispatch_status === 'failed')
    return 'GitHub accepterade inte starten. Kontrollera inställningarna innan ett nytt försök.';
  if (['pending', 'uncertain'].includes(row.dispatch_status))
    return 'Startens utfall är ännu okänt. Följ körningen här; inget nytt försök skickas automatiskt.';
  return 'Körningen är beställd och väntar på att GitHub startar.';
}

export function readRememberedKey(storage) {
  try {
    const key = storage?.getItem('oraklet-dashboard-key');
    return typeof key === 'string' && key.length >= 24 ? key : '';
  } catch {
    return '';
  }
}
export function saveRememberedKey(storage, key) {
  try {
    if (!storage) return false;
    storage.setItem('oraklet-dashboard-key', key);
    return true;
  } catch {
    return false;
  }
}
export function clearRememberedKey(storage) {
  try {
    if (!storage) return false;
    storage.removeItem('oraklet-dashboard-key');
    return true;
  } catch {
    return false;
  }
}

export const dashboardHtml = (demo = false) => `<!doctype html>
<html lang="sv" data-demo="${demo}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Professor Oraklet · Forskningsöversikt</title>
<style>
:root{color-scheme:dark;--bg:#0c121a;--panel:#131d28;--line:#283643;--text:#eaf1f5;--muted:#a0b0bf;--teal:#6ee0bd;--amber:#f2bf69;--red:#f38e8e;font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}a{color:var(--teal);text-decoration:none}a:hover{text-decoration:underline}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--teal);outline-offset:4px}aside{width:216px;position:fixed;inset:0 auto 0 0;border-right:1px solid var(--line);background:#101923;padding:32px 22px;display:flex;flex-direction:column;gap:30px}.brand{font-size:19px;font-weight:650;letter-spacing:-.5px}.mark{display:inline-flex;border:1px solid #5b9b87;border-radius:11px;width:34px;height:34px;align-items:center;justify-content:center;margin-right:8px;color:var(--teal);font-family:Georgia,serif}.small,.eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}.nav{padding:11px 13px;border:1px solid #29423d;background:#172d2a;color:var(--teal);border-radius:9px}.aside-note{margin-top:auto;color:var(--muted);font-size:12px}.aside-note strong{display:block;color:var(--text);margin-bottom:8px}main{margin-left:216px;max-width:1660px;padding:26px 40px 55px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:22px}.top strong{font-size:14px}.top span{font-size:12px;color:var(--muted)}.top-actions{display:flex;gap:16px;align-items:center}.ghost{background:transparent;border:1px solid var(--line);border-radius:7px;color:var(--text);padding:7px 12px;font-size:12px}.intro{margin:30px 0 26px;display:flex;justify-content:space-between;align-items:end;gap:20px}h1{font-size:36px;letter-spacing:-1.3px;line-height:1.2;margin:8px 0 12px;font-weight:550}h1 em{color:var(--teal);font-family:Georgia,serif;font-weight:normal}p{margin:0 0 12px;color:var(--muted)}.pill{display:inline-block;border:1px solid var(--line);padding:4px 9px;border-radius:30px;font-size:11px;white-space:nowrap}.pill.good{color:var(--teal);border-color:#32584b;background:#19332a}.pill.partial{color:var(--amber);border-color:#645039;background:#332b20}.pill.error{color:var(--red);border-color:#633a3e}.pill.running{color:#a9cafa;border-color:#3f597b}.panel{border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden}.panel-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--line);gap:12px}.panel-head h2{font-size:15px;margin:0;font-weight:600}.panel-head span{font-size:12px;color:var(--muted)}.body{padding:20px 22px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:22px 0}.stat{padding:17px 20px;border:1px solid var(--line);border-radius:10px;background:#101a24}.stat .label{font-size:12px;color:var(--muted)}.stat .value{font-size:29px;line-height:1.25;margin:8px 0 4px;font-variant-numeric:tabular-nums}.stat small{font-size:11px;color:var(--muted)}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 294px;gap:18px;align-items:start}.stack{display:grid;gap:18px}.field{display:grid;gap:6px;margin-bottom:16px}.field label{font-size:12px;color:var(--muted)}select,input{width:100%;background:#0b141d;border:1px solid #344351;border-radius:7px;padding:11px;color:var(--text)}.primary{background:var(--teal);border:0;padding:12px 16px;color:#09241d;border-radius:8px;font-weight:650;width:100%}.budget-copy{font-size:12px;margin:8px 0 18px;color:var(--muted)}.micro{font-size:11px;margin:12px 0 0;color:var(--muted)}.history{display:grid}.run-row{display:grid;grid-template-columns:minmax(180px,1fr) 146px 54px;gap:12px;align-items:center;text-align:left;background:transparent;color:var(--text);border:0;border-bottom:1px solid var(--line);padding:16px 22px;width:100%}.run-row:last-child{border:0}.run-row:hover,.run-row.selected{background:#1a2934}.run-row.selected{box-shadow:inset 3px 0 var(--teal)}.run-title{font-size:13px;font-weight:550;display:block}.date{font-size:11px;color:var(--muted);display:block;margin-top:3px}.calls{color:var(--muted);font-size:12px;text-align:right}.detail-header{display:flex;justify-content:space-between;align-items:start;gap:20px}.detail-header h2{font-size:23px;font-weight:550;letter-spacing:-.5px;margin:6px 0 12px}.status-strip{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}.status-strip>span{font-size:12px;color:var(--muted)}.status-strip strong{color:var(--text);font-weight:500}.run-link-box{padding:14px;border:1px solid var(--line);border-radius:8px;margin:0 0 20px;min-width:0}.run-link-box .small{margin-bottom:9px}.run-link-row{display:flex;gap:12px;align-items:start}.run-url{font:12px/1.7 ui-monospace,monospace;overflow-wrap:anywhere;min-width:0;flex:1}.run-link-row button{flex-shrink:0}.copy-feedback{font-size:11px;color:var(--muted);margin-top:8px}.copy-fallback{width:100%;margin-top:10px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:8px;border-radius:6px;font:12px/1.7 ui-monospace,monospace;resize:vertical}.timeline{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin:22px 0 28px;border-top:1px solid var(--line)}.step{padding:17px 12px 16px 0;border-bottom:1px solid var(--line);min-height:108px}.step-title{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:550}.dot{background:#495a69;width:8px;height:8px;border-radius:50%;flex-shrink:0}.dot.good{background:var(--teal)}.dot.partial{background:var(--amber)}.dot.error{background:var(--red)}.dot.running{background:#a9cafa;box-shadow:0 0 0 4px #26384c}.step-copy{font-size:11px;color:var(--muted);margin:9px 0 0 17px;line-height:1.6}.section-label{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted);margin:18px 0 12px}.candidate{background:#152b29;border:1px solid #31534b;border-radius:9px;padding:18px;margin-bottom:22px}.candidate h3{font-size:17px;font-weight:550;margin:9px 0 12px;line-height:1.45}.candidate p{font-size:12px;margin:0}.article{border-top:1px solid var(--line);padding:15px 0}.article h4{font-size:13px;font-weight:550;margin:0 0 9px}.article-meta{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.article summary{font-size:12px;color:var(--teal);cursor:pointer}.article details{margin:10px 0}.finding{padding:12px 0;font-size:12px;color:var(--text)}blockquote{border-left:2px solid #436158;margin:9px 0;padding:5px 0 5px 12px;color:var(--muted);font-size:12px;white-space:pre-wrap}.finding .small{font-size:10px}.selection-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:11px;color:var(--muted);margin:12px 0}.selection-grid strong{display:block;font-size:20px;font-weight:500;color:var(--text)}.query{padding:13px 0;border-top:1px solid var(--line)}.query code{display:block;font-size:12px;overflow-wrap:anywhere;color:var(--text);margin-bottom:10px}.sources{display:flex;flex-wrap:wrap;gap:7px}.notice{font-size:12px;border:1px solid #504638;background:#29251f;border-radius:8px;padding:12px 15px;color:#e1c397;margin:16px 0;overflow-wrap:anywhere}.notice:empty{display:none}.empty{padding:30px 22px;color:var(--muted);font-size:13px}.footnote{font-size:11px;color:var(--muted);margin-top:24px;padding-top:16px;border-top:1px solid var(--line)}#login{max-width:490px;margin:0 0 20px}#login .body{display:flex;align-items:center;gap:12px}#login input{min-width:0}#login button{width:auto;white-space:nowrap}#login .remember{display:flex;align-items:center;gap:8px;padding:0 22px 12px;font-size:12px;color:var(--muted)}#login #remember-key{width:auto;accent-color:var(--teal)}#login .micro{padding:0 22px 16px;margin:0}[hidden]{display:none!important}.demo-banner{font-size:12px;color:var(--amber)}
@media(min-width:1500px){.workspace{grid-template-columns:minmax(0,1fr) 330px}}@media(max-width:1180px){aside{width:176px;padding:26px 15px}main{margin-left:176px;padding:24px}.workspace{grid-template-columns:minmax(0,1fr) 260px}.run-row{grid-template-columns:minmax(0,1fr) 126px 42px;padding:14px}.body,.panel-head{padding:17px}.timeline{grid-template-columns:repeat(2,1fr)}}@media(max-width:860px){aside{position:static;width:auto;display:flex;flex-direction:row;align-items:center;padding:15px 20px;border-right:0;border-bottom:1px solid var(--line);gap:20px}.aside-note{display:none}.nav{font-size:12px;padding:7px 10px}main{margin:0;padding:20px}.workspace{grid-template-columns:1fr}.start-panel{grid-row:1}.stats{gap:9px}.stat{padding:13px}.stat .value{font-size:25px}.intro{margin:24px 0}.top{padding-bottom:16px}h1{font-size:31px}}@media(max-width:520px){main{padding:16px}.intro{display:block}.intro>.pill{margin-top:5px}.stats{grid-template-columns:repeat(2,1fr)}.run-row{grid-template-columns:minmax(0,1fr) 116px 36px;gap:7px}.pill{font-size:10px}.timeline{grid-template-columns:repeat(2,1fr)}.selection-grid{grid-template-columns:repeat(2,1fr)}h1{font-size:28px}.top-actions span{display:none}.top{gap:8px}#login .body{flex-wrap:wrap}#login button{width:100%}}
</style><script src="/research/app.js" defer></script></head><body>
<aside><div class="brand"><span class="mark">O</span>Oraklet</div><div><div class="eyebrow" style="margin-bottom:12px">Forskningslabb</div><div class="nav">◎ &nbsp; Forskningsöversikt</div></div><div class="aside-note"><strong>Från litteratur till prövning</strong>Följ vad som söks, vad som stöds av källorna och vad som återstår att undersöka.<p style="margin-top:20px"><a href="https://www.debatt-ai.se/universitet" target="_blank" rel="noopener noreferrer">Debatt-AI universitet ↗</a></p></div></aside>
<main><header class="top"><strong>Professor Oraklet / Forskningsöversikt</strong><div class="top-actions"><span id="updated">Inte ansluten</span><button class="ghost" id="refresh" type="button">Uppdatera</button><button class="ghost" id="logout" type="button" hidden>Logga ut</button></div></header>
<div class="intro"><div><div class="eyebrow">Litteratur · Evidens · Forskningsförslag</div><h1>Följ forskningen.<br><em>Förstå varje steg.</em></h1><p>Starta en körning och se hur underlaget växer fram.</p></div><span class="pill" id="mode">Privat forskningsöversikt</span></div>
<form id="login" class="panel"><div class="body"><input id="key" type="password" autocomplete="off" placeholder="Dashboardnyckel" aria-label="Dashboardnyckel" required><button class="primary" type="submit">Anslut</button></div><label class="remember"><input id="remember-key" type="checkbox">Kom ihåg nyckeln på den här enheten</label><p class="micro">Om du väljer detta sparas nyckeln i webbläsaren. Logga ut tar bort den sparade nyckeln. <a href="/research/demo">Titta på en demo ↗</a></p></form>
<div id="notice" class="notice" role="status" aria-live="polite"></div>
<div id="run-notice" class="notice" role="status" aria-live="polite"></div>
<div class="stats" id="stats"></div>
<div class="workspace"><div class="stack"><section class="panel"><div class="panel-head"><h2>Körningar</h2><span>Senaste 20 · välj för att följa</span></div><div id="history" class="history"><div class="empty">Anslut för att läsa dina sparade körningar.</div></div></section><section class="panel" id="detail"><div class="empty">Välj en körning för att se forskningsflödet.</div></section></div>
<section class="panel start-panel"><div class="panel-head"><h2>Starta forskning</h2><span>En sammanhängande körning</span></div><form class="body" id="start"><div class="field"><label for="area">Forskningsområde</label><select id="area"><option value="PINNs and turbulence">PINNs och turbulens</option><option value="Experiment design">Experimentdesign</option><option value="Kalman state estimation">Kalman och tillståndsskattning</option><option value="Causal inference">Kausal inferens</option><option value="Model evaluation">Modellutvärdering</option></select></div><div class="field"><label for="budget">Modellbudget</label><select id="budget"><option value="5">Högst 5 modellanrop</option><option value="10">Högst 10 modellanrop</option></select></div><p class="budget-copy">Samlar litteratur, analyserar abstract och söker relaterat arbete inom samma budget.</p><button class="primary" id="start-button" type="submit" disabled>Starta forskning →</button><p class="micro">Inga experiment körs. Forskningsluckor och nyhetsvärde kräver fortsatt granskning.</p><p class="micro" id="start-note">Anslut för att starta och följa forskning.</p></form></section></div>
<footer class="footnote">Körstatus visar om systemet fungerade. Evidensstatus visar hur komplett underlaget är. Källmatchade citat verifierar textens ursprung, inte vetenskaplig riktighet.</footer></main></body></html>`;

export const dashboardScript =
  `const githubRunUrl=(${githubRunUrl.toString()});\nconst runMessage=(${runMessage.toString()});\nconst readRememberedKey=(${readRememberedKey.toString()});\nconst saveRememberedKey=(${saveRememberedKey.toString()});\nconst clearRememberedKey=(${clearRememberedKey.toString()});\n` +
  String.raw`
'use strict';
const $=id=>document.getElementById(id),demo=document.documentElement.dataset.demo==='true';
const areas={'PINNs and turbulence':'PINNs och turbulens','Experiment design':'Experimentdesign','Kalman state estimation':'Kalman och tillståndsskattning','Causal inference':'Kausal inferens','Model evaluation':'Modellutvärdering'};
const stages=['preflight','collection','initial_evidence','follow_up_search','follow_up_selection','follow_up_evidence'];
const stageLabels=['Förberedelser','Litteraturinsamling','Första analysen','Uppföljningssökning','Artikelurval','Uppföljningsanalys'];
const statuses={queued:'I kö',running:'Pågår',completed:'Underlag klart',partial:'Delvis underlag',error:'Steg misslyckades',insufficient_evidence:'Otillräckligt underlag',insufficient_relevant_hits:'Inga relevanta träffar',insufficient_abstract_identifiers:'Abstract saknar identifierare',summarized:'Sammanfattad',unavailable:'Inte tillgänglig'};
const reasons={quote_not_exact:'Citatet matchar inte källtexten',quote_whitespace_variant:'Citatets blanksteg skiljer sig',quote_length_outside_bounds:'Citatet är för kort eller långt',context_quote_not_exact:'Kontextcitatet matchar inte källtexten',abstract_missing:'Abstract saknas',no_abstract_identifier:'Identifierare för abstract saknas',unmatched_evidence_quote:'Inget accepterat källcitat'};
let key='',rows=[],selected=null,selectedRow=null,starting=false,canStart=false,generation=0,refreshing=false,pendingStart=null,rememberRequested=false,rememberedKey='';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'');if(cls)n.className=cls;return n;};
const tone=s=>s==='completed'||s==='summarized'?'good':s==='error'?'error':s==='running'||s==='queued'?'running':'partial';
const pill=(text,status)=>{const n=el('span',text,'pill '+tone(status));n.title=text;return n;};
const runBadge=r=>r.status==='queued'&&r.dispatch_status==='failed'?pill('Start nekad','error'):r.status==='queued'&&['pending','uncertain'].includes(r.dispatch_status)?pill('Start osäker','partial'):pill(statuses[r.status]||r.status,r.status);
const date=value=>value?new Date(value).toLocaleString('sv-SE',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Tid saknas';
const storage=()=>{try{return window.localStorage;}catch{return null;}};
function rememberVerifiedKey(){if(rememberRequested&&rememberedKey!==key){if(saveRememberedKey(storage(),key))rememberedKey=key;else{rememberRequested=false;$('remember-key').checked=false;note('Webbläsaren kunde inte spara nyckeln. Du är ansluten i den här fliken.');}}}
const note=text=>{$('notice').textContent=text;};
function safeLink(value,label){try{const u=new URL(value);if(u.protocol!=='https:'||!['openalex.org','arxiv.org','doi.org','github.com'].includes(u.hostname)||u.username||u.password)return null;const n=el('a',label);n.href=u.href;n.target='_blank';n.rel='noopener noreferrer';return n;}catch{return null;}}
function runLink(url){
  const box=el('div',undefined,'run-link-box'),row=el('div',undefined,'run-link-row');box.append(el('div','GitHub-körning','small'));
  const link=safeLink(url,url);link.className='run-url';const button=el('button','Kopiera länk','ghost');button.type='button';
  const feedback=el('div','','copy-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const fallback=el('textarea',undefined,'copy-fallback');fallback.value=url;fallback.readOnly=true;fallback.hidden=true;fallback.setAttribute('aria-label','GitHub-URL för manuell kopiering');
  button.onclick=async()=>{
    button.disabled=true;let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);copied=true;}}catch{}
    if(!copied){const temp=el('textarea');temp.value=url;temp.readOnly=true;temp.style.position='fixed';temp.style.opacity='0';box.append(temp);
      try{temp.focus();temp.select();copied=document.execCommand('copy')===true;}catch{}finally{temp.remove();}}
    button.disabled=false;button.textContent=copied?'Kopierad ✓':'Kopiera länk';
    feedback.textContent=copied?'GitHub-länken är kopierad.':'Kopiering kunde inte genomföras. Markera URL:en nedan och kopiera manuellt.';
    fallback.hidden=copied;if(!copied){fallback.focus();fallback.select();}
  };
  row.append(link,button);box.append(row,feedback,fallback);return box;
}
function stats(report){const summaries=(report?.stages??[]).filter(s=>['initial_evidence','follow_up_evidence'].includes(s.name)).map(s=>s.summary);const n=field=>summaries.reduce((a,s)=>a+(s?.validation?.[field]??0),0);
  const cards=[['Sparade körningar',rows.length,'Senaste 20 körningarna'],['Modellanrop',report?(report.budget.known_model_calls+' / '+report.budget.maximum_model_calls):'—','Vald körning · högst tillåten budget'],['Accepterade fynd',report?n('accepted_findings'):'—','Exakta citat godkända'],['Avvisade fynd',report?n('rejected_findings'):'—','Ingår inte i underlaget']];
  $('stats').replaceChildren(...cards.map(([label,value,copy])=>{const c=el('div',undefined,'stat');c.append(el('div',label,'label'),el('div',value,'value'),el('small',copy));return c;}));}
async function api(path,body){const response=await fetch('/v1/research/'+path,{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'request_failed'),{status:response.status});return data;}
function showRows(){if(!rows.length){$('history').replaceChildren(el('div','Inga sparade körningar ännu. Starta din första körning här.','empty'));return;}
  $('history').replaceChildren(...rows.map(r=>{const b=el('button',undefined,'run-row'+(r.id===selected?' selected':''));b.type='button';b.setAttribute('aria-pressed',String(r.id===selected));const title=el('div');title.append(el('span',areas[r.area]||r.area,'run-title'),el('span',date(r.created_at),'date'));b.append(title,runBadge(r),el('div',r.known_model_calls+' / '+r.model_budget,'calls'));b.onclick=()=>select(r.id);return b;}));}
function stepCopy(s){if(!s)return 'Väntar på tidigare steg';if(s.status==='running')return 'Pågår · utfallet är inte klart';const q=s.summary;
  if(s.name==='collection')return (q?.metadata?.returned_records??0)+' källposter · '+(q?.abstracts?.available??0)+' abstract';
  if(['initial_evidence','follow_up_evidence'].includes(s.name))return (q?.coverage?.summarized??0)+' / '+(q?.coverage?.selected??0)+' artiklar · '+(s.model_calls??'?')+' anrop';
  if(s.name==='follow_up_search')return (q?.queries?.length??0)+' sökfrågor · inget modellanrop';
  if(s.name==='follow_up_selection')return 'Sökfråga '+((s.query_index??0)+1)+' vald för analys';return 'Kontroller före forskningen';}
function article(p){const n=el('div',undefined,'article');n.append(el('h4',p.title));const meta=el('div',undefined,'article-meta');meta.append(pill(statuses[p.status]||p.status,p.status));if(p.validation)meta.append(el('span',p.validation.accepted_findings+' accepterade · '+p.validation.rejected_findings+' avvisade','pill'));if(p.reused_analysis)meta.append(el('span','Återanvänd analys','pill'));const link=safeLink(p.source_url,'Källa ↗');if(link)meta.append(link);n.append(meta);
  if(p.reason)n.append(el('p',reasons[p.reason]||p.reason,'micro'));
  if(p.selection?.matched_domain?.length)n.append(el('p','Ämnesmatchning: '+p.selection.matched_domain.join(', '),'micro'));
  for(const item of p.validation?.rejected??[])n.append(el('p','Avvisat fynd '+(item.index+1)+': '+(reasons[item.reason]||item.reason),'micro'));
  if(p.findings?.length){const d=el('details');d.append(el('summary','Visa fynd och källcitat'));for(const f of p.findings){const x=el('div',undefined,'finding');x.append(el('div',({method:'Metod',result:'Rapporterat resultat',limitation:'Begränsning'})[f.kind]||f.kind,'small'),el('div',f.claim),el('blockquote',f.quote));if(f.limitation_status)x.append(el('p','Tolkning: '+({prior_work:'tidigare metoders begränsning',remaining:'möjlig kvarstående begränsning',unclear:'oklart'})[f.limitation_status]+' · ej verifierad','micro'));d.append(x);}n.append(d);}return n;}
function detail(row,technical){selectedRow={...row,technical};if(!demo)$('run-notice').textContent=runMessage(row,technical);const r=row.report,c=el('div',undefined,'body');const head=el('div',undefined,'detail-header'),h=el('div');h.append(el('div','Vald forskningskörning','eyebrow'),el('h2',areas[row.area]||row.area));head.append(h,runBadge(row));c.append(head);
  const strip=el('div',undefined,'status-strip');let execution='Ej kontrollerad';if(technical){execution=technical.status==='completed'?({success:'Slutförd',cancelled:'Avbruten',failure:'Misslyckades',timed_out:'Tidsgräns nådd'})[technical.conclusion]||'Avslutad':'Pågår / väntar';}
  strip.append(el('span','Körstatus: '+execution),el('span','Evidensstatus: '+(r?statuses[r.status]||r.status:'Väntar på första resultatet')));c.append(strip);const url=githubRunUrl(row,technical);if(url)c.append(runLink(url));
  if(technical?.status==='completed'&&(!r?.finished_at||technical.run_attempt>row.github_run_attempt))c.append(el('div','Körningen är avslutad, men ett slutligt checkpoint för den här körningsversionen saknas. Siffrorna nedan är senast sparade värden.','notice'));
  if(!r){c.append(el('p',runMessage(row,technical)));$('detail').replaceChildren(c);stats(null);return;}
  const timeline=el('div',undefined,'timeline');stages.forEach((name,i)=>{const s=r.stages.find(x=>x.name===name),x=el('div',undefined,'step'),title=el('div',undefined,'step-title');title.append(el('span','', 'dot '+(s?tone(s.status):'')),el('span',(i+1)+'. '+stageLabels[i]));x.append(title,el('div',stepCopy(s),'step-copy'));timeline.append(x);});c.append(timeline);
  if(r.budget.actual_count_complete===false)c.append(el('div','Antalet anrop i det avbrutna steget är okänt. Budgeten visar bara kända genomförda anrop.','notice'));
  if(r.candidate){const box=el('div',undefined,'candidate');box.append(el('div','Forskningsförslag · Ej verifierat','eyebrow'),el('h3',r.candidate.question),el('p','Förslaget hänvisar till '+r.candidate.evidence_articles+' analyserade artiklar. Forskningslucka, nyhetsvärde och vetenskaplig betydelse är fortfarande oprövade. Experimentet är ett utkast och körs inte.'));c.append(box);}else c.append(el('p','Inget evidensbaserat forskningsförslag har valts ännu.'));
  const final=r.stages.find(s=>s.name==='follow_up_evidence')?.summary,selection=final?.selection;
  if(selection){c.append(el('div','Urval för uppföljningen','section-label'));const grid=el('div',undefined,'selection-grid');for(const [label,value] of [['Möjliga artiklar',selection.eligible],['Ursprung exkluderade',selection.confirmed_origin],['Svaga ankare',selection.rejected_for_weak_anchors],['Fel ämnesområde',selection.rejected_for_domain??0]]){const cell=el('div');cell.append(el('strong',value??0),el('span',label));grid.append(cell);}c.append(grid);if(selection.rejected_for_no_abstract_identifier)c.append(el('p',selection.rejected_for_no_abstract_identifier+' artiklar saknar identifierare för abstract.','micro'));}
  const queries=r.stages.find(s=>s.name==='follow_up_search')?.summary?.queries;if(queries?.length){const d=el('details');d.append(el('summary','Visa uppföljningssökningar och källor'));for(const q of queries){const n=el('div',undefined,'query');n.append(el('code',q.query));const sources=el('div',undefined,'sources');for(const s of q.sources)sources.append(pill(s.source+' · '+s.records+' träffar',s.status==='ok'?'completed':'error'));n.append(sources);d.append(n);}c.append(d);}
  for(const name of ['initial_evidence','follow_up_evidence']){const stage=r.stages.find(s=>s.name===name);if(stage?.summary?.papers?.length){c.append(el('div',name==='initial_evidence'?'Första analysens artiklar':'Uppföljningens artiklar','section-label'));for(const p of stage.summary.papers)c.append(article(p));}}
  const missing=r.stages.find(s=>s.name==='collection')?.summary?.unavailable;if(missing?.length){const d=el('details');d.append(el('summary','Abstract som inte kunde hämtas ('+missing.length+')'));for(const m of missing)d.append(el('p',m.title+' · '+(reasons[m.reason]||m.reason),'micro'));c.append(d);}
  c.append(el('p','Sparat '+date(row.updated_at)+'. Ämnesmatchning bygger på ord i titeln och kan missa relevanta artiklar. Inga experiment har körts.','footnote'));$('detail').replaceChildren(c);stats(r);
}
async function select(id){selected=id;showRows();const ticket=++generation;try{let row,technical;if(demo){row=rows.find(r=>r.id===id);technical=row.technical;}else{const d=await api('runs/'+id);row=d.run;technical=d.technical;}if(ticket!==generation)return;detail(row,technical);startState();}catch(e){if(ticket===generation)note('Kunde inte läsa körningen. Dina sparade resultat ändras inte.');}}
function startState(){const active=selectedRow&&['queued','running'].includes(selectedRow.status)&&!['failed'].includes(selectedRow.dispatch_status)&&selectedRow.technical?.status!=='completed';$('start-button').disabled=demo||!key||!canStart||starting||active;$('start-note').textContent=demo?'Demonstrationsdata. Ingen körning kan startas.':!key?'Anslut för att starta och följa forskning.':!canStart?'Startfunktionen behöver konfigureras en gång. Historiken kan fortfarande läsas.':active?'Den valda körningen är beställd eller pågår. Följ stegen här.':'Startar på main. Samma startförsök skickas bara en gång.';}
async function refresh(){if(refreshing||(!key&&!demo))return;refreshing=true;const auth=key;try{const data=demo?await (await fetch('/research/demo-data')).json():await api('runs');if(!demo&&auth!==key)return;rows=data.runs;if(!demo)rememberVerifiedKey();canStart=data.can_start===true;showRows();$('updated').textContent='Uppdaterad '+new Date().toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'});if(!selected&&rows.length)selected=rows[0].id;if(selected)await select(selected);else stats(null);startState();}catch(e){if(!demo&&auth!==key)return;if(e.status===401){generation++;clearRememberedKey(storage());rememberedKey='';rememberRequested=false;$('remember-key').checked=false;key='';$('login').hidden=false;$('logout').hidden=true;rows=[];selected=selectedRow=null;$('run-notice').textContent='';showRows();$('detail').replaceChildren(el('div','Anslut för att läsa dina körningar.','empty'));stats(null);startState();}note(e.status===401?'Nyckeln accepterades inte.':e.message==='dashboard_not_configured'?'Dashboarden är ännu inte konfigurerad. Du kan titta på demon under tiden.':'Kunde inte uppdatera forskningsöversikten. Senaste sparade vyn visas.');}finally{refreshing=false;}}
$('login').onsubmit=async e=>{e.preventDefault();key=$('key').value;$('key').value='';rememberRequested=$('remember-key').checked;note('');if(!rememberRequested){const cleared=clearRememberedKey(storage());if(rememberedKey&&!cleared)note('Den sparade nyckeln kunde inte raderas. Rensa webbplatsens lagring för att ta bort den.');if(cleared)rememberedKey='';}$('login').hidden=true;$('logout').hidden=false;await refresh();};
$('logout').onclick=()=>{const cleared=clearRememberedKey(storage());note(rememberedKey&&!cleared?'Du är utloggad, men den sparade nyckeln kunde inte raderas. Rensa webbplatsens lagring för att ta bort den.':'');rememberedKey='';rememberRequested=false;$('remember-key').checked=false;key='';generation++;rows=[];selected=selectedRow=null;$('run-notice').textContent='';$('login').hidden=false;$('logout').hidden=true;$('history').replaceChildren(el('div','Anslut för att läsa dina körningar.','empty'));$('detail').replaceChildren(el('div','Välj en körning.','empty'));stats(null);startState();};
$('refresh').onclick=refresh;
$('start').onsubmit=async e=>{e.preventDefault();if(demo||starting||$('start-button').disabled)return;starting=true;startState();let input=pendingStart;try{input=input||JSON.parse(sessionStorage.getItem('oraklet-pending-start')||'null');}catch{}
  if(!input){input={id:crypto.randomUUID(),area:$('area').value,model_budget:Number($('budget').value)};pendingStart=input;try{sessionStorage.setItem('oraklet-pending-start',JSON.stringify(input));}catch{}}
  try{const data=await api('runs',input);selected=data.run.id;pendingStart=null;try{sessionStorage.removeItem('oraklet-pending-start');}catch{}note('');$('run-notice').textContent=runMessage(data.run,null);await refresh();}catch{note('Startens utfall är okänt. Ett nytt klick återanvänder samma startförsök och skickar inte en dubbel beställning.');}finally{starting=false;startState();}};
setInterval(()=>{if(!document.hidden)refresh();},20000);
if(demo){$('login').hidden=true;$('mode').textContent='DEMO · Exempeldata';$('mode').className='pill partial';note('Det här är en demonstration av vyn, med exempeldata. Ingen forskning startas.');refresh();}else{stats(null);rememberedKey=readRememberedKey(storage());if(rememberedKey){key=rememberedKey;rememberRequested=true;$('remember-key').checked=true;$('login').hidden=true;$('logout').hidden=false;refresh();}}
`;
