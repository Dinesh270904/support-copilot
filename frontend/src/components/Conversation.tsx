import { Fragment } from "react";
import { formatDay, formatTime, humanize } from "../format";
import type { Message } from "../types";
import { ShieldIcon } from "./Icons";

interface Props {
  messages: Message[];
  untrusted: Set<number>;
}

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
            {showDay && <li className="convo-day" role="separator"><span>{day}</span></li>}
            <li className={`msg msg-${m.author}${flagged ? " msg-untrusted" : ""}`}>
              <div className="bubble">
                {flagged && (
                  <p className="untrusted-label"><ShieldIcon size={13} /> Untrusted content: not followed</p>
                )}
                <div className="msg-head">
                  <strong>{humanize(m.author)}</strong>
                  <time className="num" dateTime={m.at}>{formatTime(m.at)}</time>
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
