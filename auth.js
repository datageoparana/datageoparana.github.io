/**
 * Datageo Paraná - Login Gate
 *
 * Sistema simples de gate por email com cadastro único: acesso grátis
 * vitalício, liberado na hora (sem trial, sem aprovação manual).
 *
 * Fluxo:
 *  1. Usuário sem sessão vê overlay com 2 abas: Entrar / Criar acesso gratuito
 *  2. Entrar: digita email -> consulta Apps Script -> se status APROVADO, libera
 *  3. Criar acesso: preenche formulário -> Apps Script grava -> acesso na hora
 *  4. Sessão dura 30 dias via localStorage, renovada a cada visita (deslizante)
 *
 * Configuração: window.TRACKING_CONFIG.url precisa apontar para o Apps Script.
 * Admin sempre aprovado: configurado em ALWAYS_APPROVED no Apps Script.
 */
(function () {
  'use strict';

  var SESSION_KEY = 'dg_auth_session';
  var TRIAL_KEY = 'dg_trial_record';
  var SESSION_TTL_DAYS = 30;
  var TRIAL_DAYS = 30;
  var STATUS_CHECK_TIMEOUT_MS = 12000;
  // O doPost do Apps Script envia 2 emails de forma síncrona; precisa de folga maior.
  var SIGNUP_TIMEOUT_MS = 30000;

  function getEndpoint() {
    return (window.TRACKING_CONFIG && window.TRACKING_CONFIG.url) || '';
  }

  function readSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (!session || !session.email || !session.expiresAt) return null;
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (err) {
      return null;
    }
  }

  function writeSession(email, opts) {
    var now = new Date();
    var options = opts || {};
    var ttlMs = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
    var expiresAt;
    if (options.trialUntil) {
      var trialMs = new Date(options.trialUntil).getTime();
      expiresAt = new Date(Math.min(now.getTime() + ttlMs, trialMs));
    } else {
      expiresAt = new Date(now.getTime() + ttlMs);
    }
    var session = {
      email: String(email).toLowerCase().trim(),
      approvedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      trial: options.trial === true,
      trialUntil: options.trialUntil || null,
      plan: options.plan || (options.trial ? 'trial' : 'paid')
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem('dg_access_email', session.email);
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('dg_access_email');
  }

  function recordTrial(email) {
    try {
      var now = new Date();
      var until = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      var rec = {
        email: String(email).toLowerCase().trim(),
        startedAt: now.toISOString(),
        trialUntil: until.toISOString()
      };
      localStorage.setItem(TRIAL_KEY, JSON.stringify(rec));
      return rec;
    } catch (e) {
      return null;
    }
  }

  function readTrialRecord() {
    try {
      var raw = localStorage.getItem(TRIAL_KEY);
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || !rec.email || !rec.trialUntil) return null;
      return rec;
    } catch (e) {
      return null;
    }
  }

  function trialIsExpired(rec) {
    if (!rec || !rec.trialUntil) return false;
    return new Date(rec.trialUntil).getTime() < Date.now();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function lockBody() {
    document.body.classList.add('gate-locked');
    document.documentElement.classList.remove('gate-pre-lock');
  }

  function unlockBody() {
    document.body.classList.remove('gate-locked');
    document.documentElement.classList.remove('gate-pre-lock');
  }

  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.className = 'gate-overlay';
    overlay.id = 'dg-auth-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Acesso ao Datageo Paraná');
    overlay.innerHTML = [
      '<div class="gate-card">',
      '  <button type="button" class="gate-close" aria-label="Fechar e voltar para a página inicial">&times;</button>',
      '  <div class="gate-brand" aria-hidden="true">',
      '    <svg viewBox="0 0 32 32" width="40" height="40">',
      '      <rect width="32" height="32" rx="8" fill="#0f766e"/>',
      '      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="#fff">DG</text>',
      '    </svg>',
      '  </div>',
      '  <h1 class="gate-title">Acesso aos painéis · grátis vitalício</h1>',
      '  <p class="gate-desc">Cadastro único para liberar os painéis. Sem paywall, sem trial: o Datageo Paraná é gratuito para sempre. Código e dados abertos.</p>',
      '  <div class="gate-tabs" role="tablist">',
      '    <button type="button" class="gate-tab is-active" id="dg-tab-login" role="tab" aria-selected="true" aria-controls="dg-panel-login" data-tab="login">Entrar</button>',
      '    <button type="button" class="gate-tab" id="dg-tab-signup" role="tab" aria-selected="false" aria-controls="dg-panel-signup" tabindex="-1" data-tab="signup">Criar acesso gratuito</button>',
      '  </div>',
      '  <div class="gate-panel" id="dg-panel-login" role="tabpanel" aria-labelledby="dg-tab-login" data-panel="login">',
      '    <form class="gate-form" id="dg-login-form" novalidate>',
      '      <label for="dg-login-email" class="sr-only">Email</label>',
      '      <input id="dg-login-email" type="email" required autocomplete="email" placeholder="seu.email@exemplo.com" />',
      '      <button type="submit" class="btn primary gate-btn" id="dg-login-submit">Entrar</button>',
      '      <p class="gate-message" id="dg-login-msg" role="status" aria-live="polite"></p>',
      '    </form>',
      '  </div>',
      '  <div class="gate-panel is-hidden" id="dg-panel-signup" role="tabpanel" aria-labelledby="dg-tab-signup" data-panel="signup">',
      '    <form class="gate-form" id="dg-signup-form" novalidate>',
      '      <label for="dg-signup-name" class="sr-only">Nome completo</label>',
      '      <input id="dg-signup-name" type="text" required autocomplete="name" placeholder="Nome completo" />',
      '      <label for="dg-signup-email" class="sr-only">Email</label>',
      '      <input id="dg-signup-email" type="email" required autocomplete="email" placeholder="Email" />',
      '      <label for="dg-signup-org" class="sr-only">Empresa ou instituição</label>',
      '      <input id="dg-signup-org" type="text" autocomplete="organization" placeholder="Empresa ou instituição (opcional)" />',
      '      <label for="dg-signup-phone" class="sr-only">Telefone</label>',
      '      <input id="dg-signup-phone" type="tel" autocomplete="tel" placeholder="Telefone (opcional)" />',
      '      <label for="dg-signup-reason" class="sr-only">Motivo do acesso</label>',
      '      <textarea id="dg-signup-reason" rows="3" placeholder="Como pretende usar os dados? (opcional)"></textarea>',
      '      <button type="submit" class="btn primary gate-btn" id="dg-signup-submit">Criar acesso gratuito</button>',
      '      <p class="gate-message" id="dg-signup-msg" role="status" aria-live="polite"></p>',
      '    </form>',
      '  </div>',
      '  <p class="gate-note">Seus dados de cadastro (nome, email e telefone) são usados apenas para controle de acesso e contato. A navegação gera estatísticas anonimizadas (LGPD).</p>',
      '</div>'
    ].join('');
    return overlay;
  }

  function setMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'gate-message' + (kind ? ' is-' + kind : '');
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var opts = Object.assign({}, options || {});
      if (controller) opts.signal = controller.signal;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, timeoutMs || STATUS_CHECK_TIMEOUT_MS);
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function checkAccess(email) {
    var endpoint = getEndpoint();
    if (!endpoint) {
      return Promise.reject(new Error('endpoint não configurado'));
    }
    var url = endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&')
      + 'action=check&email=' + encodeURIComponent(email);
    return fetchWithTimeout(url, { method: 'GET' }, STATUS_CHECK_TIMEOUT_MS)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || typeof data !== 'object') throw new Error('resposta inválida');
        return data;
      });
  }

  function submitSignup(payload) {
    var endpoint = getEndpoint();
    if (!endpoint) {
      return Promise.reject(new Error('endpoint não configurado'));
    }
    var body = JSON.stringify(Object.assign({
      origin: window.location.origin,
      page: 'cadastro',
      hostname: window.location.hostname,
      sessionId: sessionStorage.getItem('dg_session_id') || '',
      timestamp: new Date().toISOString()
    }, payload));

    // CORS legível: o Apps Script responde com Access-Control-Allow-Origin: *.
    // Só é sucesso quando o backend confirma a gravação na aba Cadastros
    // (authSaveSignup_ responde status 'ok'); qualquer outra resposta significa
    // que o cadastro NÃO foi salvo (ex.: implantação sem a seção AUTH GATE,
    // que engoliu cadastros silenciosamente até 2026-07-07).
    return fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: body,
      keepalive: true
    }, SIGNUP_TIMEOUT_MS).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (data && data.status === 'ok') return data;
      throw new Error((data && data.message) || 'cadastro não confirmado pelo servidor');
    });
  }

  function setActiveTab(overlay, tab) {
    var tabs = overlay.querySelectorAll('.gate-tab');
    var panels = overlay.querySelectorAll('.gate-panel');
    var name = tab.getAttribute('data-tab');
    tabs.forEach(function (t) {
      var active = t === tab;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
      t.tabIndex = active ? 0 : -1;
    });
    panels.forEach(function (p) {
      p.classList.toggle('is-hidden', p.getAttribute('data-panel') !== name);
    });
  }

  function attachTabHandlers(overlay) {
    var tabs = overlay.querySelectorAll('.gate-tab');
    tabs.forEach(function (tab, idx) {
      tab.addEventListener('click', function () {
        setActiveTab(overlay, tab);
      });
      // Padrão WAI-ARIA de tabs: setas movem o foco e ativam a aba.
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(idx + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(idx - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          setActiveTab(overlay, next);
          next.focus();
        }
      });
    });
  }

  // Troca para a aba de cadastro com o email pré-preenchido e mensagem
  // orientando o recadastro (usado pelos branches not_found e pending).
  function switchToSignup(overlay, email, messageText) {
    var signupTab = overlay.querySelector('.gate-tab[data-tab="signup"]');
    if (signupTab) setActiveTab(overlay, signupTab);
    var emailInput = overlay.querySelector('#dg-signup-email');
    if (emailInput && email) emailInput.value = email;
    setMessage(overlay.querySelector('#dg-signup-msg'), messageText, 'info');
    var nameInput = overlay.querySelector('#dg-signup-name');
    if (nameInput) nameInput.focus();
  }

  function attachLoginHandler(overlay) {
    var form = overlay.querySelector('#dg-login-form');
    var input = overlay.querySelector('#dg-login-email');
    var btn = overlay.querySelector('#dg-login-submit');
    var msg = overlay.querySelector('#dg-login-msg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim().toLowerCase();
      if (!isValidEmail(email)) {
        setMessage(msg, 'Informe um email válido.', 'error');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Verificando...';
      setMessage(msg, '');

      checkAccess(email).then(function (data) {
        var status = (data.status || '').toLowerCase();
        if (status === 'approved') {
          var isTrial = data.plan === 'trial' || !!data.trialExpiresAt;
          writeSession(email, {
            trial: isTrial,
            trialUntil: data.trialExpiresAt || null,
            plan: data.plan || (isTrial ? 'trial' : 'paid')
          });
          if (isTrial && data.trialExpiresAt) {
            recordTrial(email);
          }
          setMessage(msg, 'Acesso liberado. Redirecionando...', 'success');
          setTimeout(closeOverlayAndUnlock, 600);
        } else if (status === 'trial_expired') {
          // Modelo antigo de trial expirado: agora todos têm acesso vitalício gratuito.
          writeSession(email, { trial: false, plan: 'free' });
          try { localStorage.removeItem(TRIAL_KEY); } catch (e) {}
          setMessage(msg, 'Acesso liberado. O Datageo Paraná agora é grátis vitalício.', 'success');
          setTimeout(closeOverlayAndUnlock, 600);
        } else if (status === 'pending') {
          // Resquício do modelo antigo de aprovação manual: orienta o
          // recadastro, que hoje libera o acesso na hora.
          switchToSignup(overlay, email, 'Seu cadastro é do modelo antigo de aprovação. Reenvie o formulário abaixo para liberar o acesso gratuito na hora.');
        } else if (status === 'denied') {
          setMessage(msg, 'Acesso negado para este email. Se acha que houve engano, escreva para avnerpaesgomes@gmail.com.', 'error');
        } else {
          // Email não encontrado: troca para a aba de cadastro com o email
          // já preenchido. O recadastro é gratuito e imediato, inclusive para
          // quem perdeu o cadastro na falha técnica de junho de 2026.
          switchToSignup(overlay, email, 'Não achamos esse email na base. Reative seu acesso em segundos: o cadastro é gratuito, vitalício e liberado na hora. Uma falha técnica em junho de 2026 perdeu alguns cadastros; se era o seu caso, basta reenviar o formulário.');
        }
      }).catch(function () {
        setMessage(msg, 'Não foi possível verificar agora. Tente novamente em instantes.', 'error');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
    });
  }

  function attachSignupHandler(overlay) {
    var form = overlay.querySelector('#dg-signup-form');
    var name = overlay.querySelector('#dg-signup-name');
    var email = overlay.querySelector('#dg-signup-email');
    var org = overlay.querySelector('#dg-signup-org');
    var phone = overlay.querySelector('#dg-signup-phone');
    var reason = overlay.querySelector('#dg-signup-reason');
    var btn = overlay.querySelector('#dg-signup-submit');
    var msg = overlay.querySelector('#dg-signup-msg');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameVal = (name.value || '').trim();
      var emailVal = (email.value || '').trim().toLowerCase();
      if (!nameVal) { setMessage(msg, 'Informe seu nome completo.', 'error'); return; }
      if (!isValidEmail(emailVal)) { setMessage(msg, 'Informe um email válido.', 'error'); return; }

      btn.disabled = true;
      btn.textContent = 'Enviando...';
      // O Apps Script envia emails de forma síncrona; a espera é normal.
      setMessage(msg, 'Enviando, pode levar até 30s...', 'info');

      var payload = {
        name: nameVal,
        email: emailVal,
        organization: (org.value || '').trim(),
        phone: (phone.value || '').trim(),
        reason: (reason.value || '').trim()
      };

      submitSignup(payload).then(function () {
        showSignupSuccess(overlay, emailVal);
      }).catch(function (err) {
        if (err && err.message === 'timeout') {
          setMessage(msg, 'O servidor demorou a responder e seu cadastro pode ter sido enviado. Aguarde um minuto e tente a aba Entrar com seu email.', 'error');
        } else {
          setMessage(msg, 'O servidor não confirmou o cadastro. Tente novamente; se continuar falhando, escreva para avnerpaesgomes@gmail.com.', 'error');
        }
        btn.disabled = false;
        btn.textContent = 'Criar acesso gratuito';
      });
    });
  }

  function showSignupSuccess(overlay, email) {
    var loginPanel = overlay.querySelector('[data-panel="login"]');
    var signupPanel = overlay.querySelector('[data-panel="signup"]');
    var tabs = overlay.querySelector('.gate-tabs');
    if (loginPanel) loginPanel.classList.add('is-hidden');
    if (signupPanel) signupPanel.classList.add('is-hidden');
    if (tabs) tabs.classList.add('is-hidden');

    // Acesso vitalício e gratuito — sem trial, sem paywall.
    writeSession(email, { trial: false, plan: 'free' });
    try { localStorage.removeItem(TRIAL_KEY); } catch (e) {}

    var card = overlay.querySelector('.gate-card');
    var success = document.createElement('div');
    success.className = 'gate-success';
    // Anuncia a confirmação para leitores de tela (região de status).
    success.setAttribute('role', 'status');
    success.innerHTML = [
      '<div class="gate-success-icon" aria-hidden="true">',
      '  <svg viewBox="0 0 24 24" width="42" height="42">',
      '    <circle cx="12" cy="12" r="11" fill="#0f766e"/>',
      '    <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
      '  </svg>',
      '</div>',
      '<h2 class="gate-success-title">Acesso liberado · grátis vitalício</h2>',
      '<p class="gate-success-desc">Cadastro confirmado para <strong>' + escapeHtml(email) + '</strong>. O Datageo Paraná é gratuito para sempre, sem paywall e sem período de teste. Código e dados abertos.</p>',
      '<div class="gate-success-actions">',
      '  <button type="button" class="btn primary gate-btn" id="dg-success-enter">Acessar painéis agora</button>',
      '</div>',
      // Doação reduzida a uma linha discreta: o pitch completo (QR, copia e
      // cola) vive em doar.html, sem empurrar o CTA principal para baixo.
      '<p class="gate-donate-line">Quer apoiar o projeto? <a href="doar.html" target="_blank" rel="noopener">Doe via PIX (opcional)</a>.</p>'
    ].join('');
    card.appendChild(success);

    var enterBtn = success.querySelector('#dg-success-enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', function () {
        closeOverlayAndUnlock();
      });
      // O botão de submit ficou num painel display:none; devolve o foco
      // ao CTA principal para o teclado/leitor de tela não cair no body.
      enterBtn.focus();
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var overlayEl = null;
  var pendingNavigationUrl = null;
  var lastFocusEl = null;

  function overlayIsVisible() {
    return !!(overlayEl && !overlayEl.classList.contains('gate-hidden'));
  }

  function restoreLastFocus() {
    if (lastFocusEl && typeof lastFocusEl.focus === 'function' && document.contains(lastFocusEl)) {
      lastFocusEl.focus();
    }
    lastFocusEl = null;
  }

  // Propaga o idioma escolhido no hub para o painel de destino
  // (origens diferentes não compartilham localStorage).
  function withLang(urlStr) {
    try {
      var lang = window.i18n && window.i18n.lang;
      if (!lang || lang === 'pt') return urlStr;
      var url = new URL(urlStr, window.location.href);
      url.searchParams.set('lang', lang);
      return url.href;
    } catch (e) {
      return urlStr;
    }
  }

  function focusFirstField(overlay) {
    var fields = overlay.querySelectorAll('input, textarea');
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].offsetParent !== null) { fields[i].focus(); return; }
    }
    var successBtn = overlay.querySelector('#dg-success-enter');
    if (successBtn) successBtn.focus();
  }

  function closeOverlayAndUnlock() {
    var nextUrl = pendingNavigationUrl;
    pendingNavigationUrl = null;
    if (overlayEl) {
      overlayEl.classList.add('gate-hidden');
      setTimeout(function () {
        if (overlayEl && overlayEl.parentNode) {
          overlayEl.parentNode.removeChild(overlayEl);
          overlayEl = null;
        }
        if (nextUrl) {
          window.location.href = withLang(nextUrl);
        }
      }, 350);
    }
    unlockBody();
    document.dispatchEvent(new CustomEvent('dg:auth:unlocked'));
    if (!nextUrl) restoreLastFocus();
  }

  function dismissOverlay() {
    // Fechar com X, Esc ou backdrop apenas ESCONDE o overlay: o formulário
    // preenchido e a pendingNavigationUrl sobrevivem para a reabertura.
    cleanFromParam();
    if (overlayEl) overlayEl.classList.add('gate-hidden');
    unlockBody();
    document.dispatchEvent(new CustomEvent('dg:auth:unlocked'));
    restoreLastFocus();
  }

  function showOverlay() {
    lastFocusEl = document.activeElement;
    if (overlayEl) {
      overlayEl.classList.remove('gate-hidden');
      lockBody();
      focusFirstField(overlayEl);
      return;
    }
    lockBody();
    overlayEl = buildOverlay();
    document.body.appendChild(overlayEl);
    attachTabHandlers(overlayEl);
    attachLoginHandler(overlayEl);
    attachSignupHandler(overlayEl);
    attachDismissHandlers(overlayEl);
    focusFirstField(overlayEl);
  }

  function attachDismissHandlers(overlay) {
    var closeBtn = overlay.querySelector('.gate-close');
    if (closeBtn) closeBtn.addEventListener('click', dismissOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismissOverlay();
    });
    // addEventListener com a mesma referência não duplica handlers.
    document.addEventListener('keydown', escClose);
    document.addEventListener('keydown', trapFocus);
  }

  function escClose(e) {
    if (e.key === 'Escape' && overlayIsVisible()) {
      dismissOverlay();
    }
  }

  // Focus trap: enquanto o dialog aria-modal estiver aberto, Tab circula
  // apenas pelos elementos focáveis visíveis do overlay.
  function trapFocus(e) {
    if (e.key !== 'Tab' || !overlayIsVisible()) return;
    var nodes = overlayEl.querySelectorAll('button, input, textarea, a[href]');
    var focusables = [];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].disabled && nodes[i].offsetParent !== null && nodes[i].tabIndex !== -1) {
        focusables.push(nodes[i]);
      }
    }
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !overlayEl.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last || !overlayEl.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  }

  function attachCardInterceptors() {
    var links = document.querySelectorAll('a[href*="avnergomes.github.io/"]');
    Array.prototype.forEach.call(links, function (link) {
      // Skip the developer-link footer (portfolio) — it's not a gated dashboard
      if (link.classList.contains('developer-link')) return;
      link.addEventListener('click', function (e) {
        if (readSession()) return;
        e.preventDefault();
        e.stopPropagation();
        pendingNavigationUrl = link.href;
        showOverlay();
      });
    });
  }

  // Hosts permitidos para o redirect pós-login via ?from= (evita open redirect).
  var ALLOWED_FROM_HOSTS = ['datageoparana.github.io', 'avnergomes.github.io'];

  function getFromParamUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      // URLSearchParams já decodifica; decodificar de novo corromperia
      // URLs de painel com %XX legítimos no search/hash.
      var raw = params.get('from');
      if (!raw) return null;
      if (!/^[a-z0-9.\-]+\.[a-z]{2,}\//i.test(raw)) return null;
      var url = new URL('https://' + raw.replace(/^\/+/, ''));
      if (ALLOWED_FROM_HOSTS.indexOf(url.hostname) === -1) return null;
      return url.href;
    } catch (e) {
      return null;
    }
  }

  function cleanFromParam() {
    try {
      if (window.history && window.history.replaceState) {
        var params = new URLSearchParams(window.location.search);
        if (params.has('from')) {
          params.delete('from');
          var qs = params.toString();
          var newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
          window.history.replaceState({}, '', newUrl);
        }
      }
    } catch (e) {}
  }

  function bootstrap() {
    attachCardInterceptors();

    var session = readSession();
    var fromUrl = getFromParamUrl();
    var trialRec = readTrialRecord();
    var expiredTrial = trialIsExpired(trialRec);

    if (session) {
      // Renovação deslizante: cada visita com sessão válida estende o
      // expiresAt por mais 30 dias; o TTL só derruba visitantes inativos.
      try {
        session = writeSession(session.email, {
          trial: session.trial === true,
          trialUntil: session.trialUntil || null,
          plan: session.plan
        });
      } catch (e) { /* storage indisponível: mantém a sessão atual */ }
      sessionStorage.setItem('dg_access_email', session.email);
      if (fromUrl) {
        cleanFromParam();
        window.location.href = withLang(fromUrl);
        return;
      }
      cleanFromParam();
      document.dispatchEvent(new CustomEvent('dg:auth:ready', { detail: { email: session.email } }));
      return;
    }

    // Migra usuários antigos de trial: o acesso passou a ser grátis vitalício.
    if (expiredTrial && trialRec && trialRec.email) {
      writeSession(trialRec.email, { trial: false, plan: 'free' });
      try { localStorage.removeItem(TRIAL_KEY); } catch (e) {}
      sessionStorage.setItem('dg_access_email', trialRec.email);
      if (fromUrl) {
        cleanFromParam();
        window.location.href = withLang(fromUrl);
        return;
      }
      cleanFromParam();
      document.dispatchEvent(new CustomEvent('dg:auth:ready', { detail: { email: trialRec.email } }));
      return;
    }

    if (fromUrl) {
      pendingNavigationUrl = fromUrl;
      showOverlay();
    }
    // Else: landing fica aberta, sem overlay. Gate só ativa em clique de painel.
  }

  // expose minimal API for debugging / manual logout
  window.DatageoAuth = {
    logout: function () { clearSession(); window.location.reload(); },
    session: function () { return readSession(); },
    open: function (url) { pendingNavigationUrl = url || null; showOverlay(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
