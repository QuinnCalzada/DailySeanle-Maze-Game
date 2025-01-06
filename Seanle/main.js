/******************************************
 * main.js
 ******************************************/

// ------------------------------------------------------
// CONFIG & CONSTANTS
// ------------------------------------------------------
const TILE_SIZE = 32;
const ROWS = 20;
const COLS = 20;
const LIGHT_RADIUS = 5;

// Maze tile types
const WALL       = 0;
const FLOOR      = 1;
const CRACK_WALL = 2;
const TRAP_FLOOR = 3;
const KEY_ITEM   = 4;
const TIME_ITEM  = 5;
const LETTER_S   = 6;
const LETTER_E   = 7;
const LETTER_A   = 8;
const LETTER_N   = 9;

// We’ll keep color fallback for non-letter tiles
const TILE_COLORS = {
  [WALL]:       "#444",
  [FLOOR]:      "#cccccc",
  [CRACK_WALL]: "#666666",
  [TRAP_FLOOR]: "#880000",
  [KEY_ITEM]:   "gold",
  [TIME_ITEM]:  "cyan"
};

// For the player & enemy
const PLAYER_COLOR = "yellow";
const ENEMY_COLOR  = "red";

// Enemy moves every 0.1 seconds
const ENEMY_MOVE_INTERVAL = 100; // ms

// Maze + Player + Enemy
let canvas, ctx;
let maze = [];
let visited = [];

let player = {
  row: 1,
  col: 1,
  collectedLetters: []
};

let startPos = { row: 1, col: 1 };
let timeElapsed = 0;
let gameRunning = false;
let lastFrameTime = 0;

let enemy = {
  row: -1,
  col: -1,
  active: false
};

// Trap popup timer
let trapPopupTimer = 0;
const TRAP_MESSAGE_DURATION = 1000;

// Sean-summoned timer
let seanSummonedTimer = 0;
const SEAN_SUMMONED_DURATION = 500;

// ------------------------------------------------------
// DAILY LOGIC: dayIndex & seeded RNG
// ------------------------------------------------------
const REFERENCE_DATE = new Date(2023, 0, 1); // Jan 1, 2023
const now = new Date();
let dayIndex = Math.floor((now - REFERENCE_DATE) / (1000 * 60 * 60 * 24)) + 1;
let puzzleSeed = dayIndex;

// A simple seeded RNG
let rngState = puzzleSeed;
function seededRandom() {
  rngState = (1103515245 * rngState + 12345) & 0x7fffffff;
  return (rngState / 0x80000000);
}
function sRandRange(min, max) {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

// ------------------------------------------------------
// LETTER IMAGES for S/E/A/N
// ------------------------------------------------------
// We'll load four images specifically for the letters.
let letterImages = {
  [LETTER_S]: null,
  [LETTER_E]: null,
  [LETTER_A]: null,
  [LETTER_N]: null
};

function loadLetterImages(onComplete) {
  const lettersToLoad = [
    { type: LETTER_S, src: "assets/letter_s.png" },
    { type: LETTER_E, src: "assets/letter_e.png" },
    { type: LETTER_A, src: "assets/letter_a.png" },
    { type: LETTER_N, src: "assets/letter_n.png" }
  ];
  let loadedCount = 0;
  let total = lettersToLoad.length;

  lettersToLoad.forEach(item => {
    let img = new Image();
    img.onload = () => {
      loadedCount++;
      if (loadedCount === total) {
        onComplete();
      }
    };
    img.src = item.src;
    letterImages[item.type] = img;
  });
}

// ------------------------------------------------------
// WINDOW ONLOAD
// ------------------------------------------------------
window.onload = function() {
  // 1) Load letter images first
  loadLetterImages(() => {
    // 2) Then initialize the game once images are ready
    initGame();
    setupInput();

    // Show rules popup first
    showElement("rulesPopup");

    // Enemy interval
    setInterval(() => {
      if (gameRunning && enemy.active) {
        moveEnemyBFS();
      }
    }, ENEMY_MOVE_INTERVAL);

    // Setup share button
    const shareBtn = document.getElementById("shareBtn");
    shareBtn.addEventListener("click", copyResultsToClipboard);

    // Start button
    const startGameBtn = document.getElementById("startGameBtn");
    startGameBtn.addEventListener("click", startGame);
  });
};

// ------------------------------------------------------
// INIT GAME
// ------------------------------------------------------
function initGame() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  // Set puzzle seed
  rngState = puzzleSeed;

  generateMaze();
  placeFeatures();

  player.row = startPos.row;
  player.col = startPos.col;
  player.collectedLetters = [];
  timeElapsed = 0;

  enemy.active = false;
  enemy.row = -1;
  enemy.col = -1;

  hideElement("popup");
  hideElement("seanSummonedPopup");
  hideElement("endGamePopup");
  hideElement("rulesPopup");
}

