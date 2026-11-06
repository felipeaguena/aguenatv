'use client';
import { ShieldAlert } from 'lucide-react';

export default function Footer() {
  const currentYear = 2026;

  return (
    <footer className="w-full border-t border-white/5 bg-[#08090d] text-neutral-400 py-8 px-4 sm:px-6 lg:px-8 mt-auto pb-28 sm:pb-8">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-black text-sm">
              A
            </div>
            <div>
              <span className="font-extrabold text-white text-sm tracking-wide">AGUENA TV</span>
              <p className="text-[11px] text-neutral-500">Reprodutor de Mídia & Gerenciador de Listas</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-400 bg-white/[0.02] border border-white/5 px-3 py-1.5 rounded-xl w-fit">
            <ShieldAlert className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="font-medium text-[11px]">Aviso Legal & Isenção de Responsabilidade</span>
          </div>
        </div>

        {/* Texto de Isenção de Conteúdo */}
        <div className="text-[11px] text-neutral-500 leading-relaxed space-y-2 max-w-5xl">
          <p>
            <strong className="text-neutral-300 font-semibold">Isenção de Responsabilidade sobre os Conteúdos:</strong> O AGUENA TV opera única e exclusivamente como uma aplicação de software reprodutora de mídia pessoal (IPTV player) e organizadora de catálogos. A plataforma <strong className="text-neutral-300">não possui, não transmite, não armazena, não distribui e não comercializa</strong> nenhum conteúdo audiovisual, fluxo de transmissão (streams), canais de TV ao vivo, filmes ou séries em seus servidores.
          </p>
          <p>
            Todas as transmissões, vídeos, imagens e metadados exibidos no aplicativo são carregados e acessados diretamente a partir de servidores ou listas de reprodução (M3U / Xtream Codes) configuradas e inseridas sob responsabilidade individual e exclusiva de cada usuário. Todos os direitos autorais, marcas registradas, títulos e imagens pertencem aos seus respectivos proprietários e produtores originais.
          </p>
        </div>

        {/* Linha Inferior com Copyright */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-[10px] text-neutral-600 border-t border-white/[0.03]">
          <p>© {currentYear} AGUENA TV. Todos os direitos reservados. Software reprodutor de uso pessoal e privado.</p>
          <div className="flex items-center gap-3">
            <span>Privacidade & Segurança</span>
            <span>•</span>
            <span>Uso Responsável</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
