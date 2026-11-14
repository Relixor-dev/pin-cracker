let current = "";
let pinLength = 4;
let maxAttempts = 8;
let selectedDifficulty = "normal";
let selectedMaxAttempts = 8;
let selectedTimerSeconds = 0;
let isDailyMode = false;
let dailyDateStr = "";
let guessHistory = [];

let timerInterval = null;
let timeRemaining = 0;

let gameOver = false;
let isSubmitting = false;
let decryptUsed = false;
let soundEnabled = true;
let digitStates = {};

let winStreak = parseInt(localStorage.getItem("pinCrackerStreak") || "0", 10);
let bestStreak = parseInt(localStorage.getItem("pinCrackerBest") || "0", 10);
let totalCracked = parseInt(localStorage.getItem("pinCrackerTotal") || "0", 10);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type, volume) {
    if (!soundEnabled) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume || 0.07, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playHover() {
    if (gameOver) return;
    playTone(920, 0.022, "sine", 0.018);
}

function playWinSound() {
    playTone(523.25, 0.12, "triangle", 0.08);
    setTimeout(function() { playTone(659.25, 0.12, "triangle", 0.08); }, 110);
    setTimeout(function() { playTone(783.99, 0.25, "triangle", 0.08); }, 220);
}

function playLoseSound() {
    playTone(220, 0.2, "sawtooth", 0.07);
    setTimeout(function() { playTone(165, 0.35, "sawtooth", 0.07); }, 180);
}

window.addEventListener("DOMContentLoaded", function() {
    const screenEl = document.getElementById("screen");
    pinLength = parseInt(screenEl.dataset.length, 10) || 4;
    buildDigitMatrix();
    updateStatsDisplay();
    updateScreen();
});

function buildDigitMatrix() {
    const grid = document.getElementById("digit-matrix");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i <= 9; i++) {
        const cell = document.createElement("div");
        cell.className = "matrix-cell";
        cell.id = "matrix-digit-" + i;
        cell.innerText = String(i);
        grid.appendChild(cell);
    }
}

function resetDigitMatrix() {
    digitStates = {};
    for (let i = 0; i <= 9; i++) {
        const cell = document.getElementById("matrix-digit-" + i);
        if (cell) cell.className = "matrix-cell";
    }
}

