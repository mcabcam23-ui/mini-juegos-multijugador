// Banco de preguntas de Trivia. answer = índice de la opción correcta (0-3).
export const QUESTIONS = [
  { c: 'Geografía', q: '¿Cuál es la capital de Australia?', o: ['Sídney', 'Canberra', 'Melbourne', 'Perth'], a: 1 },
  { c: 'Geografía', q: '¿Cuál es el río más largo del mundo?', o: ['Nilo', 'Amazonas', 'Misisipi', 'Yangtsé'], a: 1 },
  { c: 'Geografía', q: '¿En qué continente está el desierto del Sáhara?', o: ['Asia', 'Oceanía', 'África', 'América'], a: 2 },
  { c: 'Geografía', q: '¿Cuál es el país más extenso del mundo?', o: ['China', 'Canadá', 'EE. UU.', 'Rusia'], a: 3 },
  { c: 'Geografía', q: '¿Cuál es la montaña más alta del mundo?', o: ['K2', 'Everest', 'Aconcagua', 'Mont Blanc'], a: 1 },
  { c: 'Historia', q: '¿En qué año llegó el ser humano a la Luna?', o: ['1965', '1969', '1972', '1958'], a: 1 },
  { c: 'Historia', q: '¿Quién pintó la Mona Lisa?', o: ['Van Gogh', 'Picasso', 'Da Vinci', 'Miguel Ángel'], a: 2 },
  { c: 'Historia', q: '¿Qué civilización construyó Machu Picchu?', o: ['Azteca', 'Maya', 'Inca', 'Olmeca'], a: 2 },
  { c: 'Historia', q: '¿En qué año cayó el Muro de Berlín?', o: ['1989', '1991', '1985', '1979'], a: 0 },
  { c: 'Ciencia', q: '¿Cuál es el planeta más grande del sistema solar?', o: ['Saturno', 'Júpiter', 'Neptuno', 'Tierra'], a: 1 },
  { c: 'Ciencia', q: '¿Cuál es el símbolo químico del oro?', o: ['Ag', 'Au', 'Or', 'Go'], a: 1 },
  { c: 'Ciencia', q: '¿Cuántos huesos tiene el cuerpo humano adulto?', o: ['206', '180', '250', '300'], a: 0 },
  { c: 'Ciencia', q: '¿Qué gas respiran las plantas para la fotosíntesis?', o: ['Oxígeno', 'Hidrógeno', 'Dióxido de carbono', 'Nitrógeno'], a: 2 },
  { c: 'Ciencia', q: '¿A qué velocidad viaja la luz aproximadamente?', o: ['300.000 km/s', '150.000 km/s', '1.000 km/s', '30.000 km/s'], a: 0 },
  { c: 'Ciencia', q: '¿Cuál es el metal líquido a temperatura ambiente?', o: ['Plomo', 'Mercurio', 'Hierro', 'Estaño'], a: 1 },
  { c: 'Deporte', q: '¿Cada cuántos años se celebran los Juegos Olímpicos de verano?', o: ['2', '3', '4', '5'], a: 2 },
  { c: 'Deporte', q: '¿Cuántos jugadores tiene un equipo de fútbol en el campo?', o: ['9', '10', '11', '12'], a: 2 },
  { c: 'Deporte', q: '¿En qué deporte destaca Rafael Nadal?', o: ['Golf', 'Tenis', 'Pádel', 'Baloncesto'], a: 1 },
  { c: 'Cine', q: '¿Quién dirigió la película "Titanic"?', o: ['Spielberg', 'Cameron', 'Nolan', 'Scorsese'], a: 1 },
  { c: 'Cine', q: '¿Cómo se llama el mago protagonista de la saga de Hogwarts?', o: ['Frodo', 'Harry Potter', 'Gandalf', 'Merlín'], a: 1 },
  { c: 'Arte', q: '¿De qué país era el pintor Salvador Dalí?', o: ['Italia', 'Francia', 'España', 'México'], a: 2 },
  { c: 'Música', q: '¿Cuántas cuerdas tiene una guitarra clásica estándar?', o: ['4', '5', '6', '7'], a: 2 },
  { c: 'Naturaleza', q: '¿Cuál es el animal terrestre más rápido?', o: ['León', 'Guepardo', 'Caballo', 'Galgo'], a: 1 },
  { c: 'Naturaleza', q: '¿Cuál es el mamífero más grande del planeta?', o: ['Elefante', 'Ballena azul', 'Jirafa', 'Orca'], a: 1 },
  { c: 'Matemáticas', q: '¿Cuánto es 7 x 8?', o: ['54', '56', '64', '49'], a: 1 },
  { c: 'Matemáticas', q: '¿Cuántos lados tiene un hexágono?', o: ['5', '6', '7', '8'], a: 1 },
  { c: 'Lengua', q: '¿Cuántas letras tiene el abecedario español (con Ñ)?', o: ['26', '27', '28', '29'], a: 1 },
  { c: 'Tecnología', q: '¿Qué significa "www"?', o: ['World Wide Web', 'World Web Wide', 'Web World Wide', 'Wide World Web'], a: 0 },
  { c: 'Tecnología', q: '¿Quién fundó Microsoft junto a Paul Allen?', o: ['Steve Jobs', 'Elon Musk', 'Bill Gates', 'Mark Zuckerberg'], a: 2 },
  { c: 'Astronomía', q: '¿Cuál es la estrella más cercana a la Tierra?', o: ['Sirio', 'El Sol', 'Polaris', 'Alfa Centauri'], a: 1 },
];

export function pickQuestions(n) {
  const shuffled = [...QUESTIONS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Elige una pregunta al azar, opcionalmente filtrada por categorías (null = todas). */
export function pickQuestionByCategories(categories, usedKeys = []) {
  const used = new Set(usedKeys);
  let pool = QUESTIONS.filter((q) => !used.has(`${q.c}|${q.q}`));
  if (categories && categories.length) {
    pool = pool.filter((q) => categories.includes(q.c));
  }
  if (!pool.length) {
    pool = categories && categories.length
      ? QUESTIONS.filter((q) => categories.includes(q.c))
      : [...QUESTIONS];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
