-- Optional MyPath CRM sample data for local testing and product walkthroughs.
--
-- Run this only after all migrations and after creating the Founder profile.
-- It is safe to run again: the two leads use stable IDs and existing rows are
-- left unchanged. Run the entire file from the Supabase SQL editor as the
-- postgres role.

begin;

-- Fail before inserting anything when the contextual stage-history migration
-- has not been applied. The seed depends on both these columns and the stage
-- movement function used by the application.
do $$
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_history'
      and column_name in (
        'description',
        'follow_up_required',
        'follow_up_date'
      )
  ) <> 3
    or to_regprocedure(
      'public.move_lead_with_context(uuid,public.pipeline_stage,numeric,text,boolean,date)'
    ) is null then
    raise exception using
      errcode = '55000',
      message = 'Database schema is not ready for sample data.',
      hint = 'Run migrations 7 and 8 in full, then rerun supabase/seed.sql.';
  end if;
  if to_regclass('public.crm_tasks') is null then
    raise exception using
      errcode = '55000',
      message = 'Database schema is not ready for team-operation samples.',
      hint = 'Run supabase/migrations/202608030008_team_operations.sql in full, then rerun supabase/seed.sql.';
  end if;
end;
$$;

do $$
declare
  v_founder_id uuid;
  v_lead_generator_id uuid;
  v_northstar_inserted integer := 0;
  v_brightpath_inserted integer := 0;
