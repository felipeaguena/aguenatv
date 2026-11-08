# AGUENATV - Documentação de Arquitetura, Auditoria de Recursos e Guia do Código

> **Data da Auditoria:** Novembro de 2026  
> **Versão da Aplicação:** v0.3.0  
> **Ambiente de Produção:** Oracle Cloud Infrastructure (Always Free) - VM Ubuntu 22.04 LTS (IP: 163.176.207.140)

---

## 1. Auditoria de Limites e Tiers Gratuitos (Free Tiers)

A análise minuciosa de todos os serviços conectados constatou que **o sistema está configurado de forma extremamente eficiente, com risco ZERO de cobrança surpresa ou estouro de cotas gratuitas**, desde que mantidas as diretrizes abaixo.

### Tabela Resumo de Serviços e Limites

| Serviço / Componente | Papel no Sistema | Tier / Plano | Limite Gratuito Mensal | Consumo Real Estimado | Risco de Estouro |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Oracle Cloud (OCI)** | Hospedagem da aplicação (Next.js / PM2) | Always Free | **10 TB / mês** de saída<br>**200 GB** Boot Disk | **< 10 GB / mês**<br>Uso de disco: 8.5 GB (19%) | **ZERO (0%)** |
| **Turso Database** | Banco SQLite Serverless em nuvem | Starter (Free) | **25M** gravações / mês<br>**500M** leituras / mês<br>**9 GB** armazenamento | Atualmente **INATIVO** na VM (usa JSON local). Se ativado: < 200k gravações | **ZERO (0%)** |
| **TMDb API** | Metadados de Filmes e Séries (sinopse, elenco, posters) | Free Developer | ~50 req/s (Sem teto mensal para uso não-comercial) | Cache de 24h na VM e navegador; imagens via CDN TMDb gratuita | **ZERO (0%)** |
| **Kitsu API** | Metadados de Animes (títulos romaji, episódios) | Free Community | ~300 req / 5 minutos | Consulta apenas Tier 2/Anime, cache de 24h | **ZERO (0%)** |
| **TheIntroDB & AniSkip** | Tempos de abertura/encerramento (pular intro) | Free Community | Sem cota declarada | Cache de 2 horas na VM | **ZERO (0%)** |
| **GitHub Releases** | Verificação e download de APKs | Public API | 60 req / hora não-autenticado | Cache de 5 minutos (`revalidate: 300`) com fallback local | **ZERO (0%)** |
| **IPTV Provider (Xtream)** | Fornecimento dos canais, filmes e séries | Assinatura Externa | Definido pelo fornecedor (geralmente **1 tela**) | Streaming direto do cliente para o IPTV; a VM não faz relay do vídeo | **Atenção apenas a telas simultâneas** |

---

### Detalhamento Crítico dos Serviços

#### 1.1. Oracle Cloud (OCI Always Free)
* **Especificações Reais da Instância na VM**:
  - Processador: AMD EPYC 7551 (2 vCPUs)
  - Memória: 1 GB RAM física (956 MiB) + 4 GB Swap configurado
  - Disco: 45 GB (apenas 8.5 GB ocupados, **37 GB livres - 19% de uso**)
  - Processo PM2 (`aguenatv`): Consome apenas **~68 MB de RAM**, operando com 1.3% de CPU média.
* **Por que a banda não estoura os 10 TB?**
  - **Ponto crucial de arquitetura**: O fluxo pesado de vídeo (arquivos de 1 GB a 15 GB de filmes, episódios e streams ao vivo HLS/TS) **NÃO trafega pela VM da Oracle**.
  - O player de vídeo (ArtPlayer/HLS.js) executa uma conexão direta HTTP/HTTPS entre o cliente (navegador do usuário ou APK) e o servidor do provedor IPTV (`rootdns.cc`).
  - A VM serve apenas o HTML compilado, assets estáticos e pequenas respostas JSON de metadados. O consumo mensal de tráfego de saída da VM é inferior a 10 GB.

#### 1.2. Turso Database (libSQL / SQLite Serverless)
* **Diagnóstico da Produção**:
  - No arquivo `/home/ubuntu/aguenatv/.env.local`, as variáveis `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` estão vazias.
  - Portanto, a função `isTursoConfigured()` retorna `false`.
  - **O sistema está operando em modo Local Persistence**: todos os usuários, favoritos, itens assistidos e progresso de reprodução são gravados nos arquivos locais JSON dentro de `/data/` com proteção de escrita atômica (`runWithLock`) e cópias `.bak`.
