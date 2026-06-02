/** Códigos de bandera (flagcdn.com 2-letter) para los 48 equipos del Mundial 2026. */
export const FLAG_CODES: Record<string, string> = {
  Mexico: 'mx', 'South Africa': 'za', 'South Korea': 'kr', 'Czech Republic': 'cz',
  Canada: 'ca', 'Bosnia & Herzegovina': 'ba', Qatar: 'qa', Switzerland: 'ch',
  Brazil: 'br', Morocco: 'ma', Haiti: 'ht', Scotland: 'gb-sct', USA: 'us',
  Paraguay: 'py', Australia: 'au', Turkey: 'tr', Germany: 'de', 'Curaçao': 'cw',
  'Ivory Coast': 'ci', Ecuador: 'ec', Netherlands: 'nl', Japan: 'jp', Sweden: 'se',
  Tunisia: 'tn', Belgium: 'be', Egypt: 'eg', Iran: 'ir', 'New Zealand': 'nz',
  Spain: 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa', Uruguay: 'uy', France: 'fr',
  Senegal: 'sn', Iraq: 'iq', Norway: 'no', Argentina: 'ar', Algeria: 'dz',
  Austria: 'at', Jordan: 'jo', Portugal: 'pt', 'DR Congo': 'cd', Uzbekistan: 'uz',
  Colombia: 'co', England: 'gb-eng', Croatia: 'hr', Ghana: 'gh', Panama: 'pa',
}

/** Nombres en español para los 48 equipos. */
export const ES_NAMES: Record<string, string> = {
  Mexico: 'México', 'South Africa': 'Sudáfrica', 'South Korea': 'Corea del Sur',
  'Czech Republic': 'Chequia', Canada: 'Canadá', 'Bosnia & Herzegovina': 'Bosnia y Herzeg.',
  Qatar: 'Catar', Switzerland: 'Suiza', Brazil: 'Brasil', Morocco: 'Marruecos',
  Haiti: 'Haití', Scotland: 'Escocia', USA: 'Estados Unidos', Paraguay: 'Paraguay',
  Australia: 'Australia', Turkey: 'Turquía', Germany: 'Alemania', 'Curaçao': 'Curazao',
  'Ivory Coast': 'Costa de Marfil', Ecuador: 'Ecuador', Netherlands: 'Países Bajos',
  Japan: 'Japón', Sweden: 'Suecia', Tunisia: 'Túnez', Belgium: 'Bélgica',
  Egypt: 'Egipto', Iran: 'Irán', 'New Zealand': 'Nueva Zelanda', Spain: 'España',
  'Cape Verde': 'Cabo Verde', 'Saudi Arabia': 'Arabia Saudita', Uruguay: 'Uruguay',
  France: 'Francia', Senegal: 'Senegal', Iraq: 'Irak', Norway: 'Noruega',
  Argentina: 'Argentina', Algeria: 'Argelia', Austria: 'Austria', Jordan: 'Jordania',
  Portugal: 'Portugal', 'DR Congo': 'RD Congo', Uzbekistan: 'Uzbekistán',
  Colombia: 'Colombia', England: 'Inglaterra', Croatia: 'Croacia', Ghana: 'Ghana',
  Panama: 'Panamá',
}

export function flagCode(teamName: string): string {
  return FLAG_CODES[teamName] ?? 'un'
}

export function esName(teamName: string): string {
  return ES_NAMES[teamName] ?? teamName
}
