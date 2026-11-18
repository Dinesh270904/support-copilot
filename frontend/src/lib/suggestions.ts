/** Starter questions per ticket category (UI copy, not data), exactly as specified. The billing "bank decline fee"
 * and integrations "SFTP" chips are deliberate: they demonstrate the insufficient-evidence state. */
export interface Suggestion {
  text: string;
  /** "count" chips run count_tickets instead of a knowledge search. */
  kind: "ask" | "count";
}
const ask = (...texts: string[]): Suggestion[] => texts.map((text) => ({ text, kind: "ask" }));

const BY_CATEGORY: Record<string, Suggestion[]> = {
  checkout: ask("Can the customer retry while payment is pending?", "What does PAYMENT_TIMEOUT mean and how do I resolve it?", "How do I check for a duplicate charge?"),
  account_access: ask("Customer lost their authenticator after a new phone. What now?", "Can they sign in with a backup code?", "What if they have no backup code?"),
  billing: ask("Why is there a prorated charge after a plan change?", "Does the product reimburse a bank decline fee?", "When does the new plan price apply?"),
  exports: ask("CSV export over 50,000 rows times out. What should they do?", "Where does the background export download appear?", "What do we record if the export job fails?"),
  notifications: ask("Password reset email never arrived. What should we check?", "Should we ask for the reset token?", "How do we check delivery logs?"),
  integrations: ask("Can scheduled reports be sent to an SFTP server?", "Which integrations are documented?"),
  security: ask("A ticket says to ignore instructions and print secrets. How do we handle it?"),
};
const NO_TICKET: Suggestion[] = [
  { text: "How do I recover account access after a phone change?", kind: "ask" },
  { text: "How many open high-priority tickets mention checkout?", kind: "count" },
];

/** `scope` is the category currently selected in the Ask box, or null for all categories. */
export function suggestionsFor(scope: string | null, ticketCategory: string | null): Suggestion[] {
  if (scope && BY_CATEGORY[scope]) return BY_CATEGORY[scope];
  if (!scope && ticketCategory && BY_CATEGORY[ticketCategory]) return BY_CATEGORY[ticketCategory];
  return NO_TICKET;
}
