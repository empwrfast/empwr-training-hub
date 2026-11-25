// EMPWR shared sign-in (email code). Load after supabase-js, before the page script.
//   <script src="auth.js" data-mode="staff"></script>   iPad, Coach Board, TV: signed in once with the EMPWR device email
//   <script src="auth.js" data-mode="member"></script>  member portal: the page calls EMPWR.start()
(function () {
  const URL = 'https://utljgnuieyjdqclfiwqz.supabase.co';
  const KEY = 'sb_publishable_2nvvJMGijP5Q2OKHZMphEg_fVhCMeW3';
  const mode = (document.currentScript && document.currentScript.dataset.mode) || 'staff';
  const sb = supabase.createClient(URL, KEY, { db: { schema: 'sgpt' }, auth: { persistSession: true, autoRefreshToken: true } });

  const css = `
  #ea{position:fixed;inset:0;z-index:9999;background:#12161F;color:#fff;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Montserrat,sans-serif}
  #ea .bx{width:100%;max-width:420px;text-align:center}
  #ea img{height:56px;margin:0 auto 26px;display:block}
  #ea h1{font-family:'Bebas Neue';font-size:42px;letter-spacing:.04em;line-height:1;margin:0}
  #ea h2{font-family:'Mr Dafoe';font-weight:400;font-size:34px;margin:2px 0 18px;color:#EB5345}
  #ea p{font-size:14px;line-height:1.45;opacity:.8;margin:0 0 14px}
  #ea input{font:600 18px Montserrat,sans-serif;width:100%;padding:14px;border-radius:10px;border:1px solid #2C3446;background:#1C2230;color:#fff;text-align:center;box-sizing:border-box}
  #ea input.code{font-family:'Bebas Neue';font-size:40px;letter-spacing:.35em}
  #ea button{font-family:'Bebas Neue';font-size:24px;letter-spacing:.05em;width:100%;padding:13px;border:0;border-radius:10px;background:#EB5345;color:#fff;cursor:pointer;margin-top:12px}
  #ea button.ln{background:none;font:600 13px Montserrat,sans-serif;text-decoration:underline;opacity:.7;margin-top:14px}
  #ea .err{color:#FF8A80;font-size:13px;min-height:18px;margin-top:10px}
  #ea .hidden{display:none}`;

  function overlay(title, sub, note) {
    if (!document.getElementById('ea-css')) { const s = document.createElement('style'); s.id = 'ea-css'; s.textContent = css; document.head.appendChild(s); }
    let o = document.getElementById('ea'); if (o) o.remove();
    o = document.createElement('div'); o.id = 'ea';
    o.innerHTML = `<div class="bx"><img src="empwr-logo-en-tag-white.svg" alt="EMPWR Fitness and Sports Training">
      <h1>${title}</h1><h2>${sub}</h2><p id="ea-note">${note}</p>
      <div id="ea-s1"><input id="ea-email" type="email" inputmode="email" autocomplete="email" placeholder="Your email">
        <button id="ea-send">Send My Code</button></div>
      <div id="ea-s2" class="hidden"><input id="ea-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······">
        <button id="ea-go">Sign In</button><button class="ln" id="ea-back">Use a different email</button></div>
      <div class="err" id="ea-err"></div></div>`;
    document.body.appendChild(o);
    return o;
  }
  const $ = id => document.getElementById(id);

  function signInFlow(title, sub, note) {
    return new Promise(resolve => {
      overlay(title, sub, note);
      let email = '';
      const err = t => $('ea-err').textContent = t || '';
      $('ea-send').onclick = async () => {
        email = $('ea-email').value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return err('Enter your email.');
        $('ea-send').disabled = true; err('');
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        $('ea-send').disabled = false;
        if (error) return err(/rate|seconds/i.test(error.message) ? 'Hang on a minute, then try again.' : 'Could not send the code. Try again.');
        $('ea-note').textContent = `Check ${email} for a 6-digit code.`;
        $('ea-s1').classList.add('hidden'); $('ea-s2').classList.remove('hidden'); $('ea-code').focus();
      };
      $('ea-email').onkeydown = e => { if (e.key === 'Enter') $('ea-send').click(); };
      $('ea-back').onclick = () => { $('ea-s2').classList.add('hidden'); $('ea-s1').classList.remove('hidden'); $('ea-note').textContent = note; err(''); };
      $('ea-code').oninput = e => { e.target.value = e.target.value.replace(/\D/g, ''); if (e.target.value.length === 6) $('ea-go').click(); };
      $('ea-go').onclick = async () => {
        const token = $('ea-code').value.trim();
        if (token.length !== 6) return err('Enter the 6 digits.');
        $('ea-go').disabled = true; err('');
        const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        $('ea-go').disabled = false;
        if (error) return err('That code did not work. Check it or send a new one.');
        resolve();
      };
    });
  }

  async function whoami() {
    const { data, error } = await sb.rpc('whoami');
    if (error) return { staff: false, member: null, error };
    return data || { staff: false, member: null };
  }

  async function signOut() { await sb.auth.signOut(); location.reload(); }

  // Gym devices: show the page if this device is signed in as staff, otherwise ask once.
  // If the database login step has not been run yet, the page keeps working exactly as before.
  async function staffGate() {
    const w = await whoami();
    if (w.error) return;
    if (w.staff) return;
    let note = 'Sign this device in with the EMPWR device email. It stays signed in after this.';
    if (w.member) { await sb.auth.signOut(); note = 'This device needs the EMPWR device email, not a member login.'; }
    for (;;) {
      await signInFlow('EMPWR Device Sign-In', 'One Time Only', note);
      const again = await whoami();
      if (again.staff) return location.reload();
      await sb.auth.signOut();
      note = 'That email is not on the EMPWR staff list. Use the gym device email.';
    }
  }

  // Member portal: resolves with { member } or { staff } once signed in.
  async function memberStart() {
    for (;;) {
      const { data } = await sb.auth.getSession();
      if (!data.session) await signInFlow('My EMPWR', 'Your Progress', 'Current members only. Enter the email you use with EMPWR and we\'ll send you a code.');
      const w = await whoami();
      if (w.member || w.staff) { const o = $('ea'); if (o) o.remove(); return w; }
      await sb.auth.signOut();
      await new Promise(res => {
        overlay('My EMPWR', 'Members Only', 'This email is not on a current EMPWR membership. If you think that\'s wrong, message us at 438-796-3233 and we\'ll sort it out.');
        $('ea-s1').innerHTML = '<button id="ea-retry">Try Another Email</button>';
        $('ea-retry').onclick = res;
      });
    }
  }

  window.EMPWR = { sb, whoami, signOut, start: memberStart };
  if (mode === 'staff') staffGate();
})();
