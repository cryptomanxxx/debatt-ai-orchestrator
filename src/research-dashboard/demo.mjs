// Explicitly labelled example data. No live queries, credentials, or model calls.
const id='00000000-0000-4000-8000-000000000001';
const findings=[{kind:'method',claim:'En fysikinformerad modell kombinerar simuleringar med glesa flödesmätningar.',quote:'We combine sparse measurements with physics-informed models.',limitation_status:null}];
export const demoRuns=[{id,area:'PINNs and turbulence',model_budget:5,status:'partial',known_model_calls:5,
  dispatch_status:'manual',created_at:'2026-10-13T06:20:00Z',updated_at:'2026-10-13T06:28:00Z',github_run_id:null,
  technical:{status:'completed',conclusion:'success'},
  report:{id,status:'partial',area:'PINNs and turbulence',created_at:'2026-10-13T06:20:00Z',finished_at:'2026-10-13T06:28:00Z',
    execution_enabled:false,budget:{maximum_model_calls:5,known_model_calls:5},candidate:{question:'Kan en fysikinformerad estimator förbättra tillståndsskattning under förändrade flödesförhållanden?',evidence_articles:3,gap_review_count:0},
    stages:[{name:'preflight',status:'completed',model_calls:0},
      {name:'collection',status:'partial',model_calls:0,summary:{metadata:{successful_searches:4,failed_searches:0,returned_records:40},abstracts:{selected:10,available:9,reused:9},unavailable:[{title:'Ett abstract kunde inte hämtas',reason:'abstract_missing'}]}},
      {name:'initial_evidence',status:'completed',model_calls:3,summary:{coverage:{selected:3,summarized:3},validation:{accepted_findings:9,rejected_findings:0},reused_analyses:0,papers:[{title:'Turbulence model augmented physics-informed neural networks for mean-flow reconstruction',status:'summarized',findings,validation:{accepted_findings:3,rejected_findings:0}}]}},
      {name:'follow_up_search',status:'completed',model_calls:0,summary:{queries:[{query:'pinn turbulence estimator state estimation',sources:[{source:'OpenAlex',status:'ok',records:10},{source:'Semantic Scholar',status:'ok',records:0},{source:'CORE',status:'ok',records:10},{source:'arXiv',status:'ok',records:3}]},{query:'physics informed neural networks turbulence model augmented',sources:[{source:'OpenAlex',status:'ok',records:10},{source:'Semantic Scholar',status:'ok',records:10},{source:'CORE',status:'ok',records:10},{source:'arXiv',status:'ok',records:10}]}]}},
      {name:'follow_up_selection',status:'completed',model_calls:0,query_index:1},
      {name:'follow_up_evidence',status:'partial',model_calls:2,summary:{coverage:{selected:2,summarized:2},validation:{accepted_findings:4,rejected_findings:1},reused_analyses:0,
        selection:{eligible:4,confirmed_origin:1,rejected_for_weak_anchors:30,rejected_for_domain:0,rejected_for_no_abstract_identifier:0,domain_terms:['turbulence','turbulent','fluid']},
        papers:[{title:'AI-Augmented Turbulence and Aerodynamic Modelling',status:'summarized',source_url:'https://openalex.org/W4407994620',findings,validation:{accepted_findings:1,rejected_findings:1,rejected:[{index:0,reason:'quote_not_exact'}]},selection:{matched_domain:['turbulence','aerodynamic'],origin_relation:'not_matched_to_origin'}},
          {title:'Mixed data-source transfer learning for a turbulence model augmented physics-informed neural network',status:'summarized',source_url:'https://openalex.org/W7167942481',findings,validation:{accepted_findings:3,rejected_findings:0},selection:{matched_domain:['turbulence'],origin_relation:'not_matched_to_origin'}}]}}
    ]}},
  {id:'00000000-0000-4000-8000-000000000002',area:'Experiment design',model_budget:5,status:'insufficient_relevant_hits',known_model_calls:2,dispatch_status:'manual',created_at:'2026-10-12T14:15:00Z',updated_at:'2026-10-12T14:20:00Z',github_run_id:null},
  {id:'00000000-0000-4000-8000-000000000003',area:'Causal inference',model_budget:5,status:'completed',known_model_calls:4,dispatch_status:'manual',created_at:'2026-10-11T09:10:00Z',updated_at:'2026-10-11T09:16:00Z',github_run_id:null}];
