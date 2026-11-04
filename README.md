# 🎬 AGUENATV - Player Inteligente e Privado

Sistema moderno, ultra-otimizado e seguro de reprodução IPTV inspirado no Design System do **[Miruro](https://www.miruro.cx/)**, desenvolvido com **Next.js (App Router)**, **Tailwind CSS**, **HLS.js**, **Turso (libSQL/SQLite Serverless)** e **IndexedDB**.

Projetado para rodar com **alto desempenho** e **baixo consumo** na **Oracle Cloud (Always Free)**, **Vercel** ou **Docker**.

---

## 🚀 Características Principais

1. **Design System Cinematográfico & Mobile First:**
   * Tema escuro OLED Deep Dark (`#0b0c10`), acabamento em vidro fosco (*glassmorphism*), acentos em violeta elétrico (`#8b5cf6`) e micro-interações fluidas.
   * Drawer lateral móvel (*Hamburger menu*) acessível no mobile ao lado do logotipo **AGUENATV**.
   * Carrossel de destaques dinâmico (*Hero Spotlight*).
   * Cards com proporção vertical 3:4, zoom suave no hover e badges de qualidade.

2. **Segurança Reforçada (Security by Design):**
   * **Página de Login Fechada:** Sem links de cadastro público. Acesso exclusivo para usuários administrados.
   * **Proteção Anti-Brute-Force:** Bloqueio automático de IP por **1 hora** após 3 tentativas consecutivas de senha incorreta.
   * **Criptografia Forte:** Hashes seguros gerados com **Bcrypt** e sessões gerenciadas em cookies `httpOnly` via **JWT (Jose)** com chave criptográfica aleatória.
   * **Mitigação de SSRF (Server-Side Request Forgery):** Validação estrita de URLs que bloqueia acessos a loopback (`127.0.0.1`), redes privadas (RFC 1918) e serviços de metadados de nuvem (`169.254.169.254`).
   * **Cabeçalhos de Segurança HTTP:** Proteção nativa contra Clickjacking (`X-Frame-Options: SAMEORIGIN`), MIME-sniffing (`X-Content-Type-Options: nosniff`), HSTS e políticas de permissões restritas.

3. **Gerenciamento de Usuários (Painel Admin) & Configurações M3U:**
   * Acesso restrito a administradores em `/admin/users`.
   * Criação, edição de dados/senhas e exclusão de contas com isolamento completo de histórico, favoritos e playlists.

4. **Busca Relativa (Fuzzy Search) 100% no Frontend:**
   * Motor **MiniSearch** rodando na memória RAM do navegador com tolerância a erros de digitação e acentuação.
   * Respostas instantâneas em menos de 15ms sem onerar o servidor.

5. **Consumo Zero de Servidor para Listas (Offline-First):**
   * Listas IPTV armazenadas localmente no **IndexedDB** do navegador com **Dexie.js**.
   * O fluxo de vídeo é consumido **direto do cliente para o servidor IPTV**, sem intermediação desnecessária de banda.

---

## 🛠️ Como Iniciar Localmente

### 1. Pré-requisitos:
* Node.js 20+ instalado.

### 2. Configurar o ambiente:
Copie o arquivo de exemplo e defina suas variáveis:
```bash
cp .env.example .env.local
```

Gere um segredo seguro para JWT:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Cole o valor gerado na variável `JWT_SECRET` no seu `.env.local`.

### 3. Iniciar o servidor de desenvolvimento:
```bash
npm run dev
```

Abra no navegador em: [http://localhost:3000](http://localhost:3000)

### 4. Primeiro Acesso:
O sistema inicializa uma conta administrativa padrão:
* **Usuário:** `felipeaguena`
* Acesse o painel em `/admin/users` no primeiro login para atualizar sua senha pessoal para uma credencial forte e exclusiva.

---

## ☁️ Como Fazer o Deploy na Oracle Cloud (OCI Always Free)

A Oracle Cloud oferece instâncias gratuitas vitalícias (Always Free) excelentes para hospedar esta aplicação.

### Passo 1: Criar a Instância na Oracle Cloud
1. No painel da Oracle Cloud, vá em **Compute -> Instances -> Create Instance**.
2. Escolha **Ubuntu 22.04 LTS** ou **Ubuntu 24.04** (ou Oracle Linux).
3. Selecione a forma (shape) **Ampere (ARM)** com até 4 OCPUs e 24GB RAM, ou **VM.Standard.E2.1.Micro (AMD)**.
4. Salve sua chave SSH privada (`.key`) e clique em **Create**.

### Passo 2: Liberar as Portas na VCN (Virtual Cloud Network)
No painel da Oracle Cloud:
1. Vá em **Networking -> Virtual Cloud Networks** e selecione a VCN da sua instância.
2. Clique na **Default Security List**.
3. Em **Ingress Rules**, clique em **Add Ingress Rules**:
   * **Source CIDR:** `0.0.0.0/0`
   * **IP Protocol:** `TCP`
   * **Destination Port Range:** `80, 443, 3000`
   * Clique em **Add Ingress Rules**.

### Passo 3: Executar o Deploy Automatizado
Conecte-se à sua VM via SSH:
```bash
ssh -i sua-chave.key ubuntu@IP_PUBLICO_DA_ORACLE
```

Clone o repositório e execute o script de deploy:
```bash
git clone https://github.com/felipeaguena/aguenatv.git
cd aguenatv
chmod +x deploy-oracle.sh
./deploy-oracle.sh
```

O script cuidará de:
* Instalar o Docker e Docker Compose automaticamente;
* Liberar o firewall interno (`iptables`/`ufw`) da VM na Oracle;
* Gerar uma chave `JWT_SECRET` criptográfica de 64 caracteres no arquivo `.env`;
* Construir e iniciar o contêiner em modo de produção otimizado com auto-reinício.

Acesse no navegador:
`http://IP_PUBLICO_DA_ORACLE:3000`

---

## 🚢 Deploy Alternativo na Vercel

1. Suba este projeto para seu repositório no GitHub.
2. Acesse [vercel.com](https://vercel.com) e importe o repositório.
3. Em **Environment Variables**, adicione:
   * `JWT_SECRET`: Chave secreta de 32+ caracteres aleatórios gerada via crypto.
   * `TURSO_DATABASE_URL` (opcional): URL do seu banco Turso (`libsql://...`).
   * `TURSO_AUTH_TOKEN` (opcional): Token de autenticação gerado pelo Turso.
   * `TMDB_API_KEY` (opcional): Sua chave da API TMDb obtida em themoviedb.org.
4. Clique em **Deploy**.
