let current = "";
let pinLength = 4;
let maxAttempts = 8;
let gameOver = false;
let soundEnabled = true;
let winStreak = parseInt(localStorage.getItem("pinCrackerStreak") || "0", 10);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type) {
    if (!soundEnabled) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playWinSound() {
    playTone(523.25, 0.12, "triangle");
    setTimeout(function() { playTone(659.25, 0.12, "triangle"); }, 110);
    setTimeout(function() { playTone(783.99, 0.25, "triangle"); }, 220);
}

function playLoseSound() {
    playTone(220, 0.2, "sawtooth");
    setTimeout(function() { playTone(165, 0.35, "sawtooth"); }, 180);
}

window.addEventListener("DOMContentLoaded", function() {
    const screenEl = document.getElementById("screen");
    pinLength = parseInt(screenEl.dataset.length, 10) || 4;
    updateStreakDisplay();
    updateScreen();
});

function updateStreakDisplay() {
    const startStreak = document.getElementById("start-streak");
    const gameStreak = document.getElementById("game-streak");
    if (startStreak) startStreak.innerText = "Current Win Streak: " + winStreak;
    if (gameStreak) gameStreak.innerText = "Streak: " + winStreak;
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById("sound-btn");
    btn.innerText = soundEnabled ? "Sound: ON" : "Sound: OFF";
    if (soundEnabled) playTone(520, 0.08, "sine");
}

function openRules() {
    document.getElementById("rules-modal").classList.remove("hidden");
}

function closeRules() {
    document.getElementById("rules-modal").classList.add("hidden");
}

async function startGame() {
    playTone(440, 0.09, "sine");
    document.getElementById("start-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    await resetGame();
}

function backToMenu() {
    playTone(330, 0.08, "sine");
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("start-screen").classList.remove("hidden");
}

function updateScreen() {
    const screen = document.getElementById("screen");
    screen.classList.remove("locked");
    screen.innerText = current.padEnd(pinLength, "_");
}

function updateAttemptsDisplay(used, max) {
    const el = document.getElementById("attempts-display");
    if (max === 0) {
        el.innerText = "Unlimited (Used: " + used + ")";
        el.classList.remove("danger");
    } else {
        const left = Math.max(0, max - used);
        el.innerText = left + " / " + max;
        el.classList.toggle("danger", left <= 2);
    }
}

function setKeypadDisabled(disabled) {
    document.querySelectorAll("#keypad button").forEach(function(btn) {
        btn.disabled = disabled;
    });
}

function press(num) {
    if (gameOver) return;
    if (current.length < pinLength) {
        playTone(480 + parseInt(num, 10) * 25, 0.06, "sine");
        current += num;
        updateScreen();
    }
}

function clearScreen() {
    if (gameOver) return;
    playTone(260, 0.08, "sine");
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
    btn.className = "reset-btn";
    btn.innerText = label;
    btn.onclick = resetGame;
    return btn;
}

async function submitGuess() {
    if (gameOver || current.length !== pinLength) return;
    const guess = current;
    current = "";
    updateScreen();

    const res = await fetch("/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guess: guess })
    });
    const data = await res.json();
    if (data.error) return;

    updateAttemptsDisplay(data.attempts, data.max_attempts);

    const log = document.getElementById("log");
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.appendChild(buildTiles(guess, data.statuses));

    const statusText = document.createElement("span");

    if (data.won) {
        gameOver = true;
        setKeypadDisabled(true);
        winStreak += 1;
        localStorage.setItem("pinCrackerStreak", String(winStreak));
        updateStreakDisplay();
        playWinSound();

        entry.classList.add("win");
        statusText.innerText = "UNLOCKED in " + data.attempts + "!";
        entry.appendChild(statusText);
        entry.appendChild(buildResetButton("New PIN"));
    } else if (data.lost) {
        gameOver = true;
        setKeypadDisabled(true);
        winStreak = 0;
        localStorage.setItem("pinCrackerStreak", "0");
        updateStreakDisplay();
        playLoseSound();

        const screen = document.getElementById("screen");
        screen.classList.add("locked");
        screen.innerText = "PIN: " + data.secret;
        entry.classList.add("lose");
        statusText.innerText = "LOCKED OUT!";
        entry.appendChild(statusText);
        entry.appendChild(buildResetButton("Try Again"));
    } else {
        playTone(390, 0.08, "triangle");
        statusText.innerText = data.exact + " exact, " + data.misplaced + " misplaced";
        entry.appendChild(statusText);
    }

    log.prepend(entry);
}

async function resetGame() {
    const difficulty = document.getElementById("difficulty").value;
    const maxVal = parseInt(document.getElementById("max-attempts").value, 10);

    const res = await fetch("/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: difficulty, max_attempts: maxVal })
    });
    const data = await res.json();

    pinLength = data.length;
    maxAttempts = data.max_attempts;
    gameOver = false;
    current = "";

    setKeypadDisabled(false);
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
}

document.addEventListener("keydown", function(e) {
    if (document.getElementById("game-screen").classList.contains("hidden")) return;
    if (gameOver) return;
    if (e.key >= "0" && e.key <= "9") press(e.key);
    if (e.key === "Backspace") {
        current = current.slice(0, -1);
        updateScreen();
    }
    if (e.key === "Escape") clearScreen();
    if (e.key === "Enter") submitGuess();
});
