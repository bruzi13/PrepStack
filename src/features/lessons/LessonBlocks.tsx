// The teaching part of a lesson: text, worked examples, diagrams, comprehension checks, scenarios, flashcards.
import { useState } from "react";
import type { LessonBlock, QuizQuestion } from "@/domain/records";
import { Diagram, Markdown } from "@/components/ui";

export function LessonBlockView({ block }: { block: LessonBlock }) {
  if (block.type === "check") return <div className="card check"><ComprehensionCheck question={block} title={block.title || "בדיקת הבנה"} /></div>;
  if (block.type === "scenario") return <ScenarioBlock block={block} />;
  if (block.type === "flashcards") {
    return (
      <div className="card">
        <h3>{block.title || "כרטיסיות"}</h3>
        <div className="cards">{block.cards.map((card, index) => <Flashcard key={index} question={card.q} answer={card.a} />)}</div>
      </div>
    );
  }
  return (
    <div className={`card block ${block.type}`}>
      {block.title && <h3>{block.title}</h3>}
      {block.type === "diagram" && block.mermaid && <Diagram code={block.mermaid} />}
      <Markdown>{block.md}</Markdown>
    </div>
  );
}

function ComprehensionCheck({ question, title }: { question: Pick<QuizQuestion, "question" | "options" | "answer" | "explain">; title?: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked != null, correct = picked === question.answer;
  const optionClass = (index: number) => {
    if (!answered) return "option";
    if (index === question.answer) return "option right";
    return index === picked ? "option wrong" : "option";
  };
  return <>
    {title && <small className="muted">{title}</small>}
    <p className="q-title">{question.question}</p>
    <div className="options">{question.options.map((option, index) => (
      <button key={index} disabled={answered} className={optionClass(index)} onClick={() => setPicked(index)}>{option}</button>
    ))}</div>
    {answered && <div className={`explain ${correct ? "good" : "bad"}`}>{correct ? "נכון. " : "לא בדיוק. "}{question.explain}</div>}
  </>;
}

function ScenarioBlock({ block }: { block: LessonBlock }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [pickedChoice, setPickedChoice] = useState<number | null>(null);
  const step = block.steps[stepIndex];
  if (!step) return null;
  const chosen = pickedChoice != null ? step.choices[pickedChoice] : null;
  const hasNextStep = stepIndex + 1 < block.steps.length;
  return (
    <div className="card scenario">
      <h3>{block.title || "תרחיש"} <small className="muted">שלב {stepIndex + 1}/{block.steps.length}</small></h3>
      <p>{step.situation}</p>
      <div className="options">{step.choices.map((choice, index) => (
        <button key={index} disabled={pickedChoice != null} className={`option ${pickedChoice === index ? (choice.good ? "right" : "wrong") : ""}`} onClick={() => setPickedChoice(index)}>{choice.label}</button>
      ))}</div>
      {chosen && <div className={`explain ${chosen.good ? "good" : "bad"}`}>{chosen.outcome}
        <div className="row">
          {!chosen.good && <button className="btn small" onClick={() => setPickedChoice(null)}>נסו בחירה אחרת</button>}
          {hasNextStep && <button className="btn small primary" onClick={() => { setStepIndex(stepIndex + 1); setPickedChoice(null); }}>המשך</button>}
        </div>
      </div>}
    </div>
  );
}

function Flashcard({ question, answer }: { question: string; answer: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button className={`flash ${revealed ? "open" : ""}`} onClick={() => setRevealed(!revealed)}>
      <b>{question}</b>{revealed ? <span>{answer}</span> : <small className="muted">הצגת תשובה</small>}
    </button>
  );
}
