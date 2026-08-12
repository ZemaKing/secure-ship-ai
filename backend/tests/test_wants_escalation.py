"""wants_escalation() is a plain regex gate, not model-judged (see services/escalation.py).
Covers the real miss found live: "I want to talk to human" (article dropped) didn't
match the old exact-substring "talk to a human" phrase and fell through to a normal
Ollama turn instead of triggering the scripted escalation.
"""
from services.escalation import wants_escalation


def test_matches_with_article():
    assert wants_escalation("I want to talk to a human")


def test_matches_without_article():
    assert wants_escalation("I want to talk to human")


def test_matches_case_insensitively():
    assert wants_escalation("TALK TO A HUMAN please")


def test_matches_speak_to_person_variants():
    assert wants_escalation("can I speak to a person")
    assert wants_escalation("can I speak to person")


def test_does_not_match_unrelated_message():
    assert not wants_escalation("Where is my package TS123456789?")