* **Se o usuário decidir ativar o Turso no futuro**:
  - O plano gratuito Starter do Turso oferece **25 milhões de operações de escrita** e **500 milhões de leitura** por mês.
  - Mesmo que uma pessoa assista 3 horas de vídeo todos os dias, com sincronização a cada 5 segundos, ela gerará ~64.800 gravações por mês, o que representa **apenas 0,25% da cota gratuita**.

#### 1.3. Provedor IPTV (Xtream Codes API)
* O único risco real de interrupção não decorre de custo financeiro, mas da **política de conexões simultâneas** do provedor da lista IPTV.
* A maioria dos painéis Xtream Codes permite **1 ou no máximo 2 conexões simultâneas**. Se um usuário estiver assistindo a um filme no APK e outra pessoa tentar assistir a um canal no PC com o mesmo login de playlist, o provedor derrubará a transmissão com erro `401 Unauthorized` ou `403 Forbidden`.

---

## 2. Esquema de Arquitetura do Sistema

```mermaid
flowchart TD
    subgraph CLIENTES ["Camada de Apresentação (Frontend)"]
        WEB["Navegador Desktop / Mobile (Next.js 16 Client)"]
        APK["App Android Nativo (Capacitor 8 + BackgroundDownloadPlugin)"]
        TV["Interface Smart TV (Spatial D-Pad Navigation)"]
    end

    subgraph CACHE_LOCAL ["Armazenamento no Cliente"]
        IDB["IndexedDB via Dexie.js (Canais, VODs, Categorias, Downloads)"]
        LS["LocalStorage (Sessão, Cache Temporário, Flags)"]
    end

    subgraph SERVIDOR_ORACLE ["Servidor de Produção (Oracle Cloud Always Free)"]
        direction TB
        PM2["PM2 Daemon (Node.js Standalone - Porta 80)"]
        MW["Middleware Next.js (Validação JWT Jose)"]
        
        subgraph API_ROUTES ["Rotas de API (/app/api)"]
            AUTH_API["/api/auth (Login, Logout, Me, Rate-Limit Brute Force)"]
            CW_API["/api/continue-watching (Sincronização de Progresso)"]
            META_API["/api/metadata & /season & /person (TMDb / Kitsu / TVMaze)"]
            SKIP_API["/api/skip-times (TheIntroDB v4 / AniSkip)"]
            IPTV_PROXY["/api/iptv (Proxy Fallback com Compressão Gzip)"]
            VER_API["/api/version (GitHub Releases Check)"]
        end

        subgraph DISK_DATA ["Persistência em Disco (/data)"]
            JSON_FILES["local-continue-watching.json\nlocal-favorites.json\nlocal-watched.json\nlocal-users.json"]
        end
    end

    subgraph SERVICOS_EXTERNOS ["Sistemas e Serviços Conectados"]
        IPTV_SRV["Servidor IPTV Xtream (rootdns.cc / dfpump.top)"]
        TMDB_SRV["TMDb API (The Movie Database)"]
        KITSU_SRV["Kitsu API (Anime Database)"]
        INTRO_SRV["TheIntroDB & AniSkip"]
        GH_SRV["GitHub Releases (AGUENATV APKs)"]
        TURSO_SRV["Turso DB (libSQL Serverless - Opcional)"]
    end

    %% Conexões Frontend
    WEB --> MW
    APK --> MW
    TV --> MW

    WEB <--> IDB
    APK <--> IDB
    WEB <--> LS
    APK <--> LS

    %% Conexões Servidor Interno
    MW --> API_ROUTES
    CW_API <--> DISK_DATA
    AUTH_API <--> DISK_DATA
    CW_API -.->|Se configurado| TURSO_SRV
    AUTH_API -.->|Se configurado| TURSO_SRV

    %% Integrações Externas do Servidor
    META_API --> TMDB_SRV
    META_API --> KITSU_SRV
    SKIP_API --> INTRO_SRV
    VER_API --> GH_SRV
    IPTV_PROXY --> IPTV_SRV

    %% Conexão Direta Crítica de Vídeo (Economia de Banda)
    WEB ==>|Streaming Direto de Vídeo HLS/TS/MP4| IPTV_SRV
    APK ==>|Streaming Direto de Vídeo HLS/TS/MP4| IPTV_SRV
    WEB -->|Client-Side Fetch da Lista M3U (Sem passar pela VM)| IPTV_SRV
```

---

## 3. Origem e Fluxo das Informações

