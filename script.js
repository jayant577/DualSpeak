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

    utter.onboundary = function(e){
      if(!e.name || e.name === 'word'){
        highlightAt(e.charIndex);
        fillEl.style.width = Math.min(100, (e.charIndex / text.length) * 100) + '%';
      }
    };
    utter.onstart = function(){
      playBtn.textContent = 'Pause';
      stopBtn.disabled = false;
      statusEl.textContent = 'Reading…';
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
    } else {
      synth.pause();
      playBtn.textContent = 'Resume';
      statusEl.textContent = 'Paused';
    }
  });

  stopBtn.addEventListener('click', function(){
    synth.cancel();
    clearHighlight();
    fillEl.style.width = '0%';
    statusEl.textContent = 'Stopped';
    resetControls();
  });

  // ---- Accounts & history — stored only in this browser, on this device ----
  var ACCOUNTS_KEY = 'speak_accounts';
  var SESSION_KEY = 'speak_current_user';
  var gate = document.getElementById('gate');
  var app = document.getElementById('app');
  var gateTitle = document.getElementById('gateTitle');
  var gateUser = document.getElementById('gateUser');
  var gatePass = document.getElementById('gatePass');
  var gateConfirm = document.getElementById('gateConfirm');
  var gateSubmit = document.getElementById('gateSubmit');
  var gateToggle = document.getElementById('gateToggle');
  var gateSwitchText = document.getElementById('gateSwitchText');
  var gateError = document.getElementById('gateError');
  var whoami = document.getElementById('whoami');
  var logoutBtn = document.getElementById('logoutBtn');
  var historyList = document.getElementById('historyList');
  var clearHistoryBtn = document.getElementById('clearHistoryBtn');
  var mode = 'login';
  var currentUser = null;

  function getAccounts(){ try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}'); }catch(e){ return {}; } }
  function saveAccounts(a){ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(a)); }
  function bufToHex(buf){ return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ('0'+b.toString(16)).slice(-2); }).join(''); }
  function randomSalt(){ var arr = new Uint8Array(16); crypto.getRandomValues(arr); return bufToHex(arr.buffer); }
  function hashPassword(password, saltHex){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(saltHex + ':' + password)).then(bufToHex);
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
    whoami.textContent = 'Signed in as ' + user;
    gate.style.display = 'none';
    app.style.display = '';
    renderHistory();
  }
  function showGate(){
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    app.style.display = 'none';
    gate.style.display = '';
    gateUser.value = ''; gatePass.value = ''; gateConfirm.value = '';
    gateError.textContent = '';
    gateUser.focus();
  }
  logoutBtn.addEventListener('click', showGate);

  function setMode(m){
    mode = m;
    gateError.textContent = '';
    if(m === 'signup'){
      gateTitle.textContent = 'Create an account';
      gateSubmit.textContent = 'Create account';
      gateConfirm.style.display = '';
      gateToggle.textContent = 'Log in instead';
      gateSwitchText.textContent = 'Already have an account?';
    } else {
      gateTitle.textContent = 'Log in';
      gateSubmit.textContent = 'Log in';
      gateConfirm.style.display = 'none';
      gateToggle.textContent = 'Create an account';
      gateSwitchText.textContent = 'New here?';
    }
  }
  gateToggle.addEventListener('click', function(){ setMode(mode === 'login' ? 'signup' : 'login'); });

  gateSubmit.addEventListener('click', function(){
    var u = gateUser.value.trim();
    var p = gatePass.value;
    gateError.textContent = '';
    if(!u || !p){ gateError.textContent = 'Enter a username and password.'; return; }
    var accounts = getAccounts();
    if(mode === 'signup'){
      if(accounts[u]){ gateError.textContent = 'That username is taken.'; return; }
      if(p.length < 4){ gateError.textContent = 'Password should be at least 4 characters.'; return; }
      if(p !== gateConfirm.value){ gateError.textContent = "Passwords don't match."; return; }
      var salt = randomSalt();
      hashPassword(p, salt).then(function(hash){
        accounts[u] = {salt:salt, hash:hash};
        saveAccounts(accounts);
        showApp(u);
      });
    } else {
      var rec = accounts[u];
      if(!rec){ gateError.textContent = 'No account with that username — create one instead.'; return; }
      hashPassword(p, rec.salt).then(function(hash){
        if(hash === rec.hash){ showApp(u); }
        else { gateError.textContent = 'Wrong password.'; }
      });
    }
  });
  [gateUser, gatePass, gateConfirm].forEach(function(el){
    el.addEventListener('keydown', function(e){ if(e.key === 'Enter') gateSubmit.click(); });
  });

  app.style.display = 'none';
  setMode('login');
  var savedUser = localStorage.getItem(SESSION_KEY);
  if(savedUser && getAccounts()[savedUser]) showApp(savedUser); else showGate();
})();
