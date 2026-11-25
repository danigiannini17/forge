export interface PlaymatTheme {
  id: string;
  name: string;
  description: string;
  swatch: string;
  surfaceCss: string;
  borderAccent: string;
}

export interface SleeveTheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  border: string;
  emblem: string;
}

export const PLAYMAT_THEMES: PlaymatTheme[] = [
  {
    id: 'edh-slate',
    name: 'EDHPlay Ardesia',
    description: 'Superficie scura opaca classica con accenti ciano',
    swatch: 'linear-gradient(135deg, #1E2736 0%, #151B26 100%)',
    surfaceCss:
      'radial-gradient(ellipse at 50% 0%, rgba(0, 181, 216, 0.08) 0%, transparent 65%), linear-gradient(180deg, #1E2534 0%, #161B26 100%)',
    borderAccent: 'rgba(0, 181, 216, 0.32)',
  },
  {
    id: 'arcane-cyan',
    name: 'Marea Arcana',
    description: 'Blu oceanico profondo con riflesso ciano',
    swatch: 'linear-gradient(135deg, #123344 0%, #0D1E2B 100%)',
    surfaceCss:
      'radial-gradient(circle at 20% 20%, rgba(0, 181, 216, 0.16) 0%, transparent 55%), radial-gradient(circle at 85% 85%, rgba(11, 197, 234, 0.1) 0%, transparent 55%), linear-gradient(160deg, #122838 0%, #0E1A26 100%)',
    borderAccent: 'rgba(11, 197, 234, 0.42)',
  },
  {
    id: 'emerald-grove',
    name: 'Radura Smeraldo',
    description: 'Tappetino da torneo verde foresta scuro',
    swatch: 'linear-gradient(135deg, #153328 0%, #0E1F19 100%)',
    surfaceCss:
      'radial-gradient(ellipse at 50% 10%, rgba(56, 161, 105, 0.15) 0%, transparent 60%), linear-gradient(180deg, #142B22 0%, #0E1D17 100%)',
    borderAccent: 'rgba(72, 187, 120, 0.36)',
  },
  {
    id: 'obsidian-ember',
    name: 'Forgia Ossidiana',
    description: 'Carbone vulcanico con bagliore ambrato',
    swatch: 'linear-gradient(135deg, #321C1D 0%, #1B1216 100%)',
    surfaceCss:
      'radial-gradient(circle at 75% 15%, rgba(237, 137, 54, 0.14) 0%, transparent 55%), linear-gradient(165deg, #27191D 0%, #171217 100%)',
    borderAccent: 'rgba(237, 137, 54, 0.36)',
  },
  {
    id: 'astral-midnight',
    name: 'Notte Astrale',
    description: 'Blu notte siderale a basso contrasto',
    swatch: 'linear-gradient(135deg, #1B203B 0%, #111424 100%)',
    surfaceCss:
      'radial-gradient(circle at 30% 80%, rgba(56, 189, 248, 0.11) 0%, transparent 55%), linear-gradient(180deg, #1B2036 0%, #121626 100%)',
    borderAccent: 'rgba(99, 179, 237, 0.35)',
  },
  {
    id: 'tournament-felt',
    name: 'Panno Torneo',
    description: 'Grigio antracite neutrale per massima leggibilità carte',
    swatch: 'linear-gradient(135deg, #262C36 0%, #1A1F28 100%)',
    surfaceCss:
      'linear-gradient(180deg, #232934 0%, #191E28 100%)',
    borderAccent: 'rgba(203, 213, 224, 0.22)',
  },
];

export const SLEEVE_THEMES: SleeveTheme[] = [
  {
    id: 'cyan',
    name: 'Ciano EDH',
    primary: '#152A38',
    secondary: '#0F1C28',
    border: '#00B5D8',
    emblem: '#76E4F7',
  },
  {
    id: 'obsidian',
    name: 'Ossidiana',
    primary: '#232936',
    secondary: '#141821',
    border: '#718096',
    emblem: '#CBD5E0',
  },
  {
    id: 'emerald',
    name: 'Smeraldo',
    primary: '#133126',
    secondary: '#0C1E17',
    border: '#38A169',
    emblem: '#9AE6B4',
  },
  {
    id: 'crimson',
    name: 'Cremisi',
    primary: '#3B181E',
    secondary: '#210E12',
    border: '#E53E3E',
    emblem: '#FEB2B2',
  },
  {
    id: 'amber',
    name: 'Ambra',
    primary: '#332512',
    secondary: '#1D150B',
    border: '#DD6B20',
    emblem: '#FBD38D',
  },
];

const STORAGE_PLAYMAT_KEY = 'lozzander_playmat_id';
const STORAGE_SLEEVE_KEY = 'lozzander_sleeve_id';

export function loadSavedPlaymatId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_PLAYMAT_KEY);
    if (saved && PLAYMAT_THEMES.some((p) => p.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage restriction
  }
  return PLAYMAT_THEMES[0].id;
}

export function savePlaymatId(id: string): void {
  try {
    localStorage.setItem(STORAGE_PLAYMAT_KEY, id);
  } catch {
    // ignore storage restriction
  }
}

export function loadSavedSleeveId(): string {
  try {
    const saved = localStorage.getItem(STORAGE_SLEEVE_KEY);
    if (saved && SLEEVE_THEMES.some((s) => s.id === saved)) {
      return saved;
    }
  } catch {
    // ignore storage restriction
  }
  return SLEEVE_THEMES[0].id;
}

export function saveSleeveId(id: string): void {
  try {
    localStorage.setItem(STORAGE_SLEEVE_KEY, id);
  } catch {
    // ignore storage restriction
  }
}

export function getPlaymatTheme(id: string): PlaymatTheme {
  return PLAYMAT_THEMES.find((p) => p.id === id) || PLAYMAT_THEMES[0];
}

export function getSleeveTheme(id: string): SleeveTheme {
  return SLEEVE_THEMES.find((s) => s.id === id) || SLEEVE_THEMES[0];
}

export const WAIT_REACTION_PREFIX = '✋ Aspetta! In risposta';
