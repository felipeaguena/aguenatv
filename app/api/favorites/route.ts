import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { turso, isTursoConfigured, ensureTursoSchema } from '@/lib/turso';
import { ensureDataMigratedToFelipeAguena } from '@/lib/users-local';
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FAVORITES_FILE = path.join(DATA_DIR, 'local-favorites.json');

async function getLocalFavorites(): Promise<any[]> {
  try {
    const raw = await fs.readFile(FAVORITES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveLocalFavorites(items: any[]): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FAVORITES_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Favorites] Aviso: persistência em disco local indisponível:', err);
  }
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  await ensureDataMigratedToFelipeAguena();

  // 1. Se o Turso estiver configurado, busca no banco por user_id estrito
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
        args: [session.userId],
      });

      return NextResponse.json({ favorites: res.rows, userId: session.userId });
    } catch (e) {
      console.warn('[Favorites] Turso falhou, usando armazenamento local:', e);
    }
  }

  // 2. Armazenamento local: estritamente o user_id logado
  const allFavorites = await getLocalFavorites();
  const userFavorites = allFavorites
    .filter((f) => f.user_id === session.userId)
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

  return NextResponse.json({ favorites: userFavorites, userId: session.userId });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  await ensureDataMigratedToFelipeAguena();

  const body = await req.json();
  const { streamId, streamType, title, posterUrl, categoryName, rating } = body;

  if (!streamId || !streamType || !title) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }

  // 1. Se o Turso estiver configurado, salva no banco
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const favId = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      await turso.execute({
        sql: `INSERT INTO favorites (id, user_id, stream_id, stream_type, title, poster_url, category_name, rating, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, stream_id, stream_type) DO UPDATE SET
                title = excluded.title,
                poster_url = excluded.poster_url,
                category_name = excluded.category_name,
                rating = excluded.rating`,
        args: [
          favId,
          session.userId,
          String(streamId),
          streamType,
          title,
          posterUrl || null,
          categoryName || null,
          rating ? String(rating) : null,
          now,
        ],
      });

      const res = await turso.execute({
        sql: 'SELECT * FROM favorites WHERE user_id = ? AND stream_id = ? AND stream_type = ? LIMIT 1',
        args: [session.userId, String(streamId), streamType],
      });

      if (res.rows.length > 0) {
        return NextResponse.json({ favorite: res.rows[0], userId: session.userId }, { status: 201 });
      }
    } catch (e) {
      console.warn('[Favorites] Falha no Turso, gravando em persistência local:', e);
    }
  }

  // 2. Persistência Localhost: Grava no arquivo JSON local data/local-favorites.json
  const allFavorites = await getLocalFavorites();
  const newFav = {
    id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    user_id: session.userId,
    stream_id: String(streamId),
    stream_type: streamType,
    title,
    poster_url: posterUrl || null,
    category_name: categoryName || null,
    rating: rating ? String(rating) : null,
    created_at: new Date().toISOString(),
  };

  // Remove duplicata pré-existente do mesmo título para este usuário específico
  const filtered = allFavorites.filter(
    (f) =>
      !(
        f.user_id === session.userId &&
        String(f.stream_id) === String(streamId) &&
        f.stream_type === streamType
      )
  );

  filtered.unshift(newFav);
  await saveLocalFavorites(filtered);

  return NextResponse.json({ favorite: newFav, userId: session.userId }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const streamId = searchParams.get('streamId');
  const streamType = searchParams.get('streamType');

  if (!streamId || !streamType) {
    return NextResponse.json({ error: 'Parâmetros insuficientes' }, { status: 400 });
  }

  // 1. Remove do Turso se configurado (isolado por user_id)
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute({
        sql: 'DELETE FROM favorites WHERE user_id = ? AND stream_id = ? AND stream_type = ?',
        args: [session.userId, String(streamId), streamType],
      });
    } catch (e) {
      console.warn('[Favorites] Falha ao deletar do Turso:', e);
    }
  }

  // 2. Remove do arquivo local-favorites.json (estritamente para o user_id logado)
  const allFavorites = await getLocalFavorites();
  const filtered = allFavorites.filter(
    (f) =>
      !(
        f.user_id === session.userId &&
        String(f.stream_id) === String(streamId) &&
        f.stream_type === streamType
      )
  );
  await saveLocalFavorites(filtered);

  return NextResponse.json({ success: true, message: 'Removido dos favoritos', userId: session.userId });
}
