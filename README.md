# Datageo Paraná

Landing page e hub central do ecossistema **Datageo Paraná** — plataforma de visualização e análise de dados públicos do estado do Paraná. Reúne em um único lugar os links e descrições de todos os dashboards do ecossistema.

**🔗 [Acessar](https://datageoparana.github.io/)**

---

## Sobre

O **Datageo Paraná** é um ecossistema de dashboards analíticos de dados públicos paranaenses, desenvolvido por [Avner Gomes](https://avnergomes.github.io/portfolio/). A landing page funciona como ponto de entrada do ecossistema, apresentando os 8 dashboards disponíveis, a arquitetura do projeto e as referências de dados utilizadas.

O site é desenvolvido com HTML5, CSS3 e JavaScript puro — sem frameworks ou etapas de build — e hospedado via GitHub Pages na organização [`datageoparana`](https://github.com/datageoparana).

---

## Dashboards do Ecossistema

| Dashboard | Descrição |
|-----------|-----------|
| **VBP Paraná** | Valor Bruto da Produção agropecuária paranaense |
| **Preços Diários** | Preços diários de commodities agropecuárias |
| **Preços Florestais** | Preços de produtos florestais no Paraná |
| **Preços de Terras** | Valor de terras agrícolas por região |
| **ComexStat Paraná** | Exportações e importações do agronegócio paranaense |
| **Emprego Agro Paraná** | Empregos formais no setor agropecuário |
| **Censo Paraná** | Dados demográficos dos Censos IBGE 1991–2022 |
| **Crédito Rural** | Crédito rural do SICOR/BCB 2013–2026 |

---

## Tecnologias

| Categoria | Tecnologia |
|-----------|-----------|
| Marcação | HTML5 |
| Estilização | CSS3 |
| Interatividade | JavaScript puro (vanilla) |
| Backend de formulário | Google Apps Script |
| Hospedagem | GitHub Pages (organização `datageoparana`) |
| CI/CD | GitHub Actions |
| SEO | Meta tags, Open Graph, JSON-LD, sitemap.xml, robots.txt |

Não utiliza npm, Node.js, frameworks JS ou etapa de build.

---

## Estrutura do Projeto

```
datageoparana.github.io/
├── index.html              # Página principal — hub com cards dos dashboards
├── arquitetura.html        # Documentação da arquitetura do ecossistema
├── referencias.html        # Fontes de dados e referências bibliográficas
├── 404.html                # Página de erro personalizada
├── sitemap.xml             # Sitemap para SEO
├── robots.txt              # Diretrizes para crawlers
└── .github/
    └── workflows/
        ├── deploy.yml      # Deploy no GitHub Pages
        ├── lighthouse.yml  # Auditoria de performance (Lighthouse)
        ├── link-check.yml  # Verificação de links quebrados
        └── seo-check.yml   # Checagem automatizada de SEO
```

---

## Funcionalidades

- **8 cards de dashboards** — acesso direto a cada dashboard do ecossistema com descrição e link
- **Página de arquitetura** — documentação técnica da estrutura e fluxo de dados do ecossistema
- **Página de referências** — fontes de dados oficiais utilizadas em todos os dashboards
- **Botão "Reportar bug"** — envio de feedback via Google Apps Script, sem necessidade de conta GitHub
- **SEO otimizado** — meta tags completas, Open Graph, dados estruturados JSON-LD e sitemap XML
- **Rastreamento LGPD-compliant** — analytics respeitando a legislação brasileira de proteção de dados
- **Página 404 personalizada** — mantém identidade visual em acessos inválidos
- **CI/CD automatizado** — deploy, auditoria Lighthouse, verificação de links e checagem de SEO via GitHub Actions

---

## Desenvolvimento Local

Por ser um site estático puro, não é necessária nenhuma instalação.

### Opção 1 — Abrir diretamente

```bash
# Clonar o repositório
git clone https://github.com/datageoparana/datageoparana.github.io.git
cd datageoparana.github.io

# Abrir no navegador
open index.html
# ou simplesmente arraste index.html para o navegador
```

### Opção 2 — Servidor local (recomendado)

```bash
# Com Python
python -m http.server 8000
# Acesse: http://localhost:8000

# Com Node.js (se disponível)
npx serve .
# Acesse: http://localhost:3000
```

---

## Contribuindo

Para reportar problemas ou sugerir melhorias, utilize o botão **"Reportar bug"** disponível na própria página, ou abra uma *issue* diretamente no repositório.

---

## Licença

MIT License — consulte o arquivo `LICENSE` no repositório para detalhes.
