/******************************************
 * main.js
 ******************************************/

// ------------------------------------------------------
// CONFIG & CONSTANTS
// ------------------------------------------------------
// Maze properties
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

// Fallback colors
const TILE_COLORS = {
  [WALL]:       "#444",
  [FLOOR]:      "#ccc",
  [CRACK_WALL]: "#666",
  [TRAP_FLOOR]: "#880000",
  [KEY_ITEM]:   "gold",
  [TIME_ITEM]:  "cyan"
};

// Mobile controls
const JOYSTICK_THRESHOLD = 30;

// Player & enemy
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
// LOADING ASSETS
// ------------------------------------------------------
let assets = {
    letterImages: {
        [LETTER_S]: null,
        [LETTER_E]: null,
        [LETTER_A]: null,
        [LETTER_N]: null
    },
    timeItem: null,
    trap: null
};

function loadAssets(onComplete) {
    const assetsToLoad = [
        { key: `letterImages.${LETTER_S}`, src: "assets/letter_s.png" },
        { key: `letterImages.${LETTER_E}`, src: "assets/letter_e.png" },
        { key: `letterImages.${LETTER_A}`, src: "assets/letter_a.png" },
        { key: `letterImages.${LETTER_N}`, src: "assets/letter_n.png" },
        { key: "timeItem", src: "assets/time_item.png" },
        { key: "trap", src: "assets/trap.png" }
    ];

    let loadedCount = 0;
    let total = assetsToLoad.length;

    assetsToLoad.forEach(item => {
        let img = new Image();
        img.onload = () => {
            loadedCount++;
            if (loadedCount === total) {
                onComplete();
            }
        };
        img.src = item.src;

        // Dynamically set the nested property
        const keys = item.key.split(".");
        let target = assets;
        while (keys.length > 1) {
            const key = keys.shift();
            if (!(key in target)) target[key] = {};
            target = target[key];
        }
        target[keys[0]] = img;
    });
}

// ------------------------------------------------------
// DAILY LOGIC
// ------------------------------------------------------
const REFERENCE_DATE = new Date(2025, 0, 5); // Jan 5, 2025
const now = new Date();
let dayIndex = Math.floor((now - REFERENCE_DATE) / (1000 * 60 * 60 * 24)) + 1;

// Our puzzle seed = dayIndex
let puzzleSeed = dayIndex;
let rngState = puzzleSeed;

