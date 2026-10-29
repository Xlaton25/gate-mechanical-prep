"""Emit create-only SQL from a private, reviewed source-image payload (never store data in Git)."""
import json,sys
from pathlib import Path
payload=json.loads(Path(sys.argv[1]).read_text())
# Inputs are a private batch assembled after source/key review, not a learner endpoint.
literal=json.dumps(payload,ensure_ascii=True).replace("'", "''")
print("DO $import$ DECLARE batch jsonb := '"+literal+"'::jsonb; q jsonb; f jsonb; k jsonb; r jsonb; sid uuid; pid uuid; qid uuid; kid uuid; n int; BEGIN\n"+r'''
for q in select value from jsonb_array_elements(batch) loop
 select id into sid from private.source_files where file_name=q->>'file';
 if sid is null then
  insert into private.source_files(file_name,filename_year,page_count,sha256,status,text_layer,embeds_answer_key,notes)
  values(q->>'file',(q->>'year')::smallint,(q->>'page_count')::int,q->>'sha256','needs_review','present','no',array['Source-preserving import; key exceptions remain in review']) returning id into sid;
 elsif not exists(select 1 from private.source_files where id=sid and sha256=q->>'sha256' and page_count=(q->>'page_count')::int) then
  raise exception 'Source identity mismatch';
 end if;
 select id into pid from public.papers where exam_year=(q->>'year')::smallint and session_label=q->>'session';
 if pid is null then
  insert into public.papers(exam_year,session_label,marking_policy_id,status,deduplicated)
  values((q->>'year')::smallint,q->>'session','gate-'||(q->>'year')||'-v1','in_review',true) returning id into pid;
 end if;
 insert into private.paper_sources(paper_id,source_file_id,page_from,page_to) values(pid,sid,1,(q->>'page_count')::int) on conflict do nothing;
 select id into qid from public.questions where paper_id=pid and number=(q->>'number')::smallint;
 if qid is not null then
  -- Existing questions/progress are never overwritten. The importer can resume safely.
  continue;
 end if;
 if jsonb_array_length(q->'figures') < 1 or jsonb_array_length(q->'figures') > 10 then raise exception 'Missing source artwork'; end if;
 insert into public.questions(paper_id,number,type,marks,body_md,validation_state)
 values(pid,(q->>'number')::smallint,q->>'type',(q->>'marks')::smallint,q->>'body_md','in_review') returning id into qid;
 if q->>'type'<>'NAT' then
  insert into public.question_options(question_id,option_id,body_md) select qid,x,'See option '||x||' in the original question above.' from unnest(array['A','B','C','D']) x;
 end if;
 n:=0;
 for f in select value from jsonb_array_elements(q->'figures') loop
  n:=n+1;
  insert into private.question_figures(question_id,ordinal,source_page,sha256,png_base64) values(qid,n,(f->>'source_page')::int,f->>'sha256',f->>'png_base64');
 end loop;
 insert into private.question_provenance(question_id,source_file_id,source_question_number,source_page)
 values(qid,sid,coalesce(q->>'source_number',q->>'number')::smallint,(q->'figures'->0->>'source_page')::int);
 k:=q->'key';
 if q->>'hold' is null then
  insert into private.answer_keys(question_id,question_type,version,provenance,provenance_verified,mcq_option,msq_options)
  values(qid,q->>'type',1,'official',true,k->>'mcq_option',case when q->>'type'='MSQ' then array(select jsonb_array_elements_text(k->'msq_options')) else null end) returning id into kid;
  n:=0;
  for r in select value from jsonb_array_elements(coalesce(k->'nat_ranges','[]')) loop
   n:=n+1; insert into private.answer_key_nat_ranges(key_id,ordinal,min_value,max_value) values(kid,n,(r->>'min')::numeric,(r->>'max')::numeric);
  end loop;
 end if;
 insert into private.question_validations(question_id,to_state,reviewer,note)
 values(qid,'in_review','Codex source import',jsonb_build_object('key_url',q->>'key_url','key_sha256',q->>'key_sha256','official_answer_raw',q->>'answer_raw','source_section',q->>'section','source_number',coalesce(q->>'source_number',q->>'number'),'hold',q->>'hold','scope','Source artwork and official master key; worked explanation pending')::text);
end loop;
END $import$;
''')
