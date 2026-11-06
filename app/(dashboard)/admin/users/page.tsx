'use client';
import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  XCircle,
  X,
  AlertCircle,
  Unlock,
  RefreshCw,
  Search,
  Lock,
  Clock,
  Globe,
} from 'lucide-react';
import { AppUser, UserRole } from '@/lib/types';
import { BlockedIpRecord } from '@/lib/rate-limit';

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'security'>('users');

  // Estados de Usuários
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Estados de IPs Bloqueados e Segurança
  const [blockedIps, setBlockedIps] = useState<BlockedIpRecord[]>([]);
  const [loadingIps, setLoadingIps] = useState(false);
  const [manualIpToUnblock, setManualIpToUnblock] = useState('');
  const [unblockingIp, setUnblockingIp] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modais de Usuários
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);

  // Form de Criação
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');

  // Form de Edição
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [editPassword, setEditPassword] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        setErrorMsg('Erro ao listar usuários (Acesso restrito a administradores)');
      }
    } catch {
      setErrorMsg('Falha de conexão com a API de usuários');
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchBlockedIps = async () => {
    setLoadingIps(true);
    try {
      const res = await fetch('/api/admin/blocked-ips');
      if (res.ok) {
        const data = await res.json();
        setBlockedIps(data.ips || []);
      } else {
        setErrorMsg('Falha ao consultar IPs bloqueados.');
      }
    } catch {
      setErrorMsg('Erro de conexão ao buscar IPs bloqueados.');
    } finally {
      setLoadingIps(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchBlockedIps();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao criar usuário');
        return;
      }

      setSuccessMsg(`Usuário @${newUsername} criado com sucesso!`);
      setIsCreateOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewRole('user');
      fetchUsers();
    } catch {
      setErrorMsg('Erro interno ao cadastrar usuário');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editUsername,
          displayName: editDisplayName,
          role: editRole,
          password: editPassword || undefined,
          isActive: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao atualizar usuário');
        return;
      }

      setSuccessMsg(`Usuário @${editUsername} atualizado com sucesso!`);
      setEditUser(null);
      fetchUsers();
    } catch {
      setErrorMsg('Erro ao salvar alterações do usuário');
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário @${username}? Seus favoritos e histórico também serão excluídos.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao remover usuário');
        return;
      }

      setSuccessMsg(`Usuário @${username} removido com sucesso!`);
      fetchUsers();
    } catch {
      setErrorMsg('Erro ao excluir usuário');
    }
  };

  // Desbloquear IP individualmente
  const handleUnblockIp = async (ip: string) => {
    setUnblockingIp(ip);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/admin/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || `Falha ao remover punição do IP ${ip}`);
        return;
      }

      setSuccessMsg(data.message || `IP ${ip} liberado com sucesso!`);
      if (manualIpToUnblock === ip) setManualIpToUnblock('');
      fetchBlockedIps();
    } catch {
      setErrorMsg('Erro ao contatar API de liberação de IP');
    } finally {
      setUnblockingIp(null);
    }
  };

  // Desbloquear todos os IPs
  const handleUnblockAll = async () => {
    if (!confirm('Deseja realmente remover todas as punições de IP e zerar as tentativas falhas de login?')) {
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/admin/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unblock_all' }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Falha ao liberar todos os IPs');
        return;
      }

      setSuccessMsg('Todos os IPs foram liberados e tiveram suas penalidades removidas com sucesso!');
      fetchBlockedIps();
    } catch {
      setErrorMsg('Erro ao processar liberação geral de IPs');
    }
  };

  const activelyBlockedCount = blockedIps.filter((i) => i.isBlocked).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-violet-400" />
            Painel de Administração
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Gerencie contas de usuários, segurança do portal e bloqueios progressivos de IP contra ataques de força bruta.
          </p>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition flex items-center gap-2 cursor-pointer w-fit"
          >
            <UserPlus className="w-4 h-4" />
            Cadastrar Novo Usuário
          </button>
        )}

        {activeTab === 'security' && (
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBlockedIps}
              disabled={loadingIps}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/10 transition cursor-pointer"
              title="Atualizar lista de IPs"
            >
              <RefreshCw className={`w-4 h-4 ${loadingIps ? 'animate-spin' : ''}`} />
            </button>
            {blockedIps.length > 0 && (
              <button
                onClick={handleUnblockAll}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition flex items-center gap-2 cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                Desbloquear Todos os IPs
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs de Navegação */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'users'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuários ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer relative ${
            activeTab === 'security'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
              : 'text-neutral-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>IPs Bloqueados & Anti-Bot</span>
          {activelyBlockedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
              {activelyBlockedCount}
            </span>
          )}
        </button>
      </div>

      {/* Feedback Mensagens */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="p-1 hover:bg-rose-500/20 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="p-1 hover:bg-emerald-500/20 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 1: GERENCIAMENTO DE USUÁRIOS */}
      {/* ============================================================== */}
      {activeTab === 'users' && (
        <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
          {loadingUsers ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-neutral-400">Carregando usuários cadastrados...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-xs">
              Nenhum usuário cadastrado além do administrador padrão.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-white/[0.02] border-b border-white/5 text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Usuário</th>
                    <th className="py-3 px-4">Nome de Exibição</th>
                    <th className="py-3 px-4">Papel (Role)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Criado em</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">@{u.username}</td>
                      <td className="py-3.5 px-4 text-neutral-200">{u.display_name}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                            u.role === 'admin'
                              ? 'bg-violet-600/20 text-violet-300 border-violet-500/30'
                              : 'bg-white/5 text-neutral-400 border-white/10'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                            <XCircle className="w-3.5 h-3.5" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400">
                        {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditUser(u);
                              setEditUsername(u.username);
                              setEditDisplayName(u.display_name);
                              setEditRole(u.role);
                              setEditIsActive(u.is_active);
                              setEditPassword('');
                            }}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 transition"
                            title="Editar Usuário / Senha"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(u.id, u.username)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                            title="Excluir Usuário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* ABA 2: SEGURANÇA, IPS BLOQUEADOS E ANTI-BOT */}
      {/* ============================================================== */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Card de Informação sobre a Proteção de IP Progressiva */}
          <div className="glass-panel rounded-3xl p-6 border border-white/5 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Proteção Anti-Bot & Bloqueio Progressivo de IP
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      ATIVO
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Tentativas incorretas de login são monitoradas por IP. Após atingir <strong className="text-white">&ge;5 erros</strong>, o IP é banido com escalonamento progressivo:
                    <span className="text-violet-400 font-semibold ml-1">
                      15 min (5 falhas) &rarr; 1h (8 falhas) &rarr; 6h (11 falhas) &rarr; 24h (&gt;15 falhas)
                    </span>.
                  </p>
                </div>
              </div>
            </div>

            {/* Barra de Desbloqueio Manual Rápido de IP */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualIpToUnblock.trim()) {
                  handleUnblockIp(manualIpToUnblock.trim());
                }
              }}
              className="mt-6 pt-5 border-t border-white/5 flex flex-col sm:flex-row items-center gap-3"
            >
              <div className="relative flex-1 w-full">
                <Globe className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Inserir endereço de IP para desbloqueio manual imediato (ex: 189.45.12.3)"
                  value={manualIpToUnblock}
                  onChange={(e) => setManualIpToUnblock(e.target.value)}
                  className="w-full bg-[#0b0c10] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none transition"
                />
              </div>
              <button
                type="submit"
                disabled={!manualIpToUnblock.trim() || unblockingIp === manualIpToUnblock}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shrink-0"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Desbloquear IP</span>
              </button>
            </form>
          </div>

          {/* Lista de Registros de IP */}
          <div className="glass-panel rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-violet-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Histórico de IPs sob Monitoramento / Punição
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400">
                Total: <strong className="text-white">{blockedIps.length}</strong> registro(s)
              </span>
            </div>

            {loadingIps ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 border-3 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-neutral-400">Carregando status dos IPs...</p>
              </div>
            ) : blockedIps.length === 0 ? (
              <div className="py-16 text-center">
                <ShieldCheck className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
                <p className="text-xs font-bold text-neutral-200">Nenhum IP bloqueado ou em punição no momento</p>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Seu portal não registrou tentativas repetidas suspeitas de login recentemente.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead className="bg-white/[0.02] border-b border-white/5 text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Endereço IP</th>
                      <th className="py-3 px-4">Tentativas Falhas</th>
                      <th className="py-3 px-4">Status de Bloqueio</th>
                      <th className="py-3 px-4">Tempo Restante de Ban</th>
                      <th className="py-3 px-4">Última Tentativa</th>
                      <th className="py-3 px-4 text-right">Ação de Desbloqueio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {blockedIps.map((item) => (
                      <tr key={item.ip} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-white flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-neutral-500" />
                          {item.ip}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                              item.attempts >= 5
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {item.attempts} falha(s)
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {item.isBlocked ? (
                            <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs font-bold">
                              <ShieldAlert className="w-3.5 h-3.5" /> BLOQUEADO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-neutral-400 text-xs font-semibold">
                              <CheckCircle className="w-3.5 h-3.5 text-neutral-500" /> Liberado (Expirado)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {item.isBlocked ? (
                            <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                              {item.remainingMinutes} min restantes
                            </span>
                          ) : (
                            <span className="text-neutral-500 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-neutral-400 text-[11px]">
                          {new Date(item.lastAttempt).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleUnblockIp(item.ip)}
                            disabled={unblockingIp === item.ip}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition flex items-center gap-1.5 ml-auto cursor-pointer disabled:opacity-40"
                            title="Remover punição deste IP e restabelecer acesso"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Remover Punição</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Criação de Usuário */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-violet-400" />
              Cadastrar Novo Usuário
            </h2>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome de Usuário (Login)
                </label>
                <input
                  type="text"
                  placeholder="ex: felipe"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  placeholder="ex: Felipe Aguena"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Senha (será criptografada com Bcrypt)
                </label>
                <input
                  type="password"
                  placeholder="Senha segura"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Papel de Acesso
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="user">Usuário Padrão</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 transition"
                >
                  Criar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Edição de Usuário */}
      {editUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative">
            <button
              onClick={() => setEditUser(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-violet-400" />
              Editar Usuário @{editUser.username}
            </h2>

            <form onSubmit={handleUpdate} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome de Usuário (Login)
                </label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nome de Exibição
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Nova Senha (deixe em branco para não alterar)
                </label>
                <input
                  type="password"
                  placeholder="Nova senha (opcional)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Papel de Acesso
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="user">Usuário Padrão</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  className="w-4 h-4 accent-violet-600 rounded"
                />
                <label htmlFor="isActiveCheck" className="text-xs text-neutral-300 cursor-pointer">
                  Usuário ativo (permite login no sistema)
                </label>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 transition"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