function seededRandom() {
  rngState = (1103515245 * rngState + 12345) & 0x7fffffff;
  return (rngState / 0x80000000);
}
function sRandRange(min, max) {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

// ------------------------------------------------------
// PLAY ONCE PER DAY
// ------------------------------------------------------
function getFormattedDate() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hasPlayedToday() {
  const lastPlayed = localStorage.getItem('lastPlayedDate');
  return lastPlayed === getFormattedDate();
}

function setPlayedFlag(isWin, gameTime) {
  localStorage.setItem('lastPlayedDate', getFormattedDate());
  localStorage.setItem('gameResult', isWin ? 'win' : 'lose');
  localStorage.setItem('gameTime', gameTime.toFixed(2));
}

// Reset "has played today" flag
function resetGameFlag() {
    localStorage.removeItem("lastPlayedDate");
    localStorage.removeItem("gameResult");
    localStorage.removeItem("gameTime");
    location.reload(); // Reload the page to reset the game state
}

function handlePlayOncePerDay() {
  // Set heading
  const heading = document.getElementById("dailySeanleHeading");
  if (heading) {
    heading.textContent = `Daily Seanle #${dayIndex}`;
  }

  if (hasPlayedToday()) {
    // Already played => stop game, show endGamePopup
    gameRunning = false;

    // Retrieve result from localStorage
    const gameResult = localStorage.getItem('gameResult');
    const gameTime   = localStorage.getItem('gameTime');

    const endGameDiv  = document.getElementById("endGamePopup");
    const endGameText = document.getElementById("endGameText");
    if (endGameDiv && endGameText) {
      endGameDiv.style.display = "block";
      if (gameResult === 'win') {
        endGameText.textContent = `Congrats! You collected S, E, A, N in ${gameTime} seconds.`;
      } else if (gameResult === 'lose') {
        endGameText.textContent = "You got Seaned! Try again tomorrow.";
      } else {
        endGameText.textContent = "You have already played today. Come back tomorrow!";
      }
    }
  } else {
    // Not played yet => show rulesPopup
    showElement("rulesPopup");
  }

  // Listen for gameCompleted event
  document.addEventListener('gameCompleted', (e) => {
    const isWin = e.detail.isWin;
    const time  = e.detail.gameTime;

    setPlayedFlag(isWin, time);
    // Don't hide the maze => just set gameRunning=false so user can't move
    gameRunning = false;

    const endGameDiv  = document.getElementById("endGamePopup");
    const endGameText = document.getElementById("endGameText");
    if (endGameDiv && endGameText) {
      endGameDiv.style.display = "block";
      if (isWin) {
        endGameText.textContent = `Congrats! You collected S, E, A, N in ${time.toFixed(2)} seconds.`;
      } else {
        endGameText.textContent = "You got Seaned! Try again tomorrow.";
      }
    }
  });
}

// ------------------------------------------------------
// window.onload
// ------------------------------------------------------
window.onload = function () {
    loadAssets(() => {
        initGame();
        setupInput();
        setupInvisibleJoystick();
        handlePlayOncePerDay();
        setInterval(() => {
          if (gameRunning && enemy.active) {
            moveEnemyBFS();
          }
        }, ENEMY_MOVE_INTERVAL);

    // Initialize Share Button
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
      shareBtn.addEventListener("click", copyResultsToClipboard);
    }

    // Start button
    const startGameBtn = document.getElementById("startGameBtn");
    startGameBtn.addEventListener("click", startGame);
    
    // Dev buttons
    setupResetGameButton(); // Initialize the Reset Game button
    setupEndGameButton(); // Initialize the End Game button
    setupActivateEnemyButton(); // Initialize the Activate Enemy button

  });
};

