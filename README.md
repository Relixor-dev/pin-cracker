# PIN Cracker

A Wordle-inspired logic and deduction puzzle game built with **Python (Flask)**, **HTML/CSS**, and **JavaScript**.

## How to Play
1. Choose your **Difficulty** (3, 4, or 5 digits) and **Attempt Limit** on the start screen.
2. Read the **Intercepted Clues** above the keypad (prime numbers, even/odd digits, sums, and comparisons).
3. Enter your guess using the on-screen keypad or your physical keyboard.
4. Use the color-coded feedback to deduce the secret PIN:
   - **Green:** Correct digit in the exact right position.
   - **Yellow:** Correct digit in the wrong position.
   - **Gray:** Digit is not in the PIN.

## Run Locally

```bash
git clone https://github.com
cd pin-cracker
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000` in your browser to play.
