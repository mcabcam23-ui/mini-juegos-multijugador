// Palabras para el Ahorcado (sin tildes, en mayúsculas), agrupadas por categoría.
export const WORD_BANK = [
  { category: 'Animales', words: ['ELEFANTE', 'MURCIELAGO', 'COCODRILO', 'JIRAFA', 'CANGURO', 'DELFIN', 'TIBURON', 'MARIPOSA', 'PINGUINO', 'ARDILLA', 'TORTUGA', 'CABALLO', 'GORILA', 'SERPIENTE', 'HORMIGA'] },
  { category: 'Países', words: ['ARGENTINA', 'ESPANA', 'MEXICO', 'COLOMBIA', 'BRASIL', 'CANADA', 'JAPON', 'ALEMANIA', 'PORTUGAL', 'MARRUECOS', 'NORUEGA', 'AUSTRALIA', 'EGIPTO', 'CHILE', 'PERU'] },
  { category: 'Comida', words: ['CHOCOLATE', 'ESPAGUETI', 'HAMBURGUESA', 'PAELLA', 'TORTILLA', 'AGUACATE', 'SANDIA', 'GAZPACHO', 'EMPANADA', 'CROQUETA', 'LENTEJAS', 'CALAMARES', 'MANZANA', 'NARANJA', 'GALLETA'] },
  { category: 'Deportes', words: ['BALONCESTO', 'NATACION', 'CICLISMO', 'ATLETISMO', 'VOLEIBOL', 'BOXEO', 'ESGRIMA', 'PATINAJE', 'SURF', 'ESCALADA', 'TENIS', 'FUTBOL', 'GOLF', 'REMO', 'JUDO'] },
  { category: 'Cine', words: ['PELICULA', 'PALOMITAS', 'DIRECTOR', 'GUION', 'ESTRENO', 'COMEDIA', 'SUSPENSE', 'TAQUILLA', 'PERSONAJE', 'ESCENARIO', 'ACTOR', 'CAMARA', 'PREMIO', 'TRAILER', 'ANIMACION'] },
  { category: 'Tecnología', words: ['ORDENADOR', 'TECLADO', 'INTERNET', 'PROGRAMA', 'PANTALLA', 'ALGORITMO', 'NAVEGADOR', 'CONTRASENA', 'BATERIA', 'AURICULARES', 'ROBOT', 'SATELITE', 'PIXEL', 'SERVIDOR', 'CODIGO'] },
];

export function randomWord() {
  const cat = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
  const word = cat.words[Math.floor(Math.random() * cat.words.length)];
  return { category: cat.category, word };
}
