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
  var SESSION_TTL_DAYS = 30;
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

  function writeSession(email) {
    var now = new Date();
    var expires = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    var session = {
      email: String(email).toLowerCase().trim(),
      approvedAt: now.toISOString(),
      expiresAt: expires.toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem('dg_access_email', session.email);
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('dg_access_email');
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
      '  <div class="gate-brand" aria-hidden="true">',
      '    <svg viewBox="0 0 32 32" width="40" height="40">',
      '      <rect width="32" height="32" rx="8" fill="#0f766e"/>',
      '      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="14" fill="#fff">DG</text>',
      '    </svg>',
      '  </div>',
      '  <h1 class="gate-title">Datageo Paraná</h1>',
      '  <p class="gate-desc">Acesso restrito. Entre com seu email cadastrado ou solicite acesso.</p>',
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
          writeSession(email);
          setMessage(msg, 'Acesso liberado. Redirecionando...', 'success');
          setTimeout(closeOverlayAndUnlock, 600);
        } else if (status === 'pending') {
          setMessage(msg, 'Seu cadastro está aguardando aprovação manual. Você receberá email quando for aprovado.', 'info');
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
        setMessage(msg, 'Solicitação enviada. Você receberá email quando o acesso for aprovado.', 'success');
        form.reset();
      }).catch(function () {
        setMessage(msg, 'Falha ao enviar. Tente novamente em instantes.', 'error');
      }).then(function () {
        btn.disabled = false;
        btn.textContent = 'Solicitar acesso';
      });
    });
  }

  var overlayEl = null;

  function closeOverlayAndUnlock() {
    if (overlayEl) {
      overlayEl.classList.add('gate-hidden');
      setTimeout(function () {
        if (overlayEl && overlayEl.parentNode) {
          overlayEl.parentNode.removeChild(overlayEl);
          overlayEl = null;
        }
      }, 350);
    }
    unlockBody();
    document.dispatchEvent(new CustomEvent('dg:auth:unlocked'));
  }

  function showOverlay() {
    if (overlayEl) return;
    lockBody();
    overlayEl = buildOverlay();
    document.body.appendChild(overlayEl);
    attachTabHandlers(overlayEl);
    attachLoginHandler(overlayEl);
    attachSignupHandler(overlayEl);
    var firstInput = overlayEl.querySelector('input[type="email"]');
    if (firstInput) firstInput.focus();
  }

  function bootstrap() {
    var session = readSession();
    if (session) {
      sessionStorage.setItem('dg_access_email', session.email);
      unlockBody();
      document.dispatchEvent(new CustomEvent('dg:auth:ready', { detail: { email: session.email } }));
      return;
    }
    showOverlay();
  }

  // expose minimal API for debugging / manual logout
  window.DatageoAuth = {
    logout: function () { clearSession(); window.location.reload(); },
    session: function () { return readSession(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
