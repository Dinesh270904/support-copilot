"""Deterministic reply drafting. The draft is never sent; the agent edits and copies it.

Structure: greeting, acknowledgement (ticket title only — no untrusted message text),
next steps quoted from retrieved guidance when evidence exists, otherwise a holding
reply that promises nothing. Quoted guidance is internal wording, so the agent is told
to rephrase it before sending.

Two rules keep the customer text honest and safe:
- Steps come from the top-ranked article only. Sentences from other retrieved articles can
  describe a different situation (a duplicate-charge sentence in a timeout reply), so they
  are listed for the agent instead.
- Prohibitions ("do not ...", "never ...") are instructions to the agent, not to the customer.
  They are never dropped (they are often the most important sentence), but they live in
  "Notes for the agent", quoted verbatim with their source ID.
"""

from __future__ import annotations

from app.composer.knowledge import compose_knowledge_answer, is_guardrail
from app.composer.types import Composed, Section
from app.schemas import KnowledgeSearchResult, TicketDetail


def compose_draft(
    ticket: TicketDetail, knowledge: KnowledgeSearchResult, *, min_sentence_score: float, max_sentences: int
) -> tuple[Composed, str]:
    grounded = compose_knowledge_answer(knowledge, min_sentence_score=min_sentence_score, max_sentences=max_sentences)
    top_article = knowledge.results[0].article_id if knowledge.results else None
    steps = [q for q in grounded.evidence if not is_guardrail(q.text) and q.source_id.split("#")[0] == top_article]
    cautions = [q for q in grounded.evidence if is_guardrail(q.text)]
    elsewhere = [q for q in grounded.evidence if not is_guardrail(q.text) and q not in steps]
    step_ids = list(dict.fromkeys(q.source_id for q in steps))

    lines = ["Hello,", "", f"Thank you for contacting us about “{ticket.title}”."]
    agent_notes: list[str] = []
    if grounded.answer_state == "answered" and steps:
        lines += ["", "Here is what our documented process says applies to this situation:"]
        lines += [f"{i}. {q.text}" for i, q in enumerate(steps, start=1)]
        lines += ["", "We will follow up as soon as we have confirmed the next step for your account."]
        agent_notes.append(
            "Steps are quoted verbatim from internal articles " + ", ".join(step_ids) + "; rephrase internal "
            "wording (e.g. 'the customer') before sending."
        )
    elif grounded.answer_state == "answered":
        lines += [
            "",
            "We are checking the details of your request and will follow up with confirmed next steps.",
        ]
        agent_notes.append("The retrieved guidance contains only cautions for the agent (below), no customer steps.")
    else:
        lines += [
            "",
            "We are reviewing your request with the relevant team so that we can give you accurate information. "
            "We will follow up with confirmed next steps rather than guess.",
        ]
        agent_notes.append("No documented guidance supports specific next steps; the draft is a holding reply.")
    for q in cautions:
        agent_notes.append(f"Agent-facing guidance, not in the draft: “{q.text}” [{q.source_id}]")
    for q in elsewhere:
        agent_notes.append(f"From a different article, not used in the draft: “{q.text}” [{q.source_id}]")
    lines += ["", "Best regards,", "[Agent name]", "Support Team"]
    draft = "\n".join(lines)

    composed = Composed(
        answer_state=grounded.answer_state,
        answer=(
            "Draft prepared for review. It has NOT been sent."
            + ("" if grounded.answer_state == "answered" else " Evidence was insufficient for specific next steps.")
        ),
        citations=grounded.citations,
        sections=[Section(title="Notes for the agent", items=agent_notes + grounded.limitations)],
        limitations=["Drafts are template-based and must be reviewed and edited by an agent before use."],
        warnings=grounded.warnings,
    )
    return composed, draft
