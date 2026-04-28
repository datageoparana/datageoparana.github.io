# Datageo Paraná — Setup do Login Gate

Este documento descreve o sistema de **login gate** com cadastro e aprovação manual implementado no `datageoparana.github.io`. O sistema bloqueia o acesso a todas as páginas até que o visitante (a) faça login com email aprovado ou (b) solicite cadastro e seja aprovado manualmente.

## Como funciona

```
[ Visitante abre o site ]
          │
          ▼
   [ auth.js verifica localStorage.dg_auth_session ]
          │
   ┌──────┴──────┐
   │             │
 Sessão        Sessão
 válida       inválida
   │             │
   ▼             ▼
 Libera     [ Overlay com 2 abas: Entrar | Solicitar acesso ]
 site             │
                  ├── Entrar ─► GET ?action=check&email=… ─► status approved? Libera. Senão, mostra mensagem.
                  └── Solicitar ─► POST page=cadastro ─► linha PENDENTE na aba "Cadastros" + email para o admin
```

A sessão é armazenada em `localStorage.dg_auth_session` por **30 dias**.

## Componentes

| Arquivo | Papel |
|---------|-------|
| `auth.js` | Lógica do gate (UI, sessão, fetch ao backend) |
| `styles.css` (seção `Auth gate`) | Estilos do overlay, tabs e formulários |
| `google-apps-script-tracking.gs` | Backend: aba `Cadastros`, endpoint `?action=check`, helpers `approveEmail`/`denyEmail` |
| `index.html`, `arquitetura.html`, `referencias.html`, `404.html` | Páginas com gate ativo |

## 1. Atualizar o Apps Script

1. Abra o projeto Apps Script atual (mesmo que serve hoje o tracking).
2. **Substitua todo o código** pelo conteúdo de `google-apps-script-tracking.gs` (este repositório).
3. Confira se `SPREADSHEET_ID` aponta para a planilha correta.
4. Confira a lista `ALWAYS_APPROVED` — emails listados ali são sempre liberados (default: `avnerpaesgomes@gmail.com`).
5. **Salve** (`Ctrl+S`).
6. Execute uma vez a função `setupSheet` para criar/recriar a aba `Cadastros` (atenção: isso recria as abas Tracking/Emails/Bugs também — se já tem dados, comente as linhas correspondentes em `setupSheet` ou rode apenas `createSignupSheet_(SpreadsheetApp.openById(SPREADSHEET_ID))` no editor).
7. **Implante uma nova versão** do Web App:
   - `Implantar` → `Gerenciar implantações` → editar a implantação atual → `Nova versão`.
   - Tipo: **Aplicativo da Web**
   - Executar como: **Eu**
   - Acesso: **Qualquer pessoa**
   - Salvar.
8. **A URL do Web App permanece a mesma** (já configurada em `index.html` no `window.TRACKING_CONFIG.url`). Se a URL mudar, atualize-a nos 4 HTMLs.

### Permissões necessárias

Na primeira execução, o Apps Script vai pedir autorização para:
- Acessar Spreadsheets (para ler/escrever cadastros).
- Enviar emails via `MailApp` (para notificar você de novos cadastros e os usuários quando forem aprovados).

Aceite todas as permissões.

## 2. Fluxo de aprovação manual

Quando alguém solicita acesso pelo site, três coisas acontecem:

1. Uma linha é adicionada à aba **`Cadastros`** com `Status = PENDENTE`.
2. Você recebe um email em `avnerpaesgomes@gmail.com` com os dados do cadastro.
3. O usuário vê: *"Solicitação enviada. Você receberá email quando o acesso for aprovado."*

### Para aprovar/negar (3 formas):

#### A) Direto na planilha (mais simples)

Abra a aba `Cadastros`, encontre a linha do email, mude a coluna **Status** de `PENDENTE` para:
- `APROVADO` — libera o acesso na próxima vez que o usuário entrar com aquele email.
- `NEGADO` — bloqueia.

> **Atenção:** mudar o Status na planilha **não dispara email** ao usuário. Use a opção C abaixo se quiser que o aprovado seja notificado.

#### B) Adicionar como admin permanente

Edite no Apps Script a constante `ALWAYS_APPROVED` e adicione o email:

```javascript
const ALWAYS_APPROVED = [
  'avnerpaesgomes@gmail.com',
  'novo.admin@example.com'
];
```

Salve. Esse email passa a ser sempre aprovado, mesmo sem entrada na planilha.

#### C) Via função do Apps Script (envia email de boas-vindas)

No editor do Apps Script, no painel de funções, cole no console / execute:

```javascript
approveEmail('usuario@exemplo.com');
// ou
denyEmail('usuario@exemplo.com');
```

`approveEmail` atualiza o Status na planilha + envia email automático para o usuário avisando que o acesso foi liberado.

## 3. Logout / Limpar sessão

Para forçar logout em um navegador, abra o console do site e rode:

```javascript
DatageoAuth.logout();
```

Ou apague manualmente `localStorage.dg_auth_session` no DevTools.

## 4. Gate de referer nos dashboards externos

Os dashboards (`vbp-parana`, `precos-diarios`, `c2-parana`, etc.) ficam em `https://avnergomes.github.io/<dashboard>/`. Como `localStorage` é por origem, eles **não compartilham sessão** com `datageoparana.github.io`. Em vez de duplicar todo o login gate em cada dashboard, usamos um **gate por referer**: o dashboard só abre se:

1. O visitante chegou via link do `datageoparana.github.io` (referer válido), OU
2. Já tem sessão ativa neste mesmo dashboard (sessionStorage), OU
3. Está navegando dentro do mesmo origin (mudança de página interna)

Caso contrário, o dashboard redireciona para `https://datageoparana.github.io/?from=<url-original>` — ou seja, manda o usuário para o login.

### Snippet inline no `<head>` de cada dashboard

Já aplicado nos 11 dashboards listados abaixo. Para novos dashboards, cole este bloco **logo após** `<head>`:

```html
<!-- Datageo Auth Referer Gate -->
<script>
  (function () {
    try {
      var ALLOWED = ['datageoparana.github.io'];
      var ROOT = 'https://datageoparana.github.io/';
      var KEY = 'dg_dashboard_pass';
      if (sessionStorage.getItem(KEY) === '1') return;
      var refHost = '';
      try { refHost = new URL(document.referrer || '').host; } catch (e) {}
      if (refHost && (refHost === location.host || ALLOWED.indexOf(refHost) !== -1)) {
        sessionStorage.setItem(KEY, '1');
        return;
      }
      location.replace(ROOT + '?from=' + encodeURIComponent(location.host + location.pathname));
    } catch (e) {}
  })();
</script>
```

> **Importante:** o gate roda **antes** de qualquer outro recurso, no topo do `<head>`. Não use `<script src="...">` externo aqui — isso introduz um flash de conteúdo enquanto o script externo carrega. O snippet inline (~15 linhas) garante zero flash.

### Pré-requisito no `datageoparana.github.io/index.html`

Os links/cartões para os dashboards **precisam** usar `rel="noopener"` (sem `noreferrer`), senão o referer é apagado e o gate redireciona o próprio usuário legítimo. Já corrigido neste repositório.

### Dashboards já protegidos

| Repositório | Arquivo modificado | URL pública |
|---|---|---|
| `vbp-parana` | `dashboard/index.html` | https://avnergomes.github.io/vbp-parana/ |
| `precos-diarios` | `dashboard/index.html` | https://avnergomes.github.io/precos-diarios/ |
| `precos-florestais` | `dashboard/index.html` | https://avnergomes.github.io/precos-florestais/ |
| `precos-de-terras` | `dashboard/index.html` | https://avnergomes.github.io/precos-de-terras/ |
| `comexstat-parana` | `dashboard/index.html` | https://avnergomes.github.io/comexstat-parana/ |
| `emprego-agro-parana` | `dashboard/index.html` | https://avnergomes.github.io/emprego-agro-parana/ |
| `censo-parana` | `dashboard/index.html` | https://avnergomes.github.io/censo-parana/ |
| `credito-rural-parana` | `dashboard/index.html` | https://avnergomes.github.io/credito-rural-parana/ |
| `saude-parana` | `dashboard/index.html` | https://avnergomes.github.io/saude-parana/ |
| `seguranca-parana` | `dashboard/index.html` | https://avnergomes.github.io/seguranca-parana/ |
| `c2-parana` | `index.html` | https://avnergomes.github.io/c2-parana/ |

### Versão hospedada (alternativa)

Para conveniência, `dashboard-gate.js` neste repositório contém a mesma lógica como script standalone. Se quiser usar via `<script src="https://datageoparana.github.io/dashboard-gate.js"></script>`, ciente do flash, é uma opção válida.

### Limites do referer gate

- **Não compartilha sessão entre dashboards.** Cada dashboard mantém seu próprio `sessionStorage` (per-origin). O usuário só passa pelo gate uma vez por sessão de browser por dashboard, mas se fechar e reabrir, precisa voltar via datageo.
- **Bypass via DevTools.** Como qualquer gate client-side, um usuário com `sessionStorage.setItem('dg_dashboard_pass','1')` no console burla. Para segurança real, ver §6 (Stripe + JWT).
- **Crawlers/bots não passam.** Páginas com `meta robots="index,follow"` continuam indexáveis pelo Google (que vê o HTML antes do redirect). Se quiser bloquear indexação completamente, mude para `noindex,nofollow` em cada dashboard.

## 5. Limitações conhecidas

- **Não é segurança forte.** Sendo um site estático, qualquer pessoa com conhecimento de DevTools pode forjar um `dg_auth_session` no localStorage e burlar o gate. Para os **dados em si** (que estão em arquivos públicos do GitHub Pages), isso é apenas uma camada de coleta de cadastros e fricção.
- **Segurança real virá com Stripe + backend.** Quando o pagamento for implementado, os dashboards precisarão buscar dados de um backend autenticado (Supabase, Cloudflare Workers, etc.) com token JWT real. O gate de hoje serve para a fase de pré-pagamento.
- **CORS:** o `POST` para o Apps Script usa `mode: 'no-cors'` (não consegue ler resposta), então o cadastro mostra mensagem otimista. O `GET` de verificação usa CORS normal e lê resposta JSON.

## 6. Próximos passos (Stripe)

Quando integrar Stripe:

1. Adicionar campos `plan`, `subscription_id`, `subscription_status` à aba `Cadastros`.
2. Trocar verificação `?action=check` para também validar assinatura ativa via webhook do Stripe.
3. Mover backend do Apps Script para uma função serverless (Cloudflare Workers, Supabase Edge Function) para suportar webhooks do Stripe e tokens JWT assinados.
4. Os dashboards passam a buscar dados de endpoints autenticados, não de arquivos estáticos.
