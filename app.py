import random
from datetime import date
from flask import Flask, render_template, request, jsonify, session

app = Flask(__name__)
app.secret_key = "pin-cracker-secret-key"

DIFFICULTY_LENGTHS = {
    "easy": 3,
    "normal": 4,
    "hard": 5
}

HEIST_STAGES = [
    {"stage": 1, "length": 3, "attempts": 5, "label": "STAGE 1/3 // OUTER GATE"},
    {"stage": 2, "length": 4, "attempts": 4, "label": "STAGE 2/3 // LASER GRID"},
    {"stage": 3, "length": 5, "attempts": 3, "label": "STAGE 3/3 // MAIN CORE"}
]

def generate_code(length=4, rng=None, unique_only=False):
    r = rng if rng else random
    if unique_only:
        digits = [str(i) for i in range(10)]
        return "".join(r.sample(digits, length))
    return "".join(str(r.randint(0, 9)) for _ in range(length))

def generate_hints(code, rng=None, total_count=None):
    r = rng if rng else random
    digits = [int(d) for d in code]
    length = len(digits)
    primes = {2, 3, 5, 7}
    possible_hints = []

    for i, d in enumerate(digits):
        pos = i + 1
        if d in primes:
            possible_hints.append(f"Digit #{pos} is a prime number.")
        else:
            possible_hints.append(f"Digit #{pos} is NOT a prime number.")

        if d % 2 == 0:
            possible_hints.append(f"Digit #{pos} is even.")
        else:
            possible_hints.append(f"Digit #{pos} is odd.")

        if d >= 5:
            possible_hints.append(f"Digit #{pos} is 5 or higher.")
        else:
            possible_hints.append(f"Digit #{pos} is less than 5.")

    temp = list(digits)
    first_digit = temp.pop(0)
    second_digit = temp.pop(0)
    third_digit = temp.pop(0)
    last_digit = int(code[-1])

    possible_hints.append(f"The sum of all {length} digits is {sum(digits)}.")
    possible_hints.append(f"Digit #1 + Digit #{length} equals {first_digit + last_digit}.")
    possible_hints.append(f"Digit #2 + Digit #3 equals {second_digit + third_digit}.")

    if first_digit > last_digit:
        possible_hints.append(f"Digit #1 is larger than Digit #{length}.")
    elif first_digit < last_digit:
        possible_hints.append(f"Digit #1 is smaller than Digit #{length}.")
    else:
        possible_hints.append(f"Digit #1 and Digit #{length} are the same.")

    if len(set(digits)) < length:
        possible_hints.append("At least one digit repeats in the PIN.")
    else:
        possible_hints.append("All digits in the PIN are unique.")

    count = total_count if total_count else (3 if length <= 4 else 4)
    return r.sample(possible_hints, min(count, len(possible_hints)))

def evaluate_guess(secret, guess):
    length = len(secret)
    statuses = ["absent"] * length
    secret_remaining = {}

    for s, g in zip(secret, guess):
        if s != g:
            secret_remaining[s] = secret_remaining.get(s, 0) + 1

    for i, (s, g) in enumerate(zip(secret, guess)):
        if s == g:
            statuses[i] = "correct"
        elif secret_remaining.get(g, 0) > 0:
            statuses[i] = "present"
            secret_remaining[g] -= 1

    exact = statuses.count("correct")
    misplaced = statuses.count("present")
    return statuses, exact, misplaced
def start_new_session(difficulty="normal", max_attempts=8, mode="standard", stage=1, custom_pin="", custom_note="", custom_clues=2, no_repeat=False):
    progressive = False
    stage_label = ""
    unique_flag = bool(no_repeat)

    if mode == "daily":
        today_str = date.today().isoformat()
        seeded_rng = random.Random(f"pin-cracker-{today_str}")
        length = 4
        max_attempts = 6
        unique_flag = False
        code = generate_code(length, seeded_rng, False)
        all_hints = generate_hints(code, seeded_rng)
        session["daily_date"] = today_str
    elif mode == "heist":
        idx = max(0, min(2, int(stage) - 1))
        cfg = HEIST_STAGES.copy().pop(idx)
        length = cfg["length"]
        max_attempts = cfg["attempts"]
        stage_label = cfg["label"]
        code = generate_code(length, None, unique_flag)
        all_hints = generate_hints(code)
        session["daily_date"] = None
    elif mode == "custom" and str(custom_pin).strip().isdigit() and 3 <= len(str(custom_pin).strip()) <= 5:
        code = str(custom_pin).strip()
        length = len(code)
        max_attempts = int(max_attempts) if int(max_attempts) > 0 else 6
        unique_flag = False
        clue_count = max(0, min(5, int(custom_clues)))
        all_hints = generate_hints(code, total_count=clue_count) if clue_count > 0 else []
        if custom_note.strip():
            all_hints.insert(0, f"AGENT NOTE: {custom_note.strip()[:60]}")
        if not all_hints:
            all_hints.append("NO TELEMETRY PROVIDED // DEDUCE BY KEYPAD.")
        session["daily_date"] = None
    else:
        length = DIFFICULTY_LENGTHS.get(difficulty, 4)
        code = generate_code(length, None, unique_flag)
        progressive = (mode == "progressive")
        total = 5 if progressive else (3 if length <= 4 else 4)
        all_hints = generate_hints(code, total_count=total)
        session["daily_date"] = None

    visible_hints = all_hints[:1] if progressive else all_hints
    hidden_hints = all_hints[1:] if progressive else []

    session["code"] = code
    session["mode"] = mode
    session["heist_stage"] = int(stage)
    session["difficulty"] = difficulty
    session["length"] = length
    session["max_attempts"] = int(max_attempts)
    session["attempts"] = 0
    session["revealed_slots"] = []
    session["hidden_hints"] = hidden_hints
    session["progressive"] = progressive
    session["no_repeat"] = unique_flag

    return {
        "hints": visible_hints,
        "hidden_count": len(hidden_hints),
        "length": length,
        "max_attempts": int(max_attempts),
        "mode": mode,
        "heist_stage": int(stage),
        "stage_label": stage_label,
        "daily_date": session.get("daily_date"),
        "no_repeat": unique_flag
    }