// ------------------------------------------------------
// INIT GAME
// ------------------------------------------------------
// Adjust canvas size dynamically
function initGame() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    // Adjust canvas size for mobile
    if (window.innerWidth < 768) { // Mobile screen size
      canvas.width = window.innerWidth - 20; // Leave some margin
      canvas.height = window.innerWidth - 20; // Keep it square
    } else {
      canvas.width = 640;
      canvas.height = 640;
    }

    rngState = puzzleSeed; // set seed

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
  const timeLabel = document.getElementById("timeLabel");
  if (timeLabel) {
    timeLabel.textContent = timeElapsed.toFixed(2);
  }

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
// GENERATE + PLACE FEATURES
// ------------------------------------------------------
function generateMaze() {
  maze = Array.from({length: ROWS}, () => Array(COLS).fill(WALL));
  visited = Array.from({length: ROWS}, () => Array(COLS).fill(false));

  function carve(r, c) {
    visited[r][c] = true;
    maze[r][c]    = FLOOR;

    let directions = [[0,1],[0,-1],[1,0],[-1,0]];
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
// DRAW
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

  // Draw player
  ctx.fillStyle = PLAYER_COLOR;
  ctx.fillRect(
    player.col*TILE_SIZE + 8,
    player.row*TILE_SIZE + 8,
    TILE_SIZE - 16,
    TILE_SIZE - 16
  );

  // Draw enemy
  if (enemy.active) {
    ctx.fillStyle = ENEMY_COLOR;
    ctx.fillRect(
      enemy.col*TILE_SIZE + 8,
      enemy.row*TILE_SIZE + 8,
      TILE_SIZE - 16,
      TILE_SIZE - 16
    );
  }
}

function drawTile(r, c, tileType) {
    if ([LETTER_S, LETTER_E, LETTER_A, LETTER_N].includes(tileType)) {
        let img = assets.letterImages[tileType];
        if (img) {
            ctx.drawImage(img, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            return;
        }
    }

    if (tileType === TIME_ITEM && assets.timeItem) {
        ctx.drawImage(assets.timeItem, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        return;
    }

    if (tileType === TRAP_FLOOR && assets.trap) {
        ctx.drawImage(assets.trap, c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        return;
    }

    // Fallback for tiles without images
    const color = TILE_COLORS[tileType] || "#000";
    ctx.fillStyle = color;
    ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}



// ------------------------------------------------------
// MOVEMENT & COLLECTION
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
        case TIME_ITEM:
            timeElapsed -= 5;
            if (timeElapsed < 0) timeElapsed = 0;
            maze[newR][newC] = FLOOR; // Remove the time item
            showTimePopup(); // Show the time reduction popup
            break;

        case TRAP_FLOOR:
            maze[newR][newC] = FLOOR; // Make trap disappear
            showTrapPopup(); // Show the trap popup
            player.row = startPos.row;
            player.col = startPos.col;
            break;

        case LETTER_S:
        case LETTER_E:
        case LETTER_A:
        case LETTER_N:
            collectLetter(tile);
            maze[newR][newC] = FLOOR;
            if (player.collectedLetters.length === 4) {
                endGame(true);
            }
            break;
        default:
            break;
    }
}


function isPassableForPlayer(r, c) {
  if (!inBounds(r, c)) return false;
  const tile = maze[r][c];
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
  let letter = "";
  switch(letterType) {
    case LETTER_S: letter = "S"; break;
    case LETTER_E: letter = "E"; break;
    case LETTER_A: letter = "A"; break;
    case LETTER_N: letter = "N"; break;
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
    S: document.getElementById("letterBoxS"),
    E: document.getElementById("letterBoxE"),
    A: document.getElementById("letterBoxA"),
    N: document.getElementById("letterBoxN")
  };
  ["S","E","A","N"].forEach(l => {
    if (player.collectedLetters.includes(l)) {
      letterBoxes[l].classList.add("active");
    } else {
      letterBoxes[l].classList.remove("active");
    }
  });
}

// ------------------------------------------------------
// Mobile Controls
// ------------------------------------------------------

function setupInvisibleJoystick() {
  let startX, startY, activeDirection;
  let isHolding = false;
  let holdInterval;

  document.body.addEventListener("touchstart", (e) => {
    // Prevent joystick controls from interfering with button presses
    if (e.target.tagName === "BUTTON") return;

    e.preventDefault(); // Prevent default touch behavior
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    activeDirection = null;
    isHolding = true;
    holdInterval = setInterval(() => {
      if (activeDirection && isHolding) {
        moveInDirection(activeDirection);
      }
    }, 100); // Adjust interval as needed
  });

  document.body.addEventListener("touchmove", (e) => {
    if (e.target.tagName === "BUTTON") return;

    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      if (dx > JOYSTICK_THRESHOLD) {
        activeDirection = "right"; // Swipe right
      } else if (dx < -JOYSTICK_THRESHOLD) {
        activeDirection = "left"; // Swipe left
      }
    } else {
      // Vertical swipe
      if (dy > JOYSTICK_THRESHOLD) {
        activeDirection = "down"; // Swipe down
      } else if (dy < -JOYSTICK_THRESHOLD) {
        activeDirection = "up"; // Swipe up
      }
    }
  });

  document.body.addEventListener("touchend", (e) => {
    if (e.target.tagName === "BUTTON") return;

    e.preventDefault();
    isHolding = false;
    clearInterval(holdInterval);
  });

  function moveInDirection(direction) {
    switch (direction) {
      case "right":
        tryMovePlayer(0, 1);
        break;
      case "left":
        tryMovePlayer(0, -1);
        break;
      case "down":
        tryMovePlayer(1, 0);
        break;
      case "up":
        tryMovePlayer(-1, 0);
        break;
    }
  }
}

// ------------------------------------------------------
// SEAN
// ------------------------------------------------------
function spawnEnemy() {
  enemy.active = true;
  let placed = false;
  while (!placed) {
    // Spawn enemy at starting location
    let r = 1;
    let c = 1;

    /* Spawn enemy at random location    
      let r = sRandRange(1, ROWS-2);
      let c = sRandRange(1, COLS-2);
    */

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
  // no cracked walls
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
  // if on player => lost
  if (enemy.row === player.row && enemy.col === player.col) {
    youGotSeaned();
    return;
  }

  const start = { r: enemy.row, c: enemy.col };
  const goal  = { r: player.row, c: player.col };

  let queue       = [];
  let visitedBFS  = Array.from({length: ROWS}, () => Array(COLS).fill(false));
  let parent      = Array.from({length: ROWS}, () => Array(COLS).fill(null));

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
        if (isPassableForEnemy(n.nr, n.nc) || (n.nr===goal.r && n.nc===goal.c)) {
          visitedBFS[n.nr][n.nc] = true;
          parent[n.nr][n.nc]     = { r, c };
          queue.push({ r: n.nr, c: n.nc });
        }
      }
    }
  }

  if (!found) return;

  let path = [];
  let cur = { r: goal.r, c: goal.c };
  while (cur && !(cur.r===start.r && cur.c===start.c)) {
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
    const popup = document.getElementById("trapPopup");
    if (popup) {
        popup.style.display = "block"; // Show the trap popup
        popup.textContent = "You fell into a trap!"; // Update the message

        setTimeout(() => {
            popup.style.display = "none"; // Hide the popup after duration
        }, TRAP_MESSAGE_DURATION);
    } else {
        console.error("Trap popup element not found!");
    }
}

