import { CATALOG } from './catalog.mjs';
import { makeCatalogProblem } from './problem-bank-create-catalog.mjs';

const DOMAINS=Object.freeze({
  'sympy-quadratic':'symbolic-mathematics',
  'sklearn-polynomial':'machine-learning',
  'dowhy-backdoor':'causal-inference',
  'glucose-temperature-evidence':'physiological-evidence-reanalysis',
  'glucose-robustness':'synthetic-physiological-dynamics',
  'glucose-absorption':'synthetic-physiological-dynamics',
  'statsmodels-ar1':'time-series',
  'pymc-gdp-ar1':'bayesian-inference',
  'ratfit-baseline':'symbolic-regression',
  'ratfit-feedback':'symbolic-regression',
  'rankscreen-consistency':'linear-algebra',
  'rankscreen-rank-deficit':'linear-algebra',
  'annihilator-recurrence':'symbolic-mathematics',
  'mixalot-model-comparison':'bayesian-inference'
});
const slug=id=>id.replace(/[^a-z0-9-]/g,'-');
export function proposeCatalogProblems({catalog=CATALOG,existingIds=[],limit=3}={}) {
  if (!Array.isArray(existingIds)||!existingIds.every(x=>typeof x==='string')) throw new Error('invalid_existing_problem_ids');
  if (!Number.isInteger(limit)||limit<1||limit>CATALOG.filter(e=>e.automatic!==false).length) throw new Error('invalid_proposal_limit');
  const seen=new Set(existingIds);
  return catalog.filter(entry=>entry.automatic!==false && DOMAINS[entry.id])
    .map(entry=>{
      const id='oraklet-'+slug(entry.id)+'-001';
      const problem=makeCatalogProblem({id,experimentId:entry.id,domain:DOMAINS[entry.id],difficulty:2});
      return {id,experiment_id:entry.id,question:problem.question,domain:problem.domain,
        hypothesis:'Oraklet kan uppfylla det låsta experimentets acceptanskriterier: '+entry.question,
        verification_plan:'Kör det kataloglåsta experimentet '+entry.id+' och kontrollera dess oberoende verifieringskriterier samt rapporterade testfall.',
        verifier_ids:problem.verifier_ids,version:problem.version,fingerprint:problem.fingerprint,
        status:'proposed_requires_human_approval'};
    }).filter(p=>!seen.has(p.id)).slice(0,limit);
}

export function renderProposals(proposals) {
  return '# Oraklets forskningsförslag (ej registrerade)\n\n'
    +(proposals.length?proposals.map((p,i)=>
      '## '+(i+1)+'. '+p.id+'\n\n'
      +'**Experiment:** `'+p.experiment_id+'`  \n'
      +'**Fråga:** '+p.question+'  \n'
      +'**Hypotes:** '+p.hypothesis+'  \n'
      +'**Verifiering:** '+p.verification_plan+'  \n'
      +'**Fingerprint:** `'+p.fingerprint+'`\n\n'
    ).join(''):'Inga ytterligare katalogförslag.\n')
    +'\nFörslagen är deterministiska, bygger på befintliga katalogprotokoll och har inte skrivits till Supabase. Granska dem innan eventuell registrering.\n';
}
