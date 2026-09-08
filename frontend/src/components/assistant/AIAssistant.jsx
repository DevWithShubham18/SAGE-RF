import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CircleAlert,
  RotateCcw,
  Send,
  UserRound,
} from "lucide-react";

import { auth } from "../../firebase/firebase";


const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARACTERS = 8000;


function AIAssistant() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState({
    provider: "",
    model: "",
    configured: false,
    verified: false,
  });

  const messageEndRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const token = await user.getIdToken();
        const response = await fetch("/api/assistant/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!cancelled && response.ok) {
          setProvider({
            provider: data.provider || "",
            model: data.model || "",
            configured: Boolean(data.configured),
            verified: false,
          });
        }
      } catch {
        if (!cancelled) {
          setProvider((current) => ({ ...current, configured: false }));
        }
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
      const activeRequest = requestRef.current;
      activeRequest?.abort();
      if (requestRef.current === activeRequest) {
        requestRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    messageEndRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, generating]);

  async function sendMessage() {
    const content = draft.trim();

    if (!content || generating) return;

    if (content.length > MAX_MESSAGE_CHARACTERS) {
      setError(`Messages are limited to ${MAX_MESSAGE_CHARACTERS.toLocaleString()} characters.`);
      return;
    }

    const nextMessages = [
      ...messages,
      { role: "user", content },
    ].slice(-MAX_MESSAGES);

    setMessages(nextMessages);
    setDraft("");
    setError("");
    setGenerating(true);

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("You must be signed in to use the AI Assistant.");
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The assistant service returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The assistant request failed."
        );
      }

      if (!data?.message?.content) {
        throw new Error("The model returned an empty response.");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message.content,
        },
      ].slice(-MAX_MESSAGES));
      setProvider({
        provider: data.provider || "",
        model: data.model || "",
        configured: true,
        verified: true,
      });
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "The assistant request failed.");
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setGenerating(false);
      }
    }
  }

  function startNewChat() {
    requestRef.current?.abort();
    requestRef.current = null;
    setMessages([]);
    setDraft("");
    setError("");
    setGenerating(false);
  }

  const providerLabel = provider.provider
    ? `${provider.provider === "ollama" ? "LOCAL · OLLAMA" : provider.provider.toUpperCase()}${provider.model ? ` · ${provider.model.toUpperCase()}` : ""}`
    : "PROVIDER UNKNOWN";

  return (
    <section className="assistant-workspace" aria-label="AI Assistant">
      <header className="assistant-header">
        <div className="assistant-identity">
          <div className="assistant-icon"><Bot size={20} /></div>
          <div>
            <span className="panel-kicker">SAGE-RF TECHNICAL SUPPORT</span>
            <h2>AI Assistant</h2>
            <p>General RF, DSP and engineering guidance. Analysis data is not shared automatically.</p>
          </div>
        </div>

        <div className="assistant-header-actions">
          <div
            className={`assistant-provider-status${provider.verified ? " verified" : provider.configured ? " configured" : " unavailable"}`}
            title={provider.verified ? "Verified by a successful model response" : "Provider connectivity is not yet verified"}
          >
            <span />
            <div>
              <strong>{providerLabel}</strong>
              <small>{provider.verified ? "MODEL VERIFIED" : provider.configured ? "CONFIGURED · NOT VERIFIED" : "NOT CONFIGURED"}</small>
            </div>
          </div>

          <button type="button" className="assistant-new-chat" onClick={startNewChat}>
            <RotateCcw size={14} />
            NEW CHAT
          </button>
        </div>
      </header>

      <div className="assistant-message-panel">
        <div className="assistant-messages" aria-live="polite" aria-busy={generating}>
          {!messages.length && (
            <div className="assistant-empty">
              <Bot size={28} />
              <strong>Technical assistant ready</strong>
              <p>Ask about RF systems, signal processing, Fourier analysis, Laplace transforms, modulation or software engineering.</p>
              <small>The assistant cannot see the active signal unless you describe it.</small>
            </div>
          )}

          {messages.map((message, index) => (
            <article className={`assistant-message ${message.role}`} key={`${message.role}-${index}`}>
              <div className="assistant-message-avatar">
                {message.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}
              </div>
              <div className="assistant-message-body">
                <span>{message.role === "user" ? "YOU" : "SAGE AI"}</span>
                <SafeMessageContent content={message.content} />
              </div>
            </article>
          ))}

          {generating && (
            <article className="assistant-message assistant generating">
              <div className="assistant-message-avatar"><Bot size={15} /></div>
              <div className="assistant-message-body">
                <span>SAGE AI</span>
                <div className="assistant-generating"><i /><i /><i /> GENERATING RESPONSE</div>
              </div>
            </article>
          )}

          <div ref={messageEndRef} />
        </div>

        {error && (
          <div className="assistant-error" role="alert">
            <CircleAlert size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="assistant-composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask a technical question…"
            aria-label="Message the AI Assistant"
            maxLength={MAX_MESSAGE_CHARACTERS}
            disabled={generating}
            rows={3}
          />
          <div className="assistant-composer-footer">
            <span>ENTER TO SEND · SHIFT+ENTER FOR NEW LINE</span>
            <span>{draft.length.toLocaleString()} / {MAX_MESSAGE_CHARACTERS.toLocaleString()}</span>
            <button
              type="button"
              onClick={sendMessage}
              disabled={generating || !draft.trim()}
            >
              <Send size={14} />
              {generating ? "GENERATING" : "SEND"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}


function SafeMessageContent({ content }) {
  const sections = String(content).split(/```/);

  return (
    <div className="assistant-message-content">
      {sections.map((section, index) =>
        index % 2 === 1 ? (
          <pre key={index}><code>{section.replace(/^\w+\n/, "")}</code></pre>
        ) : (
          section.split(/\n{2,}/).filter(Boolean).map((paragraph, paragraphIndex) => (
            <p key={`${index}-${paragraphIndex}`}>{paragraph}</p>
          ))
        )
      )}
    </div>
  );
}


export default AIAssistant;