function showTimePopup() {
    const popup = document.getElementById("timePopup");
    if (popup) {
        popup.style.display = "block"; // Show the time popup
        popup.textContent = "-5 Seconds!"; // Update the message

        setTimeout(() => {
            popup.style.display = "none"; // Hide the popup after duration
        }, TRAP_MESSAGE_DURATION);
    } else {
        console.error("Time popup element not found!");
    }
}

function showSeanSummonedPopup() {
  const p = document.getElementById("seanSummonedPopup");
  if (p) {
    p.style.display = "block";
    seanSummonedTimer = SEAN_SUMMONED_DURATION;
  }
}

function youGotSeaned() {
  endGame(false); 
}

function endGame(isWin) {
  gameRunning = false;
  showEndGamePopup(isWin);

  // Dispatch event so localStorage can be set
  const event = new CustomEvent('gameCompleted', {
    detail: {
      isWin: isWin,
      gameTime: timeElapsed
    }
  });
  document.dispatchEvent(event);
}

function showEndGamePopup(isWin) {
  hideElement("popup");
  hideElement("seanSummonedPopup");

  const endGameDiv = document.getElementById("endGamePopup");
  const endGameText = document.getElementById("endGameText");
  const submitScoreForm = document.getElementById("submitScoreForm");
  const leaderboardFeedback = document.getElementById("leaderboardFeedback");

  if (endGameDiv && endGameText) {
    endGameDiv.style.display = "block"; // Show the end game popup

    if (isWin) {
      endGameText.textContent = `Congrats! You collected S, E, A, N in ${timeElapsed.toFixed(2)} seconds.`;
      if (submitScoreForm) {
        submitScoreForm.style.display = "block"; // Show the form
      }
    } else {
      endGameText.textContent = "You got Seaned! Try again tomorrow.";
      if (submitScoreForm) {
        submitScoreForm.style.display = "none"; // Hide the form
      }
    }

    // Handle Score Submission
    const submitBtn = document.getElementById("submitScoreBtn");
    if (submitBtn) {
    submitBtn.onclick = async () => {
        console.log("Submit button clicked");
        const playerName = document.getElementById("playerNameInput").value.trim();
        console.log("Player Name:", playerName, "Time Elapsed:", timeElapsed);

        if (playerName) {
            await submitScore(playerName, timeElapsed);
            fetchLeaderboard();
        } else {
            alert("Please enter your name!");
        }
    };
}
  }
}


