#!/usr/bin/env bash
# ========================================================
# Script Automatizado de Deploy para Oracle Cloud (OCI)
# Suporta: Ubuntu 20.04/22.04/24.04 e Oracle Linux 8/9
# ========================================================

set -e

echo "=========================================="
echo "🚀 Iniciando Deploy do AGUENATV na Oracle Cloud"
echo "=========================================="

# 1. Atualização do Sistema
echo "📦 Atualizando pacotes do sistema..."
if [ -x "$(command -v apt-get)" ]; then
    sudo apt-get update -y && sudo apt-get upgrade -y
    sudo apt-get install -y curl git ufw iptables-persistent
elif [ -x "$(command -v dnf)" ]; then
    sudo dnf update -y
    sudo dnf install -y curl git
fi

# 2. Instalação do Docker (se não estiver instalado)
if ! [ -x "$(command -v docker)" ]; then
    echo "🐳 Docker não encontrado. Instalando Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm -f get-docker.sh
    echo "✅ Docker instalado com sucesso!"
fi

# 3. Liberação do Firewall da VM na Oracle Cloud (CRUCIAL!)
# As imagens da Oracle Cloud vêm com regras rígidas de iptables no SO que bloqueiam as portas 80, 443 e 3000
echo "🛡️ Configurando regras de firewall local da VM..."
if [ -x "$(command -v iptables)" ]; then
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT || true
    sudo netfilter-persistent save || true
fi

if [ -x "$(command -v ufw)" ]; then
    sudo ufw allow 80/tcp || true
    sudo ufw allow 443/tcp || true
    sudo ufw allow 3000/tcp || true
    sudo ufw allow 22/tcp || true
    sudo ufw --force enable || true
fi

# 4. Configuração de Variáveis de Ambiente
if [ ! -f .env ]; then
    echo "⚠️ Arquivo .env não encontrado. Copiando de .env.example..."
    cp .env.example .env
    # Gera automaticamente um JWT_SECRET criptográfico forte de 64 caracteres se estiver padrão
    NEW_SECRET=$(openssl rand -hex 32)
    sed -i "s/defina_uma_chave_secreta_forte_com_no_minimo_32_caracteres_aleatorios/$NEW_SECRET/g" .env
    echo "🔑 JWT_SECRET seguro gerado automaticamente no arquivo .env!"
    echo "👉 Lembre-se de editar o arquivo .env com seu TURSO_AUTH_TOKEN e TMDB_API_KEY se desejar:"
    echo "   nano .env"
fi

# 5. Build e Execução com Docker Compose
echo "🏗️ Construindo contêiner e iniciando aplicação..."
sudo docker compose down || true
sudo docker compose build --no-cache
sudo docker compose up -d

echo "=========================================="
echo "✅ AGUENATV implantado com sucesso!"
echo "🌐 Acesso local: http://localhost:3000"
echo "🌐 Acesso externo: http://$(curl -s ifconfig.me):3000"
echo "=========================================="
echo "💡 IMPORTANTE NA ORACLE CLOUD:"
echo "Certifique-se de que a 'Ingress Rule' da sua VCN no painel web da Oracle Cloud"
echo "está liberada para a porta 3000 (ou 80/443 se usar Nginx reverso) com Source: 0.0.0.0/0"
