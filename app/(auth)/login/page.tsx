'use client';
import { useState, useEffect } from 'react';
import { Tv, Lock, User, AlertCircle, ShieldAlert, Sparkles, Server } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Campo Honeypot para proteção Anti-Bot: invisível para usuários humanos
  const [extraSecurityToken, setExtraSecurityToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [savedServer, setSavedServer] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const server = localStorage.getItem('aguenatv_server_url');
      if (server) {
        setSavedServer(server);
      }
    }
  }, []);

  const handleChangeServer = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aguenatv_server_url');
      window.location.href = 'https://localhost/index.html';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || isBlocked) return;

    setErrorMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          extra_security_token: extraSecurityToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 || data.isBlocked) {
          setIsBlocked(true);
          setRemainingMinutes(data.remainingMinutes || 15);
          setErrorMsg(data.error);
        } else {
          setErrorMsg(data.error || 'Credenciais inválidas');
        }
        setLoading(false);
        return;
      }

      // Login bem-sucedido: redireciona para a aplicação privada com carregamento completo de cookies
      window.location.href = '/';
    } catch {
      setErrorMsg('Falha na conexão com o servidor');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-[#0b0c10] relative overflow-hidden">
      {/* Luzes de Fundo Atmosféricas / Efeito Miruro */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Card de Login Glassmorphism */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="text-center mb-8">
            <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 items-center justify-center shadow-lg shadow-violet-600/40 mb-3">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center justify-center gap-1">
              AGUENA<span className="text-violet-500">TV</span>
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              Portal privado de entretenimento e transmissões
            </p>
          </div>

          {/* Alerta de Bloqueio Progressivo de IP */}
          {isBlocked && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 animate-in fade-in">
              <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div>
                <p className="font-bold">Acesso Bloqueado por Segurança</p>
                <p className="text-[11px] mt-0.5 text-rose-200/80">
                  Tentativas consecutivas incorretas detectadas (&ge;5 falhas). Por segurança, seu endereço de IP foi temporariamente bloqueado por aproximadamente{' '}
                  <span className="font-bold underline text-white">{remainingMinutes} minutos</span>.
                </p>
                <p className="text-[10px] mt-2 text-rose-300/70">
                  Caso seja um acesso legítimo, solicite ao administrador a liberação do IP pelo painel de controle.
                </p>
              </div>
            </div>
          )}

          {/* Mensagem de Erro Comum */}
          {!isBlocked && errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo Honeypot Oculto (Anti-Bot invisível para humanos) */}
            <div aria-hidden="true" style={{ position: 'absolute', opacity: 0, zIndex: -1, pointerEvents: 'none', height: 0, overflow: 'hidden' }}>
              <input
                type="text"
                name="extra_security_token"
                tabIndex={-1}
                value={extraSecurityToken}
                onChange={(e) => setExtraSecurityToken(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                Usuário
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Nome de usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading || isBlocked}
                  required
                  autoFocus
                  autoComplete="username"
                  className="w-full bg-[#0b0c10] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none transition disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isBlocked}
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#0b0c10] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none transition disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isBlocked}
              className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Entrar no Sistema'
              )}
            </button>
          </form>

          {/* Servidor Conectado no App Mobile */}
          {savedServer && (
            <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="truncate max-w-[190px] flex items-center gap-1.5" title={savedServer}>
                <Server className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-neutral-400 truncate font-mono text-[10px]">{savedServer.replace(/^https?:\/\//, '')}</span>
              </span>
              <button
                type="button"
                onClick={handleChangeServer}
                className="text-violet-400 hover:text-violet-300 underline font-semibold transition cursor-pointer text-[10px]"
              >
                Trocar Servidor
              </button>
            </div>
          )}

          {/* Rodapé informativo discreto */}
          <div className={`${savedServer ? 'mt-3' : 'mt-8'} text-center border-t border-white/5 pt-4`}>
            <span className="text-[11px] text-neutral-500 flex items-center justify-center gap-1">
              <Sparkles className="w-3 h-3 text-violet-400" /> Acesso restrito a membros autorizados
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
