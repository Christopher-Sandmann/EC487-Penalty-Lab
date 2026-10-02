/** Public settings only. Do not add server-side credentials to this module. */
export function publicConfig(env={},file={},modeOverride,allowUnconfigured=false){
 const config={mode:modeOverride||env.PENALTY_MODE||file.mode||'practice',
  supabaseUrl:env.PENALTY_SUPABASE_URL||file.supabaseUrl||'',
  supabaseKey:env.PENALTY_SUPABASE_PUBLISHABLE_KEY||file.supabaseKey||'',
  turnstileSiteKey:env.PENALTY_TURNSTILE_SITE_KEY||file.turnstileSiteKey||'',
  defaultRoom:env.PENALTY_DEFAULT_ROOM||file.defaultRoom||'EC487'};
 if(!['practice','local','supabase'].includes(config.mode))throw new Error('PENALTY_MODE must be supabase, local or practice.');
 if(!/^[A-Z0-9]{4,8}$/.test(config.defaultRoom))throw new Error('Default room must have 4–8 uppercase letters or digits.');
 if(config.mode!=='supabase')return {...config,supabaseUrl:'',supabaseKey:'',turnstileSiteKey:''};
 const key=config.supabaseKey;
 if(key.startsWith('sb_secret_'))throw new Error('Never put a Supabase secret key into the frontend. Use the publishable key.');
 if(key){
  if(key.split('.').length===3){let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{throw new Error('Malformed legacy client key.');}
   if(payload.role!=='anon')throw new Error('Only a publishable key or a legacy anon key belongs in the frontend; service-role keys are forbidden.');
  }else if(!key.startsWith('sb_publishable_'))throw new Error('Expected a Supabase publishable key, not a password, token or secret key.');
 }
 if(config.supabaseUrl){const u=new URL(config.supabaseUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw new Error('Use the HTTPS Supabase project origin, without credentials, paths or query parameters.');config.supabaseUrl=u.origin;}
 if(!allowUnconfigured&&(!config.supabaseUrl||!key))throw new Error('Live deployment needs PENALTY_SUPABASE_URL and PENALTY_SUPABASE_PUBLISHABLE_KEY. Add them in GitHub Settings → Secrets and variables → Actions → Variables, or edit site-config.json. No practice fallback is deployed.');
 return config;
}