@app.route("/")
def index():
    info = start_new_session("normal", 8, "standard")
    return render_template("index.html", hints=info["hints"], length=info["length"])

@app.route("/guess", methods=["POST"])
def guess():
    data = request.get_json()
    user_guess = data.get("guess", "")
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)
    no_repeat = session.get("no_repeat", False)

    if not secret:
        info = start_new_session()
        secret = session["code"]
        length = info["length"]

    if len(user_guess) != length or not user_guess.isdigit():
        return jsonify({"error": f"Enter a {length}-digit PIN!"})

    if no_repeat and len(set(user_guess)) != length:
        return jsonify({"error": "FIREWALL: NO DUPLICATE DIGITS ALLOWED!"})

    session["attempts"] = session.get("attempts", 0) + 1
    attempts = session["attempts"]

    statuses, exact, misplaced = evaluate_guess(secret, user_guess)
    won = (user_guess == secret)
    lost = (not won and max_attempts > 0 and attempts >= max_attempts)

    unlocked_hint = None
    hidden = session.get("hidden_hints", [])
    if not won and not lost and hidden:
        unlocked_hint = hidden.pop(0)
        session["hidden_hints"] = hidden

    return jsonify({
        "won": won,
        "lost": lost,
        "secret": secret if (won or lost) else None,
        "statuses": statuses,
        "exact": exact,
        "misplaced": misplaced,
        "absent": statuses.count("absent"),
        "attempts": attempts,
        "max_attempts": max_attempts,
        "mode": session.get("mode", "standard"),
        "heist_stage": session.get("heist_stage", 1),
        "daily_date": session.get("daily_date"),
        "unlocked_hint": unlocked_hint,
        "hidden_count": len(hidden)
    })

@app.route("/decrypt", methods=["POST"])
def decrypt():
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)
    attempts = session.get("attempts", 0)
    revealed = session.get("revealed_slots", [])

    if not secret:
        return jsonify({"error": "No active session."})
    if len(revealed) >= 1:
        return jsonify({"error": "EMERGENCY DECRYPT ALREADY USED THIS ROUND"})
    if max_attempts > 0 and (max_attempts - attempts) <= 1:
        return jsonify({"error": "INSUFFICIENT ATTEMPTS TO DECRYPT"})

    slot = random.randint(0, length - 1)
    revealed.append(slot)
    session["revealed_slots"] = revealed
    session["attempts"] = attempts + 1

    temp_chars = list(secret)
    for _ in range(slot):
        temp_chars.pop(0)
    digit_val = temp_chars.pop(0)

    return jsonify({
        "clue": f"DECRYPTED: Digit #{slot + 1} is {digit_val}.",
        "slot": slot,
        "digit": digit_val,
        "attempts": session["attempts"],
        "max_attempts": max_attempts
    })

@app.route("/timeout", methods=["POST"])
def timeout():
    return jsonify({"secret": session.get("code", "0000")})

@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json() or {}
    info = start_new_session(
        difficulty=data.get("difficulty", "normal"),
        max_attempts=data.get("max_attempts", 8),
        mode=data.get("mode", "standard"),
        stage=data.get("stage", 1),
        custom_pin=data.get("custom_pin", ""),
        custom_note=data.get("custom_note", ""),
        custom_clues=data.get("custom_clues", 2),
        no_repeat=data.get("no_repeat", False)
    )
    info["status"] = "reset"
    return jsonify(info)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
