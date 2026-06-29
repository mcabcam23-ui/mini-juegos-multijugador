import ticTacToe from './ticTacToe.js';
import connect4 from './connect4.js';
import battleship from './battleship.js';
import rps from './rps.js';
import memory from './memory.js';
import hangman from './hangman.js';
import trivia from './trivia.js';
import checkers from './checkers.js';
import dots from './dots.js';
import reversi from './reversi.js';
import mastermind from './mastermind.js';
import simon from './simon.js';
import wordrush from './wordrush.js';
import dicey from './dicey.js';

const games = {
  [ticTacToe.meta.id]: ticTacToe,
  [connect4.meta.id]: connect4,
  [battleship.meta.id]: battleship,
  [checkers.meta.id]: checkers,
  [dots.meta.id]: dots,
  [memory.meta.id]: memory,
  [hangman.meta.id]: hangman,
  [trivia.meta.id]: trivia,
  [rps.meta.id]: rps,
  [reversi.meta.id]: reversi,
  [mastermind.meta.id]: mastermind,
  [simon.meta.id]: simon,
  [wordrush.meta.id]: wordrush,
  [dicey.meta.id]: dicey,
};

export function getGame(id) {
  return games[id] || null;
}

export function listGames() {
  return Object.values(games).map((g) => g.meta);
}

export default games;
