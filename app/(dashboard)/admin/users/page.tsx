'use client';
import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  Trash2,
  Shield,
  Key,
  CheckCircle,
  XCircle,
  X,
  AlertCircle,
} from 'lucide-react';
import { AppUser, UserRole } from '@/lib/types';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modais
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
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-violet-400" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Crie, edite senhas em hash e gerencie acessos fechados da sua família e amigos.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition flex items-center gap-2 cursor-pointer w-fit"
        >
          <UserPlus className="w-4 h-4" />
          Cadastrar Novo Usuário
        </button>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabela de Usuários */}
      <div className="bg-[#13141b] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center text-xs text-neutral-400 space-y-2">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando usuários...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0b0c10] text-neutral-400 font-bold border-b border-white/5 uppercase tracking-wider text-[10px]">
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
                  Criar Usuário
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
                  placeholder="ex: felipe"
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                />
                <span className="text-[10px] text-neutral-500 mt-0.5 block">
                  Usado para autenticação na tela de login
                </span>
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
