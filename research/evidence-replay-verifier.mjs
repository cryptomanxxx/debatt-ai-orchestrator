// Deterministic, read-only replay against immutable abstract archive versions.
// Verification is of quotation occurrence, never scientific truth.
import { evidencePrompt,hashText } from './literature-evidence.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/i;
export async function replayEvidence(report,{readVersion}={}) {
  const results=[];
  await Promise.all((report.papers??[]).map(async paper=>{
    if(paper.status!=='summarized') return;
    const version=paper.archive?.version_id;
    const base={article_id:paper.article_id,archive_version_id:UUID.test(version??'')?version:null};
    if(!UUID.test(version??'') || typeof readVersion!=='function'){
      results.push({...base,status:'unverifiable',reason:'archive_version_unavailable'});return;
    }
    let loaded;
    try { loaded=await readVersion(version); }
    catch (error) {
      const integrity=error?.message==='invalid_abstract_archive_response'||error?.message==='invalid_archived_abstract';
      results.push({...base,status:integrity?'rejected':'unverifiable',reason:integrity?'archive_integrity_failure':'archive_read_failed'});return;
    }
    if(!loaded){results.push({...base,status:'unverifiable',reason:'archive_version_missing'});return;}
    const abstract=loaded.abstract;
    if(typeof abstract!=='string'||abstract.length>12000||!SHA.test(paper.content?.sha256??'')
      ||hashText(abstract)!==paper.content.sha256 || loaded.content?.sha256!==paper.content.sha256
      ||loaded.content?.provider!==paper.content.provider ||loaded.content?.url!==paper.content.url
      ||loaded.archive?.version_id!==version
      || !UUID.test(paper.archive?.source_record_id??'')
      || loaded.archive?.source_record_id!==paper.archive.source_record_id
      || !(paper.source_hits?.some(h=>h.source_record_id===paper.archive.source_record_id)
        || paper.lookup_identifiers?.openalex_records?.some(h=>h.source_record_id===paper.archive.source_record_id
          && h.source_id===paper.content?.url))){
      results.push({...base,status:'rejected',reason:'archive_identity_or_hash_mismatch'});return;
    }
    let prompt;
    try {prompt=evidencePrompt(paper,abstract);}
    catch {results.push({...base,status:'rejected',reason:'invalid_replay_prompt'});return;}
    const source=prompt.source_text;
    if(hashText(source)!==paper.content.analyzed_sha256
      || prompt.source_text_is_truncated!==paper.content.truncated
      || !paper.findings?.every(f=>source.includes(f.quote)
        && (f.context_quote==null||source.includes(f.context_quote)))){
      results.push({...base,status:'rejected',reason:'analyzed_content_or_quote_mismatch'});return;
    }
    results.push({...base,status:'verified',reason:'archive_quote_match'});
  }));
  results.sort((a,b)=>a.article_id.localeCompare(b.article_id));
  return results;
}
