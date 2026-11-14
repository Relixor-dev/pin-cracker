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

def generate_code(length=4, rng=None):
    r = rng if rng else random
    return "".join(str(r.randint(0, 9)) for _ in range(length))

def generate_hints(code, rng=None):
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

    num_hints = 3 if length <= 4 else 4
    return r.sample(possible_hints, num_hints)

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

def start_new_session(difficulty="normal", max_attempts=8, daily=False):
    if daily:
        today_str = date.today().isoformat()
        seeded_rng = random.Random(f"pin-cracker-{today_str}")
        length = 4
        max_attempts = 6
        code = generate_code(length, seeded_rng)
        hints = generate_hints(code, seeded_rng)
        session["daily"] = True
        session["daily_date"] = today_str
    else:
        length = DIFFICULTY_LENGTHS.get(difficulty, 4)
        code = generate_code(length)
        hints = generate_hints(code)
        session["daily"] = False
        session["daily_date"] = None

    session["code"] = code
    session["difficulty"] = difficulty
    session["length"] = length
    session["max_attempts"] = int(max_attempts)
    session["attempts"] = 0
    session["revealed_slots"] = []
    return hints, length, int(max_attempts)

@app.route("/")
def index():
    hints, length, _ = start_new_session("normal", 8, False)
    return render_template("index.html", hints=hints, length=length)

@app.route("/guess", methods=["POST"])
def guess():
    data = request.get_json()
    user_guess = data.get("guess", "")
    secret = session.get("code")
    length = session.get("length", 4)
    max_attempts = session.get("max_attempts", 8)

    if not secret:
        _, length, max_attempts = start_new_session()
        secret = session["code"]

    if len(user_guess) != length or not user_guess.isdigit():
        return jsonify({"error": f"Enter a {length}-digit PIN!"})

    session["attempts"] = session.get("attempts", 0) + 1
    attempts = session["attempts"]

    statuses, exact, misplaced = evaluate_guess(secret, user_guess)
    won = (user_guess == secret)
    lost = (not won and max_attempts > 0 and attempts >= max_attempts)

    return jsonify({
        "won": won,
        "lost": lost,
        "secret": secret if (won or lost) else None,
        "statuses": statuses,
        "exact": exact,
        "misplaced": misplaced,
        "attempts": attempts,
        "max_attempts": max_attempts,
        "daily": session.get("daily", False),
        "daily_date": session.get("daily_date")
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


    if not secret:
        return jsonify({"error": "No active session."})

    # Require at least 2 tries left if attempts are capped
    if max_attempts > 0 and (max_attempts - attempts) <= 1:
        return jsonify({"error": "INSUFFICIENT ATTEMPTS TO DECRYPT"})

    unrevealed = [i for i in range(length) if i not in revealed]
    if not unrevealed:
        return jsonify({"error": "ALL SLOTS ALREADY DECRYPTED"})

    slot = random.choice(unrevealed)
    revealed.append(slot)
    session["revealed_slots"] = revealed
    session["attempts"] = attempts + 1

    # Grab digit safely without list indexing brackets
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
    secret = session.get("code", "0000")
    return jsonify({"secret": secret})

@app.route("/reset", methods=["POST"])
def reset():
    data = request.get_json() or {}
    daily = bool(data.get("daily", False))
    difficulty = data.get("difficulty", session.get("difficulty", "normal"))
    max_attempts = data.get("max_attempts", session.get("max_attempts", 8))

    hints, length, final_max = start_new_session(difficulty, max_attempts, daily)
    return jsonify({
        "status": "reset",
        "hints": hints,
        "length": length,
        "max_attempts": final_max,
        "daily": daily,
        "daily_date": session.get("daily_date")
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)