begin
  select profile.id
  into v_founder_id
  from public.profiles profile
  where profile.role = 'founder'
  order by profile.created_at
  limit 1;

  if v_founder_id is null then
    raise exception using
      message = 'Sample data requires a Founder profile. Create the users and assign the founder role first.';
  end if;

  select profile.id
  into v_lead_generator_id
  from public.profiles profile
  where profile.role = 'lead_generator'
  order by profile.created_at
  limit 1;

  -- A one-user development project can still load the samples. If a Lead
  -- Generator is later added, rerun after deleting the samples if their creator
  -- attribution is wanted.
  v_lead_generator_id := coalesce(v_lead_generator_id, v_founder_id);

  insert into public.leads (
    id,
    company_name,
    website,
    country,
    region,
    customer_segment,
    company_size,
    education_offering,
    current_lms_or_tools,
    contact_name,
    job_title,
    email,
    contact_phone,
    linkedin_url,
    decision_maker_status,
    main_pain_point,
    reason_mypath_is_relevant,
    current_alternative,
    budget_indicator,
    qualification_score,
    priority,
    source,
    owner_id,
    created_by,
    current_pipeline_stage,
    lifecycle_status,
    date_added,
    first_contacted_at,
    last_contacted_at,
    next_action,
    next_action_date,
    demo_date,
    proposed_value,
    expected_close_date,
    lost_reason,
    notes,
    created_at,
    updated_at
  ) values (
    '10000000-0000-4000-8000-000000000001',
    'Northstar Learning Group',
    'https://northstar-learning.example',
    'United States',
    'California',
    'Higher education',
    '201-500',
    'Online professional certificates',
    'Moodle and spreadsheets',
    'Maya Chen',
    'Director of Digital Learning',
    'maya.chen@northstar-learning.example',
    '+14155550136',
    'https://www.linkedin.com/in/maya-chen-sample',
    'Influencer with direct access to the budget owner',
    'Learner progress is fragmented across courses and difficult to report.',
    'MyPath can combine pathways, progress evidence, and employer-ready outcomes.',
    'Moodle reports plus manual spreadsheets',
    'Budget is available for a focused paid pilot this quarter.',
    84,
    'high',
    'linkedin',
    v_founder_id,
    v_lead_generator_id,
    'replied',
    'active',
    current_date - 24,
    now() - interval '18 days',
    now() - interval '12 days',
    'Schedule an initial discussion with Maya and the programme owner',
    current_date + 2,
    null,
    18000,
    current_date + 45,
    null,
    'Sample lead. Maya replied positively and asked for a concise overview before arranging a stakeholder call.',
    now() - interval '24 days',
    now() - interval '12 days'
  )
  on conflict (id) do nothing;

  get diagnostics v_northstar_inserted = row_count;

  if v_northstar_inserted = 1 then
    -- Replace the automatic initial record with a realistic, complete journey.
    delete from public.stage_history
    where lead_id = '10000000-0000-4000-8000-000000000001';

    insert into public.stage_history (
      id,
      lead_id,
      previous_stage,
      new_stage,
      changed_by,
      changed_at,
      description,
      follow_up_required,
      follow_up_date
    ) values
      (
        '11000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        null,
        'lead_added',
        v_lead_generator_id,
        now() - interval '24 days',
        'The Lead Generator found the organisation while researching higher-education providers expanding online programmes.',
        false,
        null
      ),
      (
        '11000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        'lead_added',
        'qualified',
        v_lead_generator_id,
        now() - interval '22 days',
        'The organisation matches the target segment, has an active pathway-reporting problem, and named a relevant contact.',
        false,
        null
      ),
      (
        '11000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        'qualified',
        'contacted',
        v_founder_id,
        now() - interval '18 days',
        'Noor sent a personalised LinkedIn message focused on fragmented learner-progress reporting.',
        false,
        null
      ),
      (
        '11000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001',
        'contacted',
        'replied',
        v_founder_id,
        now() - interval '12 days',
        'Maya requested a short overview and offered to include the programme owner in an initial discussion.',
        true,
        current_date + 2
      );

    insert into public.lead_activities (
      id,
      lead_id,
      activity_type,
      activity_date,
      summary,
      notes,
      created_by,
      created_at
    ) values
      (
        '21000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'linkedin',
        now() - interval '18 days',
        'Sent personalised LinkedIn outreach',
        'Opened with the reporting pain and asked whether learner pathways are a 2026 priority.',
        v_founder_id,
        now() - interval '18 days'
      ),
      (
        '21000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000001',
        'email',
        now() - interval '12 days',
        'Received a positive reply from Maya',
        'Maya asked for a one-page overview before booking a discussion with the programme owner.',
        v_founder_id,
        now() - interval '12 days'
      );
  end if;

  insert into public.leads (
    id,
    company_name,
    website,
    country,
    region,
    customer_segment,
    company_size,
    education_offering,
    current_lms_or_tools,
    contact_name,
    job_title,
    email,
    contact_phone,
    linkedin_url,
    decision_maker_status,
    main_pain_point,
    reason_mypath_is_relevant,
    current_alternative,
    budget_indicator,
    qualification_score,
    priority,
    source,
    owner_id,
    created_by,
    current_pipeline_stage,
    lifecycle_status,
    date_added,
    first_contacted_at,
    last_contacted_at,
    next_action,
    next_action_date,
    demo_date,
    proposed_value,
    expected_close_date,
    lost_reason,
    notes,
    created_at,
    updated_at
  ) values (
    '10000000-0000-4000-8000-000000000002',
    'BrightPath Academy Network',
    'https://brightpath-academy.example',
    'United Kingdom',
    'London',
    'K-12 school network',
    '501-1000',
    'Blended secondary education and career readiness',
    'Google Classroom, Careers Hub, and spreadsheets',
    'Oliver Grant',
    'Head of Careers and Progression',
    'oliver.grant@brightpath-academy.example',
    '+442079460018',
    'https://www.linkedin.com/in/oliver-grant-sample',
    'Evaluation lead and member of the purchasing committee',
    'Schools cannot consistently show how learner activities connect to progression outcomes.',
    'MyPath can give each school a shared pathway framework while preserving local delivery.',
    'Separate careers platform and manual evidence folders',
    'The network has indicated a paid-pilot budget, subject to demo approval.',
    91,
    'high',
    'referral',
    v_founder_id,
    v_founder_id,
    'demo_booked',
    'active',
    current_date - 50,
    now() - interval '43 days',
    now() - interval '17 days',
    'Run the tailored demo and confirm paid-pilot success criteria',
    current_date + 3,
    date_trunc('day', now()) + interval '3 days 10 hours',
    32000,
    current_date + 60,
    null,
    'Sample lead. Discovery is complete, the demo audience is confirmed, and the next decision depends on agreed pilot outcomes.',
    now() - interval '50 days',
    now() - interval '5 days'
  )
  on conflict (id) do nothing;

  get diagnostics v_brightpath_inserted = row_count;

  if v_brightpath_inserted = 1 then
    delete from public.stage_history
    where lead_id = '10000000-0000-4000-8000-000000000002';

    insert into public.stage_history (
      id,
      lead_id,
      previous_stage,
      new_stage,
      changed_by,
      changed_at,
      description,
      follow_up_required,
      follow_up_date
    ) values
      (
        '12000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        null,
        'lead_added',
        v_founder_id,
        now() - interval '50 days',
        'An existing education partner referred the BrightPath careers team after a sector roundtable.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        'lead_added',
        'qualified',
        v_founder_id,
        now() - interval '47 days',
        'Confirmed a multi-school use case, an accountable progression lead, and a measurable reporting problem.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000002',
        'qualified',
        'contacted',
        v_founder_id,
        now() - interval '43 days',
        'Sent a referral-led introduction with examples relevant to network-wide pathway reporting.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000002',
        'contacted',
        'replied',
        v_founder_id,
        now() - interval '39 days',
        'Oliver confirmed the reporting issue and invited Noor to an exploratory discussion.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000002',
        'replied',
        'initial_discussion',
        v_founder_id,
        now() - interval '34 days',
        'Discussed school-level variation, central reporting needs, stakeholders, and a possible pilot cohort.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000006',
        '10000000-0000-4000-8000-000000000002',
        'initial_discussion',
        'follow_up_required',
        v_founder_id,
        now() - interval '29 days',
        'Send the discovery agenda and confirm which school leaders should attend.',
        true,
        current_date - 27
      ),
      (
        '12000000-0000-4000-8000-000000000007',
        '10000000-0000-4000-8000-000000000002',
        'follow_up_required',
        'discovery_call_booked',
        v_founder_id,
        now() - interval '25 days',
        'Oliver confirmed the discovery call with careers, curriculum, and operations stakeholders.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000008',
        '10000000-0000-4000-8000-000000000002',
        'discovery_call_booked',
        'discovery_call_completed',
        v_founder_id,
        now() - interval '17 days',
        'Discovery established success measures: adoption, pathway completion, and consistent network reporting.',
        false,
        null
      ),
      (
        '12000000-0000-4000-8000-000000000009',
        '10000000-0000-4000-8000-000000000002',
        'discovery_call_completed',
        'demo_booked',
        v_founder_id,
        now() - interval '5 days',
        'Booked a tailored demo for the purchasing group using the agreed pilot success measures.',
        true,
        current_date + 3
      );

    insert into public.lead_activities (
      id,
      lead_id,
      activity_type,
      activity_date,
      summary,
      notes,
      created_by,
      created_at
    ) values
      (
        '22000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000002',
        'meeting',
        now() - interval '34 days',
        'Completed initial stakeholder discussion',
        'Captured the central reporting problem, initial stakeholder map, and possible paid-pilot scope.',
        v_founder_id,
        now() - interval '34 days'
      ),
      (
        '22000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        'call',
        now() - interval '17 days',
        'Completed structured discovery call',
        'Agreed the operational problem, decision process, implementation constraints, and pilot success measures.',
        v_founder_id,
        now() - interval '17 days'
      ),
      (
        '22000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000002',
        'demo',
        now() - interval '5 days',
        'Tailored product demo booked',
        'Demo will focus on learner pathways, progress evidence, and network-level reporting.',
        v_founder_id,
        now() - interval '5 days'
      );
  end if;

  insert into public.crm_tasks (
    id,
    title,
    description,
    task_type,
    lead_id,
    assigned_to,
    assigned_by,
    priority,
    status,
    due_date
  ) values
    (
      '31000000-0000-4000-8000-000000000001',
      'Enrich Northstar stakeholder details',
      'Confirm Maya’s direct number, decision role, and the programme owner who should join the initial discussion.',
      'data_enrichment',
      '10000000-0000-4000-8000-000000000001',
      v_lead_generator_id,
      v_founder_id,
      'high',
      'todo',
      current_date + 1
    ),
    (
      '31000000-0000-4000-8000-000000000002',
      'Research five UK academy networks',
      'Add companies that match the K-12 target segment and record a source, country, website, and relevant contact where available.',
      'research',
      null,
      v_lead_generator_id,
      v_founder_id,
      'medium',
      'in_progress',
      current_date + 4
    )
  on conflict (id) do nothing;

  raise notice 'Sample leads ready. Inserted Northstar: %, inserted BrightPath: %',
    v_northstar_inserted = 1,
    v_brightpath_inserted = 1;
end;
$$;

commit;
