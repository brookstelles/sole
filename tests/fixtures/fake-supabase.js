// A stand-in for the Supabase client, enough for the website's sign-in, book and Square tables. Made-up data only.
window.__SOLE_CLOUD_CLIENT = (() => {
  const seed = window.__FAKE_DB || {};
  // __FAKE_KEEP: the data and who is signed in last across a reload (as the real server and browser would), for tests that reload
  const KEEP = window.__FAKE_KEEP, kept = (() => { try { return KEEP ? JSON.parse(sessionStorage.getItem('__fake_T') || 'null') : null; } catch (_) { return null; } })();
  const T = kept || {businesses:seed.businesses || [{id:'B1', name:'Test business', profile:'massage'}], items:seed.items || [], square_payments:seed.payments || [], square_customers:seed.customers || [], form_links:seed.form_links || [],
    members:seed.members, invite_codes:seed.invite_codes || []};
  const KEYS = {items:['business_id', 'col', 'id'], square_payments:['business_id', 'id'], square_customers:['business_id', 'id'], form_links:['token']};
  let session = KEEP ? JSON.parse(sessionStorage.getItem('__fake_s') || 'null') : null; const subs = [];
  if (KEEP) addEventListener('beforeunload', () => { sessionStorage.setItem('__fake_T', JSON.stringify(T)); sessionStorage.setItem('__fake_s', JSON.stringify(session)); });
  window.__FAKE = {T, emit:(table, ev) => subs.filter(s => s.table === table).forEach(s => s.cb(ev)), invoked:[]};
  const query = table => {
    const filters = []; let mode = 'select', rows = null, one = false, lim = null, rng = null;
    const run = () => {
      let L = T[table].filter(r => filters.every(f => f(r)));
      // members only see their own business (row level security), when the test says who the members are
      if (table === 'businesses' && T.members) L = L.filter(b => session && T.members.some(m => m.business_id === b.id && m.email === session.user.email));
      if (mode === 'insert') { (Array.isArray(rows) ? rows : [rows]).forEach(row => T[table].push(JSON.parse(JSON.stringify(row)))); return {data:null, error:null}; }
      if (mode === 'upsert') { (Array.isArray(rows) ? rows : [rows]).forEach(row => { const k = KEYS[table], i = T[table].findIndex(r => k.every(x => r[x] === row[x])); if (i >= 0) T[table][i] = {...T[table][i], ...row}; else T[table].push(row); }); return {data:null, error:null}; }
      if (mode === 'delete') { T[table] = T[table].filter(r => !filters.every(f => f(r))); return {data:null, error:null}; }
      if (rng) L = L.slice(rng[0], rng[1] + 1); if (lim) L = L.slice(0, lim);
      L = JSON.parse(JSON.stringify(L));
      return {data:one ? (L[0] || null) : L, error:null};
    };
    const api = {select:() => api, order:() => api, eq:(k, v) => { filters.push(r => r[k] === v); return api; }, limit:n => { lim = n; return api; }, range:(a, b) => { rng = [a, b]; return api; },
      in:(k, vs) => { filters.push(r => vs.includes(r[k])); return api; }, maybeSingle:() => { one = true; return api; }, upsert:r => { mode = 'upsert'; rows = r; if (Array.isArray(r)) (window.__FAKE.batches = window.__FAKE.batches || []).push(r.length); return api; }, insert:r => { mode = 'insert'; rows = r; return api; }, is:(k, v) => { filters.push(r => (r[k] ?? null) === v); return api; }, delete:() => { mode = 'delete'; return api; },
      then:(ok, no) => Promise.resolve(run()).then(ok, no)};
    return api;
  };
  // the signup Edge Function: an invite code, then a new business and its owner (see supabase/functions/signup)
  const signup = ({action, code, profile, trade}) => {
    const em = session && session.user.email; if (!em) return {data:{error:'sign in first'}};
    if ((T.members || []).some(m => m.email === em)) return {data:{error:'already'}};
    const inv = T.invite_codes.find(x => x.code === String(code || '').trim().toUpperCase() && x.uses < x.max_uses);
    if (action === 'check') return {data:inv ? {ok:true} : {error:'bad code'}};
    if (!inv || !profile || !profile.biz || JSON.stringify(profile).includes('<')) return {data:{error:inv ? 'bad profile' : 'bad code'}};
    inv.uses++; const id = 'B' + (T.businesses.length + 1);
    T.businesses.push({id, name:profile.biz, profile:trade, data:{...profile, real:true, fresh:true, custom:true}});
    (T.members = T.members || []).push({business_id:id, email:em, role:'owner'});
    return {data:{ok:true, business_id:id}};
  };
  // the intake Edge Function: a client filling in a texted form (see supabase/functions/intake)
  const intake = ({token, action, answers, sig, biz}) => {
    if (action === 'open-new' || action === 'submit-new') {   // a new client from the business's website
      const b = T.businesses.find(x => x.data && x.data.site && x.data.site.slug === biz); if (!b) return {data:{error:'gone'}};
      const p = b.data, form = (p.forms || []).find(f => f.intake);
      if (action === 'open-new') return {data:{pub:{biz:p.biz, owner:p.owner, look:p.look, firstVisit:p.firstVisit}, form:{name:form.name, fields:form.fields, sections:form.sections, intake:true}, name:''}};
      if (!answers.name || String(answers.phone || '').replace(/\D/g, '').length < 10 || answers.consent !== true || !sig) return {data:{error:'incomplete'}};
      const id = 'w' + Date.now().toString(36), row = {business_id:b.id, col:'forms', id, data:{id, form:form.name, client:null, name:answers.name, date:new Date().toISOString().slice(0, 10), at:new Date().toISOString(), answers, sig, via:'website'}};
      T.items.push(row); window.__FAKE.sent = row; return {data:{ok:true}};
    }
    const link = T.form_links.find(l => l.token === token); if (!link) return {data:{error:'gone'}};
    if (link.used_at) return {data:{error:'used', name:(link.name || '').split(' ')[0]}};
    const p = (T.businesses.find(b => b.id === link.business_id) || {}).data || {}, form = (p.forms || []).find(f => f.name === link.form) || (p.forms || []).find(f => f.intake);
    if (action === 'open') return {data:{pub:{biz:p.biz, owner:p.owner, look:p.look, firstVisit:p.firstVisit}, form:{name:form.name, fields:form.fields, sections:form.sections, intake:!!form.intake}, name:link.name || ''}};
    const id = 'rL' + Date.now().toString(36), row = {business_id:link.business_id, col:'forms', id, data:{id, form:form.name, client:link.client, name:answers.name, date:new Date().toISOString().slice(0, 10), at:new Date().toISOString(), answers, sig, via:'link'}};
    link.used_at = new Date().toISOString(); T.items.push(row); window.__FAKE.sent = row; return {data:{ok:true}};
  };
  return {
    auth:{getSession:async () => ({data:{session}}), getUser:async () => ({data:{user:session && session.user}}),
      signInWithOtp:async ({email}) => { window.__FAKE.email = email; return {error:null}; },
      verifyOtp:async ({email, token}) => token === '123456' ? (session = {user:{email}}, {error:null}) : {error:{message:'bad code'}},
      // passkeys (Face ID): the registered one is remembered in this browser across reloads, as the real server would
      passkey:{
        startAuthentication:async () => ({data:{challenge_id:'ca', options:{challenge:'AAAA', rpId:window.__FAKE_RP || location.hostname, userVerification:'required', timeout:60000}}, error:null}),
        verifyAuthentication:async ({challengeId, credential}) => { const who = localStorage.getItem('__fake_pk');
          return challengeId === 'ca' && credential && credential.id === 'fake-pk' && who ? (session = {user:{email:who}}, {data:{session}, error:null}) : {data:null, error:{code:'webauthn_credential_not_found'}}; },
        startRegistration:async () => session ? {data:{challenge_id:'cr', options:{challenge:'AAAA', rp:{name:'Sole', id:window.__FAKE_RP || location.hostname}, user:{id:'AAAA', name:session.user.email, displayName:session.user.email}, pubKeyCredParams:[{type:'public-key', alg:-7}]}}, error:null} : {data:null, error:{message:'not signed in'}},
        verifyRegistration:async ({challengeId, credential}) => challengeId === 'cr' && credential && credential.id === 'fake-pk' ? (localStorage.setItem('__fake_pk', session.user.email), {data:{id:'p1'}, error:null}) : {data:null, error:{code:'webauthn_verification_failed'}}}},
    from:query,
    channel:() => { const ch = {on:(type, opts, cb) => { subs.push({table:opts.table, cb}); return ch; }, subscribe:() => ch}; return ch; },
    storage:{from:() => ({upload:async () => ({error:null}), createSignedUrl:async () => ({data:{signedUrl:'data:,'}})})},
    functions:{invoke:async (name, o) => { window.__FAKE.invoked.push(o.body); return name === 'intake' ? intake(o.body) : name === 'signup' ? signup(o.body) : name === 'push' ? {data:o.body.action === 'key' ? {key:'BFAKEFAKEFAKE'} : {ok:true}} : {data:{payments:0, customers:0}}; }},
  };
})();