function updateDigitMatrix(guess, statuses) {
    const priority = { absent: 1, present: 2, correct: 3 };
    guess.split("").forEach(function(digit, idx) {
        const status = statuses[idx];
        const prev = digitStates[digit];
        if (!prev || priority[status] > priority[prev]) {
            digitStates[digit] = status;
            const cell = document.getElementById("matrix-digit-" + digit);
            if (cell) cell.className = "matrix-cell " + status;
        }
    });
}
function selectOption(groupName, val, btnEl) {
    playTone(580, 0.05, "sine", 0.06);
    const map = {
        difficulty: "difficulty-group",
        attempts: "attempts-group",
        timer: "timer-group"
    };
    const containerId = map[groupName];
    document.querySelectorAll("#" + containerId + " .seg-btn").forEach(function(b) {
        b.classList.remove("active");
    });
    btnEl.classList.add("active");

    if (groupName === "difficulty") {
        selectedDifficulty = val;
    } else if (groupName === "attempts") {
        selectedMaxAttempts = parseInt(val, 10);
    } else if (groupName === "timer") {
        selectedTimerSeconds = parseInt(val, 10);
    }
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function startCountdown(seconds) {
    stopTimer();
    const badge = document.getElementById("timer-badge");
    if (!seconds || seconds <= 0) {
        badge.classList.add("hidden");
        return;
    }

    timeRemaining = seconds * 10;
    badge.classList.remove("hidden", "urgent");
    badge.innerText = seconds.toFixed(1) + "s";

    timerInterval = setInterval(async function() {
        if (gameOver) {
            stopTimer();
            return;
        }
        timeRemaining -= 1;
        const secs = Math.max(0, timeRemaining / 10);
        badge.innerText = secs.toFixed(1) + "s";

        if (secs <= 5.0) {
            badge.classList.add("urgent");
            if (timeRemaining % 10 === 0 && timeRemaining > 0) {
                playTone(880, 0.04, "sine", 0.04);
            }
        }

        if (timeRemaining <= 0) {
            stopTimer();
            await handleTimeExpired();
        }
    }, 100);
}

async function handleTimeExpired() {
    if (gameOver) return;
    gameOver = true;
    setKeypadDisabled(true);
    setLockStatus("TIME EXPIRED", "danger");

    winStreak = 0;
    localStorage.setItem("pinCrackerStreak", "0");
    updateStatsDisplay();
    playLoseSound();

    const res = await fetch("/timeout", { method: "POST" });
    const data = await res.json();

    const screen = document.getElementById("screen");
    screen.classList.add("locked");
    screen.innerText = "CODE: " + data.secret;

    const log = document.getElementById("log");
    const entry = document.createElement("div");
    entry.className = "log-entry lose";
    const statusText = document.createElement("span");
    statusText.innerText = "TIME EXPIRED // LOCKED OUT";
    entry.appendChild(statusText);

    const timeoutActions = document.createElement("div");
    timeoutActions.className = "action-group";
    timeoutActions.appendChild(buildResetButton("RETRY"));
    timeoutActions.appendChild(buildMenuButton());
    entry.appendChild(timeoutActions);
    log.prepend(entry);
}

function updateStatsDisplay() {
    const startStreak = document.getElementById("start-streak");
    const gameStreak = document.getElementById("game-streak");
    const statBest = document.getElementById("stat-best");
    const statCracked = document.getElementById("stat-cracked");
    const statMode = document.getElementById("stat-mode");
    const hudTitle = document.getElementById("hud-mode-title");

    if (startStreak) startStreak.innerText = "STREAK: " + winStreak;
    if (gameStreak) gameStreak.innerText = "STREAK " + winStreak;
    if (statBest) statBest.innerText = String(bestStreak);
    if (statCracked) statCracked.innerText = String(totalCracked);
    if (statMode) statMode.innerText = isDailyMode ? "DAILY (4-DIGIT)" : (pinLength + "-DIGIT");
    if (hudTitle) hudTitle.innerText = isDailyMode ? "DAILY_VAULT" : "PIN_CRACKER";
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById("sound-btn");
    btn.innerText = soundEnabled ? "SFX: ON" : "SFX: OFF";
    if (soundEnabled) playTone(520, 0.08, "sine", 0.06);
}

function openRules() {
    document.getElementById("rules-modal").classList.remove("hidden");
}

function closeRules() {
    document.getElementById("rules-modal").classList.add("hidden");
}

async function startGame(daily) {
    isDailyMode = Boolean(daily);
    playTone(620, 0.1, "triangle", 0.07);
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    await resetGame();
}

function backToMenu() {
    playTone(330, 0.08, "sine", 0.06);
    stopTimer();
    gameOver = false;
    isSubmitting = false;
    current = "";
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
}
function updateScreen() {
    const screen = document.getElementById("screen");
    screen.classList.remove("locked");
    screen.innerText = current.padEnd(pinLength, "_");
}

function setLockStatus(text, stateClass) {
    const el = document.getElementById("lock-status");
    el.innerText = text;
    el.className = "tele-val " + stateClass;
}

function updateAttemptsDisplay(used, max) {
    const el = document.getElementById("attempts-display");
    const decryptBtn = document.getElementById("decrypt-btn");

    if (max === 0) {
        el.innerText = "∞ (USED: " + used + ")";
        el.classList.remove("danger");
        if (decryptBtn) decryptBtn.disabled = gameOver || decryptUsed;
    } else {
        const left = Math.max(0, max - used);
        el.innerText = left + " / " + max;
        el.classList.toggle("danger", left <= 2);
        if (decryptBtn) decryptBtn.disabled = gameOver || decryptUsed || left <= 1;
    }
}

function setKeypadDisabled(disabled) {
    document.querySelectorAll("#keypad button").forEach(function(btn) {
        btn.disabled = disabled;
    });
    const decryptBtn = document.getElementById("decrypt-btn");
    if (decryptBtn && disabled) decryptBtn.disabled = true;
}

function press(num) {
    if (gameOver || isSubmitting) return;
    if (current.length < pinLength) {
        playTone(480 + parseInt(num, 10) * 25, 0.06, "sine", 0.06);
        current += num;
        updateScreen();
    }
}

function clearScreen() {
    if (gameOver || isSubmitting) return;
    playTone(260, 0.08, "sine", 0.06);
    current = "";
    updateScreen();
}

function buildTiles(guess, statuses) {
    const container = document.createElement("div");
    container.className = "tiles";
    guess.split("").forEach(function(digit, idx) {
        const tile = document.createElement("span");
        tile.className = "tile " + statuses[idx];
        tile.innerText = digit;
        container.appendChild(tile);
    });
    return container;
}

function buildResetButton(label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reset-btn";
    btn.innerText = label;
    btn.onclick = resetGame;
    return btn;
}

function buildMenuButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-inline-btn";
    btn.innerText = "SETTINGS";
    btn.onclick = backToMenu;
    return btn;
}

