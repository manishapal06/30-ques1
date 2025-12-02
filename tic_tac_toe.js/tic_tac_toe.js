// tic_tac_toe.js
// Run: node tic_tac_toe.js

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((res) => rl.question(question, (ans) => res(ans.trim())));
}

// Board coordinates mapping
const rows = ['A', 'B', 'C'];
const cols = ['1', '2', '3'];

function makeEmptyBoard() {
  return [
    ['_', '_', '_'],
    ['_', '_', '_'],
    ['_', '_', '_'],
  ];
}

function printBoard(board) {
  console.log('\n   1 2 3');
  for (let r = 0; r < 3; r++) {
    console.log(rows[r] + '  ' + board[r].join(' '));
  }
  console.log('');
}

function coordToIndex(coord) {
  if (typeof coord !== 'string' || coord.length < 2 || coord.length > 2) return null;
  const rowChar = coord[0].toUpperCase();
  const colChar = coord[1];
  const r = rows.indexOf(rowChar);
  const c = cols.indexOf(colChar);
  if (r === -1 || c === -1) return null;
  return { r, c };
}

function checkWin(board, symbol) {
  // rows
  for (let r = 0; r < 3; r++) {
    if (board[r][0] === symbol && board[r][1] === symbol && board[r][2] === symbol) return true;
  }
  // cols
  for (let c = 0; c < 3; c++) {
    if (board[0][c] === symbol && board[1][c] === symbol && board[2][c] === symbol) return true;
  }
  // diagonals
  if (board[0][0] === symbol && board[1][1] === symbol && board[2][2] === symbol) return true;
  if (board[0][2] === symbol && board[1][1] === symbol && board[2][0] === symbol) return true;

  return false;
}

async function registerPlayers() {
  console.log('Tic-Tac-Toe (3x3) with Diagonal Lock Rule\n');
  let p1 = {}, p2 = {};

  while (true) {
    const name1 = await ask('Player 1 - Enter name: ');
    const sym1 = await ask('Player 1 - Enter single-character symbol (not "_"): ');
    if (!name1) { console.log('Name cannot be empty.'); continue; }
    if (!sym1 || sym1.length !== 1) { console.log('Symbol must be a single character.'); continue; }
    if (sym1 === '_') { console.log('Symbol "_" is reserved for empty cells. Choose another.'); continue; }
    p1 = { name: name1, symbol: sym1 };
    break;
  }

  while (true) {
    const name2 = await ask('Player 2 - Enter name: ');
    const sym2 = await ask('Player 2 - Enter single-character symbol (not "_"): ');
    if (!name2) { console.log('Name cannot be empty.'); continue; }
    if (!sym2 || sym2.length !== 1) { console.log('Symbol must be a single character.'); continue; }
    if (sym2 === '_') { console.log('Symbol "_" is reserved for empty cells. Choose another.'); continue; }
    if (sym2 === p1.symbol) { console.log(`Symbol "${sym2}" is already used by Player 1. Choose another.`); continue; }
    if (name2 === p1.name) { console.log(`Name "${name2}" is already used by Player 1. Choose another name.`); continue; }
    p2 = { name: name2, symbol: sym2 };
    break;
  }

  console.log(`\nRegistered:\n  Player 1: ${p1.name} as "${p1.symbol}"\n  Player 2: ${p2.name} as "${p2.symbol}"\n`);
  return [p1, p2];
}

function isBoardFull(board) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (board[r][c] === '_') return false;
  return true;
}

function playerHasCell(board, playerSymbol, r, c) {
  return board[r][c] === playerSymbol;
}

async function main() {
  const [p1, p2] = await registerPlayers();
  const board = makeEmptyBoard();
  let currentPlayer = p1;
  let otherPlayer = p2;
  let gameEnded = false;
  // If center is locked, store the symbol of locker, otherwise null
  let centerLockedBy = null;

  printBoard(board);
  while (!gameEnded) {
    const input = await ask(`${currentPlayer.name} (${currentPlayer.symbol}) - Enter coordinate (e.g., A1): `);
    const coord = input.replace(/\s+/g, '').toUpperCase();
    const idx = coordToIndex(coord);

    // Validate coordinate
    if (!idx) {
      console.log('Invalid coordinate. Use format A1..C3. Example: B2\n');
      continue;
    }

    const { r, c } = idx;

    // Check if cell is center and if center lock applies
    if (r === 1 && c === 1 && centerLockedBy && centerLockedBy !== currentPlayer.symbol) {
      console.log(`Center B2 is locked to player with symbol "${centerLockedBy}". You cannot claim it.\n`);
      continue;
    }

    // Check if already filled
    if (board[r][c] !== '_') {
      console.log('Cell already filled. Choose another cell.\n');
      continue;
    }

    // Place symbol
    board[r][c] = currentPlayer.symbol;
    console.log('');
    printBoard(board);

    // After placing, check diagonal-lock trigger:
    // If current player now has both A1 & C3 OR A3 & C1, and center B2 is empty -> lock it to this player's symbol
    const hasA1 = playerHasCell(board, currentPlayer.symbol, 0, 0);
    const hasC3 = playerHasCell(board, currentPlayer.symbol, 2, 2);
    const hasA3 = playerHasCell(board, currentPlayer.symbol, 0, 2);
    const hasC1 = playerHasCell(board, currentPlayer.symbol, 2, 0);

    if (board[1][1] === '_' && ( (hasA1 && hasC3) || (hasA3 && hasC1) )) {
      centerLockedBy = currentPlayer.symbol;
      console.log(`Diagonal lock triggered! Center B2 is now locked to ${currentPlayer.name} ("${currentPlayer.symbol}").\n`);
    }

    // Win check
    if (checkWin(board, currentPlayer.symbol)) {
      console.log(`🎉 ${currentPlayer.name} (${currentPlayer.symbol}) wins! Congratulations!\n`);
      gameEnded = true;
      break;
    }

    // Draw check
    if (isBoardFull(board)) {
      console.log("It's a draw! No more moves left.\n");
      gameEnded = true;
      break;
    }

    // Swap players for next turn
    [currentPlayer, otherPlayer] = [otherPlayer, currentPlayer];
  }

  console.log('Game over. Thank you for playing.');
  rl.close();
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  rl.close();
});
