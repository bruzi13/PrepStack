// The end-of-lesson tests. Each collects the learner's submission; the server grades it.
import { useRef, useState } from "react";
import { ArchitectureDiagram } from "@/domain/ArchitectureDiagram";
import type { ArchitectureCanvas, ArchitectureTest, LessonTest, PracticalTest } from "@/domain/records";
import { ArchCanvas } from "@/components/ArchCanvas";
import { Markdown } from "@/components/ui";

const MIN_DESIGN_COMPONENTS = 2;
const MIN_PRACTICAL_ANSWER_LENGTH = 20;

export function QuizTest({ test, onSubmit }: { test: LessonTest; onSubmit: (answers: number[], openAnswer: string) => void }) {
  const [answers, setAnswers] = useState<number[]>(() => test.quiz.map(() => -1));
  const [openAnswer, setOpenAnswer] = useState("");
  const allAnswered = answers.every((answer) => answer >= 0);
  const choose = (questionIndex: number, optionIndex: number) =>
    setAnswers(answers.map((answer, index) => (index === questionIndex ? optionIndex : answer)));
  return (
    <div>
      {test.quiz.map((question, questionIndex) => (
        <div key={questionIndex} className="card">
          <p className="q-title">{questionIndex + 1}. {question.question}</p>
          <div className="options">{question.options.map((option, optionIndex) => (
            <button key={optionIndex} className={`option ${answers[questionIndex] === optionIndex ? "on" : ""}`} onClick={() => choose(questionIndex, optionIndex)}>{option}</button>
          ))}</div>
        </div>
      ))}
      {test.open_question && <div className="card">
        <p className="q-title">שאלה פתוחה: {test.open_question}</p>
        <textarea dir="auto" rows={6} value={openAnswer} onChange={(event) => setOpenAnswer(event.target.value)} placeholder="התשובה שלך…" />
      </div>}
      <button className="btn primary big" disabled={!allAnswered} onClick={() => onSubmit(answers, openAnswer)}>הגשה</button>
    </div>
  );
}

export function ArchitectureTestView({ test, onSubmit }: { test: ArchitectureTest; onSubmit: (canvas: ArchitectureCanvas) => void }) {
  const canvas = useRef<ArchitectureCanvas>(ArchitectureDiagram.empty());
  const [componentCount, setComponentCount] = useState(0);
  return (
    <div>
      <div className="card">
        <h3>{test.prompt}</h3>
        <div className="grid2">
          <div><h4>דרישות</h4><ul>{test.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul></div>
          {test.constraints.length > 0 && <div><h4>אילוצים</h4><ul>{test.constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}</ul></div>}
        </div>
        <small className="muted">קריטריונים: {test.rubric.map((criterion) => criterion.dimension).join(" · ")}</small>
      </div>
      <div className="card">
        <ArchCanvas value={canvas.current} onChange={(updated) => { canvas.current = updated; setComponentCount(updated.nodes.length); }} />
      </div>
      <button className="btn primary big" disabled={componentCount < MIN_DESIGN_COMPONENTS} onClick={() => onSubmit(canvas.current)}>הגשת התכנון לביקורת</button>
    </div>
  );
}

export function PracticalTestView({ test, onSubmit }: { test: PracticalTest; onSubmit: (answer: string) => void }) {
  const [answer, setAnswer] = useState("");
  return (
    <div>
      <div className="card">
        <Markdown>{test.task}</Markdown>
        <p><b>מה להגיש:</b> {test.deliverable}</p>
        <small className="muted">קריטריונים: {test.rubric.join(" · ")}</small>
      </div>
      <div className="card"><textarea dir="auto" className="mono" rows={14} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="התשובה שלך…" /></div>
      <button className="btn primary big" disabled={answer.trim().length < MIN_PRACTICAL_ANSWER_LENGTH} onClick={() => onSubmit(answer)}>הגשה לביקורת</button>
    </div>
  );
}
