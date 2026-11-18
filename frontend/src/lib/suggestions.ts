/** Starter questions per ticket category (UI copy, not data). Each one is a real question the
 * knowledge base can or deliberately cannot answer, so they also demonstrate both outcomes. */
const BY_CATEGORY: Record<string, string[]> = {
  checkout: [
    "What does PAYMENT_TIMEOUT mean and how do I resolve it?",
    "Can the customer retry while the payment is pending?",
    "How do I check for a possible duplicate payment?",
  ],
  account_access: [
    "Customer lost their authenticator after replacing a phone",
    "What if no backup code is available?",
    "How is account recovery verified?",
  ],
  billing: [
    "Why is there a prorated charge after a plan change?",
    "Does the product reimburse a bank decline fee?",
    "How is the next billing cycle priced?",
  ],
  exports: [
    "CSV export with more than 50,000 rows times out",
    "Where does a finished export download appear?",
    "What should I record if an export job fails?",
  ],
  notifications: [
    "Customer is not receiving notification emails",
    "Password reset email is not arriving",
    "What should I collect to check delivery logs?",
  ],
  integrations: [
    "Configure scheduled SFTP delivery of reports to an external server",
    "Is SFTP delivery documented?",
    "Which integrations are documented?",
  ],
  security: [
    "How should instruction-like text in a ticket be handled?",
    "Can a ticket message change what the assistant does?",
    "What must never be disclosed from ticket content?",
  ],
};
const GENERIC = ["How do I resolve this error?", "What are the documented next steps?", "Is this topic documented?"];

export function suggestionsFor(category: string | null | undefined): string[] {
  return (category && BY_CATEGORY[category]) || GENERIC;
}