function buildShareButton(attemptsUsed, maxTries, won) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "share-btn";
    btn.innerText = "SHARE";
    btn.onclick = function() {
        const header = isDailyMode
            ? "PIN CRACKER // Daily Vault (" + dailyDateStr + ")"
            : "PIN CRACKER (" + pinLength + "-Digit)";
        const score = won ? (attemptsUsed + "/" + (maxTries || "∞")) : "X/" + (maxTries || "∞");
        const rows = guessHistory.map(function(statuses) {
            return statuses.map(function(s) {
                if (s === "correct") return "🟩";
                if (s === "present") return "🟨";
                return "⬛";
            }).join("");
        }).join("\n");
        const text = header + " — " + score + "\n" + rows;
        navigator.clipboard.writeText(text);
        btn.innerText = "COPIED!";
        playTone(720, 0.08, "sine", 0.06);
        setTimeout(function() { btn.innerText = "SHARE"; }, 1800);
    };
    return btn;
}

async function buyClue() {
    if (gameOver || isSubmitting || decryptUsed) return;
    isSubmitting = true;
    try {
        const res = await fetch("/decrypt", { method: "POST" });
        const data = await res.json();
        if (data.error) {
            playTone(200, 0.12, "sawtooth", 0.05);
            return;
        }
        decryptUsed = true;
        const decryptBtn = document.getElementById("decrypt-btn");
        if (decryptBtn) {
            decryptBtn.disabled = true;
            decryptBtn.innerText = "DECRYPT USED (1/1)";
        }

        playTone(740, 0.12, "triangle", 0.07);
        updateAttemptsDisplay(data.attempts, data.max_attempts);

        const cell = document.getElementById("matrix-digit-" + data.digit);
        if (cell) cell.className = "matrix-cell correct";
        digitStates[data.digit] = "correct";

        const hintsList = document.getElementById("hints-list");
        const li = document.createElement("li");
        li.className = "decrypted-clue";
        li.innerText = data.clue;
        hintsList.appendChild(li);
    } finally {
        isSubmitting = false;
    }
}

