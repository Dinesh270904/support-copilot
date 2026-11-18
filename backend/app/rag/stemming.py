"""A deliberately small English suffix normaliser for the TF-IDF analyzer.

It conflates plural and simple verb inflections so "devices"/"device", "fees"/"fee" and
"exporting"/"exports"/"export" share a term. It is NOT a linguistic stemmer: the stems it
produces ("devic", "pend") are only index keys, and it never changes what is quoted.

Rules, in order (each only when enough of the word remains):
  1. ies -> y            policies -> policy
  2. sses -> ss; xes/zes/ches/shes -> drop "es"      passes -> pass, boxes -> box
  3. trailing s (not ss/us/is) -> drop               devices -> device, fees -> fee
  4. ing (>= 4 letters left) or ed (>= 3 left) -> drop     exporting -> export, timed -> tim
  5. trailing e -> drop                              device -> devic, timed/time -> tim

Step 5 makes "device" and "devices" (and "timed"/"time") meet; the cost is accepted collisions
such as "pending" -> "pend". The same function is used for chunks, sentences and queries because
it lives inside the vectorizer's analyzer (see app/rag/index.py).
"""

from __future__ import annotations


def stem(word: str) -> str:
    if len(word) <= 3:
        return word
    if word.endswith("ies") and len(word) > 4:
        word = word[:-3] + "y"
    elif word.endswith("sses"):
        word = word[:-2]
    elif word.endswith(("xes", "zes", "ches", "shes")):
        word = word[:-2]
    elif word.endswith("s") and not word.endswith(("ss", "us", "is")):
        word = word[:-1]
    for suffix, keep in (("ing", 4), ("ed", 3)):
        if word.endswith(suffix) and len(word) - len(suffix) >= keep:
            word = word[: -len(suffix)]
            break
    if word.endswith("e") and len(word) > 3:
        word = word[:-1]
    return word
