# 🎬 AGUENATV - Player Inteligente e Privado

Sistema moderno, ultra-otimizado e seguro de reprodução IPTV inspirado no Design System do **[Miruro](https://www.miruro.cx/)**, desenvolvido com **Next.js (App Router)**, **Tailwind CSS**, **HLS.js**, **Turso (libSQL/SQLite Serverless)** e **IndexedDB**.

Projetado especificamente para rodar com **consumo zero** no plano gratuito da **Vercel** e do **Turso**, **sem pausa por inatividade** (diferente de instâncias tradicionais de banco de dados).

---

## 🚀 Características Principais

1. **Design System Cinematográfico & Mobile First:**
   * Tema escuro OLED Deep Dark (`#0b0c10`), acabamento em vidro fosco (*glassmorphism*), acentos em violeta elétrico (`#8b5cf6`) e micro-interações fluidas.
   * Drawer lateral móvel (*Hamburger menu*) acessível no mobile ao lado do logotipo **AGUENATV**.
   * Carrossel de destaques dinâmico (*Hero Spotlight*).
   * Cards com proporção vertical 3:4, zoom suave no hover e badges de qualidade.

2. **Segurança Reforçada e Anti-Bot:**
   * **Página de Login Fechada:** Sem links de cadastro público. Acesso exclusivo para usuários já cadastrados.
   * **Proteção contra Brute-Force:** Bloqueio automático do IP por **1 hora** após 3 tentativas consecutivas de senha incorreta.
   * **Rotas Ocultas (*Stealth Mode*):** Visitantes não autenticados não conseguem visualizar nenhuma rota interna ou catálogo; todas as rotas redirecionam ou retornam 404/401 via middleware.
   * **Senhas Criptografadas:** Hashes seguros gerados com **Bcrypt** e sessões gerenciadas em cookies `httpOnly` via **JWT (Jose)**.

3. **Gerenciamento de Usuários (Painel Admin) & Configurações M3U:**
   * Acesso restrito a administradores em `/admin/users`.
   * Criação, edição de dados/senhas e exclusão de contas.
   * Dropdown de navegação no desktop com links rápidos para Favoritos, Usuários, Configurações de Listas e Sair.
   * Gerenciamento de múltiplas listas M3U / Xtream em `/settings`.
   * Isolamento total: cada usuário tem sua própria lista de favoritos e histórico de reprodução.

4. **Busca Relativa (Fuzzy Search) 100% no Frontend:**
   * Motor **MiniSearch** rodando na memória RAM do navegador.
   * Tolerância a erros de digitação e acentuação (ex: digite `"vingadors"` e encontre `"Vingadores: Ultimato"`).
   * **Zero requisições ao servidor**: respostas instantâneas em menos de 15ms.

5. **Consumo Zero de Servidor para Listas (Offline-First):**
   * Listas IPTV armazenadas localmente no **IndexedDB** do navegador com **Dexie.js**.
   * Suporte a sincronização automática (TTL inteligente) e botão de sincronização manual imediata.
   * O fluxo de vídeo é consumido **direto do cliente para o servidor IPTV**, sem passar pela Vercel (economizando 100% da banda).

6. **Reprodução em Popup / Modal e Histórico de Assistidos:**
   * Player com suporte a HLS (`.m3u8`), MPEG-TS e MP4.
   * Alternância entre **Modo Teatro Expandido** e **MiniPlayer Flutuante (Picture-in-Picture)** que continua tocando enquanto você navega pelo site.
   * **Status Visual de Assistido:** Conteúdos assistidos recebem **borda verde esmeralda (`border-emerald-500`)** e um ícone de confirmação no canto do poster.
   * **Continue Assistindo Otimizado:** Armazena de forma unificada 1 único card por título contendo o último capítulo assistido.

7. **Catálogo Geral em Lista de Texto Puro (`/catalog`):**
   * Página ultrarrápida sem carregamento de imagens.
   * Exibição paginada em lotes de **50 itens por página**.
   * Filtros dinâmicos por tipo (TV ao Vivo, Filmes, Séries) e categoria.

---

## 🛠️ Como Iniciar Localmente

### 1. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```

Abra no navegador em: [http://localhost:3000](http://localhost:3000)

### 2. Primeiro Acesso:
O sistema vem pré-configurado com uma conta administrativa inicial:
* **Usuário:** `felipeaguena`
* **Senha:** `1652`

---

## 🗄️ Configuração do Banco de Dados (Turso - Gratuito sem Pausa)

O Turso fornece um banco SQLite Serverless na nuvem com até 9GB e 500 bancos gratuitos, **sem pausar por inatividade**.

1. Crie uma conta gratuita em [turso.tech](https://turso.tech).
2. Instale a CLI do Turso ou crie um banco pelo painel web:
   ```bash
   turso db create aguenatv
   turso db show aguenatv --url
   turso db tokens create aguenatv
   ```
3. Opcional: Se preferir aplicar as tabelas manualmente, copie o conteúdo de [`turso/schema.sql`](file:///c:/Users/felipeaguena/Documents/iptv/turso/schema.sql) no shell SQL do Turso (`turso db shell aguenatv`).
   * *Nota: O sistema possui auto-migração transparente (`ensureTursoSchema`), criando as tabelas e o administrador inicial automaticamente na primeira requisição se o banco estiver vazio!*
4. Adicione as variáveis no seu `.env.local`:
   ```env
   TURSO_DATABASE_URL=libsql://aguenatv-seu-usuario.turso.io
   TURSO_AUTH_TOKEN=seu_token_gerado_no_turso
   JWT_SECRET=sua-chave-secreta-jwt-de-32-caracteres
   ```

---

## 🚢 Como Fazer o Deploy Gratuito na Vercel

1. Suba este projeto para um repositório no seu GitHub.
2. Acesse [vercel.com](https://vercel.com) e clique em **Add New Project -> Import Git Repository**.
3. Em **Environment Variables**, adicione as seguintes variáveis:
   * `TURSO_DATABASE_URL`: URL do seu banco Turso (`libsql://...`)
   * `TURSO_AUTH_TOKEN`: Token de autenticação gerado pelo Turso
   * `JWT_SECRET`: Chave secreta de 32+ caracteres para assinatura dos cookies JWT
4. Clique em **Deploy**. Sua aplicação estará online com certificado SSL automático e alta velocidade na Edge!
