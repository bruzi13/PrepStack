// Questions to the tutor while reading a lesson.
import { useState } from "react";
import { useServices } from "@/app/AppContext";
import type { ChatMessage } from "@/domain/records";
import { ChatBox } from "@/components/ChatBox";

export function TutorChat({ topicTitle }: { topicTitle: string }) {
  const { study } = useServices();
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const withQuestion: ChatMessage[] = [...conversation, { role: "user", content: question }];
    setConversation(withQuestion);
    setBusy(true);
    try {
      const answer = await study.askTutor(topicTitle, withQuestion, setStreaming);
      setConversation([...withQuestion, { role: "assistant", content: answer }]);
    } catch (failure) {
      setConversation([...withQuestion, { role: "assistant", content: (failure as Error).message }]);
    }
    setStreaming("");
    setBusy(false);
  }

  return (
    <details className="card tutor">
      <summary>שאלה על השיעור</summary>
      <ChatBox messages={conversation} streaming={streaming} busy={busy} onSend={ask} otherSpeaker="המורה" placeholder="השאלה שלך…" />
    </details>
  );
}