async function submitGuess() {
    if (gameOver || isSubmitting || current.length !== pinLength) return;
    isSubmitting = true;
    const guess = current;
    current = "";
    updateScreen();

    try {
        const res = await fetch("/guess", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guess: guess })
        });
        const data = await res.json();
        if (data.error) return;

        guessHistory.push(data.statuses);
        updateAttemptsDisplay(data.attempts, data.max_attempts);
        updateDigitMatrix(guess, data.statuses);

        const log = document.getElementById("log");
        const entry = document.createElement("div");
        entry.className = "log-entry";
        entry.appendChild(buildTiles(guess, data.statuses));

        const statusText = document.createElement("span");

        if (data.won) {
            gameOver = true;
            stopTimer();
            setKeypadDisabled(true);
            setLockStatus("BREACHED", "status-unlocked");

            winStreak += 1;
            totalCracked += 1;
            if (winStreak > bestStreak) bestStreak = winStreak;
            localStorage.setItem("pinCrackerStreak", String(winStreak));
            localStorage.setItem("pinCrackerBest", String(bestStreak));
            localStorage.setItem("pinCrackerTotal", String(totalCracked));
            updateStatsDisplay();
            playWinSound();

            entry.classList.add("win");
            statusText.innerText = "ACCESS GRANTED (" + data.attempts + ")";
            entry.appendChild(statusText);

            const winActions = document.createElement("div");
            winActions.className = "action-group";
            winActions.appendChild(buildShareButton(data.attempts, data.max_attempts, true));
            winActions.appendChild(buildResetButton("NEXT VAULT"));
            winActions.appendChild(buildMenuButton());
            entry.appendChild(winActions);
        } else if (data.lost) {
            gameOver = true;
            stopTimer();
            setKeypadDisabled(true);
            setLockStatus("ALARM TRIGGERED", "danger");

            winStreak = 0;
            localStorage.setItem("pinCrackerStreak", "0");
            updateStatsDisplay();
            playLoseSound();

            const screen = document.getElementById("screen");
            screen.classList.add("locked");
            screen.innerText = "CODE: " + data.secret;
            entry.classList.add("lose");
            statusText.innerText = "LOCKED OUT";
            entry.appendChild(statusText);

            const loseActions = document.createElement("div");
            loseActions.className = "action-group";
            loseActions.appendChild(buildShareButton(data.attempts, data.max_attempts, false));
            loseActions.appendChild(buildResetButton("RETRY"));
            loseActions.appendChild(buildMenuButton());
            entry.appendChild(loseActions);
        } else {
            playTone(390, 0.08, "triangle", 0.06);
            statusText.innerText = data.exact + " VERIFIED // " + data.misplaced + " SHIFTED";
            entry.appendChild(statusText);
        }

        log.prepend(entry);
    } finally {
        isSubmitting = false;
    }
}

async function resetGame() {
    isSubmitting = false;
    decryptUsed = false;
    stopTimer();
    const res = await fetch("/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            daily: isDailyMode,
            difficulty: selectedDifficulty,
            max_attempts: selectedMaxAttempts
        })
    });
    const data = await res.json();

    pinLength = data.length;
    maxAttempts = data.max_attempts;
    dailyDateStr = data.daily_date || "";
    guessHistory = [];
    gameOver = false;
    current = "";

    const decryptBtn = document.getElementById("decrypt-btn");
    if (decryptBtn) {
        decryptBtn.disabled = false;
        decryptBtn.innerText = "EMERGENCY DECRYPT (-1 TRY)";
    }

    setKeypadDisabled(false);
    setLockStatus("LOCKED", "status-locked");
    resetDigitMatrix();
    updateStatsDisplay();
    updateScreen();
    updateAttemptsDisplay(0, maxAttempts);

    const hintsList = document.getElementById("hints-list");
    hintsList.innerHTML = "";
    data.hints.forEach(function(h) {
        const li = document.createElement("li");
        li.innerText = h;
        hintsList.appendChild(li);
    });
    document.getElementById("log").innerHTML = "";

        if (isDailyMode) {
        startCountdown(0);
    } else {
        startCountdown(selectedTimerSeconds);
    }

}

document.addEventListener("keydown", function(e) {
    if (document.getElementById("game-screen").classList.contains("hidden")) return;
    if (gameOver || isSubmitting) return;
    if (e.key >= "0" && e.key <= "9") press(e.key);
    if (e.key === "Backspace") {
        if (current.length > 0) {
            playTone(310, 0.05, "sine", 0.05);
            current = current.slice(0, -1);
            updateScreen();
        }
    }
    if (e.key === "Escape") clearScreen();
    if (e.key === "Enter") {
        e.preventDefault();
        submitGuess();
    }
});
