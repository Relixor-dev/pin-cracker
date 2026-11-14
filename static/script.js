let current = "";
let pinLength = 4;
let maxAttempts = 8;
let selectedDifficulty = "normal";
let selectedMaxAttempts = 8;
let selectedTimerSeconds = 0;

let mutNoRepeat = false;
let mutTimeDrain = false;

let gameMode = "standard";
let heistStage = 1;
let customPin = "";
let customNote = "";
let customClues = 2;
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
let totalXP = parseInt(localStorage.getItem("pinCrackerXP") || "0", 10);

const RANKS = [
    { minXP: 0, title: "SCRIPT KIDDIE" },
    { minXP: 150, title: "CIPHER SCOUT" },
    { minXP: 400, title: "GRID INFILTRATOR" },
    { minXP: 850, title: "VAULT PHANTOM" },
    { minXP: 1500, title: "GHOST ROOT" }
];

let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

function playTone(freq, duration, type, volume) {
    if (!soundEnabled) return;
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(volume || 0.065, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.01);
        osc.onended = function() {
            osc.disconnect();
            gain.disconnect();
        };
    } catch (e) {
        // Ignore audio context block before first user click
    }
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

function getRankTitle(xp) {
    let currentTitle = RANKS.slice(0, 1).pop().title;
    RANKS.forEach(function(r) {
        if (xp >= r.minXP) currentTitle = r.title;
    });
    return currentTitle;
}

function triggerCalcEffect(className) {
    const card = document.getElementById("calculator-card");
    if (!card) return;
    card.classList.remove("shake-alarm", "pulse-win");
    void card.offsetWidth;
    card.classList.add(className);
}

