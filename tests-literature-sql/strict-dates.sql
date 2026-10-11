begin;
set local role service_role;
do $$
declare p jsonb; v text; field text; n integer:=0;
begin
 foreach v in array array['unknown','2023-02-29','1900-02-29','2026-04-31','0000-01-01','2026-13-01',
   '2026-01-01T24:00:00Z','2026-01-01T12:60:00Z','2026-01-01T12:00:60Z',
   '2026-01-01T12:00:00+16:00','2026-01-01T12:00:00','01/02/2026'] loop
   foreach field in array array['published','updated','fetchedAt'] loop
     n:=n+1;
     p:=jsonb_build_object('runKey','invalid-date-'||n,'contentHash',repeat('a',64),'searches',jsonb_build_array(
       jsonb_build_object('queryIndex',0,'query','dates','source','core','status','ok','fetchedAt','2026-10-11T12:00:00Z','papers',
         jsonb_build_array(jsonb_build_object('sourceId','transient','title','Transient'),jsonb_build_object('sourceId','invalid','title','Invalid')))));
     if field='fetchedAt' then p:=jsonb_set(p,'{searches,0,fetchedAt}',to_jsonb(v));
     else p:=jsonb_set(p,array['searches','0','papers','1',field],to_jsonb(v)); end if;
     begin
       perform public.ingest_literature_run(p);
       raise exception 'invalid timestamp accepted';
     exception when others then
       if sqlerrm<>'invalid_literature_timestamp' then raise; end if;
     end;
   end loop;
 end loop;
 foreach field in array array['updated','fetchedAt'] loop
   n:=n+1;
   p:=jsonb_build_object('runKey','date-only-time-'||n,'contentHash',repeat('c',64),'searches',jsonb_build_array(
     jsonb_build_object('queryIndex',0,'query','dates','source','core','status','ok','fetchedAt','2026-10-11T12:00:00Z','papers',
       jsonb_build_array(jsonb_build_object('sourceId','invalid','title','Invalid')))));
   if field='fetchedAt' then p:=jsonb_set(p,'{searches,0,fetchedAt}',to_jsonb('2024-02-29'::text));
   else p:=jsonb_set(p,'{searches,0,papers,0,updated}',to_jsonb('2024-02-29'::text)); end if;
   begin
     perform public.ingest_literature_run(p);
     raise exception 'date-only timestamp accepted';
   exception when others then
     if sqlerrm<>'invalid_literature_timestamp' then raise; end if;
   end;
 end loop;
 if (select count(*) from public.literature_run)<>0 or (select count(*) from public.literature_article)<>0
   or (select count(*) from public.literature_hit)<>0 then raise exception 'invalid timestamps partially committed'; end if;
 foreach v in array array['2024-02-29','2000-02-29','2026-01-01T12:00:00Z','2024-02-29T23:59:59.123+02:00'] loop
   n:=n+1;
   p:=jsonb_build_object('runKey','valid-date-'||n,'contentHash',repeat('b',64),'searches',jsonb_build_array(
     jsonb_build_object('queryIndex',0,'query','dates','source','core','status','ok','fetchedAt','2026-10-11T12:00:00Z','papers',
       jsonb_build_array(jsonb_build_object('sourceId','valid-'||n,'title','Valid','published',v,'updated','2026-10-11T12:00:00Z')))));
   perform public.ingest_literature_run(p);
   if not exists(select 1 from public.literature_article where published=v) then raise exception 'valid timestamp not retained'; end if;
 end loop;
 if public.literature_valid_time('2024-02-29',true) then raise exception 'date-only fetch/update accepted'; end if;
 if has_function_privilege('anon','public.literature_valid_time(text,boolean)','execute')
   or has_function_privilege('authenticated','public.literature_valid_time(text,boolean)','execute') then raise exception 'public validator access granted'; end if;
end;
$$;
rollback;
