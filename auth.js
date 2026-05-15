/**
 * Datageo Paraná - Login Gate
 *
 * Sistema simples de gate por email com aprovação manual.
 *
 * Fluxo:
 *  1. Usuário sem sessão vê overlay de bloqueio com 2 abas: Entrar / Cadastrar
 *  2. Entrar: digita email -> consulta Apps Script -> se status APROVADO, libera
 *  3. Cadastrar: preenche formulário -> envia ao Apps Script -> aguarda aprovação
 *  4. Sessão dura 30 dias via localStorage
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
      '    <button type="button" class="gate-tab is-active" role="tab" aria-selected="true" data-tab="login">Entrar</button>',
      '    <button type="button" class="gate-tab" role="tab" aria-selected="false" data-tab="signup">Solicitar acesso</button>',
      '  </div>',
      '  <div class="gate-panel" data-panel="login">',
      '    <form class="gate-form" id="dg-login-form" novalidate>',
      '      <label for="dg-login-email" class="sr-only">Email</label>',
      '      <input id="dg-login-email" type="email" required autocomplete="email" placeholder="seu.email@exemplo.com" />',
      '      <button type="submit" class="btn primary gate-btn" id="dg-login-submit">Entrar</button>',
      '      <p class="gate-message" id="dg-login-msg" role="status" aria-live="polite"></p>',
      '    </form>',
      '  </div>',
      '  <div class="gate-panel is-hidden" data-panel="signup">',
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
      '      <button type="submit" class="btn primary gate-btn" id="dg-signup-submit">Solicitar acesso</button>',
      '      <p class="gate-message" id="dg-signup-msg" role="status" aria-live="polite"></p>',
      '    </form>',
      '  </div>',
      '  <p class="gate-note">Ao continuar, você concorda com a coleta de dados anonimizados de navegação (LGPD Art. 12).</p>',
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

    return fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: body,
      keepalive: true
    }).then(function () { return { ok: true }; });
  }

  function attachTabHandlers(overlay) {
    var tabs = overlay.querySelectorAll('.gate-tab');
    var panels = overlay.querySelectorAll('.gate-panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(function (p) {
          p.classList.toggle('is-hidden', p.getAttribute('data-panel') !== name);
        });
      });
    });
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
          showPaywall(overlayEl || document.querySelector('#dg-auth-overlay'), email);
        } else if (status === 'pending') {
          setMessage(msg, 'Seu cadastro está aguardando aprovação. Você receberá email quando for aprovado.', 'info');
        } else if (status === 'denied') {
          setMessage(msg, 'Acesso negado para este email. Entre em contato com o administrador.', 'error');
        } else {
          setMessage(msg, 'Email não encontrado. Use a aba "Solicitar acesso" para se cadastrar.', 'error');
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
      setMessage(msg, '');

      var payload = {
        name: nameVal,
        email: emailVal,
        organization: (org.value || '').trim(),
        phone: (phone.value || '').trim(),
        reason: (reason.value || '').trim()
      };

      submitSignup(payload).then(function () {
        showSignupSuccess(overlay, emailVal);
      }).catch(function () {
        setMessage(msg, 'Falha ao enviar. Tente novamente em instantes.', 'error');
        btn.disabled = false;
        btn.textContent = 'Solicitar acesso';
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
    success.innerHTML = [
      '<div class="gate-success-icon" aria-hidden="true">',
      '  <svg viewBox="0 0 24 24" width="42" height="42">',
      '    <circle cx="12" cy="12" r="11" fill="#0f766e"/>',
      '    <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
      '  </svg>',
      '</div>',
      '<h2 class="gate-success-title">Acesso liberado · grátis vitalício</h2>',
      '<p class="gate-success-desc">Cadastro confirmado para <strong>' + escapeHtml(email) + '</strong>. O Datageo Paraná é gratuito para sempre, sem paywall e sem período de teste. Código e dados abertos.</p>',
      '<div class="gate-pix">',
      '  <div class="gate-pix-label">Apoie com uma doação (opcional)</div>',
      '  <a class="gate-pix-qr" href="qrcode_pix.png" download="datageo-parana-pix.png" title="Baixar QR Code PIX">',
      '    <img src="qrcode_pix.png" alt="QR Code PIX para doação" width="160" height="160" />',
      '    <span class="gate-pix-hint">Clique para baixar</span>',
      '  </a>',
      '  <p class="gate-pix-note">Doações via PIX ajudam a custear domínios, armazenamento e novas placas. Nada é condição de acesso.</p>',
      '</div>',
      '<div class="gate-success-actions">',
      '  <button type="button" class="btn primary gate-btn" id="dg-success-enter">Acessar painéis agora</button>',
      '</div>'
    ].join('');
    card.appendChild(success);

    var enterBtn = success.querySelector('#dg-success-enter');
    if (enterBtn) {
      enterBtn.addEventListener('click', function () {
        closeOverlayAndUnlock();
      });
    }
  }

  function showPaywall(overlay, email) {
    if (!overlay) return;
    var loginPanel = overlay.querySelector('[data-panel="login"]');
    var signupPanel = overlay.querySelector('[data-panel="signup"]');
    var tabs = overlay.querySelector('.gate-tabs');
    if (loginPanel) loginPanel.classList.add('is-hidden');
    if (signupPanel) signupPanel.classList.add('is-hidden');
    if (tabs) tabs.classList.add('is-hidden');

    var existing = overlay.querySelector('.gate-success');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var titleEl = overlay.querySelector('.gate-title');
    var descEl = overlay.querySelector('.gate-desc');
    if (titleEl) titleEl.textContent = 'Período gratuito encerrado';
    if (descEl) descEl.textContent = 'Seu trial de 30 dias acabou. Para continuar usando os painéis, escolha um plano e pague via PIX.';

    var card = overlay.querySelector('.gate-card');
    var paywall = document.createElement('div');
    paywall.className = 'gate-success';
    paywall.innerHTML = [
      '<h2 class="gate-success-title">Escolha um plano para continuar</h2>',
      '<p class="gate-success-desc">Conta: <strong>' + escapeHtml(email || '') + '</strong></p>',
      '<div class="gate-pricing">',
      '  <div class="gate-price">',
      '    <div class="gate-price-tag">Avulso</div>',
      '    <div class="gate-price-value">R$ 10</div>',
      '    <div class="gate-price-period">acesso único</div>',
      '  </div>',
      '  <div class="gate-price is-featured">',
      '    <div class="gate-price-tag">Mensal</div>',
      '    <div class="gate-price-value">R$ 50</div>',
      '    <div class="gate-price-period">por mês</div>',
      '  </div>',
      '  <div class="gate-price">',
      '    <div class="gate-price-tag">Anual</div>',
      '    <div class="gate-price-value">R$ 500</div>',
      '    <div class="gate-price-period">por ano</div>',
      '  </div>',
      '</div>',
      '<div class="gate-pix">',
      '  <div class="gate-pix-label">Pague via PIX</div>',
      '  <a class="gate-pix-qr" href="qrcode_pix.png" download="datageo-parana-pix.png" title="Clique para baixar o QR Code">',
      '    <img src="qrcode_pix.png" alt="QR Code PIX para pagamento" width="180" height="180" />',
      '    <span class="gate-pix-hint">Clique para baixar</span>',
      '  </a>',
      '  <p class="gate-pix-note">Após o pagamento, clique em "Já paguei" abaixo. Liberamos o acesso assim que confirmarmos.</p>',
      '</div>',
      '<div class="gate-success-actions">',
      '  <button type="button" class="btn primary gate-btn" id="dg-paywall-check">Já paguei — verificar acesso</button>',
      '</div>',
      '<p class="gate-message" id="dg-paywall-msg" role="status" aria-live="polite"></p>'
    ].join('');
    card.appendChild(paywall);

    var checkBtn = paywall.querySelector('#dg-paywall-check');
    var msg = paywall.querySelector('#dg-paywall-msg');
    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        if (!email) return;
        checkBtn.disabled = true;
        checkBtn.textContent = 'Verificando...';
        setMessage(msg, '');
        checkAccess(email).then(function (data) {
          var status = (data.status || '').toLowerCase();
          if (status === 'approved' && data.plan !== 'trial' && !data.trialExpiresAt) {
            writeSession(email, { trial: false, plan: data.plan || 'paid' });
            try { localStorage.removeItem(TRIAL_KEY); } catch (e) {}
            setMessage(msg, 'Pagamento confirmado. Redirecionando...', 'success');
            setTimeout(closeOverlayAndUnlock, 600);
          } else if (status === 'trial_expired' || status === 'approved') {
            setMessage(msg, 'Ainda não recebemos a confirmação do pagamento. Aguarde alguns minutos e tente de novo.', 'info');
          } else {
            setMessage(msg, 'Não foi possível confirmar. Verifique o PIX ou contate o administrador.', 'error');
          }
        }).catch(function () {
          setMessage(msg, 'Falha na verificação. Tente novamente em instantes.', 'error');
        }).then(function () {
          checkBtn.disabled = false;
          checkBtn.textContent = 'Já paguei — verificar acesso';
        });
      });
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var overlayEl = null;
  var pendingNavigationUrl = null;

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
          window.location.href = nextUrl;
        }
      }, 350);
    }
    unlockBody();
    document.dispatchEvent(new CustomEvent('dg:auth:unlocked'));
  }

  function dismissOverlay() {
    pendingNavigationUrl = null;
    cleanFromParam();
    closeOverlayAndUnlock();
  }

  function showOverlay() {
    if (overlayEl) {
      var existingInput = overlayEl.querySelector('input[type="email"]');
      if (existingInput) existingInput.focus();
      return;
    }
    lockBody();
    overlayEl = buildOverlay();
    document.body.appendChild(overlayEl);
    attachTabHandlers(overlayEl);
    attachLoginHandler(overlayEl);
    attachSignupHandler(overlayEl);
    attachDismissHandlers(overlayEl);
    var firstInput = overlayEl.querySelector('input[type="email"]');
    if (firstInput) firstInput.focus();
  }

  function attachDismissHandlers(overlay) {
    var closeBtn = overlay.querySelector('.gate-close');
    if (closeBtn) closeBtn.addEventListener('click', dismissOverlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismissOverlay();
    });
    document.addEventListener('keydown', escClose);
  }

  function escClose(e) {
    if (e.key === 'Escape' && overlayEl) {
      document.removeEventListener('keydown', escClose);
      dismissOverlay();
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
        var trialRec = readTrialRecord();
        if (trialIsExpired(trialRec) && trialRec && trialRec.email) {
          showPaywall(overlayEl, trialRec.email);
        }
      });
    });
  }

  function getFromParamUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('from');
      if (!raw) return null;
      var decoded = decodeURIComponent(raw);
      if (!/^[a-z0-9.\-]+\.[a-z]{2,}\//i.test(decoded)) return null;
      return 'https://' + decoded.replace(/^\/+/, '');
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
      sessionStorage.setItem('dg_access_email', session.email);
      if (fromUrl) {
        cleanFromParam();
        window.location.href = fromUrl;
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
        window.location.href = fromUrl;
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
