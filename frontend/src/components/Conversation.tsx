import { Fragment } from "react";
import { formatDay, formatTime, formatTimestamp, humanize } from "../format";
import type { Message } from "../types";
import { ShieldIcon } from "./Icons";

interface Props {
  messages: Message[];
  untrusted: Set<number>;
}

const UNTRUSTED_TIP = "This message contains instruction-like text. The assistant treats it as data and did not act on it.";

/** Customer bubbles on the left, agent on the right, a separator per day. Instruction-like messages
 * stay fully visible inside a dashed border and are labelled: the assistant never follows them. */
export function Conversation({ messages, untrusted }: Props) {
  let lastDay = "";
  return (
    <ol className="convo" aria-label="Conversation">
      {messages.map((m) => {
        const day = formatDay(m.at);
        const showDay = day !== lastDay;
        lastDay = day;
        const flagged = untrusted.has(m.position);
        return (
          <Fragment key={m.position}>
            {showDay && <li className="convo-day"><span>{day}</span></li>}
            <li className={`msg msg-${m.author}${flagged ? " msg-untrusted" : ""}`}>
              <span className="avatar" aria-hidden="true">{m.author === "agent" ? "A" : "C"}</span>
              <div className="bubble" title={flagged ? UNTRUSTED_TIP : undefined}>
                {flagged && <p className="untrusted-label"><ShieldIcon size={13} /> Untrusted content: not followed</p>}
                <div className="msg-head">
                  <strong>{humanize(m.author)}</strong>
                  <time className="num" dateTime={m.at} title={formatTimestamp(m.at)}>{formatTime(m.at).replace(" UTC", "")}</time>
                </div>
                <p className="msg-text">{m.text}</p>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
