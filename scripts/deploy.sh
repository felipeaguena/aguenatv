#!/bin/bash
set -e

echo "=== Salvando backup de seguranca dos dados dos usuarios ==="
mkdir -p /home/ubuntu/persistent_data
if [ -d /home/ubuntu/aguenatv/data ]; then
  cp -rf /home/ubuntu/aguenatv/data/* /home/ubuntu/persistent_data/ 2>/dev/null || true
fi

echo "=== Descompactando projeto ==="
mkdir -p /home/ubuntu/aguenatv
tar -xzf /home/ubuntu/project.tar.gz -C /home/ubuntu/aguenatv
mv /home/ubuntu/.env.local /home/ubuntu/aguenatv/.env.local 2>/dev/null || true
rm -f /home/ubuntu/project.tar.gz

echo "=== Restaurando dados persistentes dos usuarios ==="
mkdir -p /home/ubuntu/aguenatv/data
cp -rf /home/ubuntu/persistent_data/* /home/ubuntu/aguenatv/data/ 2>/dev/null || true

echo "=== Configurando permissao da porta 80 para Node ==="
NODE_BIN=$(readlink -f $(which node))
sudo setcap 'cap_net_bind_service=+ep' "$NODE_BIN"

echo "=== Instalando dependencias (npm install) ==="
cd /home/ubuntu/aguenatv
npm install --production=false

echo "=== Compilando aplicacao Next.js (npm run build) ==="
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo "=== Iniciando ou reiniciando no PM2 na porta 80 ==="
pm2 delete aguenatv 2>/dev/null || true
PORT=80 NODE_ENV=production pm2 start npm --name "aguenatv" -- start -- -p 80

echo "=== Salvando configuracao do PM2 para auto-inicializacao ==="
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu || true

echo "=== Status PM2 ==="
pm2 status

echo "=== Testando servidor localmente na porta 80 ==="
sleep 3
curl -I http://localhost:80 || true

echo "=== DEPLOY CONCLUIDO COM SUCESSO! ==="
