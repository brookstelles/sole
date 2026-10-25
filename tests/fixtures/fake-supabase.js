// A stand-in for the Supabase client, enough for the website's sign-in, book and Square tables. Made-up data only.
window.__SOLE_CLOUD_CLIENT = (() => {
  const seed = window.__FAKE_DB || {};
  const T = {businesses:seed.businesses || [{id:'B1', name:'Test business', profile:'massage'}], items:seed.items || [], square_payments:seed.payments || [], square_customers:seed.customers || []};
  const KEYS = {items:['business_id', 'col', 'id'], square_payments:['business_id', 'id'], square_customers:['business_id', 'id']};
  let session = null; const subs = [];
  window.__FAKE = {T, emit:(table, ev) => subs.filter(s => s.table === table).forEach(s => s.cb(ev)), invoked:[]};
  const query = table => {
    const filters = []; let mode = 'select', rows = null, one = false, lim = null, rng = null;
    const run = () => {
      let L = T[table].filter(r => filters.every(f => f(r)));
      if (mode === 'upsert') { (Array.isArray(rows) ? rows : [rows]).forEach(row => { const k = KEYS[table], i = T[table].findIndex(r => k.every(x => r[x] === row[x])); if (i >= 0) T[table][i] = {...T[table][i], ...row}; else T[table].push(row); }); return {data:null, error:null}; }
      if (mode === 'delete') { T[table] = T[table].filter(r => !filters.every(f => f(r))); return {data:null, error:null}; }
      if (rng) L = L.slice(rng[0], rng[1] + 1); if (lim) L = L.slice(0, lim);
      L = JSON.parse(JSON.stringify(L));
      return {data:one ? (L[0] || null) : L, error:null};
    };
    const api = {select:() => api, order:() => api, eq:(k, v) => { filters.push(r => r[k] === v); return api; }, limit:n => { lim = n; return api; }, range:(a, b) => { rng = [a, b]; return api; },
      maybeSingle:() => { one = true; return api; }, upsert:r => { mode = 'upsert'; rows = r; return api; }, delete:() => { mode = 'delete'; return api; },
      then:(ok, no) => Promise.resolve(run()).then(ok, no)};
    return api;
  };
  return {
    auth:{getSession:async () => ({data:{session}}), getUser:async () => ({data:{user:session && session.user}}),
      signInWithOtp:async ({email}) => { window.__FAKE.email = email; return {error:null}; },
      verifyOtp:async ({email, token}) => token === '123456' ? (session = {user:{email}}, {error:null}) : {error:{message:'bad code'}}},
    from:query,
    channel:() => { const ch = {on:(type, opts, cb) => { subs.push({table:opts.table, cb}); return ch; }, subscribe:() => ch}; return ch; },
    storage:{from:() => ({upload:async () => ({error:null}), createSignedUrl:async () => ({data:{signedUrl:'data:,'}})})},
    functions:{invoke:async (name, o) => { window.__FAKE.invoked.push(o.body); return {data:{payments:0, customers:0}}; }},
  };
})();