// ------------------------------------------------------
// START GAME
// ------------------------------------------------------
function startGame() {
  hideElement("rulesPopup");
  gameRunning = true;
  lastFrameTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ------------------------------------------------------
// MAIN LOOP
// ------------------------------------------------------
function gameLoop(timestamp) {
  if (!gameRunning) return;

  let dt = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  timeElapsed += dt;
  document.getElementById("timeLabel").textContent = timeElapsed.toFixed(2);

  if (trapPopupTimer > 0) {
    trapPopupTimer -= dt * 1000;
    if (trapPopupTimer <= 0) {
      hideElement("popup");
    }
  }
  if (seanSummonedTimer > 0) {
    seanSummonedTimer -= dt * 1000;
    if (seanSummonedTimer <= 0) {
      hideElement("seanSummonedPopup");
    }
  }

  draw();
  requestAnimationFrame(gameLoop);
}

// ------------------------------------------------------
// DRAW - uses letterImages for S/E/A/N tiles
// ------------------------------------------------------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let dist = Math.abs(r - player.row) + Math.abs(c - player.col);
      if (dist <= LIGHT_RADIUS) {
        let tileType = maze[r][c];
        drawTile(r, c, tileType);
      } else {
        // darkness
        ctx.fillStyle = "#000";
        ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Player
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(player.col*TILE_SIZE + 8, player.row*TILE_SIZE + 8,
               TILE_SIZE - 16, TILE_SIZE - 16);

  // Enemy
  if (enemy.active) {
    ctx.fillStyle = ENEMY_COLOR;
    ctx.fillRect(enemy.col*TILE_SIZE + 8, enemy.row*TILE_SIZE + 8,
                 TILE_SIZE - 16, TILE_SIZE - 16);
  }
}

// If tile is a letter, draw the image; otherwise, fallback to color
function drawTile(r, c, tileType) {
  if (tileType === LETTER_S ||
      tileType === LETTER_E ||
      tileType === LETTER_A ||
      tileType === LETTER_N) {

    // If we have a loaded image for this letter, draw it
    let letterImg = letterImages[tileType];
    if (letterImg) {
      ctx.drawImage(letterImg, c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
      return;
    }
  }

  // Fallback for walls, floors, traps, etc.
  const color = TILE_COLORS[tileType] || "#000";
  ctx.fillStyle = color;
  ctx.fillRect(c*TILE_SIZE, r*TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

// ------------------------------------------------------
// GENERATE + PLACE FEATURES (seeded random)
// ------------------------------------------------------
function generateMaze() {
  maze = Array.from({length: ROWS}, () => Array(COLS).fill(WALL));
  visited = Array.from({length: ROWS}, () => Array(COLS).fill(false));

  function carve(r, c) {
    visited[r][c] = true;
    maze[r][c] = FLOOR;

    let directions = [[0,1],[0,-1],[1,0],[-1,0]];
    // shuffle with seeded random
    for (let i = directions.length - 1; i > 0; i--) {
      let j = sRandRange(0, i);
      [directions[i], directions[j]] = [directions[j], directions[i]];
    }

    for (let [dr, dc] of directions) {
      let nr = r + dr*2;
      let nc = c + dc*2;
      if (inBounds(nr, nc) && !visited[nr][nc]) {
        maze[r + dr][c + dc] = FLOOR;
        carve(nr, nc);
      }
    }
  }

  carve(1,1);

  // Convert some walls to CRACK_WALL
  for (let r = 1; r < ROWS-1; r++) {
    for (let c = 1; c < COLS-1; c++) {
      if (maze[r][c] === WALL && seededRandom() < 0.05) {
        maze[r][c] = CRACK_WALL;
      }
    }
  }
}

function placeFeatures() {
  startPos = { row: 1, col: 1 };
  maze[startPos.row][startPos.col] = FLOOR;

  const restrictedArea = (r, c) => (r >= 1 && r <= 5 && c >= 1 && c <= 5);

  // Trap floors
  for (let i = 0; i < 5; i++) {
    let r, c;
    do {
      r = sRandRange(1, ROWS-2);
      c = sRandRange(1, COLS-2);
    } while (maze[r][c] !== FLOOR || restrictedArea(r, c));
    maze[r][c] = TRAP_FLOOR;
  }

  // Time items
  for (let i = 0; i < 4; i++) {
    let r, c;
    do {
      r = sRandRange(1, ROWS-2);
      c = sRandRange(1, COLS-2);
    } while (maze[r][c] !== FLOOR || restrictedArea(r, c));
    maze[r][c] = TIME_ITEM;
  }

  // Key
  let keyPlaced = false;
  while (!keyPlaced) {
    let r = sRandRange(1, ROWS-2);
    let c = sRandRange(1, COLS-2);
    if (maze[r][c] === FLOOR && !restrictedArea(r, c)) {
      maze[r][c] = KEY_ITEM;
      keyPlaced = true;
    }
  }

  // Letters S, E, A, N
  const letters = [LETTER_S, LETTER_E, LETTER_A, LETTER_N];
  for (let letter of letters) {
    let placed = false;
    while (!placed) {
      let r = sRandRange(1, ROWS-2);
      let c = sRandRange(1, COLS-2);
      if (maze[r][c] === FLOOR && !restrictedArea(r, c)) {
        maze[r][c] = letter;
        placed = true;
      }
    }
  }
}

// ------------------------------------------------------
// MOVEMENT & LETTER COLLECTION
// ------------------------------------------------------
function setupInput() {
  window.addEventListener("keydown", (e) => {
    if (!gameRunning) return;
    switch (e.code) {
      case "ArrowUp":
      case "KeyW":
        tryMovePlayer(-1, 0);
        break;
      case "ArrowDown":
      case "KeyS":
        tryMovePlayer(1, 0);
        break;
      case "ArrowLeft":
      case "KeyA":
        tryMovePlayer(0, -1);
        break;
      case "ArrowRight":
      case "KeyD":
        tryMovePlayer(0, 1);
        break;
    }
  });
}

function tryMovePlayer(dr, dc) {
  let newR = player.row + dr;
  let newC = player.col + dc;
  if (!inBounds(newR, newC)) return;
  if (!isPassableForPlayer(newR, newC)) return;

  player.row = newR;
  player.col = newC;

  let tile = maze[newR][newC];
  switch (tile) {
    case KEY_ITEM:
      maze[newR][newC] = FLOOR;
      break;
    case TIME_ITEM:
      timeElapsed -= 5;
      if (timeElapsed < 0) timeElapsed = 0;
      maze[newR][newC] = FLOOR;
      break;
    case TRAP_FLOOR:
      showTrapPopup();
      player.row = startPos.row;
      player.col = startPos.col;
      maze[newR][newC] = FLOOR;
      break;
    case LETTER_S:
    case LETTER_E:
    case LETTER_A:
    case LETTER_N:
      collectLetter(tile);
      // Turn tile to floor so we don’t need to step twice
      maze[newR][newC] = FLOOR;
      if (player.collectedLetters.length === 4) {
        endGame();
      }
      break;
    default:
      // floor, crack, etc.
      break;
  }
}

function isPassableForPlayer(r, c) {
  if (!inBounds(r, c)) return false;
  const tile = maze[r][c];
  // Include letters so the player can step on them
  return [
    FLOOR,
    CRACK_WALL,
    TRAP_FLOOR,
    KEY_ITEM,
    TIME_ITEM,
    LETTER_S,
    LETTER_E,
    LETTER_A,
    LETTER_N
  ].includes(tile);
}

function collectLetter(letterType) {
  let letter = '';
  switch(letterType) {
    case LETTER_S: letter = 'S'; break;
    case LETTER_E: letter = 'E'; break;
    case LETTER_A: letter = 'A'; break;
    case LETTER_N: letter = 'N'; break;
  }
  if (!player.collectedLetters.includes(letter)) {
    player.collectedLetters.push(letter);
    // If 3rd letter => spawn enemy
    if (player.collectedLetters.length === 3 && !enemy.active) {
      spawnEnemy();
      showSeanSummonedPopup();
    }
  }
  updateLettersUI();
}

function updateLettersUI() {
  const letterBoxes = {
    'S': document.getElementById('letterBoxS'),
    'E': document.getElementById('letterBoxE'),
    'A': document.getElementById('letterBoxA'),
    'N': document.getElementById('letterBoxN')
  };
  ['S','E','A','N'].forEach(l => {
    if (player.collectedLetters.includes(l)) {
      letterBoxes[l].classList.add('active');
    } else {
      letterBoxes[l].classList.remove('active');
    }
  });
}

// ------------------------------------------------------
// ENEMY ("SEAN") BFS
// ------------------------------------------------------
function spawnEnemy() {
  enemy.active = true;
  let placed = false;
  while (!placed) {
    let r = sRandRange(1, ROWS-2);
    let c = sRandRange(1, COLS-2);
    if (isPassableForEnemy(r, c)) {
      enemy.row = r;
      enemy.col = c;
      placed = true;
    }
  }
}

function isPassableForEnemy(r, c) {
  if (!inBounds(r, c)) return false;
  const tile = maze[r][c];
  // No cracked walls for the enemy
  return [
    FLOOR,
    TRAP_FLOOR,
    KEY_ITEM,
    TIME_ITEM,
    LETTER_S,
    LETTER_E,
    LETTER_A,
    LETTER_N
  ].includes(tile);
}

function moveEnemyBFS() {
  if (!enemy.active) return;
  if (enemy.row === player.row && enemy.col === player.col) {
    youGotSeaned();
    return;
  }

  const start = { r: enemy.row, c: enemy.col };
  const goal  = { r: player.row, c: player.col };

  let queue = [];
  let visitedBFS = Array.from({length: ROWS}, () => Array(COLS).fill(false));
  let parent = Array.from({length: ROWS}, () => Array(COLS).fill(null));

  queue.push(start);
  visitedBFS[start.r][start.c] = true;
  let found = false;

  while (queue.length > 0) {
    let {r, c} = queue.shift();
    if (r === goal.r && c === goal.c) {
      found = true;
      break;
    }
    let neighbors = [
      {nr: r-1, nc: c},
      {nr: r+1, nc: c},
      {nr: r,   nc: c-1},
      {nr: r,   nc: c+1}
    ];
    for (let n of neighbors) {
      if (inBounds(n.nr, n.nc) && !visitedBFS[n.nr][n.nc]) {
        if (isPassableForEnemy(n.nr, n.nc) || (n.nr === goal.r && n.nc === goal.c)) {
          visitedBFS[n.nr][n.nc] = true;
          parent[n.nr][n.nc] = { r, c };
          queue.push({ r: n.nr, c: n.nc });
        }
      }
    }
  }

  if (!found) return;

  let path = [];
  let cur = { r: goal.r, c: goal.c };
  while (cur && !(cur.r === start.r && cur.c === start.c)) {
    path.push(cur);
    cur = parent[cur.r][cur.c];
  }
  path.reverse();
  if (path.length > 0) {
    let nextStep = path[0];
    if (nextStep.r === player.row && nextStep.c === player.col) {
      youGotSeaned();
      return;
    }
    enemy.row = nextStep.r;
    enemy.col = nextStep.c;
  }
}

// ------------------------------------------------------
// POPUPS & END GAME
// ------------------------------------------------------
function showTrapPopup() {
  const popup = document.getElementById("popup");
  popup.style.display = "block";
  popup.textContent = "You fell into a trap!";
  trapPopupTimer = TRAP_MESSAGE_DURATION;
}

function showSeanSummonedPopup() {
  const p = document.getElementById("seanSummonedPopup");
  p.style.display = "block";
  seanSummonedTimer = SEAN_SUMMONED_DURATION;
}

function youGotSeaned() {
  gameRunning = false;
  showEndGamePopup(false);
}

function endGame() {
  gameRunning = false;
  showEndGamePopup(true);
}

function showEndGamePopup(isWin) {
  hideElement("popup");
  hideElement("seanSummonedPopup");

  const endGameDiv = document.getElementById("endGamePopup");
  const endGameText = document.getElementById("endGameText");
  endGameDiv.style.display = "block";

  if (isWin) {
    let finalTime = timeElapsed.toFixed(2);
    endGameText.textContent =
      `Congrats! You collected S, E, A, N in ${finalTime} seconds.`;
  } else {
    endGameText.textContent = "You got Seaned! Try again tomorrow.";
  }
}
  
// ------------------------------------------------------
// SHARING (with "Copied to clipboard!" feedback)
// ------------------------------------------------------
function copyResultsToClipboard() {
  const endGameText = document.getElementById("endGameText").textContent;
  let shareMessage = "";

  if (endGameText.includes("Congrats!")) {
    // Win
    shareMessage = `I completed Daily Seanle #${dayIndex} in ${timeElapsed.toFixed(2)} seconds! Can you do better: https://dailyseanle.com`;
  } else {
    // Lose
    shareMessage = `I got Seaned on Daily Seanle #${dayIndex}! Can you do better: https://dailyseanle.com`;
  }

  navigator.clipboard.writeText(shareMessage)
    .then(() => {
      console.log("Results copied to clipboard!");
      const feedback = document.getElementById("shareFeedback");
      feedback.style.display = "block";
      feedback.textContent = "Copied to clipboard!";
      setTimeout(() => {
        feedback.style.display = "none";
      }, 3000);
    })
    .catch(err => {
      console.error("Failed to copy: ", err);
    });
}

// ------------------------------------------------------
// HELPER
// ------------------------------------------------------
function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}
function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}
function inBounds(r, c) {
  return (r >= 0 && r < ROWS && c >= 0 && c < COLS);
}
