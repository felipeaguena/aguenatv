/**
 * Dicionário bidirecional de títulos de animes (Inglês, Português, Romaji e Japonês)
 * e funções de expansão dinâmica de busca para facilitar encontrar qualquer título no catálogo.
 */

export interface AnimeTitleSet {
  pt: string;
  en: string;
  romaji: string;
  aliases?: string[];
}

export const POPULAR_ANIME_DICTIONARY: AnimeTitleSet[] = [
  {
    pt: 'Ataque dos Titãs',
    en: 'Attack on Titan',
    romaji: 'Shingeki no Kyojin',
    aliases: ['AoT', 'SnK'],
  },
  {
    pt: 'Caçador de Demônios',
    en: 'Demon Slayer',
    romaji: 'Kimetsu no Yaiba',
    aliases: ['Demon Slayer: Kimetsu no Yaiba'],
  },
  {
    pt: 'Boku no Hero',
    en: 'My Hero Academia',
    romaji: 'Boku no Hero Academia',
    aliases: ['MHA', 'BnHA'],
  },
  {
    pt: 'Batalha de Feiticeiros',
    en: 'Jujutsu Kaisen',
    romaji: 'Jujutsu Kaisen',
    aliases: ['JJK'],
  },
  {
    pt: 'Homem Motosserra',
    en: 'Chainsaw Man',
    romaji: 'Chainsaw Man',
    aliases: ['CSM'],
  },
  {
    pt: 'Solo Leveling',
    en: 'Solo Leveling',
    romaji: 'Ore dake Level Up na Ken',
    aliases: ['O Despertar do Mais Fraco'],
  },
  {
    pt: 'Minha Estrela Favorita',
    en: 'Oshi no Ko',
    romaji: 'Oshi no Ko',
    aliases: ['My Star'],
  },
  {
    pt: 'Frieren e a Jornada para o Além',
    en: "Frieren: Beyond Journey's End",
    romaji: 'Sousou no Frieren',
    aliases: ['Frieren'],
  },
  {
    pt: 'Spy x Família',
    en: 'SPY x FAMILY',
    romaji: 'SPY x FAMILY',
    aliases: ['Spy Family', 'Spy x Family'],
  },
  {
    pt: 'Naruto',
    en: 'Naruto',
    romaji: 'Naruto',
    aliases: ['Naruto Shippuden', 'Boruto'],
  },
  {
    pt: 'One Piece',
    en: 'One Piece',
    romaji: 'One Piece',
    aliases: ['Luffy', 'Piratas do Chapéu de Palha'],
  },
  {
    pt: 'Bleach',
    en: 'Bleach',
    romaji: 'Bleach',
    aliases: ['Bleach Thousand Year Blood War', 'Bleach TYBW'],
  },
  {
    pt: 'Hunter x Hunter',
    en: 'Hunter x Hunter',
    romaji: 'Hunter x Hunter',
    aliases: ['HxH', 'Hunter Hunter'],
  },
  {
    pt: 'O Caderno da Morte',
    en: 'Death Note',
    romaji: 'Death Note',
    aliases: [],
  },
  {
    pt: 'Fullmetal Alchemist',
    en: 'Fullmetal Alchemist',
    romaji: 'Hagane no Renkinjutsushi',
    aliases: ['FMA', 'FMAB', 'Fullmetal Alchemist Brotherhood'],
  },
  {
    pt: 'Sword Art Online',
    en: 'Sword Art Online',
    romaji: 'Sword Art Online',
    aliases: ['SAO', 'Alicization'],
  },
  {
    pt: 'Tokyo Ghoul',
    en: 'Tokyo Ghoul',
    romaji: 'Tokyo Ghoul',
    aliases: ['Tokyo Ghoul:re'],
  },
  {
    pt: 'Dragon Ball',
    en: 'Dragon Ball',
    romaji: 'Dragon Ball',
    aliases: ['Dragon Ball Z', 'Dragon Ball Super', 'DBZ', 'DBS', 'Dragon Ball GT'],
  },
  {
    pt: 'Os Ases do Vôlei',
    en: 'Haikyu!!',
    romaji: 'Haikyuu!!',
    aliases: ['Haikyu', 'Haikyuu'],
  },
  {
    pt: 'Black Clover',
    en: 'Black Clover',
    romaji: 'Black Clover',
    aliases: ['Trevo Negro'],
  },
  {
    pt: 'Vinland Saga',
    en: 'Vinland Saga',
    romaji: 'Vinland Saga',
    aliases: [],
  },
  {
    pt: 'Mob Psycho 100',
    en: 'Mob Psycho 100',
    romaji: 'Mob Psycho 100',
    aliases: ['Mob Psycho'],
  },
  {
    pt: 'Reencarnação Desempregada',
    en: 'Mushoku Tensei: Jobless Reincarnation',
    romaji: 'Mushoku Tensei: Isekai Ittara Honki Dasu',
    aliases: ['Mushoku Tensei', 'Jobless Reincarnation'],
  },
  {
    pt: 'Steins Gate',
    en: 'Steins;Gate',
    romaji: 'Steins;Gate',
    aliases: ['Steins Gate', 'Steins;Gate 0'],
  },
  {
    pt: 'Cowboy Bebop',
    en: 'Cowboy Bebop',
    romaji: 'Cowboy Bebop',
    aliases: [],
  },
  {
    pt: 'Neon Genesis Evangelion',
    en: 'Neon Genesis Evangelion',
    romaji: 'Shin Seiki Evangelion',
    aliases: ['Evangelion', 'NGE', 'The End of Evangelion'],
  },
  {
    pt: 'Tokyo Revengers',
    en: 'Tokyo Revengers',
    romaji: 'Tokyo Revengers',
    aliases: [],
  },
  {
    pt: 'Blue Lock',
    en: 'Blue Lock',
    romaji: 'Blue Lock',
    aliases: [],
  },
  {
    pt: 'Dandadan',
    en: 'Dandadan',
    romaji: 'Dandadan',
    aliases: ['Dan Da Dan'],
  },
  {
    pt: 'Monstro Número 8',
    en: 'Kaiju No. 8',
    romaji: 'Kaijuu 8-gou',
    aliases: ['Kaiju 8', 'Kaiju Number 8', 'Kaiju No 8'],
  },
  {
    pt: 'Delícias de Masmorra',
    en: 'Delicious in Dungeon',
    romaji: 'Dungeon Meshi',
    aliases: ['Dungeon Meshi'],
  },
  {
    pt: 'Re:Zero',
    en: 'Re:Zero - Starting Life in Another World',
    romaji: 'Re:Zero kara Hajimeru Isekai Seikatsu',
    aliases: ['Re Zero', 'Re:Zero'],
  },
  {
    pt: 'KonoSuba',
    en: "KonoSuba: God's Blessing on this Wonderful World!",
    romaji: 'Kono Subarashii Sekai ni Shukufuku wo!',
    aliases: ['Konosuba', 'KonoSuba'],
  },
  {
    pt: 'Fate Stay Night',
    en: 'Fate/stay night',
    romaji: 'Fate/stay night',
    aliases: ['Fate Zero', 'Fate Stay Night', 'Unlimited Blade Works', "Heaven's Feel"],
  },
  {
    pt: 'Sala de Aula de Elite',
    en: 'Classroom of the Elite',
    romaji: 'Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e',
    aliases: ['Classroom of the Elite', 'Youkoso Jitsuryoku'],
  },
  {
    pt: 'Aquele Dia que Reencarnei como Slime',
    en: 'That Time I Got Reincarnated as a Slime',
    romaji: 'Tensei Shitara Slime Datta Ken',
    aliases: ['Slime Isekai', 'Tensura'],
  },
  {
    pt: 'Overlord',
    en: 'Overlord',
    romaji: 'Overlord',
    aliases: [],
  },
  {
    pt: 'No Game No Life',
    en: 'No Game No Life',
    romaji: 'No Game No Life',
    aliases: ['NGNL'],
  },
  {
    pt: 'Code Geass',
    en: 'Code Geass: Lelouch of the Rebellion',
    romaji: 'Code Geass: Hangyaku no Lelouch',
    aliases: ['Code Geass'],
  },
  {
    pt: 'A Cidade Onde Apenas Eu Não Existo',
    en: 'Erased',
    romaji: 'Boku dake ga Inai Machi',
    aliases: ['Erased'],
  },
  {
    pt: 'Seu Nome',
    en: 'Your Name.',
    romaji: 'Kimi no Na wa.',
    aliases: ['Your Name', 'Kimi no Na wa'],
  },
  {
    pt: 'O Tempo com Você',
    en: 'Weathering with You',
    romaji: 'Tenki no Ko',
    aliases: ['Weathering with You', 'Tenki no Ko'],
  },
  {
    pt: 'A Viagem de Chihiro',
    en: 'Spirited Away',
    romaji: 'Sen to Chihiro no Kamikakushi',
    aliases: ['Spirited Away', 'Chihiro'],
  },
  {
    pt: 'Princesa Mononoke',
    en: 'Princess Mononoke',
    romaji: 'Mononoke Hime',
    aliases: ['Princess Mononoke'],
  },
  {
    pt: 'O Castelo Animado',
    en: "Howl's Moving Castle",
    romaji: 'Howl no Ugoku Shiro',
    aliases: ['Howls Moving Castle'],
  },
  {
    pt: 'Dr. Stone',
    en: 'Dr. STONE',
    romaji: 'Dr. STONE',
    aliases: ['Dr Stone'],
  },
  {
    pt: 'Fire Force',
    en: 'Fire Force',
    romaji: 'Enen no Shouboutai',
    aliases: ['Enen no Shouboutai'],
  },
  {
    pt: 'Os Sete Pecados Capitais',
    en: 'The Seven Deadly Sins',
    romaji: 'Nanatsu no Taizai',
    aliases: ['Seven Deadly Sins', 'Nanatsu no Taizai'],
  },
  {
    pt: 'One Punch Man',
    en: 'One-Punch Man',
    romaji: 'One Punch Man',
    aliases: ['OPM', 'Saitama'],
  },
  {
    pt: 'Paraíso do Inferno',
    en: "Hell's Paradise",
    romaji: 'Jigokuraku',
    aliases: ['Hells Paradise', 'Jigokuraku'],
  },
  {
    pt: 'The Promised Neverland',
    en: 'The Promised Neverland',
    romaji: 'Yakusoku no Neverland',
    aliases: ['Yakusoku no Neverland'],
  },
  {
    pt: 'Cyberpunk Mercenários',
    en: 'Cyberpunk: Edgerunners',
    romaji: 'Cyberpunk: Edgerunners',
    aliases: ['Cyberpunk Edgerunners'],
  },
  {
    pt: 'Bocchi the Rock!',
    en: 'Bocchi the Rock!',
    romaji: 'Bocchi the Rock!',
    aliases: ['Bocchi the Rock', 'Bocchi'],
  },
  {
    pt: 'Kaguya-sama: O Amor é uma Guerra',
    en: 'Kaguya-sama: Love Is War',
    romaji: 'Kaguya-sama wa Kokurasetai',
    aliases: ['Kaguya sama', 'Love is War'],
  },
  {
    pt: 'Mashle Magia e Músculos',
    en: 'Mashle: Magic and Muscles',
    romaji: 'Mashle',
    aliases: ['Mashle'],
  },
  {
    pt: 'Wind Breaker',
    en: 'Wind Breaker',
    romaji: 'Wind Breaker',
    aliases: [],
  },
  {
    pt: 'Ilusão Celestial',
    en: 'Heavenly Delusion',
    romaji: 'Tengoku Daimakyou',
    aliases: ['Tengoku Daimakyou'],
  },
  {
    pt: 'Zom 100: Coisas para Fazer Antes de Virar Zumbi',
    en: 'Zom 100: Bucket List of the Dead',
    romaji: 'Zom 100: Zombie ni Naru made ni Shitai 100 no Koto',
    aliases: ['Zom 100', 'Zom100'],
  },
  {
    pt: 'Pluto',
    en: 'Pluto',
    romaji: 'Pluto',
    aliases: [],
  },
  {
    pt: 'Monster',
    en: 'Monster',
    romaji: 'Monster',
    aliases: [],
  },
  {
    pt: 'As Aventuras Bizarras de JoJo',
    en: "JoJo's Bizarre Adventure",
    romaji: 'JoJo no Kimyou na Bouken',
    aliases: ['Jojo', "JoJo's Bizarre Adventure", 'JoJo'],
  },
  {
    pt: 'Gintama',
    en: 'Gintama',
    romaji: 'Gintama',
    aliases: [],
  },
  {
    pt: 'Samurai X',
    en: 'Rurouni Kenshin',
    romaji: 'Rurouni Kenshin: Meiji Kenkaku Romantan',
    aliases: ['Samurai X', 'Rurouni Kenshin'],
  },
  {
    pt: 'Yu Yu Hakusho',
    en: 'Yu Yu Hakusho',
    romaji: 'Yuu☆Yuu☆Hakusho',
    aliases: ['YuYu Hakusho'],
  },
  {
    pt: 'Os Cavaleiros do Zodíaco',
    en: 'Saint Seiya: Knights of the Zodiac',
    romaji: 'Saint Seiya',
    aliases: ['Cavaleiros do Zodiaco', 'Saint Seiya'],
  },
  {
    pt: 'Inuyasha',
    en: 'InuYasha',
    romaji: 'InuYasha',
    aliases: ['Inuyasha'],
  },
  {
    pt: 'Fairy Tail',
    en: 'Fairy Tail',
    romaji: 'Fairy Tail',
    aliases: [],
  },
  {
    pt: 'Toradora!',
    en: 'Toradora!',
    romaji: 'Toradora!',
    aliases: ['Toradora'],
  },
  {
    pt: 'Sua Mentira em Abril',
    en: 'Your Lie in April',
    romaji: 'Shigatsu wa Kimi no Uso',
    aliases: ['Your Lie in April'],
  },
  {
    pt: 'A Voz do Silêncio',
    en: 'A Silent Voice',
    romaji: 'Koe no Katachi',
    aliases: ['A Silent Voice', 'Koe no Katachi'],
  },
  {
    pt: 'Violet Evergarden',
    en: 'Violet Evergarden',
    romaji: 'Violet Evergarden',
    aliases: [],
  },
  {
    pt: 'Horimiya',
    en: 'Horimiya',
    romaji: 'Horimiya',
    aliases: [],
  },
  {
    pt: 'Assassination Classroom',
    en: 'Assassination Classroom',
    romaji: 'Ansatsu Kyoushitsu',
    aliases: ['Ansatsu Kyoushitsu'],
  },
  {
    pt: 'O Herói do Escudo',
    en: 'The Rising of the Shield Hero',
    romaji: 'Tate no Yuusha no Nariagari',
    aliases: ['Shield Hero', 'Tate no Yuusha'],
  },
  {
    pt: 'O Basquete de Kuroko',
    en: "Kuroko's Basketball",
    romaji: 'Kuroko no Basket',
    aliases: ['Kuroko no Basket'],
  },
  {
    pt: 'Noragami',
    en: 'Noragami',
    romaji: 'Noragami',
    aliases: ['Noragami Aragoto'],
  },
  {
    pt: 'Akame ga Kill!',
    en: 'Akame ga Kill!',
    romaji: 'Akame ga Kill!',
    aliases: ['Akame ga Kill'],
  },
  {
    pt: 'Bungo Stray Dogs',
    en: 'Bungo Stray Dogs',
    romaji: 'Bungou Stray Dogs',
    aliases: ['Bungou Stray Dogs'],
  },
  {
    pt: 'Dororo',
    en: 'Dororo',
    romaji: 'Dororo',
    aliases: [],
  },
  {
    pt: 'Parasyte',
    en: 'Parasyte -the maxim-',
    romaji: 'Kiseijuu: Sei no Kakuritsu',
    aliases: ['Parasyte', 'Kiseijuu'],
  },
  {
    pt: 'Psycho-Pass',
    en: 'Psycho-Pass',
    romaji: 'Psycho-Pass',
    aliases: ['Psycho Pass'],
  },
  {
    pt: 'Made in Abyss',
    en: 'Made in Abyss',
    romaji: 'Made in Abyss',
    aliases: [],
  },
  {
    pt: 'Berserk',
    en: 'Berserk',
    romaji: 'Berserk',
    aliases: [],
  },
  {
    pt: 'Torre de Deus',
    en: 'Tower of God',
    romaji: 'Kami no Tou',
    aliases: ['Tower of God'],
  },
  {
    pt: 'Shangri-La Frontier',
    en: 'Shangri-La Frontier',
    romaji: 'Shangri-La Frontier',
    aliases: [],
  },
  {
    pt: 'The Eminence in Shadow',
    en: 'The Eminence in Shadow',
    romaji: 'Kage no Jitsuryokusha ni Naritakute!',
    aliases: ['Eminence in Shadow'],
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Expande a query de pesquisa para incluir títulos equivalentes em Inglês, Português e Romaji.
 * Exemplo:
 *  - "attack on titan" -> ["attack on titan", "shingeki no kyojin", "ataque dos titas", "aot"]
 *  - "kimetsu" -> ["kimetsu", "demon slayer", "cacador de demonios"]
 *  - "minha estrela favorita" -> ["minha estrela favorita", "oshi no ko", "my star"]
 */
export function expandQueryWithAliases(query: string): string[] {
  const normQuery = normalizeText(query);
  if (!normQuery) return [query];

  const results = new Set<string>();
  results.add(normQuery);

  for (const item of POPULAR_ANIME_DICTIONARY) {
    const allVariants = [
      normalizeText(item.pt),
      normalizeText(item.en),
      normalizeText(item.romaji),
      ...(item.aliases?.map(normalizeText) || []),
    ].filter(Boolean);

    // Se a query bater com qualquer uma das variações (ou for substring relevante)
    const isMatch = allVariants.some(
      (v) => v === normQuery || v.includes(normQuery) || (normQuery.length >= 4 && normQuery.includes(v))
    );

    if (isMatch) {
      allVariants.forEach((v) => results.add(v));
    }
  }

  return Array.from(results);
}