1. **Autenticação e Sessão**:
   - As credenciais de acesso ao AGUENATV são validadas em `/api/auth/login`.
   - Se o Turso estiver ativo, consulta a tabela `app_users`; caso contrário, consulta `data/local-users.json` (senhas criptografadas com `bcryptjs`).
   - Um cookie HTTP-only seguro `session_token` assinado via JWT (`jose` com algoritmo HS256) é emitido para o navegador ou APK.
2. **Listas de Canais, Filmes e Séries (M3U / Xtream Codes)**:
   - **Fluxo Principal (Client-Side)**: O cliente executa `fetchIPTVApi()` diretamente a partir do IP do usuário para `https://rootdns.cc/player_api.php`.
   - **Por que é eficiente**: O Cloudflare não bloqueia IPs residenciais/4G, não há limite de tamanho de payload da Vercel/Node, e o JSON (15MB+) é salvo diretamente no banco local do navegador (`IndexedDB` via `Dexie.js`).
   - **Fluxo de Fallback (Server Proxy)**: Se o navegador falhar (ex: bloqueio de CORS local), ele recorre a `/api/iptv`, que baixa a lista, comprime em Gzip (reduzindo de 15MB para ~1.1MB) e entrega ao cliente.
3. **Metadados e Capas**:
   - O título limpo do arquivo é enviado para `/api/metadata`.
   - **Tier 1**: Consulta a API do The Movie Database (TMDb) com algoritmo de variantes e sinônimos.
   - **Tier 2 (Animes)**: Se for animação japonesa ou contiver a tag de anime, complementa com a API do Kitsu para obter sinopse e nomes em japonês/romaji.
   - **Tier 3 (Séries não encontradas)**: Fallback para a API do TVMaze.
   - Todas as respostas são armazenadas no cache de memória da VM e cacheadas por 24 horas no Next.js.
4. **Reprodução Contínua e Continue Assistindo**:
   - Durante a reprodução no player (ArtPlayer), a cada 5 segundos o hook `useContinueWatching` envia o progresso (`currentTime`, `duration`, `progress_percentage`) para `/api/continue-watching`.
   - A rota salva os dados no arquivo local JSON e, se configurado, no banco Turso.
5. **Downloads Offline (Exclusivo APK Nativo)**:
   - O usuário clica para baixar um filme ou episódio.
   - O plugin nativo Java `BackgroundDownloadPlugin` assume o download em segundo plano usando o `DownloadManager` do Android, exibindo notificações do sistema operacional.
   - O arquivo é gravado no armazenamento do aparelho e registrado no `IndexedDB` (`offline_downloads`).

---

## 4. Diagnóstico da Arquitetura Next.js e Possíveis Gargalos

Durante a auditoria de código, foram identificados os seguintes pontos que merecem atenção:

### ⚠️ Gargalo 1: Frequência de Gravação em `continue-watching`
* **Cenário Atual**: Em [`useContinueWatching.ts`](file:///c:/Users/felipeaguena/Documents/iptv/hooks/useContinueWatching.ts), o `MIN_INTERVAL_MS` está fixado em 5 segundos (`5000ms`).
* **Impacto**: Ao assistir a um filme de 2 horas, são disparadas **1.440 requisições HTTP POST** para `/api/continue-watching`. A cada requisição, a rota adquire um lock assíncrono, lê o arquivo JSON do disco, serializa os dados e grava um arquivo temporário com rename atômico.
* **Oportunidade de Melhoria**:
  - Aumentar o intervalo para **15 a 30 segundos**.
  - Garantir o envio imediato apenas em eventos de `pause`, `ended` ou quando o usuário sai da página (`beforeunload` / desmontagem do componente).
  - Isso reduz a carga de I/O de disco e requisições HTTP na VM em até **80%**.

### ⚠️ Gargalo 2: Cache em Memória Volátil (`globalCache`)
* **Cenário Atual**: Em [`title-search.ts`](file:///c:/Users/felipeaguena/Documents/iptv/lib/title-search.ts), o cache de metadados utiliza um `Map` estático limitado a 1.500 entradas.
* **Impacto**: Toda vez que a aplicação é reiniciada ou que o script de deploy roda, esse cache em memória é esvaziado.
* **Atenuação Existente**: O Next.js já atenua esse efeito porque o `fetch()` interno possui `next: { revalidate: 86400 }`, preservando as respostas no Data Cache em disco (`.next/cache`).

### ⚠️ Gargalo 3: Consumo de Memória no Parse de Grandes Payloads no Proxy
* **Cenário Atual**: Se a lista IPTV contiver 80.000 itens (aproximadamente 25MB de texto JSON) e a requisição cair no proxy da VM (`/api/iptv`), o Node.js precisa alocar cerca de 80MB a 120MB de heap para ler a string, fazer o buffer e comprimir via Gzip.
* **Impacto**: Em uma máquina de 1 GB de RAM, múltiplos usuários solicitando recarga da lista completa via proxy ao mesmo tempo poderiam provocar picos de swap.
* **Atenuação Existente**: A busca direta pelo cliente (`fetchIPTVApi`) protege a VM contra esse cenário na esmagadora maioria dos acessos.

---

## 5. Schema de Arquivos: Onde Encontrar o Quê no Código

Abaixo está o mapa completo da organização do projeto:

```
c:\Users\felipeaguena\Documents\iptv\
├── app/                                 # App Router do Next.js (Rotas, Telas e APIs)
│   ├── (auth)/login/page.tsx            # Tela de Login do AGUENATV
│   ├── (dashboard)/                     # Layout autenticado principal
│   │   ├── layout.tsx                   # Shell da dashboard com Navbar e rodapé
│   │   ├── page.tsx                     # Página Inicial (Home / Em Alta / Continue Assistindo)
│   │   ├── movies/                      # Catálogo e detalhes de Filmes
│   │   │   ├── page.tsx                 # Grade de filmes por categoria
│   │   │   ├── [id]/page.tsx            # Detalhes do filme (sinopse, elenco, trailer)
│   │   │   └── [id]/watch/page.tsx      # Player do filme
│   │   ├── series/                      # Catálogo e detalhes de Séries e Animes
│   │   │   ├── page.tsx                 # Grade de séries por categoria
│   │   │   ├── [id]/page.tsx            # Detalhes da série e listagem de temporadas
│   │   │   └── [id]/watch/page.tsx      # Player de episódios da série
│   │   ├── live/                        # TV ao Vivo
│   │   │   ├── page.tsx                 # Guia de canais ao vivo
│   │   │   └── watch/page.tsx           # Player de TV ao vivo com troca rápida
│   │   ├── favorites/page.tsx           # Lista de Favoritos do usuário
│   │   ├── history/page.tsx             # Histórico de Itens Já Assistidos
│   │   ├── offline/page.tsx             # Painel de Downloads Offline (APK)
│   │   ├── settings/page.tsx            # Configurações de Playlists, Perfil e Sistema
│   │   └── admin/                       # Painel Administrativo
│   │       ├── users/page.tsx           # Gerenciamento de Usuários
│   │       └── blocked-ips/page.tsx     # Gerenciamento de IPs bloqueados por brute force
│   ├── api/                             # Rotas de Backend Serverless (Next.js API)
│   │   ├── auth/                        # Endpoints de login, logout e validação de sessão
│   │   ├── continue-watching/           # GET/POST/DELETE de progresso de vídeo
│   │   ├── favorites/                   # Adição e remoção de favoritos
│   │   ├── watched/                     # Marcação de filmes/episódios assistidos
│   │   ├── iptv/                        # Proxy resiliente para a API Xtream Codes
│   │   │   └── video-info/              # Metadados técnicos do stream (codec, resolução)
│   │   ├── metadata/                    # Enriquecimento com TMDb e Kitsu
│   │   │   ├── season/                  # Sinopses e dados de episódios por temporada
│   │   │   └── route.ts                 # Busca principal com resolução de variantes
│   │   ├── person/                      # Filmografia e detalhes de atores/diretores
│   │   ├── skip-times/                  # Tempos de Intro e Encerramento (AniSkip/TheIntroDB)
│   │   ├── version/                     # Consulta de novas releases no GitHub
│   │   └── admin/                       # Endpoints restritos de usuários e IPs bloqueados
│   ├── globals.css                      # Estilos globais e temas Tailwind CSS v4
│   └── layout.tsx                       # RootLayout (HTML base, fontes, metadados)
│
├── components/                          # Componentes React Modulares
│   ├── player/                          # Componentes do Reprodutor de Vídeo
│   │   ├── VideoPlayer.tsx              # Player oficial baseado em ArtPlayer e HLS.js
│   │   └── FloatingPlayer.tsx           # Modo Picture-in-Picture / Mini-player
│   ├── watch/                           # Visualização de Reprodução
│   │   └── WatchView.tsx                # Tela unificada de exibição do player e grade
│   ├── ui/                              # Elementos de Interface do Usuário
│   │   ├── Navbar.tsx                   # Cabeçalho sticky com omnibar de busca rápida
│   │   ├── UpdateAlertModal.tsx         # Modal de atualização automática do APK Android
│   │   ├── OfflineBanner.tsx            # Alerta visual quando o dispositivo perde a internet
│   │   └── ImageWithFallback.tsx        # Renderizador seguro de posters e capas
│   ├── media/                           # Cards e Carrosséis de Mídia
│   │   ├── MediaCard.tsx                # Card individual de filme/série com tags de progresso
│   │   └── MediaCarousel.tsx            # Fileiras de rolagem horizontal na Home
│   └── tv/                              # Componentes exclusivos para Smart TV
│       ├── TvNavbar.tsx                 # Menu de navegação adaptado para controle remoto
│       └── TvHomeView.tsx               # Interface com foco espacial (D-Pad)
│
├── lib/                                 # Lógica de Negócio e Utilitários
│   ├── iptv-client.ts                   # Cliente de comunicação com provedores IPTV
│   ├── db-local.ts                      # Banco de dados IndexedDB (Dexie.js) no cliente
│   ├── download-manager.ts              # Gerenciador de downloads offline nativos no APK
│   ├── title-search.ts                  # Normalização de títulos, variantes e cache TMDb
│   ├── anime-aliases.ts                 # Dicionário de sinônimos de animes conhecidos
│   ├── series.ts                        # Organização de temporadas, episódios e ordenação
│   ├── rate-limit.ts                    # Bloqueio progressivo de IP contra ataques de força bruta
│   ├── auth.ts                          # Funções de descriptografia e validação de tokens JWT
│   ├── turso.ts                         # Conector oficial do banco Turso / libSQL
│   ├── users-local.ts                   # Persistência em arquivo local para usuários e dados
│   ├── tv-spatial-navigation.ts         # Motor de navegação para teclas de controle remoto
│   └── types.ts                         # Definições de interfaces e tipos TypeScript
│
├── android/                             # Projeto Nativo Android (Capacitor)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml          # Permissões do Android (Instalação, Notificações, Armazenamento)
│   │   ├── java/com/aguenatv/app/
│   │   │   ├── MainActivity.java        # Ponto de entrada nativo do app
│   │   │   └── BackgroundDownloadPlugin.java # Plugin nativo de download e instalação de APK
│   │   └── res/xml/file_paths.xml       # Caminhos autorizados para o FileProvider do Android
│   └── build.gradle                     # Configurações do Gradle e SDK Android
│
├── data/                                # Armazenamento de Dados Locais na VM (JSON)
│   ├── local-users.json                 # Usuários do sistema e hashes de senha
│   ├── local-continue-watching.json     # Histórico de reprodução e progresso
│   ├── local-favorites.json             # Itens favoritados
│   └── local-watched.json               # Marcações de itens assistidos
│
├── turso/                               # Configurações do Banco Serverless
│   └── schema.sql                       # Esquema DDL completo das tabelas e índices
│
├── scripts/                             # Scripts Utilitários e DevOps
│   ├── deploy.sh                        # Script automatizado de deploy em produção na VM
│   └── merge_continue.py                # Script em Python para migração segura de histórico
│
├── middleware.ts                        # Interceptador global do Next.js (Proteção de rotas com JWT)
├── next.config.ts                       # Configuração do Next.js (Standalone, Turbopack, Headers)
└── package.json                         # Dependências e scripts do projeto
```

---

## 6. Recomendações e Próximos Passos Sugeridos

1. **Ajuste de Throttle no Progresso de Reprodução**:
   - Modificar o `MIN_INTERVAL_MS` em [`useContinueWatching.ts`](file:///c:/Users/felipeaguena/Documents/iptv/hooks/useContinueWatching.ts) de `5000` para `15000` (15 segundos) e registrar o salvamento no evento `pause` e na saída da página. Isso aliviará significativamente o I/O do disco da VM sem qualquer perda perceptível para o usuário.
2. **Ativação Opcional do Turso**:
   - Se desejar sincronizar os favoritos e o histórico entre diferentes aparelhos sem depender do backup do disco local da VM, basta criar um banco gratuito no [Turso](https://turso.tech) e preencher `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no `.env.local` da VM. O código já está 100% pronto para fazer a transição automática.
3. **Atenção às Conexões Simultâneas do IPTV**:
   - Certifique-se de que cada membro da família ou tela ativa possua uma lista/usuário próprio ou que o pacote do seu fornecedor IPTV suporte mais de 1 conexão simultânea para evitar que a transmissão caia repentinamente durante o uso.