window.addEventListener("DOMContentLoaded", function() {
    const screenEl = document.getElementById("screen");
    pinLength = parseInt(screenEl.dataset.length, 10) || 4;
    buildDigitMatrix();
    updateStatsDisplay();
    updateScreen();

    const params = new URLSearchParams(window.location.search);
    const sharedCode = params.get("v");
    if (sharedCode) {
        try {
            const decoded = JSON.parse(atob(sharedCode));
            if (decoded.pin && decoded.pin.length >= 3 && decoded.pin.length <= 5) {
                customPin = decoded.pin;
                customNote = decoded.note || "";
                customClues = (decoded.clues !== undefined) ? parseInt(decoded.clues, 10) : 2;
                startGame("custom");
            }
        } catch (err) {
            console.warn("Invalid custom vault link");
        }
    }
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

function toggleMutator(name, btnEl) {
    playTone(640, 0.05, "triangle", 0.06);
    if (name === "noRepeat") {
        mutNoRepeat = !mutNoRepeat;
        btnEl.classList.toggle("active", mutNoRepeat);
    } else if (name === "timeDrain") {
        mutTimeDrain = !mutTimeDrain;
        btnEl.classList.toggle("active", mutTimeDrain);
    }
}

function selectOption(groupName, val, btnEl) {
    playTone(580, 0.05, "sine", 0.06);
    const map = {
        difficulty: "difficulty-group",
        attempts: "attempts-group",
        timer: "timer-group",
        customClues: "custom-clues-group"
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
    } else if (groupName === "customClues") {
        customClues = parseInt(val, 10);
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
    triggerCalcEffect("shake-alarm");

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
    timeoutActions.appendChild(buildResetButton("RETRY", gameMode === "heist" ? 1 : null));
    timeoutActions.appendChild(buildMenuButton());
    entry.appendChild(timeoutActions);
    log.prepend(entry);
}
function updateStatsDisplay() {
    const rankTitle = getRankTitle(totalXP);
    const startRank = document.getElementById("start-rank");
    const hudRank = document.getElementById("hud-rank");
    const statXP = document.getElementById("stat-xp");
    const startStreak = document.getElementById("start-streak");
    const gameStreak = document.getElementById("game-streak");
    const statBest = document.getElementById("stat-best");
    const statCracked = document.getElementById("stat-cracked");
    const statMode = document.getElementById("stat-mode");
    const statFirewall = document.getElementById("stat-firewall");
    const hudTitle = document.getElementById("hud-mode-title");

    if (startRank) startRank.innerText = "RANK: " + rankTitle + " (" + totalXP + " XP)";
    if (hudRank) hudRank.innerText = rankTitle;
    if (statXP) statXP.innerText = totalXP + " XP";
    if (startStreak) startStreak.innerText = "STREAK: " + winStreak;
    if (gameStreak) gameStreak.innerText = "STREAK " + winStreak;
    if (statBest) statBest.innerText = String(bestStreak);
    if (statCracked) statCracked.innerText = String(totalCracked);

    const fwTags = [];
    if (mutNoRepeat && gameMode !== "daily" && gameMode !== "custom") fwTags.push("NO-REPEAT");
    if (mutTimeDrain && timerInterval !== null) fwTags.push("DRAIN");
    if (statFirewall) statFirewall.innerText = fwTags.length ? fwTags.join(" + ") : "STANDARD";

    const modeLabels = {
        daily: "DAILY VAULT",
        heist: "HEIST STAGE " + heistStage + "/3",
        progressive: "PROGRESSIVE (" + pinLength + "D)",
        custom: "FRIEND VAULT",
        standard: pinLength + "-DIGIT"
    };
    if (statMode) statMode.innerText = modeLabels[gameMode] || (pinLength + "-DIGIT");
    if (hudTitle) hudTitle.innerText = gameMode === "heist" ? ("HEIST_STAGE_" + heistStage) : (gameMode.toUpperCase() + "_VAULT");
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById("sound-btn");
    btn.innerText = soundEnabled ? "SFX: ON" : "SFX: OFF";
    if (soundEnabled) playTone(520, 0.08, "sine", 0.06);
}

function openRules() { document.getElementById("rules-modal").classList.remove("hidden"); }
function closeRules() { document.getElementById("rules-modal").classList.add("hidden"); }
function openCustomModal() { document.getElementById("custom-modal").classList.remove("hidden"); }
function closeCustomModal() { document.getElementById("custom-modal").classList.add("hidden"); }

function readCustomInputs() {
    const pin = document.getElementById("custom-pin-input").value.trim();
    const note = document.getElementById("custom-note-input").value.trim();
    if (!/^\d{3,5}$/.test(pin)) {
        alert("Enter a 3, 4, or 5 digit numeric PIN!");
        return null;
    }
    return { pin: pin, note: note, clues: customClues };
}

function copyCustomLink() {
    const payload = readCustomInputs();
    if (!payload) return;
    const encoded = btoa(JSON.stringify(payload));
    const url = window.location.origin + "/?v=" + encoded;
    navigator.clipboard.writeText(url);
    playTone(740, 0.1, "triangle", 0.07);
    alert("Challenge link copied to clipboard! Send it to a friend.");
}

async function launchCustomLocal() {
    const payload = readCustomInputs();
    if (!payload) return;
    customPin = payload.pin;
    customNote = payload.note;
    customClues = payload.clues;
    gameMode = "custom";
    closeCustomModal();
    await startGame("custom");
}

async function startGame(mode) {
    gameMode = mode || "standard";
    heistStage = 1;
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
    updateStatsDisplay();
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
    if (mutNoRepeat && gameMode !== "daily" && gameMode !== "custom" && current.includes(num)) {
        playTone(190, 0.09, "sawtooth", 0.05);
        triggerCalcEffect("shake-alarm");
        return;
    }
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

function buildResetButton(label, nextStage) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "reset-btn";
    btn.innerText = label;
    btn.onclick = function() {
        if (nextStage) {
            heistStage = nextStage;
        } else if (gameMode === "heist") {
            heistStage = 1;
        }
        resetGame();
    };
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
        const header = gameMode === "daily"
            ? "PIN CRACKER // Daily Vault (" + dailyDateStr + ")"
            : "PIN CRACKER [" + gameMode.toUpperCase() + "]";
        const score = won ? (attemptsUsed + "/" + (maxTries || "∞")) : "X/" + (maxTries || "∞");
        const rows = guessHistory.map(function(statuses) {
            return statuses.map(function(s) {
                if (s === "correct") return "🟩";
                if (s === "present") return "🟨";
                return "⬛";
            }).join("");
        }).join("\n");
        navigator.clipboard.writeText(header + " — " + score + "\n" + rows);
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
        if (data.error) {
            triggerCalcEffect("shake-alarm");
            return;
        }

        guessHistory.push(data.statuses);
        updateAttemptsDisplay(data.attempts, data.max_attempts);
        updateDigitMatrix(guess, data.statuses);

        if (!data.won && !data.lost && mutTimeDrain && timerInterval !== null && data.absent > 0) {
            timeRemaining = Math.max(1, timeRemaining - (data.absent * 20));
        }

        const hintsList = document.getElementById("hints-list");
        if (data.unlocked_hint) {
            const li = document.createElement("li");
            li.className = "decrypted-clue";
            li.innerText = "[DECRYPTED] " + data.unlocked_hint;
            hintsList.appendChild(li);
        }

        const log = document.getElementById("log");
        const entry = document.createElement("div");
        entry.className = "log-entry";
        entry.appendChild(buildTiles(guess, data.statuses));

        const statusText = document.createElement("span");

        if (data.won) {
            const isHeistAdvance = (gameMode === "heist" && heistStage < 3);
            gameOver = true;
            if (!isHeistAdvance) stopTimer();
            setKeypadDisabled(true);
            setLockStatus(isHeistAdvance ? "STAGE CLEARED" : "BREACHED", "status-unlocked");
            triggerCalcEffect("pulse-win");

            let earnedXP = 50 + (pinLength * 15);
            if (mutNoRepeat) earnedXP += 25;
            if (mutTimeDrain && selectedTimerSeconds > 0) earnedXP += 35;
            if (gameMode === "heist" && heistStage === 3) earnedXP += 120;

            if (!isHeistAdvance) {
                winStreak += 1;
                totalCracked += 1;
                totalXP += earnedXP;
                if (winStreak > bestStreak) bestStreak = winStreak;
                localStorage.setItem("pinCrackerStreak", String(winStreak));
                localStorage.setItem("pinCrackerBest", String(bestStreak));
                localStorage.setItem("pinCrackerTotal", String(totalCracked));
                localStorage.setItem("pinCrackerXP", String(totalXP));
            }
            updateStatsDisplay();
            playWinSound();

            entry.classList.add("win");
            statusText.innerText = isHeistAdvance
                ? ("STAGE " + heistStage + " BYPASSED!")
                : ("GRANTED +" + earnedXP + " XP");
            entry.appendChild(statusText);

            const winActions = document.createElement("div");
            winActions.className = "action-group";
            if (isHeistAdvance) {
                winActions.appendChild(buildResetButton("STAGE " + (heistStage + 1) + " →", heistStage + 1));
            } else {
                winActions.appendChild(buildShareButton(data.attempts, data.max_attempts, true));
                winActions.appendChild(buildResetButton("NEXT VAULT", gameMode === "heist" ? 1 : null));
                winActions.appendChild(buildMenuButton());
            }
            entry.appendChild(winActions);
        } else if (data.lost) {
            gameOver = true;
            stopTimer();
            setKeypadDisabled(true);
            setLockStatus("ALARM TRIGGERED", "danger");
            triggerCalcEffect("shake-alarm");

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
            loseActions.appendChild(buildResetButton("RETRY", gameMode === "heist" ? 1 : null));
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
    const keepHeistTimer = (gameMode === "heist" && heistStage > 1 && timerInterval !== null);
    if (!keepHeistTimer) stopTimer();

    const res = await fetch("/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            mode: gameMode,
            stage: heistStage,
            difficulty: selectedDifficulty,
            max_attempts: selectedMaxAttempts,
            custom_pin: customPin,
            custom_note: customNote,
            custom_clues: customClues,
            no_repeat: mutNoRepeat
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

    const boxTitle = document.getElementById("hints-box-title");
    if (boxTitle) {
        boxTitle.innerText = data.stage_label
            ? ("// " + data.stage_label)
            : (data.hidden_count > 0 ? ("// TELEMETRY (" + data.hidden_count + " ENCRYPTED)") : "// INTERCEPTED TELEMETRY");
    }

    setKeypadDisabled(false);
    setLockStatus("LOCKED", "status-locked");
    resetDigitMatrix();
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

    if (gameMode === "daily" || gameMode === "custom") {
        startCountdown(0);
    } else if (gameMode === "heist") {
        if (!keepHeistTimer) startCountdown(60);
    } else {
        startCountdown(selectedTimerSeconds);
    }
    updateStatsDisplay();
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
