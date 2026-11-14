let current = "";
let pinLength = 4;
let maxAttempts = 8;
let gameOver = false;

window.addEventListener("DOMContentLoaded", function() {
    const screenEl = document.getElementById("screen");
    pinLength = parseInt(screenEl.dataset.length, 10) || 4;
    updateScreen();
});

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
        current += num;
        updateScreen();
    }
}

function clearScreen() {
    if (gameOver) return;
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
    clearScreen();

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
        entry.classList.add("win");
        statusText.innerText = "UNLOCKED in " + data.attempts + "!";
        entry.appendChild(statusText);
        entry.appendChild(buildResetButton("New PIN"));
    } else if (data.lost) {
        gameOver = true;
        setKeypadDisabled(true);
        const screen = document.getElementById("screen");
        screen.classList.add("locked");
        screen.innerText = "PIN: " + data.secret;
        entry.classList.add("lose");
        statusText.innerText = "LOCKED OUT!";
        entry.appendChild(statusText);
        entry.appendChild(buildResetButton("Try Again"));
    } else {
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
    if (gameOver) return;
    if (e.key >= "0" && e.key <= "9") press(e.key);
    if (e.key === "Backspace") {
        current = current.slice(0, -1);
        updateScreen();
    }
    if (e.key === "Escape") clearScreen();
    if (e.key === "Enter") submitGuess();
});
