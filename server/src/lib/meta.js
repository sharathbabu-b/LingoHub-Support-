// Languages the platform supports (focus: European + Asian, per product brief).
const LANGUAGES = [
  // Europe
  { code: 'en', name: 'English', region: 'Europe' },
  { code: 'de', name: 'German', region: 'Europe' },
  { code: 'fr', name: 'French', region: 'Europe' },
  { code: 'es', name: 'Spanish', region: 'Europe' },
  { code: 'it', name: 'Italian', region: 'Europe' },
  { code: 'pt', name: 'Portuguese', region: 'Europe' },
  { code: 'nl', name: 'Dutch', region: 'Europe' },
  { code: 'pl', name: 'Polish', region: 'Europe' },
  { code: 'ro', name: 'Romanian', region: 'Europe' },
  { code: 'sv', name: 'Swedish', region: 'Europe' },
  { code: 'ru', name: 'Russian', region: 'Europe' },
  { code: 'uk', name: 'Ukrainian', region: 'Europe' },
  { code: 'tr', name: 'Turkish', region: 'Europe' },
  // Asia
  { code: 'ja', name: 'Japanese', region: 'Asia' },
  { code: 'ko', name: 'Korean', region: 'Asia' },
  { code: 'zh', name: 'Chinese (Mandarin)', region: 'Asia' },
  { code: 'hi', name: 'Hindi', region: 'Asia' },
  { code: 'ta', name: 'Tamil', region: 'Asia' },
  { code: 'te', name: 'Telugu', region: 'Asia' },
  { code: 'bn', name: 'Bengali', region: 'Asia' },
  { code: 'th', name: 'Thai', region: 'Asia' },
  { code: 'vi', name: 'Vietnamese', region: 'Asia' },
  { code: 'id', name: 'Indonesian', region: 'Asia' },
  { code: 'ms', name: 'Malay', region: 'Asia' },
  { code: 'fil', name: 'Filipino', region: 'Asia' },
  { code: 'ar', name: 'Arabic', region: 'Asia' },
];

// Proficiency levels, best first. Weight is used by the matching engine.
const LEVELS = [
  { code: 'native', label: 'Native speaker', weight: 1.0, rank: 4 },
  { code: 'C2', label: 'C2 – Proficient', weight: 0.9, rank: 3 },
  { code: 'C1', label: 'C1 – Advanced', weight: 0.8, rank: 2 },
  { code: 'B2', label: 'B2 – Upper-intermediate', weight: 0.6, rank: 1 },
];

const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
const LEVEL_CODES = LEVELS.map((l) => l.code);
const levelRank = (code) => (LEVELS.find((l) => l.code === code) || { rank: 0 }).rank;
const levelWeight = (code) => (LEVELS.find((l) => l.code === code) || { weight: 0 }).weight;

module.exports = { LANGUAGES, LEVELS, LANGUAGE_CODES, LEVEL_CODES, levelRank, levelWeight };
