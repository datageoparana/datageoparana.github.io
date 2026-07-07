/**
 * Datageo Paraná — Dashboard Referer Gate
 *
 * Para uso nos dashboards externos (avnergomes.github.io/<dashboard>).
 * Garante que a página só abra se:
 *   1. O usuário chegou via link do datageoparana.github.io (referer), OU
 *   2. Já tem sessao ativa no proprio dominio do dashboard (sessionStorage), OU
 *   3. Esta navegando dentro do mesmo origin
 *
 * Caso contrario, redireciona para https://datageoparana.github.io/ (login gate).
 *
 * USO (forma A — script externo):
 *   <script src="https://datageoparana.github.io/dashboard-gate.js"></script>
 *   - Coloque como PRIMEIRO script no <head>, antes de qualquer outro recurso.
 *
 * USO (forma B — inline, recomendada para zero flash):
 *   Cole o conteudo deste arquivo dentro de uma tag <script> no topo do <head>.
 *
 * Limitacoes: esta e uma checagem client-side (referer + sessionStorage).
 * Pode ser burlada por usuarios com DevTools. A seguranca real virá com
 * autenticação backend (Stripe + JWT) na próxima fase.
 */
(function () {
  'use strict';

  var ALLOWED_REFERRER_HOSTS = [
    'datageoparana.github.io'
  ];
  var ROOT_LOGIN_URL = 'https://datageoparana.github.io/';
  var SESSION_KEY = 'dg_dashboard_pass';

  function getReferrerHost() {
    try {
      var ref = document.referrer || '';
      if (!ref) return '';
      return new URL(ref).host;
    } catch (e) {
      return '';
    }
  }

  function hasSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function grantSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (e) {}
  }

  function redirect() {
    try {
      // Preserva query string e hash do painel (filtros, ?lang=, abas) no
      // round-trip pelo gate: o auth.js reconstrói a URL completa no retorno.
      var target = ROOT_LOGIN_URL + '?from='
        + encodeURIComponent(location.host + location.pathname + location.search + location.hash);
      location.replace(target);
    } catch (e) {
      location.href = ROOT_LOGIN_URL;
    }
  }

  if (hasSession()) return;

  var refHost = getReferrerHost();

  if (refHost && refHost === location.host) {
    grantSession();
    return;
  }

  if (refHost && ALLOWED_REFERRER_HOSTS.indexOf(refHost) !== -1) {
    grantSession();
    return;
  }

  redirect();
})();