// ------------------------------------------------------
// LEADERBOARD
// ------------------------------------------------------

const API_URL = "https://i6calligwc.execute-api.us-east-1.amazonaws.com";

async function fetchLeaderboard() {
    try {
        console.log("Fetching leaderboard...");
        const response = await fetch(`${API_URL}/leaderboard`);
        const { leaderboard, userCount } = await response.json();
        console.log("Leaderboard Data:", leaderboard, "User Count:", userCount);
        displayLeaderboard(leaderboard, userCount);
    } catch (err) {
        console.error("Error fetching leaderboard:", err);
    }
}

async function submitScore(username, score) {
    try {
        console.log("Submitting score:", { username, score });
        const response = await fetch(`${API_URL}/submit-score`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, score })
        });

        if (!response.ok) {
            throw new Error(`Failed to submit score: ${response.statusText}`);
        }

        console.log("Score submitted successfully!");
    } catch (err) {
        console.error("Error submitting score:", err);
    }
}


function displayLeaderboard(leaderboard, userCount) {
    const list = document.getElementById("leaderboardList");
    list.innerHTML = ""; // Clear previous entries

    leaderboard.forEach((entry) => {
        const div = document.createElement("div");
        div.innerHTML = `<span>${entry.username}</span><span>${entry.score.toFixed(2)}s</span>`;
        list.appendChild(div);
    });

    const userCountLabel = document.createElement("p");
    userCountLabel.textContent = `Total Players Today: ${userCount}`;
    list.appendChild(userCountLabel);
}

// ------------------------------------------------------
// SHARING
// ------------------------------------------------------
function copyResultsToClipboard() {
    const endGameText = document.getElementById("endGameText");
    const feedback = document.getElementById("leaderboardFeedback");
    let shareMessage = "";

   if (endGameText) {
    if (endGameText.textContent.includes("Congrats!")) {
        shareMessage = `I completed Daily Seanle #${dayIndex} in ${timeElapsed.toFixed(2)} seconds! Can you do better: https://dailyseanle.com`;
        localStorage.setItem("clipboardScore", shareMessage); // Store score locally
    } else if (endGameText.textContent.includes("You got Seaned")) {
        shareMessage = `I got Seaned on Daily Seanle #${dayIndex}! Can you do better: https://dailyseanle.com`;
        localStorage.setItem("clipboardScore", shareMessage); // Store score locally
    }
}


   navigator.clipboard.writeText(shareMessage)
        .then(() => {
            feedback.style.display = "block";
            feedback.textContent = "Copied to clipboard!";
            setTimeout(() => (feedback.style.display = "none"), 3000);
        })
        .catch(console.error);
}

function loadScoreFromClipboard() {
    const storedScore = localStorage.getItem("clipboardScore");
    if (storedScore) {
        navigator.clipboard.writeText(storedScore).catch(console.error);
    }
}

// ------------------------------------------------------
// HELPERS
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

// Handle "Activate Enemy" Button
function setupActivateEnemyButton() {
  const activateEnemyBtn = document.getElementById("activateEnemyBtn");
  activateEnemyBtn.addEventListener("click", () => {
      spawnEnemy(); // Activate the enemy
  });
}

// Handle "End Game" Button
function setupEndGameButton() {
  const endGameBtn = document.getElementById("endGameBtn");
  endGameBtn.addEventListener("click", () => {
    // Simulate a game completion with a win
    endGame(true); // Pass `false` for testing the lose scenario
  });
}

// Handle "Reset Game" Button
function setupResetGameButton() {
  const resetGameBtn = document.getElementById("resetGameBtn");
  resetGameBtn.addEventListener("click", () => {
    resetGameFlag();
  });
}
