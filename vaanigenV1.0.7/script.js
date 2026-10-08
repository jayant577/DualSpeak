(function(){
  var synth = window.speechSynthesis;
  var textEl = document.getElementById('text');
  var readingEl = document.getElementById('reading');
  var voiceSel = document.getElementById('voice');
  var playBtn = document.getElementById('playBtn');
  var stopBtn = document.getElementById('stopBtn');
  var statusEl = document.getElementById('status');
  var fillEl = document.getElementById('fill');
  var voiceHint = document.getElementById('voiceHint');

  var lang = 'en';
  var rate = 1;
  var voices = [];
  var words = [];
  var keepAlive = null;
  var fallbackTimer = null;
  var fallbackIndex = -1;
  var boundaryFired = false;

  if(!synth){
    statusEl.textContent = 'Speech not supported in this browser';
    playBtn.disabled = true;
  }

  function loadVoices(){
    voices = synth ? synth.getVoices() : [];
    fillVoiceList();
  }
  if(synth) synth.onvoiceschanged = loadVoices;
  loadVoices();

  function fillVoiceList(){
    voiceSel.innerHTML = '';
    var prefix = lang === 'en' ? 'en' : 'mr';
    var matches = voices.filter(function(v){ return v.lang.toLowerCase().indexOf(prefix) === 0; });
    if(matches.length === 0){
      var opt = document.createElement('option');
      opt.textContent = 'Device default';
      voiceSel.appendChild(opt);
      voiceHint.textContent = lang === 'mr'
        ? "No Marathi voice on this device yet — it'll fall back to the system default. Add a Marathi voice in your browser or OS settings for clearer pronunciation."
        : '';
    } else {
      matches.forEach(function(v){
        var opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name + ' (' + v.lang + ')';
        voiceSel.appendChild(opt);
      });
      voiceHint.textContent = '';
    }
  }

  document.querySelectorAll('#langSeg button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#langSeg button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      lang = btn.dataset.lang;
      textEl.lang = lang;
      fillVoiceList();
    });
  });

  document.querySelectorAll('#speedSeg button').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#speedSeg button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      rate = parseFloat(btn.dataset.rate);
    });
  });

  function buildReadingView(text){
    readingEl.innerHTML = '';
    words = [];
    var re = /\S+/g, m, last = 0;
    var frag = document.createDocumentFragment();
    while((m = re.exec(text))){
      if(m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = m[0];
      frag.appendChild(span);
      words.push({start:m.index, end:m.index+m[0].length, el:span});
      last = m.index + m[0].length;
    }
    if(last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    readingEl.appendChild(frag);
  }

  function clearHighlight(){ words.forEach(function(w){ w.el.classList.remove('active'); }); }

  function highlightAt(idx){
    clearHighlight();
    for(var i=0;i<words.length;i++){
      if(idx >= words[i].start && idx < words[i].end){
        words[i].el.classList.add('active');
        words[i].el.scrollIntoView({block:'center', behavior:'smooth'});
        break;
      }
    }
  }

  function resetControls(){
    playBtn.textContent = 'Play';
    playBtn.disabled = false;
    stopBtn.disabled = true;
    clearInterval(keepAlive);
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }

  function stepFallback(){
    fallbackIndex++;
    if(fallbackIndex >= words.length){ clearInterval(fallbackTimer); fallbackTimer = null; return; }
    clearHighlight();
    words[fallbackIndex].el.classList.add('active');
    words[fallbackIndex].el.scrollIntoView({block:'center', behavior:'smooth'});
    fillEl.style.width = Math.min(100, ((fallbackIndex + 1) / words.length) * 100) + '%';
  }

  function startSpeaking(){
    var text = textEl.value.trim();
    if(!text) return;
    synth.cancel();
    buildReadingView(text);
    if(currentUser) addHistory(currentUser, {ts:Date.now(), text:text, lang:lang, rate:rate});
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    utter.lang = lang === 'en' ? 'en-US' : 'mr-IN';
    var chosen = voices.find(function(v){ return v.name === voiceSel.value; });
    if(chosen) utter.voice = chosen;

    boundaryFired = false;
    fallbackIndex = -1;
    utter.onboundary = function(e){
      boundaryFired = true;
      if(fallbackTimer){ clearInterval(fallbackTimer); fallbackTimer = null; }
      if(!e.name || e.name === 'word'){
        highlightAt(e.charIndex);
        fillEl.style.width = Math.min(100, (e.charIndex / text.length) * 100) + '%';
      }
    };
    utter.onstart = function(){
      playBtn.textContent = 'Pause';
      stopBtn.disabled = false;
      statusEl.textContent = 'Reading…';
      setTimeout(function(){
        if(!boundaryFired && words.length && !fallbackTimer){
          var msPerWord = Math.max(150, 400 / rate);
          fallbackTimer = setInterval(stepFallback, msPerWord);
        }
      }, 500);
    };
    utter.onend = function(){
      clearHighlight();
      fillEl.style.width = '0%';
      statusEl.textContent = 'Finished';
      resetControls();
    };
    utter.onerror = function(){
      statusEl.textContent = 'Could not read this text';
      resetControls();
    };
    synth.speak(utter);
    keepAlive = setInterval(function(){
      if(synth.speaking && !synth.paused){ synth.pause(); synth.resume(); }
    }, 10000);
  }

  playBtn.addEventListener('click', function(){
    if(!synth.speaking){
      startSpeaking();
    } else if(synth.paused){
      synth.resume();
      playBtn.textContent = 'Pause';
      statusEl.textContent = 'Reading…';
      if(!boundaryFired && words.length && !fallbackTimer){
        var msPerWord = Math.max(150, 400 / rate);
        fallbackTimer = setInterval(stepFallback, msPerWord);
      }
    } else {
      synth.pause();
      playBtn.textContent = 'Resume';
      statusEl.textContent = 'Paused';
      if(fallbackTimer){ clearInterval(fallbackTimer); fallbackTimer = null; }
    }
  });

  stopBtn.addEventListener('click', function(){
    synth.cancel();
    clearHighlight();
    fillEl.style.width = '0%';
    statusEl.textContent = 'Stopped';
    resetControls();
  });

  // ---- Accounts, two-factor & history — stored only in this browser, on this device ----
  var ACCOUNTS_KEY = 'speak_accounts';
  var SESSION_KEY = 'speak_current_user';
  var gate = document.getElementById('gate');
  var app = document.getElementById('app');
  var logoutBtn = document.getElementById('logoutBtn');
  var historyList = document.getElementById('historyList');
  var clearHistoryBtn = document.getElementById('clearHistoryBtn');
  var currentUser = null;
  var pendingLoginUser = null;
  var pendingSignup = null;
  var forgotUser = null;

  // Accounts live in the artifact's shared database when this page is running
  // as a published Claude artifact with database access granted — the same
  // account then works from any device that opens the link. Anywhere else
  // (this site hosted on its own, or no database access this visit) it falls
  // back to this browser's local storage only, exactly as before.
  var remoteDb = null;
  var dbReady = (function(){
    if(typeof window.claude !== 'undefined' && typeof window.claude.use === 'function'){
      return window.claude.use('db').then(function(ns){ remoteDb = ns; }).catch(function(){ remoteDb = null; });
    }
    return Promise.resolve();
  })();
  function accountsCol(){ return remoteDb.collection('accounts'); }
  function getLocalAccounts(){ try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); }catch(e){ return {}; } }
  function saveLocalAccounts(a){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
  function getAccount(username){
    return dbReady.then(function(){
      if(remoteDb){
        return accountsCol().doc(username).get().then(function(snap){ return snap.exists ? snap.data() : null; });
      }
      return getLocalAccounts()[username] || null;
    });
  }
  function setAccount(username, record){
    return dbReady.then(function(){
      if(remoteDb) return accountsCol().doc(username).set(record);
      var all = getLocalAccounts();
      all[username] = record;
      saveLocalAccounts(all);
    });
  }
  function deleteAccount(username){
    return dbReady.then(function(){
      if(remoteDb) return accountsCol().doc(username).delete();
      var all = getLocalAccounts();
      delete all[username];
      saveLocalAccounts(all);
    });
  }
  function encodeAccountExport(username, rec){
    var payload = JSON.stringify({u: username, salt: rec.salt, hash: rec.hash, secret: rec.secret || null});
    return 'VGACC1:' + btoa(unescape(encodeURIComponent(payload)));
  }
  function decodeAccountExport(code){
    code = code.trim();
    if(code.indexOf('VGACC1:') !== 0) return null;
    try{
      var obj = JSON.parse(decodeURIComponent(escape(atob(code.slice(7)))));
      if(!obj.u || !obj.salt || !obj.hash) return null;
      return obj;
    } catch(e){ return null; }
  }
  function bufToHex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0'+b.toString(16)).slice(-2); }).join(''); }
  function randomSalt(){ var arr = new Uint8Array(16); crypto.getRandomValues(arr); return bufToHex(arr.buffer); }
  function hashPassword(password, saltHex){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltHex + ':' + password)).then(bufToHex);
  }

  // ---- Base32 + TOTP (RFC 6238 — HMAC-SHA1, 30s step, 6 digits) ----
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function base32Encode(bytes){
    var bits = '';
    for(var i=0;i<bytes.length;i++) bits += bytes[i].toString(2).padStart(8,'0');
    var out = '';
    for(var i=0;i+5<=bits.length;i+=5) out += B32[parseInt(bits.substr(i,5),2)];
    if(bits.length % 5){ out += B32[parseInt(bits.slice(-(bits.length%5)).padEnd(5,'0'),2)]; }
    return out;
  }
  function base32Decode(str){
    str = str.toUpperCase().replace(/=+$/,'');
    var bits = '';
    for(var i=0;i<str.length;i++){
      var v = B32.indexOf(str[i]);
      if(v < 0) continue;
      bits += v.toString(2).padStart(5,'0');
    }
    var bytes = [];
    for(var i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.substr(i,8),2));
    return new Uint8Array(bytes);
  }
  function generateSecret(){
    var bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    return base32Encode(bytes);
  }
  function counterBytes(counter){
    var buf = new ArrayBuffer(8);
    var view = new DataView(buf);
    view.setUint32(0, Math.floor(counter / 4294967296));
    view.setUint32(4, counter % 4294967296);
    return new Uint8Array(buf);
  }
  function totpAt(secretBase32, offsetSteps){
    var counter = Math.floor(Date.now()/1000/30) + offsetSteps;
    var key = base32Decode(secretBase32);
    return crypto.subtle.importKey('raw', key, {name:'HMAC', hash:'SHA-1'}, false, ['sign'])
      .then(function(cryptoKey){ return crypto.subtle.sign('HMAC', cryptoKey, counterBytes(counter)); })
      .then(function(sig){
        var h = new Uint8Array(sig);
        var offset = h[h.length-1] & 0xf;
        var code = ((h[offset] & 0x7f) << 24 | (h[offset+1] & 0xff) << 16 | (h[offset+2] & 0xff) << 8 | (h[offset+3] & 0xff)) % 1000000;
        return String(code).padStart(6,'0');
      });
  }
  function verifyTotp(secretBase32, code){
    return Promise.all([-1,0,1].map(function(o){ return totpAt(secretBase32, o); }))
      .then(function(codes){ return codes.indexOf(code) !== -1; });
  }
  function otpauthUri(user, secret){
    return 'otpauth://totp/Speak:' + encodeURIComponent(user) + '?secret=' + secret + '&issuer=Speak&digits=6&period=30';
  }

  // ---- Show/hide password ----
  document.querySelectorAll('.eye').forEach(function(btn){
    btn.addEventListener('click', function(){
      var target = document.getElementById(btn.dataset.target);
      target.type = target.type === 'password' ? 'text' : 'password';
      btn.textContent = target.type === 'password' ? '👁' : '🙈';
      btn.setAttribute('aria-label', target.type === 'password' ? 'Show password' : 'Hide password');
    });
  });

  // ---- Step navigation ----
  var gateSteps = document.querySelectorAll('.gate-step');
  function showStep(name){
    gateSteps.forEach(function(s){ s.style.display = s.dataset.step === name ? '' : 'none'; });
    gate.querySelectorAll('.hint.error').forEach(function(e){ e.textContent = ''; });
  }

  function historyKey(user){ return 'speak_history_' + user; }
  function getHistory(user){ try{ return JSON.parse(localStorage.getItem(historyKey(user)) || '[]'); }catch(e){ return []; } }
  function addHistory(user, entry){
    var h = getHistory(user);
    h.unshift(entry);
    if(h.length > 20) h = h.slice(0, 20);
    localStorage.setItem(historyKey(user), JSON.stringify(h));
    if(user === currentUser) renderHistory();
  }
  function renderHistory(){
    var h = currentUser ? getHistory(currentUser) : [];
    historyList.innerHTML = '';
    if(h.length === 0){
      var p = document.createElement('p');
      p.className = 'history-empty';
      p.textContent = "Nothing read yet — it'll show up here once you press play.";
      historyList.appendChild(p);
      return;
    }
    h.forEach(function(item){
      var row = document.createElement('div');
      row.className = 'history-item';
      var snippet = document.createElement('span');
      snippet.className = 'snippet';
      snippet.textContent = item.text.length > 70 ? item.text.slice(0,70) + '…' : item.text;
      var meta = document.createElement('span');
      meta.className = 'meta';
      var d = new Date(item.ts);
      meta.textContent = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' · ' + (item.lang === 'en' ? 'English' : 'मराठी') + ' · ' + item.rate + '×';
      row.appendChild(snippet);
      row.appendChild(meta);
      row.addEventListener('click', function(){
        textEl.value = item.text;
        lang = item.lang;
        document.querySelectorAll('#langSeg button').forEach(function(b){ b.classList.toggle('active', b.dataset.lang === item.lang); });
        textEl.lang = item.lang;
        fillVoiceList();
        window.scrollTo({top:0, behavior:'smooth'});
      });
      historyList.appendChild(row);
    });
  }
  clearHistoryBtn.addEventListener('click', function(){
    if(!currentUser) return;
    localStorage.removeItem(historyKey(currentUser));
    renderHistory();
  });

  function showApp(user){
    currentUser = user;
    localStorage.setItem(SESSION_KEY, user);
    gate.style.display = 'none';
    app.style.display = '';
    renderHistory();
    maybeShowWhatsNew();
  }
  function showGate(){
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    app.style.display = 'none';
    gate.style.display = '';
    showStep('login');
    loginUser.value = ''; loginPass.value = '';
    loginUser.focus();
  }
  logoutBtn.addEventListener('click', showGate);

  // ---- Login ----
  var loginUser = document.getElementById('loginUser');
  var loginPass = document.getElementById('loginPass');
  var loginError = document.getElementById('loginError');
  var login2faCode = document.getElementById('login2faCode');
  var login2faError = document.getElementById('login2faError');

  document.getElementById('loginSubmit').addEventListener('click', function(){
    var u = loginUser.value.trim(), p = loginPass.value;
    loginError.textContent = '';
    if(!u || !p){ loginError.textContent = 'Enter your username and password.'; return; }
    getAccount(u).then(function(rec){
      if(!rec){ loginError.textContent = 'No account with that username.'; return; }
      hashPassword(p, rec.salt).then(function(hash){
        if(hash !== rec.hash){ loginError.textContent = 'Wrong password.'; return; }
        if(rec.secret){
          pendingLoginUser = u;
          login2faCode.value = '';
          showStep('login2fa');
          login2faCode.focus();
        } else {
          showApp(u);
        }
      });
    });
  });
  function tryLogin2fa(){
    var code = login2faCode.value.trim();
    if(code.length !== 6) return;
    getAccount(pendingLoginUser).then(function(rec){
      verifyTotp(rec.secret, code).then(function(ok){
        if(ok){ showApp(pendingLoginUser); }
        else { login2faError.textContent = 'Incorrect code — try again.'; login2faCode.value = ''; }
      });
    });
  }
  document.getElementById('login2faSubmit').addEventListener('click', tryLogin2fa);
  login2faCode.addEventListener('input', function(){
    login2faCode.value = login2faCode.value.replace(/\D/g,'');
    if(login2faCode.value.length === 6) tryLogin2fa();
  });
  document.getElementById('login2faBack').addEventListener('click', function(){ showStep('login'); });
  document.getElementById('toSignup').addEventListener('click', function(){ showStep('signup'); });
  document.getElementById('toLogin').addEventListener('click', function(){ showStep('login'); });

  // ---- Carry one account to another device by hand (works with no shared
  // backend — a code exported from one device's Settings, pasted into the
  // other device's login screen). ----
  document.getElementById('toImport').addEventListener('click', function(){
    document.getElementById('importCode').value = '';
    showStep('importAccount');
  });
  document.getElementById('importBack').addEventListener('click', function(){ showStep('login'); });
  document.getElementById('importSubmit').addEventListener('click', function(){
    var obj = decodeAccountExport(document.getElementById('importCode').value);
    var err = document.getElementById('importError');
    if(!obj){ err.textContent = "That code doesn't look right — copy it exactly from the other device."; return; }
    var rec = {salt: obj.salt, hash: obj.hash};
    if(obj.secret) rec.secret = obj.secret;
    setAccount(obj.u, rec).then(function(){
      err.textContent = '';
      loginUser.value = obj.u;
      loginPass.value = '';
      showStep('login');
      loginError.textContent = 'Account added on this device — log in below.';
    });
  });

  // ---- Forgot password (identity proved with the authenticator code, not email) ----
  var forgot2faCode = document.getElementById('forgot2faCode');
  document.getElementById('forgotLink').addEventListener('click', function(){
    var u = loginUser.value.trim();
    if(!u){ loginError.textContent = 'Enter your username above first.'; return; }
    getAccount(u).then(function(rec0){
      if(!rec0){ loginError.textContent = 'Enter your username above first.'; return; }
      if(!rec0.secret){ loginError.textContent = "This account doesn't have two-factor set up, so there's no way to verify it's you without it. You'll need to create a new account."; return; }
      forgotUser = u;
      document.getElementById('forgotUserLabel').textContent = u;
      forgot2faCode.value = '';
      showStep('forgot2fa');
    });
  });
  document.getElementById('forgot2faBack').addEventListener('click', function(){ showStep('login'); });
  function tryForgot2fa(){
    var code = forgot2faCode.value.trim();
    if(code.length !== 6) return;
    getAccount(forgotUser).then(function(rec){
      verifyTotp(rec.secret, code).then(function(ok){
        if(ok){ showStep('forgotReset'); }
        else {
          document.getElementById('forgot2faError').textContent = 'Incorrect code — try again.';
          forgot2faCode.value = '';
        }
      });
    });
  }
  document.getElementById('forgot2faSubmit').addEventListener('click', tryForgot2fa);
  forgot2faCode.addEventListener('input', function(){
    forgot2faCode.value = forgot2faCode.value.replace(/\D/g,'');
    if(forgot2faCode.value.length === 6) tryForgot2fa();
  });
  document.getElementById('resetSubmit').addEventListener('click', function(){
    var p = document.getElementById('resetPass').value;
    var c = document.getElementById('resetConfirm').value;
    var err = document.getElementById('resetError');
    err.textContent = '';
    if(p.length < 4){ err.textContent = 'Password should be at least 4 characters.'; return; }
    if(p !== c){ err.textContent = "Passwords don't match."; return; }
    var salt = randomSalt();
    hashPassword(p, salt).then(function(hash){
      return getAccount(forgotUser).then(function(rec){
        rec.salt = salt; rec.hash = hash;
        return setAccount(forgotUser, rec);
      });
    }).then(function(){
      loginUser.value = forgotUser;
      loginPass.value = '';
      showStep('login');
      loginError.textContent = 'Password updated — log in with your new password.';
    });
  });

  // ---- Sign up ----
  var signupUser = document.getElementById('signupUser');
  var signupPass = document.getElementById('signupPass');
  var signupConfirm = document.getElementById('signupConfirm');
  var signupError = document.getElementById('signupError');
  var signup2faCode = document.getElementById('signup2faCode');
  var signup2faError = document.getElementById('signup2faError');

  document.getElementById('signupContinue').addEventListener('click', function(){
    var u = signupUser.value.trim(), p = signupPass.value, c = signupConfirm.value;
    signupError.textContent = '';
    if(!u || !p){ signupError.textContent = 'Enter a username and password.'; return; }
    if(p.length < 4){ signupError.textContent = 'Password should be at least 4 characters.'; return; }
    if(p !== c){ signupError.textContent = "Passwords don't match."; return; }
    getAccount(u).then(function(existing){
      if(existing){ signupError.textContent = 'That username is taken.'; return; }
      var salt = randomSalt();
      hashPassword(p, salt).then(function(hash){
        var secret = generateSecret();
        pendingSignup = {username:u, salt:salt, hash:hash, secret:secret};
        document.getElementById('secretKey').textContent = secret;
        document.getElementById('qrBox').innerHTML = '';
        new QRCode(document.getElementById('qrBox'), {text: otpauthUri(u, secret), width:176, height:176});
        signup2faCode.value = '';
        showStep('signup2fa');
      });
    });
  });
  document.getElementById('copyKey').addEventListener('click', function(){
    var btn = document.getElementById('copyKey');
    function flash(){ var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = old; }, 1500); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(pendingSignup.secret).then(flash).catch(function(){ btn.textContent = pendingSignup.secret; });
    } else { btn.textContent = pendingSignup.secret; }
  });
  function trySignup2fa(){
    var code = signup2faCode.value.trim();
    if(code.length !== 6) return;
    verifyTotp(pendingSignup.secret, code).then(function(ok){
      if(ok){
        setAccount(pendingSignup.username, {salt:pendingSignup.salt, hash:pendingSignup.hash, secret:pendingSignup.secret})
          .then(function(){ showApp(pendingSignup.username); });
      } else {
        signup2faError.textContent = 'Incorrect code — check your authenticator app and try again.';
        signup2faCode.value = '';
      }
    });
  }
  document.getElementById('signup2faSubmit').addEventListener('click', trySignup2fa);
  signup2faCode.addEventListener('input', function(){
    signup2faCode.value = signup2faCode.value.replace(/\D/g,'');
    if(signup2faCode.value.length === 6) trySignup2fa();
  });
  document.getElementById('signup2faSkip').addEventListener('click', function(){
    setAccount(pendingSignup.username, {salt:pendingSignup.salt, hash:pendingSignup.hash})
      .then(function(){ showApp(pendingSignup.username); });
  });

  // ---- Version & what's new ----
  var APP_VERSION = '1.0.7';
  var SEEN_VERSION_KEY_PREFIX = 'speak_seen_version_';
  var CHANGELOG = {
    '1.0.5': [
      "Two-factor is now optional when creating an account — skip it and turn it on later from Settings.",
      "Change your username and password from Settings → Profile.",
      "Settings now shows the app version under About."
    ],
    '1.0.6': [
      "Attempted cross-device login (see 1.0.7 — it didn't actually work for links opened directly, which is the normal case).",
      "Fixed the progress bar and word highlight not animating on Android and iOS while reading."
    ],
    '1.0.7': [
      "Correction: 1.0.6's cross-device login doesn't work when this link is opened directly, which is how it normally opens on another device — a current platform limitation, not something fixable from here.",
      "Added a real workaround instead: Settings → Profile → Export an account code on one device, then use \"Have an account code?\" on the login screen of another device to add it there."
    ]
  };
  function maybeShowWhatsNew(){
    var banner = document.getElementById('whatsNew');
    var notes = CHANGELOG[APP_VERSION];
    var seen = localStorage.getItem(SEEN_VERSION_KEY_PREFIX + currentUser);
    if(!notes || seen === APP_VERSION){ banner.style.display = 'none'; return; }
    var list = document.getElementById('whatsNewList');
    list.innerHTML = '';
    notes.forEach(function(item){
      var li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    document.getElementById('whatsNewVersion').textContent = 'v' + APP_VERSION;
    banner.style.display = 'flex';
  }
  document.getElementById('whatsNewClose').addEventListener('click', function(){
    localStorage.setItem(SEEN_VERSION_KEY_PREFIX + currentUser, APP_VERSION);
    document.getElementById('whatsNew').style.display = 'none';
  });

  // ---- Appearance ----
  var THEME_KEY = 'speak_theme';
  function applyTheme(t){
    if(t === 'light') document.documentElement.setAttribute('data-theme','light');
    else if(t === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('#themeSeg button').forEach(function(b){ b.classList.toggle('active', b.dataset.theme === t); });
    localStorage.setItem(THEME_KEY, t);
  }
  document.querySelectorAll('#themeSeg button').forEach(function(b){
    b.addEventListener('click', function(){ applyTheme(b.dataset.theme); });
  });
  applyTheme(localStorage.getItem(THEME_KEY) || 'auto');

  // ---- Settings modal: profile + two-factor enable/disable ----
  var settingsModal = document.getElementById('settingsModal');
  var enable2faBlock = document.getElementById('enable2faBlock');
  var disable2faBlock = document.getElementById('disable2faBlock');
  var toggle2faBtn = document.getElementById('toggle2faBtn');
  var twofaStatus = document.getElementById('twofaStatus');
  var pendingEnableSecret = null;

  function refreshTwofaUI(){
    enable2faBlock.style.display = 'none';
    disable2faBlock.style.display = 'none';
    document.getElementById('enable2faCode').value = '';
    document.getElementById('disable2faCode').value = '';
    document.getElementById('enable2faError').textContent = '';
    document.getElementById('disable2faError').textContent = '';
    getAccount(currentUser).then(function(rec){
      if(rec && rec.secret){
        twofaStatus.textContent = 'Two-factor is on for this account.';
        toggle2faBtn.textContent = 'Disable two-factor';
      } else {
        twofaStatus.textContent = 'Two-factor is off for this account.';
        toggle2faBtn.textContent = 'Enable two-factor';
      }
    });
  }
  document.getElementById('settingsBtn').addEventListener('click', function(){
    document.getElementById('profileUsernameLabel').textContent = currentUser;
    document.getElementById('aboutVersion').textContent = 'v' + APP_VERSION;
    document.getElementById('newUsername').value = '';
    document.getElementById('curPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('newPasswordConfirm').value = '';
    document.getElementById('exportCodeWrap').style.display = 'none';
    setFieldMsg('usernameError', '');
    setFieldMsg('passwordError', '');
    refreshTwofaUI();
    settingsModal.style.display = 'flex';
  });

  document.getElementById('exportAccountBtn').addEventListener('click', function(){
    getAccount(currentUser).then(function(rec){
      document.getElementById('exportCodeBox').value = encodeAccountExport(currentUser, rec);
      document.getElementById('exportCodeWrap').style.display = '';
    });
  });
  document.getElementById('exportCopyBtn').addEventListener('click', function(){
    var ta = document.getElementById('exportCodeBox');
    var btn = document.getElementById('exportCopyBtn');
    function flash(){ var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = old; }, 1500); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(ta.value).then(flash).catch(function(){ ta.select(); });
    } else { ta.select(); }
  });

  function setFieldMsg(id, text, isError){
    var el = document.getElementById(id);
    el.textContent = text;
    el.classList.toggle('error', isError !== false);
  }

  document.getElementById('changeUsernameBtn').addEventListener('click', function(){
    var newU = document.getElementById('newUsername').value.trim();
    if(!newU){ setFieldMsg('usernameError', 'Enter a new username.'); return; }
    if(newU === currentUser){ setFieldMsg('usernameError', "That's already your username."); return; }
    getAccount(newU).then(function(existing){
      if(existing){ setFieldMsg('usernameError', 'That username is taken.'); return; }
      var oldUser = currentUser;
      getAccount(oldUser).then(function(rec){
        setAccount(newU, rec).then(function(){ return deleteAccount(oldUser); }).then(function(){
          var hist = localStorage.getItem(historyKey(oldUser));
          if(hist !== null){ localStorage.setItem(historyKey(newU), hist); localStorage.removeItem(historyKey(oldUser)); }
          var seen = localStorage.getItem(SEEN_VERSION_KEY_PREFIX + oldUser);
          if(seen !== null){ localStorage.setItem(SEEN_VERSION_KEY_PREFIX + newU, seen); localStorage.removeItem(SEEN_VERSION_KEY_PREFIX + oldUser); }
          currentUser = newU;
          localStorage.setItem(SESSION_KEY, newU);
          document.getElementById('newUsername').value = '';
          document.getElementById('profileUsernameLabel').textContent = newU;
          setFieldMsg('usernameError', 'Username updated.', false);
        });
      });
    });
  });

  document.getElementById('changePasswordBtn').addEventListener('click', function(){
    var cur = document.getElementById('curPassword').value;
    var np = document.getElementById('newPassword').value;
    var nc = document.getElementById('newPasswordConfirm').value;
    if(!cur || !np){ setFieldMsg('passwordError', 'Fill in your current and new password.'); return; }
    if(np.length < 4){ setFieldMsg('passwordError', 'New password should be at least 4 characters.'); return; }
    if(np !== nc){ setFieldMsg('passwordError', "New passwords don't match."); return; }
    getAccount(currentUser).then(function(rec){
      hashPassword(cur, rec.salt).then(function(hash){
        if(hash !== rec.hash){ setFieldMsg('passwordError', 'Current password is wrong.'); return; }
        var salt = randomSalt();
        hashPassword(np, salt).then(function(newHash){
          rec.salt = salt; rec.hash = newHash;
          setAccount(currentUser, rec).then(function(){
            document.getElementById('curPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newPasswordConfirm').value = '';
            setFieldMsg('passwordError', 'Password updated.', false);
          });
        });
      });
    });
  });
  document.getElementById('closeSettings').addEventListener('click', function(){ settingsModal.style.display = 'none'; });
  settingsModal.addEventListener('click', function(e){ if(e.target === settingsModal) settingsModal.style.display = 'none'; });

  toggle2faBtn.addEventListener('click', function(){
    getAccount(currentUser).then(function(rec){
      if(rec && rec.secret){
        enable2faBlock.style.display = 'none';
        disable2faBlock.style.display = '';
        document.getElementById('disable2faCode').focus();
      } else {
        pendingEnableSecret = generateSecret();
        document.getElementById('settingsSecretKey').textContent = pendingEnableSecret;
        document.getElementById('settingsQrBox').innerHTML = '';
        new QRCode(document.getElementById('settingsQrBox'), {text: otpauthUri(currentUser, pendingEnableSecret), width:176, height:176});
        disable2faBlock.style.display = 'none';
        enable2faBlock.style.display = '';
        document.getElementById('enable2faCode').focus();
      }
    });
  });
  document.getElementById('settingsCopyKey').addEventListener('click', function(){
    var btn = document.getElementById('settingsCopyKey');
    function flash(){ var old = btn.textContent; btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = old; }, 1500); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(pendingEnableSecret).then(flash).catch(function(){ btn.textContent = pendingEnableSecret; });
    } else { btn.textContent = pendingEnableSecret; }
  });
  function tryEnable2fa(){
    var code = document.getElementById('enable2faCode').value.trim();
    if(code.length !== 6) return;
    verifyTotp(pendingEnableSecret, code).then(function(ok){
      if(ok){
        getAccount(currentUser).then(function(rec){
          rec.secret = pendingEnableSecret;
          setAccount(currentUser, rec).then(refreshTwofaUI);
        });
      } else {
        document.getElementById('enable2faError').textContent = 'Incorrect code — try again.';
        document.getElementById('enable2faCode').value = '';
      }
    });
  }
  document.getElementById('enable2faCode').addEventListener('input', function(e){
    e.target.value = e.target.value.replace(/\D/g,'');
    if(e.target.value.length === 6) tryEnable2fa();
  });
  function tryDisable2fa(){
    var code = document.getElementById('disable2faCode').value.trim();
    if(code.length !== 6) return;
    getAccount(currentUser).then(function(rec){
      verifyTotp(rec.secret, code).then(function(ok){
        if(ok){
          delete rec.secret;
          setAccount(currentUser, rec).then(refreshTwofaUI);
        } else {
          document.getElementById('disable2faError').textContent = 'Incorrect code — try again.';
          document.getElementById('disable2faCode').value = '';
        }
      });
    });
  }
  document.getElementById('disable2faCode').addEventListener('input', function(e){
    e.target.value = e.target.value.replace(/\D/g,'');
    if(e.target.value.length === 6) tryDisable2fa();
  });

  app.style.display = 'none';
  showStep('login');
  var savedUser = localStorage.getItem(SESSION_KEY);
  if(savedUser){
    getAccount(savedUser).then(function(rec){ if(rec) showApp(savedUser); else showGate(); });
  } else {
    showGate();
  }
})();
