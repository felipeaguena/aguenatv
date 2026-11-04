# 🎬 AGUENATV - Player Inteligente e Privado

Sistema moderno, ultra-otimizado e seguro de reprodução IPTV inspirado no Design System do **[Miruro](https://www.miruro.cx/)**, desenvolvido com **Next.js (App Router)**, **Capacitor (Android)**, **Tailwind CSS**, **HLS.js**, **Turso (libSQL/SQLite Serverless)** e **IndexedDB**.

Projetado para rodar com **alto desempenho** e **baixo consumo** na **Oracle Cloud (Always Free)**, **Vercel** ou como **Aplicativo Android Nativo**.

---

## 🚀 Características Principais

1. **Design System Cinematográfico & Mobile First:**
   * Tema escuro OLED Deep Dark (`#0b0c10`), acabamento em vidro fosco (*glassmorphism*), acentos em violeta elétrico (`#8b5cf6`) e micro-interações fluidas.
   * Drawer lateral móvel (*Hamburger menu*) acessível no mobile ao lado do logotipo **AGUENATV**.
   * Carrossel de destaques dinâmico (*Hero Spotlight*).
   * Cards com proporção vertical 3:4, zoom suave no hover e badges de qualidade.

2. **Aplicativo Android Nativo (Capacitor) & Modo Offline:**
   * **Download Direto para a Memória do Celular:** Baixe filmes e episódios de séries para assistir no metrô, viagens ou sem conexão.
   * **Página Dedicada de Baixados (`/offline`):** Lista todos os conteúdos salvos no armazenamento interno do celular com controle de tamanho em MB/GB e opção de exclusão.
   * **Bypass Nativo de CORS e Mixed Content:** Aplicativo nativo conecta diretamente a servidores IPTV em HTTP ou HTTPS sem restrições do navegador.

3. **Segurança Reforçada (Security by Design):**
   * **Página de Login Fechada:** Sem links de cadastro público. Acesso exclusivo para usuários administrados.
   * **Proteção Anti-Brute-Force:** Bloqueio automático de IP por **1 hora** após 3 tentativas consecutivas de senha incorreta.
   * **Criptografia Forte:** Hashes seguros gerados com **Bcrypt** e sessões gerenciadas em cookies `httpOnly` via **JWT (Jose)** com chave criptográfica aleatória.
   * **Mitigação de SSRF (Server-Side Request Forgery):** Validação estrita de URLs que bloqueia acessos a loopback (`127.0.0.1`), redes privadas (RFC 1918) e serviços de metadados de nuvem (`169.254.169.254`).
   * **Cabeçalhos de Segurança HTTP:** Proteção nativa contra Clickjacking (`X-Frame-Options: SAMEORIGIN`), MIME-sniffing (`X-Content-Type-Options: nosniff`), HSTS e políticas de permissões restritas.

4. **Gerenciamento de Usuários (Painel Admin) & Configurações M3U:**
   * Acesso restrito a administradores em `/admin/users`.
   * Criação, edição de dados/senhas e exclusão de contas com isolamento completo de histórico, favoritos e playlists.

5. **Busca Relativa (Fuzzy Search) 100% no Frontend:**
   * Motor **MiniSearch** rodando na memória RAM do navegador com tolerância a erros de digitação e acentuação.
   * Respostas instantâneas em menos de 15ms sem onerar o servidor.

6. **Consumo Zero de Servidor para Listas (Offline-First):**
   * Listas IPTV armazenadas localmente no **IndexedDB** do navegador com **Dexie.js**.
   * O fluxo de vídeo é consumido **direto do cliente para o servidor IPTV**, sem intermediação desnecessária de banda.

---

## 📱 Aplicativo Android (Capacitor) & Como Gerar o APK

O AGUENATV agora inclui integração completa com o **Capacitor**, gerando um aplicativo nativo para Android com suporte a armazenamento local e downloads.

### Opção 1: Compilação Automática na Nuvem (GitHub Actions - Sem Instalar Nada no PC)
Você não precisa instalar o Android Studio nem o SDK do Android no seu computador:
1. Ao enviar alterações para a branch `main` no GitHub, o fluxo de trabalho do **GitHub Actions** compila o APK automaticamente.
2. No seu repositório no GitHub, clique na aba **Actions**.
3. Selecione a execução mais recente de **Build Android APK**.
4. Na seção **Artifacts** no final da página, baixe o arquivo `aguenatv-android-apk.zip`.
5. Extraia o `app-debug.apk` e envie para o seu celular Android para instalar diretamente!

### Opção 2: Compilação Local com Android Studio
Se você tiver o **Android Studio** instalado:
```bash
# 1. Compila os arquivos web e sincroniza o projeto nativo
npm run cap:build

# 2. Abre o projeto no Android Studio
npm run cap:open
```
No Android Studio, clique em **Build -> Build Bundle(s) / APK(s) -> Build APK(s)** para gerar o arquivo `.apk`.

---

## 🔄 Como Funcionam as Atualizações do Aplicativo

Quando você fizer novas modificações no sistema, há duas formas pelas quais o aplicativo se atualiza:

### 1. Atualizações Instantâneas sem Reinstalar o APK (Live Web / OTA)
Se você configurou a URL do seu servidor (na Oracle Cloud ou Vercel) no arquivo [`capacitor.config.ts`](file:///c:/Users/felipeaguena/Documents/iptv/capacitor.config.ts):
```ts
server: {
  url: 'http://SEU_IP_ORACLE:3000', // ou sua URL na Vercel/Domínio
  cleartext: true,
}
```
* **Como funciona:** O aplicativo Android carrega dinamicamente a versão mais recente diretamente do seu servidor na nuvem, mantendo todos os recursos nativos (como download na memória interna e player offline).
* **Vantagem:** **Toda vez que você fizer `git push` no GitHub e a Oracle Cloud ou Vercel atualizar, o aplicativo no seu celular é atualizado AUTOMATICAMENTE e NA HORA!** Você e seus usuários não precisam baixar um novo APK.

### 2. Atualizações de Recursos Nativos (Novo APK)
Você só precisará gerar e instalar um novo arquivo `.apk` no celular quando:
* Adicionar uma nova permissão nativa do Android no `AndroidManifest.xml` (ex: acesso a Bluetooth, câmera, etc.);
* Atualizar a versão do motor do Capacitor ou adicionar novos plugins nativos de hardware.
* Nesses casos, o **GitHub Actions** compilará o novo APK automaticamente na nuvem para você baixar e instalar por cima do app existente.

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

Acesse no navegador ou conecte seu aplicativo:
`http://IP_PUBLICO_DA_ORACLE:3000`
